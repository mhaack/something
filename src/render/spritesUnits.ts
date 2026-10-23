/** Prozedurale Sprites für Gebäude, Flaggen, Figuren und Waren. */
import type { WareType } from '../data/wares';
import { hash2 } from '../sim/rng';
import type { RGB } from './palette';
import { PixelBuffer, type Sprite } from './sprites';

const OUTLINE: RGB = [20, 16, 10];

function shade(c: RGB, f: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
  ];
}

/** Flagge mit wehendem Tuch, `frame` 0..3. */
export function makeFlag(color: RGB, frame: number): Sprite {
  const b = new PixelBuffer(12, 20);
  b.rect(2, 1, 1, 18, [60, 44, 26]);
  b.set(2, 0, [200, 180, 120]);
  for (let x = 0; x < 7; x++) {
    const wave = Math.round(Math.sin(((x + frame * 1.5) / 7) * Math.PI * 2) * 0.9);
    for (let y = 0; y < 5; y++) {
      const c = y === 0 || x === 6 ? shade(color, 0.7) : y === 1 ? shade(color, 1.2) : color;
      b.set(3 + x, 1 + y + (x > 1 ? wave : 0), c);
    }
  }
  b.outline(OUTLINE);
  return b.toSprite(2, 19);
}

/** Grenzpfahl in Spielerfarbe. */
export function makeBorderPost(color: RGB): Sprite {
  const b = new PixelBuffer(5, 8);
  b.rect(1, 2, 3, 5, [110, 100, 90]);
  b.rect(1, 1, 3, 2, color);
  b.outline(OUTLINE);
  return b.toSprite(2, 7);
}

const STONE: RGB[] = [
  [86, 80, 74],
  [112, 106, 98],
  [138, 132, 122],
  [164, 158, 146],
];
const ROOF: RGB[] = [
  [96, 34, 24],
  [128, 46, 30],
  [158, 62, 38],
  [186, 84, 52],
];

function stoneWall(
  b: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  seed: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const row = Math.floor((y - y0) / 3);
      const brick = Math.floor((x - x0 + (row % 2) * 2) / 4);
      const mortar = (y - y0) % 3 === 2 || (x - x0 + (row % 2) * 2) % 4 === 3;
      const side = (x - x0) / w;
      let l = 2 - Math.floor(side * 1.6) + (hash2(brick, row, seed) > 0.7 ? 1 : 0);
      if (mortar) l = 0;
      b.set(x, y, STONE[Math.max(0, Math.min(3, l))]);
    }
  }
}

function roof(b: PixelBuffer, cx: number, top: number, halfW: number, h: number): void {
  for (let j = 0; j < h; j++) {
    const hw = Math.round((halfW * (j + 1)) / h);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const side = (x - cx) / Math.max(1, hw);
      const l = side < -0.2 ? 3 : side < 0.3 ? 2 : 1;
      b.set(x, top + j, ROOF[(j % 3 === 2 ? l - 1 : l) as 0 | 1 | 2 | 3] ?? ROOF[0]);
    }
  }
}

/** Hauptquartier: Burg mit zwei Türmen, Tor und Banner in Spielerfarbe. */
export function makeHQ(color: RGB): Sprite {
  const w = 72;
  const h = 70;
  const b = new PixelBuffer(w, h);
  const base = h - 4;
  // Haupthaus
  stoneWall(b, 14, base - 30, 44, 30, 1);
  roof(b, 36, base - 46, 24, 16);
  // Türme
  stoneWall(b, 4, base - 40, 14, 40, 2);
  stoneWall(b, 54, base - 40, 14, 40, 3);
  roof(b, 11, base - 52, 8, 12);
  roof(b, 61, base - 52, 8, 12);
  // Zinnen
  for (let x = 14; x < 54; x += 4) b.rect(x, base - 33, 2, 3, STONE[2]);
  // Tor
  b.rect(30, base - 14, 12, 14, [40, 26, 14]);
  b.rect(31, base - 13, 10, 13, [70, 46, 24]);
  for (let y = base - 13; y < base; y += 3) b.rect(31, y, 10, 1, [52, 34, 18]);
  // Fenster
  for (const x of [9, 59]) b.rect(x, base - 28, 3, 5, [24, 20, 30]);
  for (const x of [20, 48]) b.rect(x, base - 22, 4, 5, [24, 20, 30]);
  // Banner
  b.rect(36, base - 62, 1, 16, [60, 44, 26]);
  b.rect(37, base - 61, 8, 5, color);
  b.rect(37, base - 61, 8, 1, shade(color, 1.3));
  b.outline(OUTLINE);
  return b.toSprite(40, base);
}

/** Baustellen- und Gebäudeplatzhalter folgen in Phase 3. */

const SKIN: RGB = [226, 178, 132];
const HAIR: RGB = [92, 60, 30];
const PANTS: RGB = [70, 62, 90];
const SHOES: RGB = [40, 30, 20];

/** Träger: 4 Laufphasen, nach rechts blickend. */
export function makeCarrier(color: RGB, frame: number): Sprite {
  const b = new PixelBuffer(10, 16);
  const tunic = shade(color, 0.85);
  const tunicLight = shade(color, 1.15);
  const bob = frame % 2;
  const top = 1 + bob;
  // Kopf
  b.rect(4, top, 3, 1, HAIR);
  b.rect(3, top + 1, 4, 3, SKIN);
  b.set(3, top + 1, HAIR);
  b.set(6, top + 2, [40, 30, 30]);
  // Körper
  b.rect(3, top + 4, 4, 5, tunic);
  b.rect(3, top + 4, 1, 5, tunicLight);
  // Arme nach oben (Last auf den Schultern)
  b.set(2, top + 4, SKIN);
  b.set(7, top + 4, SKIN);
  // Beine
  const legA = [0, 1, 0, -1][frame];
  b.rect(3 + Math.max(0, legA), top + 9, 1, 4 - bob, PANTS);
  b.rect(5 - Math.min(0, legA), top + 9, 1, 4 - bob, PANTS);
  b.set(3 + Math.max(0, legA), 14, SHOES);
  b.set(5 - Math.min(0, legA), 14, SHOES);
  b.outline(OUTLINE);
  return b.toSprite(5, 15);
}

/** Esel: 4 Laufphasen, nach rechts blickend. */
export function makeDonkey(frame: number): Sprite {
  const b = new PixelBuffer(18, 14);
  const body: RGB = [128, 118, 108];
  const dark: RGB = [96, 88, 80];
  const light: RGB = [162, 152, 140];
  b.ellipse(8, 7, 6, 3, (_dx, dy) => (dy < -0.3 ? light : body));
  // Kopf und Ohren
  b.rect(13, 3, 3, 4, body);
  b.rect(15, 5, 2, 2, light);
  b.set(13, 1, dark);
  b.set(13, 2, dark);
  b.set(14, 2, dark);
  // Packtaschen
  b.rect(5, 6, 5, 3, [120, 80, 40]);
  // Beine
  const offs = [
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 0, 1],
  ][frame];
  [4, 6, 10, 12].forEach((x, k) => b.rect(x + offs[k], 9, 1, 4, dark));
  // Schwanz
  b.set(2, 6, dark);
  b.set(1, 7, dark);
  b.outline(OUTLINE);
  return b.toSprite(8, 13);
}

/** Spiegelt ein Sprite horizontal (für Blickrichtung links). */
export function mirror(s: Sprite): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = s.w;
  canvas.height = s.h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(s.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, 0, 0);
  return { canvas, ax: s.w - 1 - s.ax, ay: s.ay, w: s.w, h: s.h };
}

type WareShape =
  | 'log'
  | 'plank'
  | 'stone'
  | 'fish'
  | 'loaf'
  | 'meat'
  | 'sack'
  | 'bucket'
  | 'pig'
  | 'lump'
  | 'bar'
  | 'coin'
  | 'sword'
  | 'shield'
  | 'tool';

const WARE_LOOK: Record<WareType, [WareShape, RGB]> = {
  wood: ['log', [120, 78, 40]],
  planks: ['plank', [196, 150, 90]],
  stone: ['stone', [150, 146, 138]],
  fish: ['fish', [120, 150, 180]],
  bread: ['loaf', [196, 140, 70]],
  meat: ['meat', [190, 70, 60]],
  wheat: ['sack', [220, 196, 110]],
  flour: ['sack', [236, 232, 220]],
  water: ['bucket', [70, 120, 200]],
  pig: ['pig', [236, 160, 160]],
  coal: ['lump', [40, 40, 44]],
  ironore: ['lump', [150, 100, 80]],
  goldore: ['lump', [200, 170, 80]],
  iron: ['bar', [150, 160, 176]],
  gold: ['bar', [236, 200, 60]],
  coins: ['coin', [240, 210, 70]],
  sword: ['sword', [200, 206, 216]],
  shield: ['shield', [150, 90, 50]],
  hammer: ['tool', [170, 170, 180]],
  shovel: ['tool', [150, 140, 120]],
  axe: ['tool', [190, 190, 200]],
  saw: ['tool', [210, 210, 220]],
  pick: ['tool', [140, 140, 150]],
  rod: ['tool', [150, 110, 70]],
  scythe: ['tool', [200, 200, 210]],
  cleaver: ['tool', [220, 220, 228]],
  rollingpin: ['tool', [210, 170, 120]],
  tongs: ['tool', [120, 120, 130]],
  crucible: ['tool', [180, 110, 70]],
};

/** Kleines Warensymbol (ca. 7×6 Pixel), Anker unten Mitte. */
export function makeWare(type: WareType): Sprite {
  const [shape, c] = WARE_LOOK[type];
  const b = new PixelBuffer(9, 8);
  const d = shade(c, 0.7);
  const l = shade(c, 1.25);
  switch (shape) {
    case 'log':
      b.rect(1, 3, 7, 3, c);
      b.rect(1, 3, 7, 1, l);
      b.rect(7, 3, 1, 3, [200, 160, 100]);
      break;
    case 'plank':
      b.rect(1, 2, 7, 2, c);
      b.rect(1, 4, 7, 2, d);
      b.rect(1, 2, 7, 1, l);
      break;
    case 'stone':
      b.ellipse(4.5, 4.5, 3.5, 2.5, (dx, dy) => (dx + dy < -0.3 ? l : dx + dy > 0.6 ? d : c));
      break;
    case 'fish':
      b.rect(2, 3, 5, 2, c);
      b.rect(2, 3, 5, 1, l);
      b.set(1, 2, d);
      b.set(1, 5, d);
      b.set(6, 3, [20, 20, 20]);
      break;
    case 'loaf':
      b.ellipse(4.5, 4.5, 3.5, 2, (_dx, dy) => (dy < -0.2 ? l : c));
      break;
    case 'meat':
      b.ellipse(4, 4.5, 3, 2.2, (dx) => (dx < -0.3 ? l : c));
      b.rect(6, 4, 2, 1, [240, 230, 210]);
      break;
    case 'sack':
      b.ellipse(4.5, 5, 3, 2.5, (dx) => (dx < -0.2 ? l : dx > 0.5 ? d : c));
      b.rect(4, 1, 2, 2, d);
      break;
    case 'bucket':
      b.rect(2, 3, 5, 4, [120, 90, 60]);
      b.rect(2, 3, 5, 1, c);
      b.set(4, 1, [80, 60, 40]);
      break;
    case 'pig':
      b.ellipse(4.5, 4.5, 3.5, 2.2, (dx, dy) => (dy < -0.3 ? l : dx > 0.6 ? d : c));
      b.set(8, 4, d);
      break;
    case 'lump':
      b.ellipse(3, 5, 2.2, 1.8, () => c);
      b.ellipse(6, 5, 2, 1.6, () => d);
      b.ellipse(4.5, 3.5, 1.8, 1.4, () => l);
      break;
    case 'bar':
      b.rect(1, 4, 7, 2, d);
      b.rect(2, 3, 5, 1, l);
      b.rect(1, 4, 7, 1, c);
      break;
    case 'coin':
      b.ellipse(4.5, 4.5, 2.5, 2.5, (dx, dy) => (dx + dy < 0 ? l : c));
      break;
    case 'sword':
      b.rect(1, 4, 6, 1, c);
      b.rect(1, 3, 6, 1, l);
      b.rect(7, 2, 1, 4, [140, 100, 40]);
      break;
    case 'shield':
      b.rect(2, 1, 5, 4, c);
      b.rect(3, 5, 3, 1, c);
      b.set(4, 6, c);
      b.rect(4, 1, 1, 5, [220, 200, 120]);
      break;
    case 'tool':
      b.rect(1, 5, 6, 1, [120, 84, 46]);
      b.rect(6, 3, 2, 3, c);
      b.set(6, 3, l);
      break;
  }
  b.outline(OUTLINE);
  return b.toSprite(4, 7);
}
