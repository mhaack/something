import { hash2 } from './rng';

/** Glatte Interpolationskurve (nur Grundrechenarten, deterministisch). */
function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value-Noise in [0, 1) mit Gitterabstand `period`. */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  const fx = x / period;
  const fy = y / period;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fade(fx - x0);
  const ty = fade(fy - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** Fraktales Rauschen aus mehreren Oktaven, normiert auf [0, 1). */
export function fbm(x: number, y: number, period: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x, y, p, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    p = Math.max(1, p / 2);
  }
  return sum / norm;
}
