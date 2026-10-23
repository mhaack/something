/** Prozedurale Sprites für Produktionsgebäude, Lager, Baustellen und Setzlinge. */
import type { BuildingType } from '../data/buildings';
import { hash2 } from '../sim/rng';
import type { RGB } from './palette';
import { PixelBuffer, pickRamp, type Sprite } from './sprites';

const OUTLINE: RGB = [20, 14, 8];

function shade(c: RGB, f: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
  ];
}

const PLANK: RGB[] = [
  [70, 46, 24],
  [98, 66, 36],
  [128, 90, 52],
  [156, 114, 68],
];
const STONE: RGB[] = [
  [74, 70, 66],
  [100, 96, 90],
  [128, 124, 116],
  [156, 152, 142],
];
const DOOR: RGB = [60, 38, 20];
const GLASS: RGB = [36, 34, 48];
const LIT: RGB = [228, 188, 92];

type RoofStyle = 'thatch' | 'moss' | 'slate' | 'tile' | 'shingle';
const ROOFS: Record<RoofStyle, RGB[]> = {
  thatch: [
    [112, 84, 32],
    [150, 116, 48],
    [186, 150, 70],
    [214, 182, 98],
  ],
  moss: [
    [40, 70, 28],
    [58, 96, 36],
    [80, 122, 46],
    [108, 148, 62],
  ],
  slate: [
    [48, 52, 62],
    [68, 74, 86],
    [92, 98, 112],
    [120, 126, 140],
  ],
  tile: [
    [96, 34, 22],
    [128, 48, 30],
    [160, 66, 40],
    [190, 92, 58],
  ],
  shingle: [
    [74, 50, 30],
    [100, 70, 40],
    [128, 92, 54],
    [150, 112, 68],
  ],
};

/** Holzwand aus senkrechten Brettern, rechts dunkler (Licht von links). */
function timberWall(b: PixelBuffer, x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const t = (x - x0) / w;
      let l = t < 0.25 ? 3 : t < 0.7 ? 2 : 1;
      if ((x - x0) % 3 === 2) l -= 1;
      if (hash2(x, y >> 2, 17) > 0.9) l -= 1;
      b.set(x, y, PLANK[Math.max(0, l)]);
    }
  }
  // Balken oben und unten
  for (let x = x0; x < x0 + w; x++) {
    b.set(x, y0, PLANK[0]);
    b.set(x, y0 + h - 1, PLANK[0]);
  }
}

function stoneBase(
  b: PixelBuffer,
  x0: number,
  y0: number,
  w: number,
  h: number,
  seed: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    const row = Math.floor((y - y0) / 3);
    for (let x = x0; x < x0 + w; x++) {
      const brick = Math.floor((x - x0 + (row % 2) * 2) / 5);
      const mortar = (y - y0) % 3 === 2 || (x - x0 + (row % 2) * 2) % 5 === 4;
      const t = (x - x0) / w;
      let l = (t < 0.3 ? 3 : t < 0.7 ? 2 : 1) + (hash2(brick, row, seed) > 0.7 ? 0 : -0.4);
      if (mortar) l -= 1.3;
      b.set(x, y, STONE[Math.max(0, Math.min(3, Math.round(l)))]);
    }
  }
}

/** Satteldach in Frontansicht mit Dachüberstand. */
function roof(
  b: PixelBuffer,
  cx: number,
  baseY: number,
  halfW: number,
  h: number,
  style: RoofStyle,
): void {
  const ramp = ROOFS[style];
  for (let j = 0; j < h; j++) {
    const hw = Math.round((halfW * (j + 1)) / h);
    const y = baseY - h + j;
    for (let x = cx - hw; x <= cx + hw; x++) {
      const side = (x - cx) / Math.max(1, hw);
      let l = side < -0.1 ? 3 : 2;
      if (side > 0.5) l = 1;
      if (style === 'thatch' && hash2(x, y, 3) > 0.75) l -= 1;
      if ((style === 'slate' || style === 'tile' || style === 'shingle') && j % 3 === 2) l -= 1;
      if (style === 'moss' && hash2(x >> 1, y, 9) > 0.8) l += 1;
      b.set(x, y, ramp[Math.max(0, Math.min(3, l))]);
    }
  }
  // Traufkante
  for (let x = cx - halfW; x <= cx + halfW; x++) b.set(x, baseY, ramp[0]);
}

function door(b: PixelBuffer, x: number, y: number, w: number, h: number): void {
  b.rect(x, y, w, h, DOOR);
  b.rect(x, y, w, 1, PLANK[0]);
  b.set(x + w - 2, y + (h >> 1), [210, 180, 90]);
}

function window(b: PixelBuffer, x: number, y: number, lit = false): void {
  b.rect(x, y, 3, 3, lit ? LIT : GLASS);
  b.rect(x - 1, y + 3, 5, 1, PLANK[3]);
}

function banner(b: PixelBuffer, x: number, y: number, color: RGB): void {
  b.rect(x, y, 1, 8, PLANK[0]);
  for (let k = 0; k < 4; k++) b.rect(x + 1, y + k, 4 - (k >> 1), 1, shade(color, k ? 1 : 1.25));
}

function logPile(b: PixelBuffer, x: number, y: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const row = k < 3 ? 0 : 1;
    const lx = x + (k % 3) * 3 + row;
    const ly = y - row * 3;
    b.rect(lx, ly, 3, 3, PLANK[2]);
    b.set(lx + 1, ly + 1, [200, 160, 100]);
    b.set(lx, ly, PLANK[1]);
  }
}

function stonePile(b: PixelBuffer, x: number, y: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const row = k < 3 ? 0 : 1;
    const sx = x + (k % 3) * 4 + row * 2;
    const sy = y - row * 3;
    b.rect(sx, sy, 3, 3, STONE[2]);
    b.set(sx, sy, STONE[3]);
    b.set(sx + 2, sy + 2, STONE[0]);
  }
}

function plankStack(b: PixelBuffer, x: number, y: number, n: number): void {
  for (let k = 0; k < n; k++) {
    b.rect(x, y - k * 2, 9, 1, PLANK[3]);
    b.rect(x, y - k * 2 + 1, 9, 1, PLANK[1]);
  }
}

function finish(b: PixelBuffer, ax: number, ay: number, shadowW: number): Sprite {
  b.outline(OUTLINE);
  b.shadow(ax + 6, ay, shadowW, 3, 95);
  return b.toSprite(ax, ay);
}

/** Kleine Hütte als Grundform (Holzfäller, Förster, Steinbruch). */
function smallHut(color: RGB, style: RoofStyle, stoneWalls: boolean): PixelBuffer {
  const b = new PixelBuffer(44, 40);
  const base = 34;
  if (stoneWalls) stoneBase(b, 10, base - 13, 22, 13, 4);
  else {
    stoneBase(b, 10, base - 3, 22, 3, 4);
    timberWall(b, 10, base - 13, 22, 10);
  }
  roof(b, 21, base - 13, 15, 13, style);
  door(b, 18, base - 9, 5, 9);
  window(b, 12, base - 9);
  window(b, 26, base - 9, true);
  // Schornstein
  b.rect(27, base - 22, 3, 6, STONE[1]);
  b.rect(27, base - 22, 3, 1, STONE[3]);
  banner(b, 33, base - 22, color);
  return b;
}

export function makeBuilding(type: BuildingType, color: RGB): Sprite {
  switch (type) {
    case 'woodcutter': {
      const b = smallHut(color, 'thatch', false);
      logPile(b, 1, 31, 5);
      // Hackklotz mit Axt
      b.rect(35, 29, 4, 3, PLANK[2]);
      b.rect(36, 26, 1, 3, PLANK[1]);
      b.rect(36, 25, 3, 2, [180, 180, 190]);
      return finish(b, 21, 34, 18);
    }
    case 'forester': {
      const b = smallHut(color, 'moss', false);
      for (const [x, h] of [
        [3, 6],
        [7, 4],
        [37, 5],
      ]) {
        b.rect(x, 33 - h, 1, h, PLANK[1]);
        b.ellipse(x + 0.5, 33 - h, 2.2, 2, (dx, dy) =>
          pickRamp(ROOFS.moss, 0.6 - dx * 0.3 - dy * 0.3),
        );
      }
      return finish(b, 21, 34, 18);
    }
    case 'quarry': {
      const b = smallHut(color, 'slate', true);
      stonePile(b, 0, 31, 5);
      return finish(b, 21, 34, 18);
    }
    case 'sawmill': {
      const b = new PixelBuffer(64, 52);
      const base = 45;
      stoneBase(b, 12, base - 4, 38, 4, 7);
      timberWall(b, 12, base - 18, 38, 14);
      roof(b, 31, base - 18, 24, 15, 'shingle');
      door(b, 27, base - 12, 8, 12);
      window(b, 16, base - 13, true);
      window(b, 42, base - 13);
      // Sägeblatt an der Seite
      b.ellipse(55, base - 10, 6, 6, (dx, dy) =>
        dx * dx + dy * dy < 0.15 ? [90, 90, 96] : [196, 198, 206],
      );
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        b.set(
          55 + Math.round(Math.cos(a) * 7),
          base - 10 + Math.round(Math.sin(a) * 7),
          [150, 150, 160],
        );
      }
      logPile(b, 1, base - 2, 6);
      plankStack(b, 2, base - 8, 3);
      banner(b, 46, base - 30, color);
      return finish(b, 31, base, 26);
    }
    case 'storehouse': {
      const b = new PixelBuffer(64, 54);
      const base = 47;
      stoneBase(b, 10, base - 22, 44, 22, 11);
      roof(b, 32, base - 22, 27, 16, 'tile');
      // großes Doppeltor
      b.rect(24, base - 15, 16, 15, DOOR);
      b.rect(31, base - 15, 1, 15, PLANK[0]);
      for (let y = base - 13; y < base; y += 4) b.rect(24, y, 16, 1, [50, 46, 50]);
      b.rect(24, base - 16, 16, 1, STONE[3]);
      window(b, 14, base - 16, true);
      window(b, 46, base - 16);
      // Kisten und Fass
      b.rect(2, base - 6, 6, 6, PLANK[2]);
      b.rect(2, base - 6, 6, 1, PLANK[3]);
      b.rect(4, base - 4, 2, 2, PLANK[0]);
      b.rect(56, base - 7, 5, 7, [110, 72, 40]);
      b.rect(56, base - 5, 5, 1, [60, 60, 66]);
      b.rect(56, base - 2, 5, 1, [60, 60, 66]);
      banner(b, 52, base - 34, color);
      banner(b, 10, base - 34, color);
      return finish(b, 32, base, 28);
    }
    default: {
      const b = smallHut(color, 'thatch', false);
      return finish(b, 21, 34, 18);
    }
  }
}

/** Absteckung einer Baustelle während des Planierens. */
export function makeStakes(): Sprite {
  const b = new PixelBuffer(36, 22);
  for (const [x, y] of [
    [4, 8],
    [30, 8],
    [8, 18],
    [27, 18],
  ]) {
    b.rect(x, y - 6, 1, 6, PLANK[2]);
    b.set(x, y - 6, [220, 60, 40]);
  }
  for (let x = 5; x < 30; x += 2) b.set(x, 3, [220, 200, 160]);
  b.outline(OUTLINE);
  return b.toSprite(18, 18);
}

/** Gerüst über einem entstehenden Gebäude (Breite passend zum Gebäude). */
export function makeScaffold(width: number, height: number): Sprite {
  const b = new PixelBuffer(width, height);
  const poles = [2, Math.round(width / 2), width - 3];
  for (const x of poles) b.rect(x, 0, 1, height, PLANK[2]);
  for (let y = 6; y < height; y += 9) b.rect(1, y, width - 2, 1, PLANK[1]);
  for (let k = 0; k < width - 4; k += 2) b.set(2 + k, 2 + ((k / 2) % 2), PLANK[3]);
  return b.toSprite(width >> 1, height - 1);
}

/** Setzling in Wachstumsstufe 0..2. */
export function makeSapling(variant: number, stage: number): Sprite {
  const b = new PixelBuffer(16, 22);
  const cx = 8;
  const base = 19;
  const h = 4 + stage * 4;
  const pine = variant >= 2;
  b.rect(cx, base - h, 1, h, PLANK[1]);
  const ramp = pine ? ROOFS.moss : ROOFS.moss.map((c) => shade(c, 1.15));
  if (pine) {
    for (let j = 0; j < h; j++) {
      const hw = Math.round(((j + 1) / h) * (1.5 + stage));
      for (let x = cx - hw; x <= cx + hw; x++) b.set(x, base - h - 2 + j, ramp[x < cx ? 2 : 1]);
    }
  } else {
    const r = 1.6 + stage * 1.3;
    b.ellipse(cx + 0.5, base - h, r, r * 0.9, (dx, dy) =>
      pickRamp(ramp, 0.55 - dx * 0.3 - dy * 0.35),
    );
  }
  b.outline(OUTLINE);
  b.shadow(cx + 2, base, 2 + stage, 1, 70);
  return b.toSprite(cx, base);
}

/** Kleines Statussymbol über Gebäuden: 0 = keine Ressourcen, 1 = Ausgang blockiert. */
export function makeStatusIcon(kind: 0 | 1): Sprite {
  const b = new PixelBuffer(9, 9);
  const c: RGB = kind === 0 ? [210, 50, 40] : [230, 180, 40];
  b.ellipse(4.5, 4.5, 4, 4, () => c);
  b.rect(4, 2, 1, 3, [255, 255, 255]);
  b.set(4, 6, [255, 255, 255]);
  b.outline(OUTLINE);
  return b.toSprite(4, 8);
}
