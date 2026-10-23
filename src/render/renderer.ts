import { MAP } from '../data/balance';
import { MapObject } from '../data/terrain';
import type { World } from '../sim/world';
import { nodeWorldX, nodeWorldY, type Camera } from './camera';
import { HEIGHT_PX, TH, TW } from './constants';
import { PLAYER_COLORS } from './palette';
import { ROCK_SIZES, buildSprites, type Sprite, type SpriteSet } from './sprites';
import { TerrainCache } from './terrainCache';

export interface RenderStats {
  chunksDrawn: number;
  objectsDrawn: number;
  cachedChunks: number;
}

export interface RenderOptions {
  hoverNode: number;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private terrain: TerrainCache;
  private sprites: SpriteSet;
  stats: RenderStats = { chunksDrawn: 0, objectsDrawn: 0, cachedChunks: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.terrain = new TerrainCache(world.map);
    this.sprites = buildSprites(PLAYER_COLORS);
  }

  setWorld(world: World): void {
    this.world = world;
    this.terrain = new TerrainCache(world.map);
  }

  get terrainCache(): TerrainCache {
    return this.terrain;
  }

  resize(cam: Camera): void {
    if (this.canvas.width !== cam.width || this.canvas.height !== cam.height) {
      this.canvas.width = cam.width;
      this.canvas.height = cam.height;
    }
  }

  draw(cam: Camera, _alpha: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cam.width, cam.height);
    const camX = Math.round(cam.x);
    const camY = Math.round(cam.y);
    this.drawTerrain(cam, camX, camY);
    this.drawObjects(cam, camX, camY, opts);
    this.stats.cachedChunks = this.terrain.size;
  }

  private drawTerrain(cam: Camera, camX: number, camY: number): void {
    const t = this.terrain;
    t.beginFrame();
    const n = t.chunkSize;
    const maxH = MAP.MAX_HEIGHT * HEIGHT_PX;
    const cx0 = Math.max(0, Math.floor((camX - TW) / (n * TW)));
    const cx1 = Math.min(t.chunksX - 1, Math.floor((camX + cam.width + TW) / (n * TW)));
    const cy0 = Math.max(0, Math.floor((camY - 2 * TH) / (n * TH)));
    const cy1 = Math.min(t.chunksY - 1, Math.floor((camY + cam.height + maxH) / (n * TH)));
    let drawn = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = t.get(cx, cy);
        if (!c) continue;
        this.ctx.drawImage(c.canvas, c.x - camX, c.y - camY);
        drawn++;
      }
    }
    this.stats.chunksDrawn = drawn;
  }

  private blit(s: Sprite, x: number, y: number): void {
    this.ctx.drawImage(s.canvas, x - s.ax, y - s.ay);
  }

  private drawObjects(cam: Camera, camX: number, camY: number, opts: RenderOptions): void {
    const map = this.world.map;
    const ctx = this.ctx;
    const maxH = MAP.MAX_HEIGHT * HEIGHT_PX;
    const y0 = Math.max(0, Math.floor((camY - TH) / TH));
    const y1 = Math.min(map.height - 1, Math.ceil((camY + cam.height + maxH + 2 * TH) / TH));
    const x0 = Math.max(0, Math.floor((camX - TW) / TW));
    const x1 = Math.min(map.width - 1, Math.ceil((camX + cam.width + TW) / TW));
    const starts = new Map<number, number>();
    for (const p of this.world.players) starts.set(p.hqNode, p.color);
    let count = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.width + x;
        const sx = nodeWorldX(x, y) - camX;
        const sy = nodeWorldY(y, map.heights[i]) - camY;
        if (i === opts.hoverNode) this.drawCursor(sx, sy);
        const obj = map.objects[i];
        if (obj === MapObject.Tree) {
          this.blit(this.sprites.trees[map.objectData[i] & 3], sx, sy);
          count++;
        } else if (obj === MapObject.Rock) {
          const size = Math.min(
            ROCK_SIZES - 1,
            Math.floor((map.objectData[i] * ROCK_SIZES) / (MAP.ROCK_STONE_MAX + 1)),
          );
          this.blit(this.sprites.rocks[i & 1][size], sx, sy);
          count++;
        }
        const startColor = starts.get(i);
        if (startColor !== undefined) {
          this.blit(this.sprites.startFlags[startColor], sx, sy);
          count++;
        }
      }
    }
    ctx.globalAlpha = 1;
    this.stats.objectsDrawn = count;
  }

  private drawCursor(sx: number, sy: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 3, sy, 7, 1);
    ctx.fillRect(sx, sy - 2, 1, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(sx - 1, sy - 1, 3, 3);
  }
}
