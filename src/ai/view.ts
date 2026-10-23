/**
 * Lagebild der KI: Was ein Spieler über seine eigene Wirtschaft und die sichtbare Karte weiß.
 * Wird bei jeder Entscheidung neu aus dem Weltzustand berechnet (die KI hat keinen eigenen
 * Zustand und bleibt damit trivial serialisierbar und deterministisch).
 */
import { BUILDINGS, isMilitaryType, type BuildingSize, type BuildingType } from '../data/buildings';
import { emptyWareCounts, type WareCounts, type WareType } from '../data/wares';
import type { AiLevel } from '../data/balance';
import type { Building } from '../sim/entities';
import { DIRS, Dir, neighbor } from '../sim/geometry';
import { buildSize } from '../sim/buildings';
import { isStore } from '../sim/store';
import type { World } from '../sim/world';
import { isMinableTerrain, type GameMap } from '../sim/map';
import type { AiMemory } from './memory';

export interface Slot {
  node: number;
  flagNode: number;
  size: BuildingSize;
}

export interface View {
  world: World;
  player: number;
  level: AiLevel;
  memory: AiMemory;
  /** Eigene Gebäude je Typ (Baustellen eingeschlossen). */
  counts: Record<BuildingType, number>;
  buildings: Building[];
  sites: number;
  militarySites: number;
  /** Summe der Bestände aller eigenen Lager. */
  stock: WareCounts;
  stores: Building[];
  /** Flaggen, die über Straßen mit einem eigenen Lager verbunden sind. */
  reachable: Set<number>;
  /** Schritte querfeldein zur nächsten erreichbaren Flagge (-1 = nicht im eigenen Gebiet). */
  flagDist: Int32Array;
  /** Schritte zur eigenen Gebietsgrenze (-1 = fremdes Gebiet). */
  borderDist: Int32Array;
  /** Freie Bauplätze im eigenen Gebiet. */
  slots: Slot[];
}

const minableCache = new WeakMap<GameMap, Uint8Array>();

/**
 * Bergknoten der Karte (abgeleiteter Cache außerhalb des Weltzustands: das Gelände ändert sich
 * im Spiel nie, nur Höhen und Objekte).
 */
export function minable(map: GameMap): Uint8Array {
  let m = minableCache.get(map);
  if (!m) {
    m = new Uint8Array(map.width * map.height);
    for (let n = 0; n < m.length; n++) m[n] = isMinableTerrain(map, n) ? 1 : 0;
    minableCache.set(map, m);
  }
  return m;
}

/** Schritte von den nächsten Startknoten aus (Breitensuche über Nachbarn, -1 = unerreicht). */
export function bfs(
  world: World,
  starts: readonly number[],
  allowed: (n: number) => boolean,
  maxDist = Infinity,
): Int32Array {
  const map = world.map;
  const dist = new Int32Array(map.width * map.height).fill(-1);
  const queue = new Int32Array(dist.length);
  let tail = 0;
  for (const s of starts) {
    if (dist[s] < 0) {
      dist[s] = 0;
      queue[tail++] = s;
    }
  }
  for (let head = 0; head < tail; head++) {
    const c = queue[head];
    if (dist[c] >= maxDist) continue;
    for (const d of DIRS) {
      const m = neighbor(map, c, d);
      if (m >= 0 && dist[m] < 0 && allowed(m)) {
        dist[m] = dist[c] + 1;
        queue[tail++] = m;
      }
    }
  }
  return dist;
}

/** Flaggen, die über eigene Straßen mit einem Lager verbunden sind. */
export function reachableFlags(world: World, stores: readonly Building[]): Set<number> {
  const seen = new Set<number>(stores.map((s) => s.flag));
  const queue = [...seen];
  for (let q = 0; q < queue.length; q++) {
    const f = world.flags[queue[q]];
    for (const r of f.roads) {
      if (r <= 0) continue;
      const road = world.roads[r];
      const other = road.flagA === f.id ? road.flagB : road.flagA;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

export function buildView(world: World, player: number, level: AiLevel, memory: AiMemory): View {
  const counts = {} as Record<BuildingType, number>;
  for (const t of Object.keys(BUILDINGS) as BuildingType[]) counts[t] = 0;
  const buildings: Building[] = [];
  const stores: Building[] = [];
  const stock = emptyWareCounts();
  let sites = 0;
  let militarySites = 0;
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner !== player) continue;
    buildings.push(b);
    counts[b.type]++;
    if (b.site) {
      sites++;
      if (isMilitaryType(b.type)) militarySites++;
    } else if (isStore(b)) {
      stores.push(b);
      for (const t in b.stock) stock[t as WareType] += b.stock[t as WareType];
    }
  }
  const reachable = reachableFlags(world, stores);
  const own = (n: number): boolean => world.owner[n] === player;
  const flagDist = bfs(
    world,
    [...reachable].map((f) => world.flags[f].node),
    own,
  );
  const map = world.map;
  const edge: number[] = [];
  const slots: Slot[] = [];
  for (let n = 0; n < map.width * map.height; n++) {
    if (world.owner[n] !== player) continue;
    if (DIRS.some((d) => world.owner[neighbor(map, n, d)] !== player)) edge.push(n);
    const size = buildSize(world, player, n);
    if (size) slots.push({ node: n, flagNode: neighbor(map, n, Dir.SE), size });
  }
  const borderDist = bfs(world, edge, own);
  return {
    world,
    player,
    level,
    memory,
    counts,
    buildings,
    sites,
    militarySites,
    stock,
    stores,
    reachable,
    flagDist,
    borderDist,
    slots,
  };
}
