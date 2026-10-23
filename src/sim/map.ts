import { TERRAIN_RULES } from '../data/balance';
import { MapObject, terrainInfo } from '../data/terrain';
import { DIRS, neighbor, trianglesAround, type GridSize } from './geometry';

/** Kartendaten. Alle Arrays haben Länge width*height (terrain: 2*width*height). */
export interface GameMap extends GridSize {
  width: number;
  height: number;
  /** Höhe pro Knoten. */
  heights: number[];
  /** Terrain pro Dreieck (2 pro Knoten: UP, DOWN). */
  terrain: number[];
  /** Objekt pro Knoten (MapObject). */
  objects: number[];
  /** Objektvariante bzw. Restmenge (z. B. Steine eines Felsens, Baumart). */
  objectData: number[];
  /** Bodenschatz pro Knoten (Resource) und Menge. */
  resources: number[];
  resourceAmounts: number[];
}

export function createEmptyMap(width: number, height: number): GameMap {
  const n = width * height;
  return {
    width,
    height,
    heights: new Array<number>(n).fill(0),
    terrain: new Array<number>(2 * n).fill(0),
    objects: new Array<number>(n).fill(MapObject.None),
    objectData: new Array<number>(n).fill(0),
    resources: new Array<number>(n).fill(0),
    resourceAmounts: new Array<number>(n).fill(0),
  };
}

/** Zählt die angrenzenden Dreiecke, die eine Eigenschaft erfüllen. Fehlende zählen nicht. */
function countTriangles(
  map: GameMap,
  i: number,
  prop: 'walkable' | 'buildable' | 'minable' | 'arable',
): { match: number; total: number } {
  let match = 0;
  let total = 0;
  for (const t of trianglesAround(map, i)) {
    if (t < 0) continue;
    total++;
    if (terrainInfo(map.terrain[t])[prop]) match++;
  }
  return { match, total };
}

/** Terrain erlaubt Betreten (mindestens ein begehbares angrenzendes Dreieck, nicht am Rand). */
export function isWalkableTerrain(map: GameMap, i: number): boolean {
  const { match, total } = countTriangles(map, i, 'walkable');
  return total === 6 && match > 0;
}

/** Alle 6 angrenzenden Dreiecke sind bebaubar. */
export function isBuildableTerrain(map: GameMap, i: number): boolean {
  const { match, total } = countTriangles(map, i, 'buildable');
  return total === 6 && match === 6;
}

/** Alle 6 angrenzenden Dreiecke sind Berg. */
export function isMinableTerrain(map: GameMap, i: number): boolean {
  const { match, total } = countTriangles(map, i, 'minable');
  return total === 6 && match === 6;
}

/** Größter Höhenunterschied zu den direkten Nachbarn. */
export function maxSlope(map: GameMap, i: number): number {
  const h = map.heights[i];
  let m = 0;
  for (const d of DIRS) {
    const n = neighbor(map, i, d);
    if (n < 0) continue;
    m = Math.max(m, Math.abs(map.heights[n] - h));
  }
  return m;
}

export function isFlat(map: GameMap, i: number): boolean {
  return maxSlope(map, i) <= TERRAIN_RULES.BUILD_MAX_SLOPE;
}

/** Knoten ist frei von Objekten. */
export function isFreeOfObjects(map: GameMap, i: number): boolean {
  return map.objects[i] === MapObject.None;
}

/** Begehbar für Figuren: Terrain erlaubt es und kein blockierendes Objekt. */
export function isPassable(map: GameMap, i: number): boolean {
  return isWalkableTerrain(map, i) && map.objects[i] !== MapObject.Rock;
}
