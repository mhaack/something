/**
 * Reiner Software-Rasterizer für Terrain-Dreiecke (ohne DOM, damit testbar).
 * Schattierung: Gouraud über Knotenhelligkeit, quantisiert auf die Terrainrampe mit Bayer-Dithering
 * und einer prozeduralen Textur pro Terraintyp.
 */
import { MAP } from '../data/balance';
import { Terrain } from '../data/terrain';
import {
  Dir,
  TRI_DOWN,
  TRI_UP,
  neighbor,
  triangleIfExists,
  triangleNodes,
  trianglesAround,
} from '../sim/geometry';
import type { GameMap } from '../sim/map';
import { hash2 } from '../sim/rng';
import { nodeWorldX, nodeWorldY } from './camera';
import { HEIGHT_PX, TH, TW } from './constants';
import { BAYER4, TERRAIN_RAMPS } from './palette';

/** Helligkeit pro Knoten in [0,1], Licht von links oben. */
export function computeLight(map: GameMap): Float32Array {
  const out = new Float32Array(map.width * map.height);
  for (let i = 0; i < out.length; i++) out[i] = nodeLight(map, i);
  return out;
}

export function nodeLight(map: GameMap, i: number): number {
  const h = map.heights[i];
  const hOf = (d: Dir): number => {
    const n = neighbor(map, i, d);
    return n < 0 ? h : map.heights[n];
  };
  const v = 0.55 + (hOf(Dir.SE) - hOf(Dir.NW)) * 0.1 + (hOf(Dir.E) - hOf(Dir.W)) * 0.04;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Texturversatz auf der Rampe (in Rampenstufen) für ein Weltpixel. */
function texel(t: number, wx: number, wy: number): number {
  const r = hash2(wx, wy, t * 7919);
  switch (t) {
    case Terrain.Water: {
      const wave = hash2(wx >> 3, wy, 17);
      return wave > 0.86 ? 0.8 : wave < 0.1 ? -0.6 : 0;
    }
    case Terrain.Mountain: {
      // Gesteinsschichten schräg über den Hang plus Körnung
      const strata = hash2((wx + wy * 2) >> 3, (wy - wx) >> 4, 23);
      const crack = hash2(wx >> 1, wy, 29) > 0.94 ? -1.1 : 0;
      return (strata - 0.5) * 1.2 + (r > 0.9 ? 0.6 : r < 0.06 ? -0.6 : 0) + crack;
    }
    case Terrain.Snow:
      return r > 0.93 ? -0.7 : r < 0.03 ? 0.5 : 0;
    case Terrain.Desert: {
      const ripple = (wx + 2 * wy + ((hash2(wx >> 4, wy >> 3, 5) * 6) | 0)) % 9 === 0;
      return ripple ? 0.7 : r > 0.94 ? -0.6 : 0;
    }
    case Terrain.Swamp: {
      const pool = hash2(wx >> 2, wy >> 1, 41) > 0.8 ? -1.2 : 0;
      return pool + (r > 0.85 ? 0.8 : 0);
    }
    default: {
      // Wiese: Grashalme (2 Pixel hoch, unten dunkel) und Körnung
      const blade = hash2(wx, wy >> 1, 101 + t);
      if (blade > 0.93) return (wy & 1) === 0 ? 1.1 : -0.4;
      return r > 0.9 ? 0.5 : r < 0.07 ? -0.8 : 0;
    }
  }
}

/** Sand am Ufer und Schaum am Wasserrand. */
const BEACH_RAMP = TERRAIN_RAMPS[Terrain.Desert];
const FOAM: [number, number, number] = [150, 190, 228];
/** Breite der Übergangszone in baryzentrischen Einheiten. */
const BLEND = 0.24;
const BEACH = 0.13;
const FOAM_WIDTH = 0.07;

export interface RasterTarget {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Weltpixel der linken oberen Ecke des Ziels. */
  originX: number;
  originY: number;
}

interface Vtx {
  x: number;
  y: number;
  l: number;
}

function shadeIndex(t: number, light: number, wx: number, wy: number, top: number): number {
  const dither = BAYER4[((wy & 3) << 2) | (wx & 3)];
  const idx = Math.floor(light * top + texel(t, wx, wy) + dither - 0.25);
  return idx < 0 ? 0 : idx > top ? top : idx;
}

/**
 * Füllt ein Dreieck. `nbr[k]` ist das Terrain jenseits der Kante gegenüber Ecke k (-1 = keins):
 * nahe einer Kante zu anderem Terrain wird gedithert überblendet, an Küsten entstehen Sand und Schaum.
 */
function fillTriangle(
  target: RasterTarget,
  a: Vtx,
  b: Vtx,
  c: Vtx,
  terrain: number,
  nbr: readonly number[],
): void {
  const ramp = TERRAIN_RAMPS[terrain];
  const top = ramp.length - 1;
  const ox = target.originX;
  const oy = target.originY;
  const ax = a.x - ox;
  const ay = a.y - oy;
  const bx = b.x - ox;
  const by = b.y - oy;
  const cx = c.x - ox;
  const cy = c.y - oy;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (area === 0) return;
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(target.width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(target.height - 1, Math.ceil(Math.max(ay, by, cy)));
  const inv = 1 / area;
  const data = target.data;
  const isWater = terrain === Terrain.Water;
  const anyEdge = nbr.some((t) => t >= 0 && t !== terrain);
  for (let py = minY; py <= maxY; py++) {
    const sy = py + 0.5;
    for (let px = minX; px <= maxX; px++) {
      const sx = px + 0.5;
      let w0 = ((bx - sx) * (cy - sy) - (by - sy) * (cx - sx)) * inv;
      let w1 = ((cx - sx) * (ay - sy) - (cy - sy) * (ax - sx)) * inv;
      let w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      if (w0 < 0) w0 = 0;
      if (w1 < 0) w1 = 0;
      if (w2 < 0) w2 = 0;
      const wx = px + ox;
      const wy = py + oy;
      const light = isWater ? 0.55 : a.l * w0 + b.l * w1 + c.l * w2;
      let col = ramp[shadeIndex(terrain, light, wx, wy, top)];
      if (anyEdge) {
        // Nächste Kante bestimmen
        let k = 0;
        let wk = w0;
        if (w1 < wk) {
          k = 1;
          wk = w1;
        }
        if (w2 < wk) {
          k = 2;
          wk = w2;
        }
        const other = nbr[k];
        if (other >= 0 && other !== terrain && wk < BLEND) {
          const h = hash2(wx, wy, 977);
          const otherWater = other === Terrain.Water;
          if (!isWater && otherWater && wk < BEACH && terrain !== Terrain.Snow) {
            if (h < 1 - wk / BEACH + 0.25) {
              col =
                BEACH_RAMP[shadeIndex(Terrain.Desert, light + 0.1, wx, wy, BEACH_RAMP.length - 1)];
            }
          } else if (isWater && !otherWater) {
            if (wk < FOAM_WIDTH && h < 1 - wk / FOAM_WIDTH) col = FOAM;
          } else if (!isWater && !otherWater && h < 0.5 * (1 - wk / BLEND)) {
            const oramp = TERRAIN_RAMPS[other];
            col = oramp[shadeIndex(other, light, wx, wy, oramp.length - 1)];
          }
        }
      }
      const o = (py * target.width + px) * 4;
      data[o] = col[0];
      data[o + 1] = col[1];
      data[o + 2] = col[2];
      data[o + 3] = 255;
    }
  }
}

/** Terrain des Nachbardreiecks über die Kante (n1, n2), -1 wenn keins. */
function terrainAcross(map: GameMap, tri: number, n1: number, n2: number): number {
  for (const t of trianglesAround(map, n1)) {
    if (t < 0 || t === tri) continue;
    const ns = triangleNodes(map, t);
    if (ns[0] === n2 || ns[1] === n2 || ns[2] === n2) return map.terrain[t];
  }
  return -1;
}

function vertex(map: GameMap, light: Float32Array, i: number): Vtx {
  const x = i % map.width;
  const y = (i / map.width) | 0;
  return { x: nodeWorldX(x, y), y: nodeWorldY(y, map.heights[i]), l: light[i] };
}

/** Rastert alle Dreiecke der Knoten im Rechteck [x0,x1) × [y0,y1) in das Ziel. */
export function rasterizeNodes(
  map: GameMap,
  light: Float32Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  target: RasterTarget,
): void {
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= map.height) continue;
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= map.width) continue;
      const i = y * map.width + x;
      for (const kind of [TRI_UP, TRI_DOWN]) {
        const tri = triangleIfExists(map, i, kind);
        if (tri < 0) continue;
        const [a, b, c] = triangleNodes(map, tri);
        const nbr = [
          terrainAcross(map, tri, b, c),
          terrainAcross(map, tri, c, a),
          terrainAcross(map, tri, a, b),
        ];
        fillTriangle(
          target,
          vertex(map, light, a),
          vertex(map, light, b),
          vertex(map, light, c),
          map.terrain[tri],
          nbr,
        );
      }
    }
  }
}

/** Pixelmaße eines Terrain-Chunks mit `chunk` Knoten Kantenlänge. */
export function chunkBounds(
  cx: number,
  cy: number,
  chunk: number,
): { x: number; y: number; w: number; h: number } {
  const maxH = MAP.MAX_HEIGHT * HEIGHT_PX;
  return {
    x: cx * chunk * TW - TW,
    y: cy * chunk * TH - maxH,
    w: chunk * TW + 3 * TW,
    h: chunk * TH + 2 * TH + maxH,
  };
}
