import { MAP, VIEW } from '../data/balance';
import { nodeIndex } from '../sim/geometry';
import type { GameMap } from '../sim/map';
import { HEIGHT_PX, TH, TW } from './constants';

/** Kamera in Basispixeln. (x, y) ist die linke obere Ecke des sichtbaren Ausschnitts. */
export interface Camera {
  x: number;
  y: number;
  /** Größe des Basiscanvas in Pixeln. */
  width: number;
  height: number;
  /** Ganzzahliger Skalierungsfaktor (Gerätepixel pro Basispixel). */
  scale: number;
  zoom: number;
}

export function createCamera(): Camera {
  return { x: 0, y: 0, width: 320, height: 200, scale: 1, zoom: VIEW.DEFAULT_ZOOM };
}

/** Weltposition eines Knotens in Basispixeln (ohne Kamera). */
export function nodeWorldX(x: number, y: number): number {
  return x * TW + (y & 1) * (TW / 2);
}

export function nodeWorldY(y: number, h: number): number {
  return y * TH - h * HEIGHT_PX;
}

export function worldPixelWidth(map: GameMap): number {
  return map.width * TW + TW / 2;
}

export function worldPixelHeight(map: GameMap): number {
  return map.height * TH;
}

/** Berechnet Basisgröße und Skalierung für eine Gerätepixelfläche. */
export function fitCamera(cam: Camera, deviceWidth: number, deviceHeight: number): void {
  const target = VIEW.ZOOM_BASE_WIDTHS[cam.zoom];
  cam.scale = Math.max(1, Math.round(deviceWidth / target));
  cam.width = Math.ceil(deviceWidth / cam.scale);
  cam.height = Math.ceil(deviceHeight / cam.scale);
}

export function clampCamera(cam: Camera, map: GameMap): void {
  const maxX = worldPixelWidth(map) - cam.width;
  const maxY = worldPixelHeight(map) - cam.height;
  cam.x = Math.max(Math.min(0, maxX / 2), Math.min(cam.x, Math.max(maxX / 2, maxX)));
  cam.y = Math.max(Math.min(0, maxY / 2), Math.min(cam.y, Math.max(maxY / 2, maxY)));
}

export function centerOnNode(cam: Camera, map: GameMap, node: number): void {
  const x = node % map.width;
  const y = (node / map.width) | 0;
  cam.x = nodeWorldX(x, y) - cam.width / 2;
  cam.y = nodeWorldY(y, map.heights[node]) - cam.height / 2;
  clampCamera(cam, map);
}

/**
 * Findet den Knoten, dessen (höhenversetzte) Bildschirmposition einem Basispixel am nächsten ist.
 * Liefert -1 außerhalb der Karte.
 */
export function pickNode(map: GameMap, worldX: number, worldY: number): number {
  const approxRow = Math.round(worldY / TH);
  const maxRowShift = Math.ceil((MAP.MAX_HEIGHT * HEIGHT_PX) / TH) + 1;
  let best = -1;
  let bestD = Infinity;
  for (let y = approxRow - 1; y <= approxRow + maxRowShift; y++) {
    if (y < 0 || y >= map.height) continue;
    const approxCol = Math.round((worldX - (y & 1) * (TW / 2)) / TW);
    for (let x = approxCol - 1; x <= approxCol + 1; x++) {
      if (x < 0 || x >= map.width) continue;
      const i = nodeIndex(map, x, y);
      const dx = nodeWorldX(x, y) - worldX;
      const dy = (nodeWorldY(y, map.heights[i]) - worldY) * 2;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}
