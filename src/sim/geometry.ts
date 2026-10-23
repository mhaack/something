/**
 * Versetztes Dreiecksgitter: ungerade Zeilen sind um eine halbe Kachel nach rechts versetzt
 * ("odd-r"). Jeder Knoten hat 6 Nachbarn. Pro Knoten gibt es zwei Dreiecke:
 *   UP   = (Knoten, SW, SO)  – Spitze oben, liegt unterhalb des Knotens
 *   DOWN = (Knoten, O, SO)   – Spitze unten, liegt rechts unterhalb des Knotens
 */

export const Dir = { E: 0, SE: 1, SW: 2, W: 3, NW: 4, NE: 5 } as const;
export type Dir = (typeof Dir)[keyof typeof Dir];
export const DIRS: readonly Dir[] = [0, 1, 2, 3, 4, 5];

export const TRI_UP = 0;
export const TRI_DOWN = 1;

export interface GridSize {
  width: number;
  height: number;
}

export function nodeIndex(g: GridSize, x: number, y: number): number {
  return y * g.width + x;
}

export function inBounds(g: GridSize, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function nodeX(g: GridSize, i: number): number {
  return i % g.width;
}

export function nodeY(g: GridSize, i: number): number {
  return (i / g.width) | 0;
}

/** Koordinate des Nachbarn in Richtung `d` (ohne Bereichsprüfung). */
export function neighborXY(x: number, y: number, d: Dir): [number, number] {
  const odd = y & 1;
  switch (d) {
    case Dir.E:
      return [x + 1, y];
    case Dir.W:
      return [x - 1, y];
    case Dir.NE:
      return [x + odd, y - 1];
    case Dir.NW:
      return [x - 1 + odd, y - 1];
    case Dir.SE:
      return [x + odd, y + 1];
    case Dir.SW:
      return [x - 1 + odd, y + 1];
  }
}

/** Index des Nachbarn in Richtung `d` oder -1 außerhalb der Karte. */
export function neighbor(g: GridSize, i: number, d: Dir): number {
  const [nx, ny] = neighborXY(nodeX(g, i), nodeY(g, i), d);
  return inBounds(g, nx, ny) ? nodeIndex(g, nx, ny) : -1;
}

export function oppositeDir(d: Dir): Dir {
  return ((d + 3) % 6) as Dir;
}

/** Richtung von a nach b, falls benachbart, sonst -1. */
export function dirBetween(g: GridSize, a: number, b: number): Dir | -1 {
  for (const d of DIRS) if (neighbor(g, a, d) === b) return d;
  return -1;
}

/**
 * Die 6 Dreiecke um einen Knoten als Dreiecksindizes (2*Knoten + UP/DOWN).
 * Fehlende Dreiecke am Rand werden als -1 geliefert.
 */
export function trianglesAround(g: GridSize, i: number): number[] {
  const w = neighbor(g, i, Dir.W);
  const nw = neighbor(g, i, Dir.NW);
  const ne = neighbor(g, i, Dir.NE);
  return [
    triangleIfExists(g, i, TRI_UP),
    triangleIfExists(g, i, TRI_DOWN),
    w >= 0 ? triangleIfExists(g, w, TRI_DOWN) : -1,
    nw >= 0 ? triangleIfExists(g, nw, TRI_UP) : -1,
    nw >= 0 ? triangleIfExists(g, nw, TRI_DOWN) : -1,
    ne >= 0 ? triangleIfExists(g, ne, TRI_UP) : -1,
  ];
}

/** Dreiecksindex, falls alle drei Eckknoten auf der Karte liegen, sonst -1. */
export function triangleIfExists(g: GridSize, i: number, kind: number): number {
  const se = neighbor(g, i, Dir.SE);
  const other = neighbor(g, i, kind === TRI_UP ? Dir.SW : Dir.E);
  return se >= 0 && other >= 0 ? 2 * i + kind : -1;
}

/** Die drei Eckknoten eines Dreiecks. */
export function triangleNodes(g: GridSize, tri: number): [number, number, number] {
  const i = tri >> 1;
  const kind = tri & 1;
  return [i, neighbor(g, i, kind === TRI_UP ? Dir.SW : Dir.E), neighbor(g, i, Dir.SE)];
}

/** Axiale Koordinaten für Distanzen. */
function toAxial(x: number, y: number): [number, number] {
  return [x - ((y - (y & 1)) >> 1), y];
}

/** Gitterdistanz in Schritten zwischen zwei Knoten. */
export function gridDistance(ax: number, ay: number, bx: number, by: number): number {
  const [aq, ar] = toAxial(ax, ay);
  const [bq, br] = toAxial(bx, by);
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function nodeDistance(g: GridSize, a: number, b: number): number {
  return gridDistance(nodeX(g, a), nodeY(g, a), nodeX(g, b), nodeY(g, b));
}

/** Alle Knoten im Radius r (inklusive Zentrum), in deterministischer Reihenfolge. */
export function nodesInRadius(g: GridSize, center: number, r: number): number[] {
  const cx = nodeX(g, center);
  const cy = nodeY(g, center);
  const out: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) {
    if (y < 0 || y >= g.height) continue;
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      if (x < 0 || x >= g.width) continue;
      if (gridDistance(cx, cy, x, y) <= r) out.push(nodeIndex(g, x, y));
    }
  }
  return out;
}
