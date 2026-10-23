/** Prozedurale 16×16-Pixel-Icons für Werkzeugleiste und Infofenster. */
import type { WareType } from '../data/wares';
import type { RGB } from '../render/palette';
import { PixelBuffer } from '../render/sprites';
import { makeWare } from '../render/spritesUnits';
import { makeBuilding } from '../render/spritesBuildings';
import { PLAYER_COLORS } from '../render/palette';
import type { BuildingType } from '../data/buildings';

export type IconName =
  | 'select'
  | 'flag'
  | 'road'
  | 'demolish'
  | 'build'
  | 'stats'
  | 'buildHelp'
  | 'congestion'
  | 'minimap'
  | 'help'
  | 'debug'
  | 'pause'
  | 'play'
  | 'slower'
  | 'faster'
  | 'close'
  | 'newGame'
  | 'sound'
  | 'mute';

const INK: RGB = [24, 16, 8];
const LIGHT: RGB = [242, 230, 200];
const WOOD: RGB = [150, 104, 56];
const RED: RGB = [200, 48, 40];
const BLUE: RGB = [64, 108, 220];
const GREEN: RGB = [80, 150, 50];
const YELLOW: RGB = [236, 200, 70];
const GRAY: RGB = [150, 146, 140];

function draw(name: IconName, b: PixelBuffer): void {
  const px = (pts: string, c: RGB): void => {
    // Mini-Bitmap: Zeilen getrennt durch '/', '#' setzt ein Pixel.
    pts.split('/').forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') b.set(x, y, c);
    });
  };
  switch (name) {
    case 'select':
      px('/..#/..##/..###/..####/..#####/..######/..#######/..####/..#.##/.....##/......##', LIGHT);
      break;
    case 'flag':
      b.rect(4, 2, 1, 12, WOOD);
      b.rect(5, 2, 7, 5, BLUE);
      b.rect(5, 2, 7, 1, [110, 150, 240]);
      b.rect(3, 14, 3, 1, GRAY);
      break;
    case 'road': {
      // Weg in die Tiefe mit Flagge am Ende
      for (let y = 4; y < 15; y++) {
        const half = 1 + ((y - 4) * 4) / 11;
        const cx = 8 + Math.round(Math.sin(y / 2.5) * 1.2);
        b.rect(Math.round(cx - half), y, Math.round(half * 2), 1, [176, 132, 76]);
        if (y % 3 === 0) b.set(cx, y, [120, 86, 44]);
      }
      b.rect(9, 0, 1, 5, WOOD);
      b.rect(10, 0, 4, 3, BLUE);
      break;
    }
    case 'demolish':
      for (let k = 2; k < 14; k++) {
        b.set(k, k, RED);
        b.set(k + 1, k, RED);
        b.set(15 - k, k, RED);
        b.set(14 - k, k, RED);
      }
      break;
    case 'newGame':
      // Landkarte als Schriftrolle mit Wegmarke
      b.rect(2, 3, 12, 10, [214, 190, 140]);
      b.rect(2, 3, 12, 1, [240, 222, 180]);
      b.rect(1, 2, 2, 12, WOOD);
      b.rect(13, 2, 2, 12, WOOD);
      b.rect(4, 8, 5, 3, GREEN);
      b.rect(8, 5, 4, 2, BLUE);
      b.rect(10, 9, 1, 3, INK);
      b.rect(11, 9, 2, 2, RED);
      break;
    case 'stats':
      b.rect(2, 14, 12, 1, LIGHT);
      b.rect(3, 9, 2, 5, BLUE);
      b.rect(6, 5, 2, 9, YELLOW);
      b.rect(9, 7, 2, 7, GREEN);
      b.rect(12, 3, 2, 11, RED);
      break;
    case 'build':
      b.rect(3, 8, 10, 7, [170, 126, 70]);
      for (let y = 0; y < 6; y++) b.rect(8 - y - 1, 2 + y, 2 * y + 2, 1, RED);
      b.rect(7, 11, 3, 4, [70, 46, 24]);
      b.rect(11, 1, 4, 2, GRAY);
      b.rect(12, 3, 1, 4, WOOD);
      break;
    case 'buildHelp':
      for (let y = 3; y < 15; y += 4) for (let x = 2; x < 15; x += 4) b.rect(x, y, 2, 1, YELLOW);
      b.rect(7, 2, 1, 8, WOOD);
      b.rect(8, 2, 4, 3, YELLOW);
      break;
    case 'congestion':
      for (let k = 0; k < 4; k++)
        b.rect(3 + k * 2, 11 - k * 2, 6, 2, k % 2 ? [190, 150, 90] : GRAY);
      b.rect(11, 2, 3, 6, RED);
      b.rect(12, 9, 1, 1, RED);
      break;
    case 'minimap':
      b.rect(2, 3, 12, 10, GREEN);
      b.rect(2, 3, 5, 4, BLUE);
      b.rect(10, 8, 4, 5, GRAY);
      b.rect(6, 6, 5, 4, [0, 0, 0]);
      b.rect(7, 7, 3, 2, GREEN);
      break;
    case 'help':
      px(
        '/..../.....####/....##..##/....##..##/........##/.......##/......##/......##/......../......##/......##',
        LIGHT,
      );
      break;
    case 'debug':
      b.ellipse(8, 9, 3.5, 4.5, () => [90, 160, 70]);
      b.rect(7, 3, 2, 2, [90, 160, 70]);
      for (const y of [6, 9, 12]) {
        b.rect(2, y, 3, 1, LIGHT);
        b.rect(11, y, 3, 1, LIGHT);
      }
      b.rect(8, 5, 1, 9, INK);
      break;
    case 'sound':
    case 'mute':
      // Lautsprecher, dazu Schallwellen bzw. ein Kreuz
      b.rect(2, 6, 3, 4, LIGHT);
      for (let k = 0; k < 4; k++) b.rect(5 + k, 5 - k, 1, 6 + 2 * k, LIGHT);
      if (name === 'sound') {
        b.rect(11, 6, 1, 4, LIGHT);
        b.rect(13, 4, 1, 8, LIGHT);
      } else {
        for (let k = 0; k < 5; k++) {
          b.set(10 + k, 5 + k, RED);
          b.set(14 - k, 5 + k, RED);
        }
      }
      break;
    case 'pause':
      b.rect(4, 3, 3, 10, LIGHT);
      b.rect(9, 3, 3, 10, LIGHT);
      break;
    case 'play':
      for (let y = 0; y < 10; y++) b.rect(5, 3 + y, Math.min(y, 9 - y) + 1, 1, LIGHT);
      break;
    case 'slower':
      for (let y = 0; y < 9; y++) {
        const w = Math.min(y, 8 - y) + 1;
        b.rect(8 - w, 4 + y, w, 1, LIGHT);
        b.rect(14 - w, 4 + y, w, 1, LIGHT);
      }
      break;
    case 'faster':
      for (let y = 0; y < 9; y++) {
        const w = Math.min(y, 8 - y) + 1;
        b.rect(2, 4 + y, w, 1, LIGHT);
        b.rect(8, 4 + y, w, 1, LIGHT);
      }
      break;
    case 'close':
      for (let k = 4; k < 12; k++) {
        b.set(k, k, LIGHT);
        b.set(15 - k, k, LIGHT);
      }
      break;
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** Liefert ein neues Canvas-Element mit dem Icon (Kopie des gecachten Bilds). */
export function icon(name: IconName): HTMLCanvasElement {
  let src = cache.get(name);
  if (!src) {
    const b = new PixelBuffer(16, 16);
    draw(name, b);
    b.outline(INK);
    src = b.toSprite(0, 0).canvas;
    cache.set(name, src);
  }
  return copy(src, 'icon');
}

/** Gebäudebild (Spielerfarbe) als kleines Canvas für Menüs. */
export function buildingIcon(type: BuildingType, color: number): HTMLCanvasElement {
  const key = `building:${type}:${color}`;
  let src = cache.get(key);
  if (!src) {
    src = makeBuilding(type, PLAYER_COLORS[color]).canvas;
    cache.set(key, src);
  }
  return copy(src, 'building-icon');
}

/** Warensymbol als Canvas für Infofenster. */
export function wareIcon(type: WareType): HTMLCanvasElement {
  const key = `ware:${type}`;
  let src = cache.get(key);
  if (!src) {
    src = makeWare(type).canvas;
    cache.set(key, src);
  }
  return copy(src, 'ware-icon');
}

function copy(src: HTMLCanvasElement, className: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.className = className;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}
