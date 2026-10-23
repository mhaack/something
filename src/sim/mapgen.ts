import { MAP, START } from '../data/balance';
import { MapObject, Resource, Terrain, terrainInfo } from '../data/terrain';
import {
  TRI_DOWN,
  TRI_UP,
  gridDistance,
  nodeIndex,
  nodeX,
  nodeY,
  nodesInRadius,
  triangleIfExists,
  triangleNodes,
  trianglesAround,
} from './geometry';
import { createEmptyMap, isBuildableTerrain, isFlat, isMinableTerrain, type GameMap } from './map';
import { fbm, valueNoise } from './noise';
import { createRng, hashSeed, nextFloat, nextInt, type RngState } from './rng';

export interface MapGenOptions {
  seed: number | string;
  size: number;
  players: number;
}

export interface GeneratedMap {
  map: GameMap;
  /** Startknoten (HQ-Position) je Spieler. */
  starts: number[];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 0.999 ? 0.999 : v;
}

function borderFalloff(size: number): number {
  return Math.max(
    MAP.BORDER_FALLOFF_MIN,
    Math.min(MAP.BORDER_FALLOFF_MAX, Math.round(size * MAP.BORDER_FALLOFF_SHARE)),
  );
}

/** Rohhöhe in [0,1) inklusive Randabfall. */
function rawHeight(x: number, y: number, w: number, h: number, seed: number): number {
  const px = x + (y & 1) * 0.5;
  let v = fbm(px, y, MAP.HEIGHT_BASE_PERIOD, MAP.HEIGHT_OCTAVES, seed);
  // Kontrast strecken, damit Wasser- und Bergflächen entstehen.
  v = clamp01((v - 0.5) * 1.9 + 0.52);
  // Berge steiler machen.
  if (v > MAP.MOUNTAIN_LEVEL) v = clamp01(MAP.MOUNTAIN_LEVEL + (v - MAP.MOUNTAIN_LEVEL) * 1.6);
  const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
  const falloff = borderFalloff(w);
  if (edge < falloff) {
    const t = edge / falloff;
    v *= t * t * (3 - 2 * t);
  }
  return v;
}

export function generateMap(opts: MapGenOptions): GeneratedMap {
  const size = opts.size;
  const map = createEmptyMap(size, size);
  const seed = hashSeed(opts.seed);
  const rng = createRng(`${opts.seed}:map`);
  const n = size * size;

  // 1. Höhen
  const raw = new Array<number>(n);
  const waterH = Math.round(MAP.WATER_LEVEL * MAP.MAX_HEIGHT);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = nodeIndex(map, x, y);
      const v = rawHeight(x, y, size, size, seed);
      raw[i] = v;
      map.heights[i] = Math.max(waterH, Math.round(v * MAP.MAX_HEIGHT));
    }
  }

  // 2. Terrain pro Dreieck
  for (let i = 0; i < n; i++) {
    for (const kind of [TRI_UP, TRI_DOWN]) {
      const tri = triangleIfExists(map, i, kind);
      if (tri < 0) {
        map.terrain[2 * i + kind] = Terrain.Water;
        continue;
      }
      const [a, b, c] = triangleNodes(map, tri);
      const avg = (raw[a] + raw[b] + raw[c]) / 3;
      const lo = Math.min(raw[a], raw[b], raw[c]);
      map.terrain[tri] = classifyTriangle(map, i, kind, avg, lo, seed);
    }
  }

  // 3. Bäume
  for (let i = 0; i < n; i++) {
    if (!isTreeSpot(map, i)) continue;
    const x = nodeX(map, i);
    const y = nodeY(map, i);
    const forest = valueNoise(x, y, MAP.FOREST_PERIOD, seed + 77);
    const p = forest > MAP.FOREST_THRESHOLD ? MAP.FOREST_DENSITY : MAP.SCATTER_TREE_CHANCE;
    if (nextFloat(rng) < p) placeTree(map, i, rng);
  }

  // 4. Felsen
  const clusters = Math.round((n / 1000) * MAP.ROCK_CLUSTERS_PER_1000);
  for (let c = 0; c < clusters; c++) {
    const center = nextInt(rng, 0, n - 1);
    if (!isRockSpot(map, center)) continue;
    for (const j of nodesInRadius(map, center, MAP.ROCK_CLUSTER_RADIUS)) {
      if (isRockSpot(map, j) && nextFloat(rng) < MAP.ROCK_DENSITY) placeRock(map, j, rng);
    }
  }

  // 5. Bodenschätze
  placeResources(map, seed);

  // 6. Startpositionen
  const starts = chooseStarts(map, opts.players, rng);
  for (const s of starts) prepareStart(map, s, rng);

  return { map, starts };
}

function classifyTriangle(
  map: GameMap,
  i: number,
  kind: number,
  avg: number,
  lo: number,
  seed: number,
): number {
  if (avg < MAP.WATER_LEVEL || lo < MAP.WATER_LEVEL - 0.04) return Terrain.Water;
  if (avg > MAP.SNOW_LEVEL) return Terrain.Snow;
  if (avg > MAP.MOUNTAIN_LEVEL) return Terrain.Mountain;
  const x = nodeX(map, i) * 2 + kind;
  const y = nodeY(map, i);
  const moist = valueNoise(x, y, MAP.MOISTURE_PERIOD, seed + 31);
  if (moist > MAP.SWAMP_MOISTURE && avg < MAP.SWAMP_MAX_HEIGHT) return Terrain.Swamp;
  if (moist < MAP.DESERT_MOISTURE) return Terrain.Desert;
  const variant = valueNoise(x, y, 6, seed + 53);
  return variant < 0.4 ? Terrain.Meadow1 : variant < 0.7 ? Terrain.Meadow2 : Terrain.Meadow3;
}

/** Bäume wachsen, wo alle angrenzenden Dreiecke fruchtbar sind. */
export function isTreeSpot(map: GameMap, i: number): boolean {
  if (map.objects[i] !== MapObject.None) return false;
  const tris = trianglesAround(map, i);
  for (const t of tris) if (t < 0 || !terrainInfo(map.terrain[t]).arable) return false;
  return true;
}

function isRockSpot(map: GameMap, i: number): boolean {
  if (map.objects[i] !== MapObject.None) return false;
  const tris = trianglesAround(map, i);
  for (const t of tris) {
    if (t < 0) return false;
    const info = terrainInfo(map.terrain[t]);
    if (!info.walkable) return false;
  }
  return true;
}

function placeTree(map: GameMap, i: number, rng: RngState): void {
  map.objects[i] = MapObject.Tree;
  map.objectData[i] = nextInt(rng, 0, 3);
}

function placeRock(map: GameMap, i: number, rng: RngState): void {
  map.objects[i] = MapObject.Rock;
  map.objectData[i] = nextInt(rng, MAP.ROCK_STONE_MIN, MAP.ROCK_STONE_MAX);
}

function placeResources(map: GameMap, seed: number): void {
  const types = [Resource.Coal, Resource.Iron, Resource.Gold, Resource.Granite];
  // Gewichtung: Gold seltener, Kohle häufiger.
  const bias = [0.06, 0.02, -0.08, 0];
  for (let i = 0; i < map.width * map.height; i++) {
    let anyMountain = false;
    for (const t of trianglesAround(map, i)) {
      if (t >= 0 && map.terrain[t] === Terrain.Mountain) anyMountain = true;
    }
    if (!anyMountain) continue;
    const x = nodeX(map, i);
    const y = nodeY(map, i);
    let best = -1;
    let bestV: number = MAP.RESOURCE_THRESHOLD;
    for (let k = 0; k < types.length; k++) {
      const v = valueNoise(x, y, MAP.RESOURCE_PERIOD, seed + 101 * (k + 1)) + bias[k];
      if (v > bestV) {
        bestV = v;
        best = k;
      }
    }
    if (best < 0) continue;
    map.resources[i] = types[best];
    const strength = (bestV - MAP.RESOURCE_THRESHOLD) / (1 - MAP.RESOURCE_THRESHOLD);
    map.resourceAmounts[i] = Math.max(1, Math.round(strength * MAP.RESOURCE_MAX_AMOUNT));
  }
}

interface Candidate {
  node: number;
  score: number;
}

function startCandidates(map: GameMap, minShare: number): Candidate[] {
  const out: Candidate[] = [];
  const step = 3;
  const margin = borderFalloff(map.width);
  for (let y = margin; y < map.height - margin; y += step) {
    for (let x = margin; x < map.width - margin; x += step) {
      const i = nodeIndex(map, x, y);
      if (!isBuildableTerrain(map, i) || !isFlat(map, i)) continue;
      const area = nodesInRadius(map, i, START.BUILDABLE_RADIUS);
      let buildable = 0;
      for (const j of area) if (isBuildableTerrain(map, j)) buildable++;
      const share = buildable / area.length;
      if (share < minShare) continue;
      let trees = 0;
      let rocks = 0;
      let mountain = 0;
      for (const j of nodesInRadius(map, i, START.RESOURCE_RADIUS)) {
        if (map.objects[j] === MapObject.Tree) trees++;
        else if (map.objects[j] === MapObject.Rock) rocks++;
      }
      for (const j of nodesInRadius(map, i, START.MOUNTAIN_SEARCH_RADIUS)) {
        if (isMinableTerrain(map, j)) mountain++;
      }
      const score =
        share +
        Math.min(1, trees / START.MIN_TREES) * 0.3 +
        Math.min(1, rocks / START.MIN_ROCKS) * 0.3 +
        Math.min(1, mountain / 20) * 0.6;
      out.push({ node: i, score });
    }
  }
  return out;
}

function chooseStarts(map: GameMap, players: number, rng: RngState): number[] {
  let candidates: Candidate[] = [];
  const shares: number[] = [START.MIN_BUILDABLE_SHARE, 0.5, 0.3];
  for (const share of shares) {
    candidates = startCandidates(map, share);
    if (candidates.length >= players) break;
  }
  const chosen: number[] = [];
  if (candidates.length > 0) {
    let best = candidates[0];
    for (const c of candidates) if (c.score > best.score) best = c;
    chosen.push(best.node);
  }
  while (chosen.length < players && chosen.length < candidates.length) {
    let bestC: Candidate | null = null;
    let bestV = -1;
    for (const c of candidates) {
      if (chosen.includes(c.node)) continue;
      let minD = Infinity;
      for (const s of chosen) {
        minD = Math.min(
          minD,
          gridDistance(nodeX(map, c.node), nodeY(map, c.node), nodeX(map, s), nodeY(map, s)),
        );
      }
      const v = minD * (0.5 + c.score);
      if (v > bestV) {
        bestV = v;
        bestC = c;
      }
    }
    if (!bestC) break;
    chosen.push(bestC.node);
  }
  // Notfall: Karte bietet zu wenige Plätze → Fläche erzwingen.
  while (chosen.length < players) {
    const m = borderFalloff(map.width) + 4;
    const x = nextInt(rng, m, map.width - m - 1);
    const y = nextInt(rng, m, map.height - m - 1);
    const i = nodeIndex(map, x, y);
    forceMeadow(map, i, START.BUILDABLE_RADIUS);
    chosen.push(i);
  }
  return chosen;
}

/** Wandelt das Gebiet um einen Knoten in ebene Wiese um (nur als Notfall). */
function forceMeadow(map: GameMap, center: number, r: number): void {
  const h = Math.round(MAP.WATER_LEVEL * MAP.MAX_HEIGHT) + 4;
  for (const j of nodesInRadius(map, center, r + 1)) {
    map.heights[j] = h;
    map.objects[j] = MapObject.None;
    map.terrain[2 * j + TRI_UP] = Terrain.Meadow1;
    map.terrain[2 * j + TRI_DOWN] = Terrain.Meadow1;
  }
}

/** Räumt den HQ-Bereich frei, ebnet ihn und gleicht Bäume/Felsen auf Mindestmengen an. */
function prepareStart(map: GameMap, start: number, rng: RngState): void {
  const h0 = map.heights[start];
  for (const j of nodesInRadius(map, start, START.CLEAR_RADIUS)) {
    map.objects[j] = MapObject.None;
    map.objectData[j] = 0;
    if (gridDistance(nodeX(map, start), nodeY(map, start), nodeX(map, j), nodeY(map, j)) <= 2) {
      map.heights[j] = h0;
    }
  }
  const ring = nodesInRadius(map, start, START.RESOURCE_RADIUS).filter(
    (j) =>
      gridDistance(nodeX(map, start), nodeY(map, start), nodeX(map, j), nodeY(map, j)) >
      START.CLEAR_RADIUS + 1,
  );
  let trees = 0;
  let rocks = 0;
  for (const j of ring) {
    if (map.objects[j] === MapObject.Tree) trees++;
    else if (map.objects[j] === MapObject.Rock) rocks++;
  }
  let guard = 0;
  while (trees < START.MIN_TREES && guard++ < 2000) {
    const j = ring[nextInt(rng, 0, ring.length - 1)];
    if (isTreeSpot(map, j)) {
      placeTree(map, j, rng);
      trees++;
    }
  }
  guard = 0;
  while (rocks < START.MIN_ROCKS && guard++ < 2000) {
    const j = ring[nextInt(rng, 0, ring.length - 1)];
    if (isRockSpot(map, j)) {
      placeRock(map, j, rng);
      rocks++;
    }
  }
}
