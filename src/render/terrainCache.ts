import { VIEW } from '../data/balance';
import type { GameMap } from '../sim/map';
import { chunkBounds, computeLight, nodeLight, rasterizeNodes } from './terrainRaster';

interface Chunk {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  lastUsed: number;
}

/**
 * Cacht vorgerenderte Terrain-Chunks als Canvas. Nur sichtbare Chunks werden erzeugt, pro Frame
 * gedeckelt, mit LRU-Verdrängung.
 */
export class TerrainCache {
  private chunks = new Map<number, Chunk>();
  private light: Float32Array;
  private frame = 0;
  private budget = 0;
  readonly chunkSize = VIEW.TERRAIN_CHUNK;

  constructor(private map: GameMap) {
    this.light = computeLight(map);
  }

  get chunksX(): number {
    return Math.ceil(this.map.width / this.chunkSize);
  }

  get chunksY(): number {
    return Math.ceil(this.map.height / this.chunkSize);
  }

  beginFrame(): void {
    this.frame++;
    // Leerer Cache (Start, Zoom) darf mehr auf einmal rastern.
    this.budget = this.chunks.size === 0 ? Infinity : VIEW.TERRAIN_CHUNKS_PER_FRAME;
  }

  /** Liefert den Chunk oder null, falls das Frame-Budget aufgebraucht ist. */
  get(cx: number, cy: number): Chunk | null {
    const key = cy * this.chunksX + cx;
    let c = this.chunks.get(key);
    if (!c) {
      if (this.budget <= 0) return null;
      this.budget--;
      c = this.build(cx, cy);
      this.chunks.set(key, c);
      this.evict();
    }
    c.lastUsed = this.frame;
    return c;
  }

  /** Verwirft Chunks rund um geänderte Knoten (z. B. nach Planieren). */
  invalidateNodes(nodes: readonly number[]): void {
    for (const i of nodes) {
      const x = i % this.map.width;
      const y = (i / this.map.width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.map.width || ny >= this.map.height) continue;
          this.light[ny * this.map.width + nx] = nodeLight(this.map, ny * this.map.width + nx);
        }
      }
      const cx = Math.floor(x / this.chunkSize);
      const cy = Math.floor(y / this.chunkSize);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) this.chunks.delete((cy + dy) * this.chunksX + cx + dx);
      }
    }
  }

  clear(): void {
    this.chunks.clear();
  }

  get size(): number {
    return this.chunks.size;
  }

  private build(cx: number, cy: number): Chunk {
    const b = chunkBounds(cx, cy, this.chunkSize);
    const canvas = document.createElement('canvas');
    canvas.width = b.w;
    canvas.height = b.h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(b.w, b.h);
    const n = this.chunkSize;
    rasterizeNodes(this.map, this.light, cx * n, cy * n, cx * n + n, cy * n + n, {
      data: img.data,
      width: b.w,
      height: b.h,
      originX: b.x,
      originY: b.y,
    });
    ctx.putImageData(img, 0, 0);
    return { canvas, x: b.x, y: b.y, lastUsed: this.frame };
  }

  private evict(): void {
    if (this.chunks.size <= VIEW.TERRAIN_CACHE_MAX) return;
    let oldestKey = -1;
    let oldest = Infinity;
    for (const [k, c] of this.chunks) {
      if (c.lastUsed < oldest) {
        oldest = c.lastUsed;
        oldestKey = k;
      }
    }
    if (oldestKey >= 0) this.chunks.delete(oldestKey);
  }
}
