/**
 * Prozeduraler Sprite-Generator. Alle Grafiken werden aus kleinen Formen und Paletten in einen
 * Pixelpuffer gezeichnet und einmalig auf ein Canvas vorgerendert.
 */
import { hash2 } from '../sim/rng';
import { WARE_TYPES, type WareType } from '../data/wares';
import { type RGB } from './palette';
import {
  makeBorderPost,
  makeCarrier,
  makeDonkey,
  makeFlag,
  makeHQ,
  makeWare,
  mirror,
} from './spritesUnits';

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

  /** Dunkler 1-Pixel-Umriss um alle deckend gesetzten Pixel. */
  outline(c: RGB): void {
    const mask: boolean[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) mask.push(this.data[(y * this.w + x) * 4 + 3] === 255);
    }
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

  /** Halbtransparenter Schlagschatten (nur auf leeren Pixeln, nach dem Umriss aufrufen). */
  shadow(cx: number, cy: number, rx: number, ry: number, alpha = 90): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && !this.isSet(x, y)) this.set(x, y, [10, 16, 6], alpha);
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

const OUTLINE: RGB = [16, 22, 10];

export function pickRamp(ramp: RGB[], t: number): RGB {
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)));
  return ramp[i];
}

const OAK_RAMP: RGB[] = [
  [18, 44, 14],
  [26, 62, 18],
  [36, 82, 22],
  [50, 104, 28],
  [70, 128, 36],
  [98, 152, 50],
];
const BIRCH_RAMP: RGB[] = [
  [36, 66, 18],
  [52, 88, 24],
  [72, 112, 30],
  [96, 136, 40],
  [124, 160, 54],
  [156, 184, 72],
];
const PINE_RAMP: RGB[] = [
  [10, 32, 22],
  [16, 46, 30],
  [24, 62, 38],
  [34, 80, 46],
  [48, 100, 56],
  [66, 120, 70],
];
const BARK: RGB[] = [
  [48, 32, 18],
  [70, 46, 26],
  [96, 64, 36],
  [120, 84, 48],
];
const BIRCH_BARK: RGB[] = [
  [40, 36, 32],
  [168, 164, 150],
  [208, 204, 190],
  [236, 234, 222],
];

function trunk(b: PixelBuffer, cx: number, baseY: number, h: number, w: number, bark: RGB[]): void {
  for (let y = baseY - h; y <= baseY; y++) {
    const flare = y >= baseY - 1 ? 1 : 0;
    for (let x = cx - (w >> 1) - flare; x <= cx + ((w - 1) >> 1) + flare; x++) {
      const side = (x - cx + 0.5) / (w / 2 + flare);
      let l = side < -0.3 ? 3 : side < 0.3 ? 2 : 1;
      if (bark === BIRCH_BARK && hash2(x, y >> 1, 7) > 0.8) l = 0;
      else if (hash2(x, y, 3) > 0.85) l = Math.max(0, l - 1);
      b.set(x, y, bark[l]);
    }
  }
}

/** Laubkrone aus Blattbüscheln. `sway` verschiebt die oberen Teile (Wind). */
function crown(
  b: PixelBuffer,
  cx: number,
  cy: number,
  r: number,
  ramp: RGB[],
  seed: number,
  sway: number,
): void {
  const clusters: [number, number, number][] = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + hash2(k, seed, 1) * 0.6;
    const dist = 0.45 + hash2(k, seed, 2) * 0.3;
    clusters.push([
      Math.cos(ang) * dist * r,
      Math.sin(ang) * dist * r * 0.8,
      r * (0.42 + hash2(k, seed, 3) * 0.18),
    ]);
  }
  clusters.push([0, -0.1 * r, r * 0.6]);
  // Von hinten (oben) nach vorn (unten) zeichnen, damit untere Büschel überdecken.
  clusters.sort((p, q) => p[1] - q[1]);
  for (const [ox, oy, rr] of clusters) {
    const lift = (oy / r + 1) / 2; // 0 oben .. 1 unten
    const sx = sway * (1 - lift);
    b.ellipse(cx + ox + sx, cy + oy, rr, rr * 0.85, (dx, dy, x, y) => {
      const local = -dx * 0.35 - dy * 0.45;
      const global = -(ox / r) * 0.15 - (oy / r) * 0.2;
      const noise = (hash2(x, y, seed + 11) - 0.5) * 0.35;
      return pickRamp(ramp, 0.5 + local + global + noise);
    });
  }
  // Glanzlichter oben links
  for (let k = 0; k < 10; k++) {
    const x = cx - r * 0.5 + hash2(k, seed, 9) * r * 0.9 + sway;
    const y = cy - r * 0.6 + hash2(k, seed, 10) * r * 0.6;
    if (b.isSet(x, y)) b.set(x, y, ramp[ramp.length - 1]);
  }
}

/** Laubbaum (Eiche/Birke). */
function makeLeafTree(variant: number, birch: boolean, sway: number): Sprite {
  const w = 32;
  const h = 44;
  const b = new PixelBuffer(w, h);
  const cx = 16;
  const baseY = h - 4;
  const trunkH = birch ? 18 : 14;
  trunk(b, cx, baseY, trunkH, birch ? 2 : 3, birch ? BIRCH_BARK : BARK);
  // Äste
  const branch = birch ? BIRCH_BARK[1] : BARK[1];
  b.set(cx - 2, baseY - trunkH + 3, branch);
  b.set(cx - 3, baseY - trunkH + 2, branch);
  b.set(cx + 2, baseY - trunkH + 4, branch);
  b.set(cx + 3, baseY - trunkH + 3, branch);
  const r = birch ? 8 : 10.5;
  crown(b, cx, baseY - trunkH - r * 0.55, r, birch ? BIRCH_RAMP : OAK_RAMP, 31 + variant, sway);
  b.outline(OUTLINE);
  b.shadow(cx + 4, baseY, 8, 2.5);
  return b.toSprite(cx, baseY);
}

/** Nadelbaum mit hängenden Astlagen. */
function makePineTree(variant: number, tall: boolean, sway: number): Sprite {
  const w = 26;
  const h = 46;
  const b = new PixelBuffer(w, h);
  const cx = 13;
  const baseY = h - 4;
  trunk(b, cx, baseY, 6, 2, BARK);
  const height = tall ? 34 : 28;
  const halfW = tall ? 8 : 9;
  const tiers = tall ? 6 : 5;
  for (let j = 0; j < height; j++) {
    const t = j / height; // 0 = Spitze
    const tierPos = (t * tiers) % 1; // 0 = oben in der Lage
    const hw = halfW * (0.12 + 0.88 * t) * (0.55 + 0.5 * tierPos);
    const y = baseY - 4 - height + j;
    const sx = Math.round(sway * (1 - t));
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = (x + 0.5 - cx) / Math.max(1, hw);
      const droop = Math.abs(dx) > 0.8 && tierPos < 0.3 ? -1 : 0;
      const light =
        0.55 - dx * 0.35 + (tierPos - 0.5) * 0.35 + (hash2(x, y, 57 + variant) - 0.5) * 0.35;
      b.set(x + sx, y + droop, pickRamp(PINE_RAMP, light));
    }
  }
  b.outline(OUTLINE);
  b.shadow(cx + 4, baseY, 7, 2.2);
  return b.toSprite(cx, baseY);
}

const ROCK_RAMP: RGB[] = [
  [52, 50, 50],
  [76, 74, 72],
  [102, 100, 96],
  [130, 128, 122],
  [160, 158, 150],
  [192, 190, 182],
];
const MOSS: RGB = [70, 98, 40];

/** Facettierter Felsbrocken; `size` 0..1 nach Reststeinen. */
function makeRock(variant: number, size: number): Sprite {
  const w = 32;
  const h = 26;
  const b = new PixelBuffer(w, h);
  const cx = w / 2;
  const baseY = h - 4;
  const n = 2 + Math.round(size * 3);
  const parts: [number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const ox = (hash2(k, variant, 3) - 0.5) * 14 * (0.5 + size);
    const rx = 3 + size * 5.5 * (0.6 + hash2(k, variant, 7) * 0.6);
    parts.push([ox, rx, hash2(k, variant, 5)]);
  }
  parts.sort((p, q) => q[1] - p[1]); // große zuerst (hinten)
  for (const [ox, rx, hv] of parts) {
    const ry = rx * 0.8;
    const ccy = baseY - ry + 1 - hv * 3 * size;
    b.ellipse(cx + ox, ccy, rx, ry, (dx, dy, x, y) => {
      // Facetten: Normale grob quantisieren
      const fx = Math.round(dx * 2) / 2;
      const fy = Math.round(dy * 2) / 2;
      let l = 0.58 - fx * 0.3 - fy * 0.4;
      if (hash2(x, y, 91) > 0.92) l -= 0.25;
      if (fy < -0.4 && hash2(x >> 1, y, 13 + variant) > 0.75) return MOSS;
      return pickRamp(ROCK_RAMP, l);
    });
  }
  b.outline([26, 24, 22]);
  b.shadow(cx + 3, baseY, 6 + size * 8, 2.5);
  return b.toSprite(cx, baseY);
}

// --- Dekoration (nur Darstellung, kein Spielzustand) ------------------------------------------

function makeDecoration(kind: number): Sprite {
  const b = new PixelBuffer(9, 8);
  const ax = 4;
  const ay = 6;
  switch (kind) {
    case 0: // Grasbüschel
    case 1: {
      const g: RGB[] = [
        [40, 90, 22],
        [70, 130, 36],
        [110, 168, 56],
      ];
      for (let k = 0; k < 5; k++) {
        const x = 2 + k;
        const hh = 2 + ((hash2(k, kind, 3) * 3) | 0);
        for (let j = 0; j < hh; j++)
          b.set(x + (j > 1 && k % 2 ? (k < 2 ? -1 : 1) : 0), ay - j, g[Math.min(2, j)]);
      }
      break;
    }
    case 2: // weiße Blumen
    case 3: // gelbe Blumen
    case 4: {
      // rote Blumen
      const petal: RGB = kind === 2 ? [240, 240, 232] : kind === 3 ? [240, 210, 60] : [210, 50, 50];
      for (let k = 0; k < 3; k++) {
        const x = 1 + k * 3;
        const y = ay - 1 - (k % 2);
        b.set(x, y + 1, [50, 110, 30]);
        b.set(x, y, petal);
        b.set(x + 1, y, petal);
        b.set(x, y - 1, petal);
      }
      break;
    }
    case 5: // kleine Steine
      b.set(2, ay, [120, 116, 110]);
      b.set(3, ay, [150, 146, 138]);
      b.set(3, ay - 1, [170, 166, 158]);
      b.set(6, ay, [110, 106, 100]);
      break;
    case 6: // Busch
      b.ellipse(4.5, ay - 2, 3.5, 2.5, (dx, dy) => pickRamp(OAK_RAMP, 0.55 - dx * 0.3 - dy * 0.4));
      b.outline(OUTLINE);
      break;
    case 7: // Pilz
      b.set(4, ay, [230, 220, 200]);
      b.rect(3, ay - 1, 3, 1, [190, 40, 30]);
      b.set(4, ay - 2, [210, 60, 40]);
      b.set(3, ay - 1, [240, 240, 240]);
      break;
    case 8: // trockenes Wüstengras
      for (let k = 0; k < 4; k++) {
        b.set(2 + k * 2, ay, [150, 120, 60]);
        b.set(2 + k * 2 + (k % 2 ? 1 : -1), ay - 1, [180, 150, 80]);
      }
      break;
    case 9: // Schilf (Sumpf)
      for (let k = 0; k < 3; k++) {
        const x = 2 + k * 2;
        for (let j = 0; j < 5; j++) b.set(x, ay - j, j === 4 ? [120, 80, 40] : [70, 110, 40]);
      }
      break;
  }
  return b.toSprite(ax, ay);
}

export const DECORATION_KINDS = 10;

export interface SpriteSet {
  /** [Variante][Windphase] */
  trees: Sprite[][];
  rocks: Sprite[][];
  decorations: Sprite[];
  /** [Spieler][Frame] */
  flags: Sprite[][];
  borderPosts: Sprite[];
  hq: Sprite[];
  /** [Spieler][Blick 0=rechts,1=links][Frame], mit Last auf den Schultern */
  carriers: Sprite[][][];
  /** wie `carriers`, ohne Last */
  carriersEmpty: Sprite[][][];
  /** [Blick][Frame] */
  donkeys: Sprite[][];
  wares: Record<WareType, Sprite>;
}

export const ROCK_SIZES = 3;
export const WALK_FRAMES = 4;
export const FLAG_FRAMES = 4;
/** Windphasen der Bäume (Pendel: -1, 0, 1, 0). */
export const TREE_FRAMES = 4;
const SWAY = [-1, 0, 1, 0];

export function buildSprites(playerColors: RGB[]): SpriteSet {
  const frames = (f: (i: number) => Sprite, n: number): Sprite[] =>
    Array.from({ length: n }, (_, i) => f(i));
  const wares = {} as Record<WareType, Sprite>;
  for (const t of WARE_TYPES) wares[t] = makeWare(t);
  const donkeyR = frames(makeDonkey, WALK_FRAMES);
  const treeVariants: ((sway: number) => Sprite)[] = [
    (s) => makeLeafTree(0, false, s),
    (s) => makeLeafTree(1, true, s),
    (s) => makePineTree(0, false, s),
    (s) => makePineTree(1, true, s),
  ];
  const carriersFor = (loaded: boolean): Sprite[][][] =>
    playerColors.map((c) => {
      const right = frames((i) => makeCarrier(c, i, loaded), WALK_FRAMES);
      return [right, right.map(mirror)];
    });
  return {
    trees: treeVariants.map((mk) => SWAY.map((s) => mk(s))),
    rocks: [0, 1].map((v) =>
      Array.from({ length: ROCK_SIZES }, (_, s) => makeRock(v, (s + 1) / ROCK_SIZES)),
    ),
    decorations: frames(makeDecoration, DECORATION_KINDS),
    flags: playerColors.map((c) => frames((i) => makeFlag(c, i), FLAG_FRAMES)),
    borderPosts: playerColors.map(makeBorderPost),
    hq: playerColors.map(makeHQ),
    carriers: carriersFor(true),
    carriersEmpty: carriersFor(false),
    donkeys: [donkeyR, donkeyR.map(mirror)],
    wares,
  };
}
