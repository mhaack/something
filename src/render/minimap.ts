import { MapObject, Terrain } from '../data/terrain';
import { TRI_UP } from '../sim/geometry';
import type { World } from '../sim/world';
import { worldPixelHeight, worldPixelWidth, type Camera } from './camera';
import { PLAYER_COLORS, TERRAIN_RAMPS, type RGB } from './palette';
import { computeLight } from './terrainRaster';

/**
 * Minikarte: 2 Pixel pro Knoten horizontal, 1 Pixel vertikal (entspricht dem 2:1-Seitenverhältnis
 * der Kacheln), ungerade Zeilen um 1 Pixel versetzt.
 */
export class Minimap {
  private base: HTMLCanvasElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(
    canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.rebuild();
  }

  setWorld(world: World): void {
    this.world = world;
    this.rebuild();
  }

  get pixelWidth(): number {
    return this.world.map.width * 2 + 1;
  }

  get pixelHeight(): number {
    return this.world.map.height;
  }

  rebuild(): void {
    const map = this.world.map;
    const w = this.pixelWidth;
    const h = this.pixelHeight;
    this.base.width = w;
    this.base.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.base.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const light = computeLight(map);
    const put = (x: number, y: number, c: RGB): void => {
      const o = (y * w + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    };
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        const t = map.terrain[2 * i + TRI_UP];
        const ramp = TERRAIN_RAMPS[t];
        const l = t === Terrain.Water ? 0.5 : light[i];
        let c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(l * (ramp.length - 1))))];
        if (map.objects[i] === MapObject.Tree) c = [24, 58, 18];
        else if (map.objects[i] === MapObject.Rock) c = [150, 146, 140];
        const px = x * 2 + (y & 1);
        put(px, y, c);
        put(px + 1, y, c);
      }
    }
    for (const p of this.world.players) {
      const x = p.hqNode % map.width;
      const y = (p.hqNode / map.width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -2; dx <= 3; dx++) {
          const px = x * 2 + (y & 1) + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < w && py < h) put(px, py, PLAYER_COLORS[p.color]);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  draw(cam: Camera): void {
    const ctx = this.ctx;
    ctx.drawImage(this.base, 0, 0);
    const sx = this.pixelWidth / worldPixelWidth(this.world.map);
    const sy = this.pixelHeight / worldPixelHeight(this.world.map);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(cam.x * sx) + 0.5,
      Math.round(cam.y * sy) + 0.5,
      Math.round(cam.width * sx),
      Math.round(cam.height * sy),
    );
  }

  /** Rechnet Minikarten-Pixel in Weltpixel um. */
  toWorld(px: number, py: number): [number, number] {
    return [
      (px / this.pixelWidth) * worldPixelWidth(this.world.map),
      (py / this.pixelHeight) * worldPixelHeight(this.world.map),
    ];
  }
}
