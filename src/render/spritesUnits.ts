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

const WOOD: RGB[] = [
  [52, 34, 18],
  [78, 52, 28],
  [104, 72, 40],
  [132, 94, 54],
];
const GOLD: RGB = [236, 200, 80];

/** Flagge mit wehendem Tuch, `frame` 0..3. */
export function makeFlag(color: RGB, frame: number): Sprite {
  const b = new PixelBuffer(16, 24);
  const px = 3;
  // Mast mit Licht links
  for (let y = 2; y < 22; y++) {
    b.set(px, y, WOOD[2]);
    b.set(px + 1, y, WOOD[1]);
  }
  b.set(px, 1, GOLD);
  b.set(px + 1, 1, shade(GOLD, 0.8));
  b.set(px, 0, shade(GOLD, 1.1));
  // Tuch: wehend, mit Verlauf und Falten
  const cw = 9;
  const ch = 6;
  for (let x = 0; x < cw; x++) {
    const phase = ((x + frame * 2.2) / cw) * Math.PI * 2;
    const wave = Math.round(Math.sin(phase) * (x / cw) * 1.6);
    const fold = Math.cos(phase);
    for (let y = 0; y < ch; y++) {
      let f = 1 + fold * 0.18 - (y / ch) * 0.15;
      if (y === 0) f += 0.15;
      if (x === cw - 1) f -= 0.2;
      b.set(px + 2 + x, 2 + y + wave, shade(color, f));
    }
  }
  b.outline(OUTLINE);
  // Fußsteine
  b.set(px - 1, 22, [110, 104, 96]);
  b.set(px + 2, 22, [130, 124, 116]);
  b.set(px, 22, [90, 86, 80]);
  b.shadow(px + 4, 22, 4, 1.4, 80);
  return b.toSprite(px, 22);
}

/** Grenzpfahl in Spielerfarbe. */
export function makeBorderPost(color: RGB): Sprite {
  const b = new PixelBuffer(6, 10);
  b.rect(2, 3, 2, 6, WOOD[2]);
  b.rect(3, 3, 1, 6, WOOD[1]);
  b.rect(1, 1, 4, 3, color);
  b.rect(1, 1, 4, 1, shade(color, 1.3));
  b.outline(OUTLINE);
  b.shadow(4, 9, 2, 1, 70);
  return b.toSprite(2, 9);
}

const STONE: RGB[] = [
  [70, 64, 60],
  [96, 90, 84],
  [122, 116, 108],
  [148, 142, 132],
  [172, 166, 154],
];
const ROOF: RGB[] = [
  [78, 28, 20],
  [110, 40, 28],
  [142, 56, 36],
  [172, 76, 48],
  [196, 100, 64],
];

/** Mauer aus versetzten Quadern; `curve` > 0 schattiert zylindrisch (Turm). */
function stoneWall(
  b: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  seed: number,
  curve = 0,
): void {
  for (let y = y0; y < y0 + h; y++) {
    const row = Math.floor((y - y0) / 4);
    const off = (row % 2) * 3;
    for (let x = x0; x < x0 + w; x++) {
      const bx = Math.floor((x - x0 + off) / 6);
      const mortarY = (y - y0) % 4 === 3;
      const mortarX = (x - x0 + off) % 6 === 5;
      const t = (x - x0 + 0.5) / w; // 0 links .. 1 rechts
      let l = curve ? 3.2 - Math.pow(Math.abs(t - 0.3) * 1.6, 1.5) * 2.4 : 3 - t * 1.6;
      l += (hash2(bx, row, seed) - 0.5) * 1.1;
      if (mortarY || mortarX) l -= 1.4;
      b.set(x, y, STONE[Math.max(0, Math.min(4, Math.round(l)))]);
    }
  }
}

/** Kegeldach mit Ziegelreihen. */
function coneRoof(b: PixelBuffer, cx: number, top: number, halfW: number, h: number): void {
  for (let j = 0; j < h; j++) {
    const hw = Math.round((halfW * (j + 1)) / h);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const side = (x - cx) / Math.max(1, hw);
      let l = side < -0.4 ? 4 : side < 0 ? 3 : side < 0.5 ? 2 : 1;
      if (j % 3 === 2) l -= 1;
      if ((x + (((j / 3) | 0) % 2) * 2) % 4 === 0 && j % 3 !== 2) l -= 1;
      b.set(x, top + j, ROOF[Math.max(0, l)]);
    }
  }
}

/** Satteldach (Front) über dem Haupthaus. */
function gableRoof(b: PixelBuffer, cx: number, top: number, halfW: number, h: number): void {
  for (let j = 0; j < h; j++) {
    const hw = Math.round(halfW * Math.min(1, (j + 2) / h));
    for (let x = cx - hw; x <= cx + hw; x++) {
      const side = (x - cx) / Math.max(1, hw);
      let l = side < 0 ? 3 : 2;
      if (j % 3 === 2) l -= 1;
      if (Math.abs(x - cx) === hw) l = 0;
      b.set(x, top + j, ROOF[Math.max(0, l)]);
    }
  }
}

function crenels(b: PixelBuffer, x0: number, x1: number, y: number): void {
  for (let x = x0; x < x1; x += 4) {
    b.rect(x, y - 3, 2, 3, STONE[3]);
    b.set(x + 1, y - 3, STONE[2]);
  }
}

function archWindow(b: PixelBuffer, x: number, y: number, w: number, h: number, lit = false): void {
  const glass: RGB = lit ? [230, 190, 90] : [28, 26, 40];
  b.rect(x, y + 1, w, h - 1, glass);
  b.rect(x + 1, y, w - 2, 1, glass);
  b.rect(x - 1, y + h, w + 2, 1, STONE[4]);
  if (w >= 3) b.rect(x + (w >> 1), y + 1, 1, h - 1, STONE[1]);
}

/** Hauptquartier: Burg mit zwei Rundtürmen, Bergfried, Tor und Bannern in Spielerfarbe. */
export function makeHQ(color: RGB): Sprite {
  const w = 88;
  const h = 84;
  const b = new PixelBuffer(w, h);
  const base = h - 6;
  // Sockel
  stoneWall(b, 6, base - 4, 76, 5, 9);
  // Bergfried hinten
  stoneWall(b, 30, base - 52, 28, 22, 4);
  crenels(b, 30, 58, base - 52);
  archWindow(b, 42, base - 46, 4, 6, true);
  // Haupthaus
  stoneWall(b, 16, base - 32, 56, 30, 1);
  gableRoof(b, 44, base - 44, 26, 13);
  crenels(b, 16, 72, base - 32);
  // Türme
  stoneWall(b, 4, base - 44, 16, 44, 2, 1);
  stoneWall(b, 68, base - 44, 16, 44, 3, 1);
  coneRoof(b, 12, base - 60, 10, 16);
  coneRoof(b, 76, base - 60, 10, 16);
  for (const tx of [12, 76]) {
    b.set(tx, base - 61, GOLD);
    archWindow(b, tx - 1, base - 36, 3, 5);
    archWindow(b, tx - 1, base - 22, 3, 5);
  }
  // Tor mit Bogen, Bohlen und Eisenbändern
  const gx = 37;
  const gw = 14;
  const gy = base - 17;
  for (let y = gy; y < base; y++) {
    for (let x = gx; x < gx + gw; x++) {
      const dx = x - (gx + gw / 2 - 0.5);
      if (y < gy + 4 && dx * dx + (gy + 4 - y) * (gy + 4 - y) * 3 > 50) continue;
      let c = WOOD[(x - gx) % 3 === 2 ? 0 : 2];
      if ((y - gy) % 6 === 4) c = [50, 48, 52];
      b.set(x, y, c);
    }
  }
  b.rect(gx + gw - 3, gy + 9, 1, 2, GOLD);
  for (const x of [gx - 2, gx + gw + 1]) b.rect(x, gy + 2, 1, base - gy - 2, STONE[0]);
  // Fenster im Haupthaus
  archWindow(b, 22, base - 24, 4, 6, true);
  archWindow(b, 62, base - 24, 4, 6);
  archWindow(b, 28, base - 26, 3, 5);
  archWindow(b, 57, base - 26, 3, 5, true);
  // Banner an der Front
  for (const bx of [26, 58]) {
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 5; x++) {
        if (y >= 10 && x === 2) continue;
        const f = x === 0 ? 1.25 : x === 4 ? 0.75 : 1;
        b.set(bx + x, base - 30 + y, shade(color, f));
      }
    }
    b.rect(bx - 1, base - 31, 7, 1, WOOD[1]);
    b.set(bx + 2, base - 26, GOLD);
  }
  // Fahne auf dem Bergfried
  b.rect(44, base - 70, 1, 18, WOOD[1]);
  b.set(44, base - 71, GOLD);
  for (let x = 0; x < 10; x++) {
    const wave = Math.round(Math.sin((x / 10) * Math.PI * 2) * 0.8);
    for (let y = 0; y < 5; y++)
      b.set(45 + x, base - 69 + y + wave, shade(color, y === 0 ? 1.25 : 1));
  }
  // Efeu an der linken Turmseite
  for (let k = 0; k < 14; k++) {
    const x = 4 + ((hash2(k, 1, 5) * 5) | 0);
    const y = base - 6 - ((hash2(k, 2, 5) * 22) | 0);
    b.set(x, y, [50, 96, 34]);
    b.set(x + 1, y, [70, 120, 42]);
  }
  b.outline(OUTLINE);
  b.shadow(50, base, 40, 4, 100);
  return b.toSprite(44, base);
}

const SKIN: RGB = [228, 180, 136];
const SKIN_DARK: RGB = [190, 140, 100];
const PANTS: RGB = [74, 64, 96];
const PANTS_DARK: RGB = [54, 46, 72];
const BOOTS: RGB = [52, 36, 22];
const BELT: RGB = [96, 62, 30];

export type FigurePose = 'walk' | 'carry' | 'work';

/** Aussehen einer Berufsfigur. */
export interface FigureLook {
  hat: RGB;
  hatStyle: 'brim' | 'cap' | 'hood';
  apron?: RGB;
  tool: 'axe' | 'shovel' | 'pick' | 'hammer' | 'saw' | 'rod' | 'scythe' | 'cleaver' | null;
}

export const FIGURE_LOOKS: Record<string, FigureLook> = {
  carrier: { hat: [200, 172, 96], hatStyle: 'brim', tool: null },
  builder: { hat: [190, 60, 40], hatStyle: 'cap', tool: 'hammer' },
  leveler: { hat: [130, 96, 56], hatStyle: 'brim', tool: 'shovel' },
  woodcutter: { hat: [60, 110, 50], hatStyle: 'hood', tool: 'axe' },
  forester: { hat: [70, 130, 60], hatStyle: 'brim', tool: 'shovel' },
  stonecutter: { hat: [130, 130, 136], hatStyle: 'cap', tool: 'pick' },
  sawyer: { hat: [70, 90, 160], hatStyle: 'cap', apron: [220, 210, 186], tool: 'saw' },
  fisher: { hat: [60, 90, 140], hatStyle: 'brim', tool: 'rod' },
  farmer: { hat: [214, 186, 100], hatStyle: 'brim', tool: 'scythe' },
  waterer: { hat: [90, 120, 170], hatStyle: 'cap', tool: null },
  miller: { hat: [236, 232, 220], hatStyle: 'cap', apron: [236, 232, 220], tool: null },
  baker: { hat: [244, 242, 236], hatStyle: 'cap', apron: [244, 242, 236], tool: null },
  pigbreeder: { hat: [120, 84, 48], hatStyle: 'brim', tool: null },
  butcher: { hat: [200, 60, 50], hatStyle: 'cap', apron: [236, 220, 214], tool: 'cleaver' },
  donkeybreeder: { hat: [150, 120, 80], hatStyle: 'brim', tool: null },
  geologist: { hat: [110, 110, 120], hatStyle: 'hood', tool: 'hammer' },
  miner: { hat: [220, 190, 60], hatStyle: 'cap', tool: 'pick' },
  smelter: { hat: [70, 60, 56], hatStyle: 'cap', apron: [110, 80, 56], tool: null },
  minter: { hat: [200, 170, 70], hatStyle: 'cap', apron: [110, 80, 56], tool: null },
  toolsmith: { hat: [80, 80, 90], hatStyle: 'cap', apron: [110, 80, 56], tool: 'hammer' },
  weaponsmith: { hat: [150, 40, 40], hatStyle: 'cap', apron: [110, 80, 56], tool: 'hammer' },
};

const METAL: RGB = [196, 198, 208];
const METAL_DARK: RGB = [120, 122, 132];
const FIG_HANDLE: RGB = [130, 90, 50];

/** Werkzeug von (x0,y0) (Hand) in Richtung (dx,dy) mit Kopf am Ende. */
function drawHeldTool(
  b: PixelBuffer,
  tool: NonNullable<FigureLook['tool']>,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
): void {
  const len = tool === 'saw' ? 6 : tool === 'rod' ? 9 : tool === 'scythe' ? 7 : 5;
  for (let k = 0; k < len; k++) {
    const c = tool === 'saw' && k > 0 ? (k % 2 ? METAL : METAL_DARK) : FIG_HANDLE;
    b.set(x0 + Math.round(dx * k), y0 + Math.round(dy * k), c);
  }
  const hx = x0 + Math.round(dx * (len - 1));
  const hy = y0 + Math.round(dy * (len - 1));
  switch (tool) {
    case 'axe':
      b.rect(hx - 1, hy - 1, 2, 3, METAL);
      b.set(hx - 2, hy, METAL_DARK);
      break;
    case 'hammer':
      b.rect(hx - 1, hy - 1, 3, 2, METAL_DARK);
      b.set(hx - 1, hy - 1, METAL);
      break;
    case 'pick':
      b.set(hx - 1, hy, METAL);
      b.set(hx + 1, hy, METAL);
      b.set(hx - 2, hy + 1, METAL_DARK);
      b.set(hx + 2, hy + 1, METAL_DARK);
      b.set(hx, hy, METAL_DARK);
      break;
    case 'shovel':
      b.rect(hx, hy, 2, 3, METAL);
      b.set(hx + 1, hy + 2, METAL_DARK);
      break;
    case 'saw':
      b.set(hx, hy, FIG_HANDLE);
      break;
    case 'rod':
      b.set(hx + 1, hy, [220, 220, 220]);
      b.set(hx + 1, hy + 1, [220, 220, 220]);
      b.set(hx + 1, hy + 2, [200, 40, 30]);
      break;
    case 'scythe':
      for (let k = 1; k <= 4; k++) b.set(hx - k, hy + (k >> 1), k === 1 ? METAL_DARK : METAL);
      break;
    case 'cleaver':
      b.rect(hx, hy - 1, 3, 3, METAL);
      b.set(hx + 2, hy + 1, METAL_DARK);
      break;
  }
}

/**
 * Figur (nach rechts blickend). `walk`/`carry`: 4 Laufphasen, mit Last trägt sie die Ware mit
 * erhobenen Armen. `work`: 2 Phasen (Werkzeug oben / unten).
 */
export function makeFigure(color: RGB, frame: number, pose: FigurePose, look: FigureLook): Sprite {
  const b = new PixelBuffer(18, 22);
  const shirt = shade(color, 0.9);
  const shirtLight = shade(color, 1.2);
  const shirtDark = shade(color, 0.65);
  const working = pose === 'work';
  const bob = !working && frame % 2 === 1 ? 1 : 0;
  const top = 4 + bob;
  const cx = 7;
  const hatDark = shade(look.hat, 0.72);
  // Kopfbedeckung
  if (look.hatStyle === 'brim') {
    b.rect(cx - 3, top + 1, 6, 1, hatDark);
    b.rect(cx - 2, top, 4, 1, look.hat);
    b.rect(cx - 1, top - 1, 3, 1, look.hat);
  } else if (look.hatStyle === 'cap') {
    b.rect(cx - 2, top, 4, 2, look.hat);
    b.rect(cx + 1, top + 1, 2, 1, hatDark);
  } else {
    b.rect(cx - 2, top, 4, 2, look.hat);
    b.rect(cx - 3, top + 1, 1, 4, hatDark);
  }
  // Kopf
  b.rect(cx - 2, top + 2, 4, 3, SKIN);
  b.set(cx - 2, top + 2, SKIN_DARK);
  b.set(cx + 1, top + 3, [40, 30, 30]);
  b.set(cx + 2, top + 4, SKIN);
  if (look.hatStyle !== 'hood') b.set(cx - 2, top + 4, [110, 70, 40]);
  // Rumpf
  for (let y = 0; y < 6; y++) {
    for (let x = -2; x <= 1; x++) {
      let c = x === -2 ? shirtLight : x === 1 ? shirtDark : shirt;
      if (look.apron && y >= 2 && x >= 0) c = look.apron;
      b.set(cx + x, top + 5 + y, c);
    }
  }
  b.rect(cx - 2, top + 9, 4, 1, BELT);
  // Arme und Werkzeug
  if (pose === 'carry') {
    b.rect(cx - 3, top + 3, 1, 3, shirtLight);
    b.rect(cx + 2, top + 3, 1, 3, shirtDark);
    b.set(cx - 3, top + 2, SKIN);
    b.set(cx + 2, top + 2, SKIN);
  } else if (working) {
    if (frame === 0) {
      b.rect(cx + 2, top + 2, 1, 3, shirtDark);
      b.set(cx + 2, top + 1, SKIN);
      if (look.tool) drawHeldTool(b, look.tool, cx + 3, top + 1, 0.6, -0.9);
    } else {
      b.rect(cx + 2, top + 5, 2, 1, shirtDark);
      b.set(cx + 4, top + 6, SKIN);
      if (look.tool) drawHeldTool(b, look.tool, cx + 4, top + 6, 0.8, 0.7);
    }
    b.rect(cx - 3, top + 5, 1, 3, shirtLight);
  } else {
    const swing = [0, 1, 0, -1][frame];
    b.rect(cx - 3, top + 5, 1, 3, shirtLight);
    b.set(cx - 3 - swing, top + 8, SKIN);
    b.rect(cx + 2, top + 5, 1, 3, shirtDark);
    b.set(cx + 2 + swing, top + 8, SKIN);
    if (look.tool) drawHeldTool(b, look.tool, cx + 3 + swing, top + 8, 0.7, -0.8);
  }
  // Beine
  const stride = working
    ? [0, 0]
    : [
        [-1, 1],
        [0, 0],
        [1, -1],
        [0, 0],
      ][frame];
  const legTop = top + 11;
  const legLen = 5 - bob;
  for (let y = 0; y < legLen; y++) {
    const t = y / legLen;
    b.set(cx - 1 + Math.round(stride[0] * t), legTop + y, PANTS);
    b.set(cx + Math.round(stride[1] * t), legTop + y, PANTS_DARK);
  }
  b.set(cx - 1 + stride[0], legTop + legLen, BOOTS);
  b.set(cx + stride[0], legTop + legLen, BOOTS);
  b.set(cx + stride[1], legTop + legLen, BOOTS);
  b.set(cx + 1 + stride[1], legTop + legLen, BOOTS);
  b.outline(OUTLINE);
  b.shadow(cx + 1, 20, 4, 1.3, 80);
  return b.toSprite(cx, 20);
}

/** Träger (Kompatibilität): Figur mit Strohhut, mit oder ohne Last. */
export function makeCarrier(color: RGB, frame: number, loaded: boolean): Sprite {
  return makeFigure(color, frame, loaded ? 'carry' : 'walk', FIGURE_LOOKS.carrier);
}

/** Esel (nach rechts blickend), 4 Laufphasen. */
export function makeDonkey(frame: number): Sprite {
  const b = new PixelBuffer(22, 17);
  const body: RGB = [132, 122, 112];
  const dark: RGB = [92, 84, 78];
  const light: RGB = [168, 158, 146];
  const belly: RGB = [190, 182, 170];
  const by = 8;
  // Rumpf
  b.ellipse(9, by, 6.5, 3.4, (_dx, dy) => (dy > 0.45 ? belly : dy < -0.35 ? light : body));
  // Hals, Kopf, Maul, Ohren, Mähne
  b.rect(14, by - 4, 3, 4, body);
  b.rect(15, by - 5, 4, 3, body);
  b.rect(18, by - 4, 2, 2, belly);
  b.set(19, by - 3, dark);
  b.set(16, by - 4, [20, 20, 20]);
  b.set(15, by - 7, dark);
  b.set(15, by - 6, body);
  b.set(16, by - 7, dark);
  b.set(16, by - 6, light);
  for (let x = 13; x <= 15; x++) b.set(x, by - 4 + (15 - x), dark);
  // Packsattel
  b.rect(6, by - 3, 6, 2, [140, 40, 30]);
  b.rect(5, by - 1, 3, 4, [128, 86, 44]);
  b.rect(11, by - 1, 2, 4, [104, 70, 36]);
  // Beine
  const offs = [
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [0, -1, -1, 0],
    [-1, 0, 0, -1],
  ][frame];
  [4, 6, 11, 13].forEach((x, k) => {
    for (let y = 0; y < 4; y++) b.set(x + (y > 1 ? offs[k] : 0), by + 3 + y, k % 2 ? dark : body);
    b.set(x + offs[k], by + 7, [40, 34, 30]);
  });
  // Schwanz
  b.set(2, by - 1, dark);
  b.set(1, by, dark);
  b.set(1, by + 1, [60, 54, 50]);
  b.outline(OUTLINE);
  b.shadow(10, by + 8, 7, 1.5, 80);
  return b.toSprite(9, by + 7);
}

/** Baustellen- und Gebäudeplatzhalter folgen in Phase 3. */

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

const HANDLE: RGB = [120, 84, 46];
const HANDLE_LIGHT: RGB = [160, 118, 70];

/** Werkzeuge einzeln erkennbar zeichnen (9×8 Pixel). */
function drawTool(b: PixelBuffer, type: WareType, c: RGB, l: RGB, d: RGB): void {
  const handle = (x0: number, y0: number, x1: number, y1: number): void => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const y = Math.round(y0 + ((y1 - y0) * k) / n);
      b.set(x, y, k % 2 ? HANDLE : HANDLE_LIGHT);
    }
  };
  switch (type) {
    case 'hammer':
      handle(1, 6, 5, 2);
      b.rect(4, 0, 4, 2, c);
      b.set(4, 0, l);
      b.set(7, 1, d);
      break;
    case 'shovel':
      handle(1, 1, 5, 5);
      b.rect(5, 4, 3, 3, c);
      b.set(5, 4, l);
      b.set(7, 6, d);
      break;
    case 'axe':
      handle(1, 7, 5, 1);
      b.rect(5, 0, 3, 3, c);
      b.set(7, 0, l);
      b.set(7, 3, d);
      break;
    case 'saw':
      b.rect(1, 3, 6, 2, c);
      b.rect(1, 3, 6, 1, l);
      for (let x = 1; x < 7; x += 2) b.set(x, 5, d);
      b.rect(7, 2, 2, 3, HANDLE);
      break;
    case 'pick':
      handle(4, 7, 4, 2);
      for (let x = 1; x < 8; x++) b.set(x, 1 + (x === 1 || x === 7 ? 1 : 0), x < 4 ? l : c);
      break;
    case 'rod':
      handle(1, 7, 7, 0);
      b.set(8, 1, [220, 220, 220]);
      b.set(8, 2, [220, 220, 220]);
      b.set(8, 3, [200, 40, 30]);
      break;
    case 'scythe':
      handle(2, 7, 4, 1);
      for (let x = 4; x < 9; x++) b.set(x, 1 + ((x - 4) >> 1), x === 4 ? l : c);
      break;
    case 'cleaver':
      b.rect(1, 1, 5, 4, c);
      b.rect(1, 1, 5, 1, l);
      b.set(1, 4, d);
      handle(6, 3, 8, 3);
      break;
    case 'rollingpin':
      b.rect(2, 3, 5, 3, c);
      b.rect(2, 3, 5, 1, l);
      b.set(1, 4, HANDLE);
      b.set(7, 4, HANDLE);
      b.set(0, 4, HANDLE);
      b.set(8, 4, HANDLE);
      break;
    case 'tongs':
      handle(1, 7, 4, 3);
      handle(3, 7, 4, 3);
      b.set(5, 2, c);
      b.set(6, 1, c);
      b.set(5, 1, l);
      b.set(7, 1, d);
      break;
    case 'crucible':
      b.rect(2, 2, 5, 5, c);
      b.rect(2, 2, 5, 1, l);
      b.rect(3, 3, 3, 1, [240, 160, 40]);
      b.set(6, 6, d);
      break;
    default:
      handle(1, 6, 6, 1);
  }
}

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
      drawTool(b, type, c, l, d);
      break;
  }
  b.outline(OUTLINE);
  return b.toSprite(4, 7);
}
