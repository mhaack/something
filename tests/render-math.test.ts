import { describe, expect, it } from 'vitest';
import { nodeWorldX, nodeWorldY, pickNode } from '../src/render/camera';
import { chunkBounds, computeLight, rasterizeNodes } from '../src/render/terrainRaster';
import { generateMap } from '../src/sim/mapgen';

describe('Render-Mathematik', () => {
  const { map } = generateMap({ seed: 3, size: 64, players: 2 });

  it('pickNode findet den Knoten an seiner eigenen Bildschirmposition', () => {
    for (const [x, y] of [
      [10, 10],
      [11, 11],
      [30, 20],
      [40, 41],
    ]) {
      const i = y * map.width + x;
      expect(pickNode(map, nodeWorldX(x, y), nodeWorldY(y, map.heights[i]))).toBe(i);
    }
  });

  it('Chunk-Rasterung füllt den Kernbereich lückenlos', () => {
    const n = 8;
    const b = chunkBounds(2, 2, n);
    const data = new Uint8ClampedArray(b.w * b.h * 4);
    rasterizeNodes(map, computeLight(map), 2 * n - 1, 2 * n - 1, 3 * n + 1, 3 * n + 1, {
      data,
      width: b.w,
      height: b.h,
      originX: b.x,
      originY: b.y,
    });
    // Ein Rechteck sicher innerhalb der Chunkfläche muss vollständig deckend sein.
    let holes = 0;
    const maxH = b.h - (n * 16 + 32);
    for (let y = maxH + 24; y < maxH + n * 16 - 8; y++) {
      for (let x = 48; x < b.w - 64; x++) if (data[(y * b.w + x) * 4 + 3] === 0) holes++;
    }
    expect(holes).toBe(0);
  });
});
