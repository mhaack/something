/**
 * Prozeduraler Sprite-Generator. Alle Grafiken werden aus kleinen Formen und Paletten in einen
 * Pixelpuffer gezeichnet und einmalig auf ein Canvas vorgerendert.
 */
import { hash2 } from '../sim/rng';
import { type RGB } from './palette';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Ankerpunkt (Fußpunkt) innerhalb des Sprites. */
  ax: number;
  ay: number;
  w: number;
  h: number;
}

/** Pixelpuffer mit Zeichenhilfen. */
export class PixelBuffer {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
    this.data[o + 3] = a;
  }

  isSet(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Gefüllte Ellipse; `shade` liefert pro Pixel die Farbe abhängig von der relativen Lage. */
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    shade: (dx: number, dy: number, x: number, y: number) => RGB | null,
  ): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const c = shade(dx, dy, x, y);
          if (c) this.set(x, y, c);
        }
      }
    }
  }

  /** Dunkler 1-Pixel-Umriss um alle gesetzten Pixel. */
  outline(c: RGB): void {
    const mask: boolean[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) mask.push(this.isSet(x, y));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (mask[y * this.w + x]) continue;
        const near =
          (x > 0 && mask[y * this.w + x - 1]) ||
          (x < this.w - 1 && mask[y * this.w + x + 1]) ||
          (y > 0 && mask[(y - 1) * this.w + x]) ||
          (y < this.h - 1 && mask[(y + 1) * this.w + x]);
        if (near) this.set(x, y, c);
      }
    }
  }

  toSprite(ax: number, ay: number): Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return { canvas, ax, ay, w: this.w, h: this.h };
  }
}

const OUTLINE: RGB = [16, 20, 10];

function pickRamp(ramp: RGB[], t: number): RGB {
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)));
  return ramp[i];
}

const LEAF_RAMP: RGB[] = [
  [22, 54, 16],
  [32, 74, 20],
  [44, 96, 26],
  [62, 120, 34],
  [88, 146, 46],
];
const PINE_RAMP: RGB[] = [
  [14, 40, 24],
  [20, 56, 32],
  [28, 72, 40],
  [40, 92, 50],
  [56, 112, 62],
];
const TRUNK: RGB = [84, 56, 30];
const TRUNK_DARK: RGB = [58, 38, 20];

/** Laubbaum. `size` 0..1 skaliert (für Wachstumsstufen). */
function makeLeafTree(variant: number, size: number): Sprite {
  const w = 24;
  const h = 32;
  const b = new PixelBuffer(w, h);
  const cx = w / 2;
  const baseY = h - 2;
  const trunkH = Math.round(4 + 6 * size);
  b.rect(cx - 1, baseY - trunkH, 2, trunkH, TRUNK);
  b.rect(cx, baseY - trunkH, 1, trunkH, TRUNK_DARK);
  const r = 3 + 6 * size;
  const crownY = baseY - trunkH - r * 0.7;
  const blobs = [
    [0, 0, 1],
    [-0.55, 0.25, 0.7],
    [0.55, 0.3, 0.7],
    [0.1, -0.5, 0.65],
  ];
  for (const [ox, oy, rs] of blobs) {
    b.ellipse(cx + ox * r, crownY + oy * r, r * rs, r * rs * 0.9, (dx, dy, x, y) => {
      const light = 0.55 - dx * 0.25 - dy * 0.35 + (hash2(x, y, 31 + variant) - 0.5) * 0.5;
      return pickRamp(LEAF_RAMP, light);
    });
  }
  b.outline(OUTLINE);
  return b.toSprite(cx, baseY);
}

/** Nadelbaum. */
function makePineTree(variant: number, size: number): Sprite {
  const w = 20;
  const h = 34;
  const b = new PixelBuffer(w, h);
  const cx = w / 2;
  const baseY = h - 2;
  b.rect(cx - 1, baseY - 4, 2, 4, TRUNK);
  const height = Math.round(8 + 20 * size);
  const halfW = 2 + 5 * size;
  for (let j = 0; j < height; j++) {
    const t = j / height; // 0 = Spitze
    const layer = (j % 5) / 5;
    const hw = halfW * (0.25 + 0.75 * t) * (0.75 + 0.35 * layer);
    const y = baseY - 3 - height + j;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = (x + 0.5 - cx) / Math.max(1, hw);
      const light = 0.55 - dx * 0.35 + layer * 0.2 + (hash2(x, y, 57 + variant) - 0.5) * 0.4;
      b.set(x, y, pickRamp(PINE_RAMP, light));
    }
  }
  b.outline(OUTLINE);
  return b.toSprite(cx, baseY);
}

const ROCK_RAMP: RGB[] = [
  [64, 60, 58],
  [90, 86, 82],
  [118, 114, 108],
  [146, 142, 134],
  [178, 174, 166],
];

/** Felsbrocken; `size` 0..1 nach Reststeinen. */
function makeRock(variant: number, size: number): Sprite {
  const w = 28;
  const h = 22;
  const b = new PixelBuffer(w, h);
  const cx = w / 2;
  const baseY = h - 3;
  const n = 2 + Math.round(size * 3);
  for (let k = 0; k < n; k++) {
    const ox = (hash2(k, variant, 3) - 0.5) * 12 * (0.5 + size);
    const oy = -hash2(k, variant, 5) * 4 * size;
    const rx = 3 + size * 5 * (0.6 + hash2(k, variant, 7) * 0.6);
    const ry = rx * 0.75;
    b.ellipse(cx + ox, baseY - ry + oy, rx, ry, (dx, dy, x, y) => {
      const light = 0.6 - dx * 0.3 - dy * 0.45 + (hash2(x, y, 91) - 0.5) * 0.3;
      return pickRamp(ROCK_RAMP, light);
    });
  }
  b.outline([28, 26, 24]);
  return b.toSprite(cx, baseY);
}

/** Startmarker (Platzhalter bis zum HQ in Phase 2): Fahnenmast in Spielerfarbe. */
function makeStartFlag(color: RGB): Sprite {
  const b = new PixelBuffer(16, 26);
  b.rect(3, 2, 1, 22, [70, 50, 30]);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 9; x++) {
      const wave = Math.round(Math.sin((x / 9) * Math.PI * 1.5));
      b.set(4 + x, 3 + y + wave, x < 1 ? [0, 0, 0] : color);
    }
  }
  b.outline(OUTLINE);
  return b.toSprite(3, 24);
}

export interface SpriteSet {
  trees: Sprite[];
  rocks: Sprite[][];
  startFlags: Sprite[];
}

export const ROCK_SIZES = 3;

export function buildSprites(playerColors: RGB[]): SpriteSet {
  return {
    trees: [makeLeafTree(0, 1), makeLeafTree(1, 0.85), makePineTree(0, 1), makePineTree(1, 0.85)],
    rocks: [0, 1].map((v) =>
      Array.from({ length: ROCK_SIZES }, (_, s) => makeRock(v, (s + 1) / ROCK_SIZES)),
    ),
    startFlags: playerColors.map(makeStartFlag),
  };
}
