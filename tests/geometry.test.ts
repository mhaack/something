import { describe, expect, it } from 'vitest';
import {
  DIRS,
  dirBetween,
  gridDistance,
  neighbor,
  neighborXY,
  nodeIndex,
  nodesInRadius,
  oppositeDir,
  triangleNodes,
  trianglesAround,
} from '../src/sim/geometry';

const g = { width: 10, height: 10 };

describe('geometry', () => {
  it('Nachbarschaft ist symmetrisch', () => {
    for (let y = 1; y < 9; y++) {
      for (let x = 1; x < 9; x++) {
        const i = nodeIndex(g, x, y);
        for (const d of DIRS) {
          const n = neighbor(g, i, d);
          expect(neighbor(g, n, oppositeDir(d))).toBe(i);
          expect(dirBetween(g, i, n)).toBe(d);
        }
      }
    }
  });

  it('Nachbarn haben Distanz 1', () => {
    for (const y of [2, 3]) {
      for (const d of DIRS) {
        const [nx, ny] = neighborXY(4, y, d);
        expect(gridDistance(4, y, nx, ny)).toBe(1);
      }
    }
  });

  it('Radius 1 enthält 7 Knoten, Radius 2 enthält 19', () => {
    expect(nodesInRadius(g, nodeIndex(g, 5, 5), 1)).toHaveLength(7);
    expect(nodesInRadius(g, nodeIndex(g, 5, 4), 2)).toHaveLength(19);
  });

  it('jeder innere Knoten hat 6 verschiedene Dreiecke, die ihn enthalten', () => {
    for (const [x, y] of [
      [4, 4],
      [4, 5],
    ]) {
      const i = nodeIndex(g, x, y);
      const tris = trianglesAround(g, i);
      expect(new Set(tris).size).toBe(6);
      for (const t of tris) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(triangleNodes(g, t)).toContain(i);
      }
    }
  });

  it('Randknoten haben fehlende Dreiecke', () => {
    expect(trianglesAround(g, nodeIndex(g, 0, 0))).toContain(-1);
  });
});
