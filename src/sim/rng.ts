/**
 * Seedbarer, deterministischer RNG (sfc32). Der Zustand ist ein Array aus vier 32-Bit-Zahlen und
 * damit direkt JSON-serialisierbar. Funktionen mutieren den übergebenen Zustand.
 */

export type RngState = [number, number, number, number];

/** Mischt einen beliebigen Zahlen- oder Text-Seed zu einer 32-Bit-Zahl. */
export function hashSeed(seed: number | string): number {
  const s = String(seed);
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRng(seed: number | string): RngState {
  const h = hashSeed(seed);
  const state: RngState = [h, h ^ 0x9e3779b9, h ^ 0x243f6a88, h ^ 0xb7e15162];
  // Aufwärmen, damit ähnliche Seeds auseinanderlaufen.
  for (let i = 0; i < 15; i++) nextU32(state);
  return state;
}

/** Nächste 32-Bit-Zahl ohne Vorzeichen. */
export function nextU32(s: RngState): number {
  let a = s[0] >>> 0;
  let b = s[1] >>> 0;
  let c = s[2] >>> 0;
  let d = s[3] >>> 0;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  s[0] = a >>> 0;
  s[1] = b;
  s[2] = c;
  s[3] = d;
  return t;
}

/** Gleichverteilte Zahl in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Ganze Zahl in [min, max] (beide inklusive). */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}

export function chance(s: RngState, p: number): boolean {
  return nextFloat(s) < p;
}

export function pick<T>(s: RngState, items: readonly T[]): T {
  return items[nextInt(s, 0, items.length - 1)];
}

/** Zustandsloser Hash zweier Koordinaten und eines Seeds → [0, 1). Für Noise und Rendering. */
export function hash2(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
