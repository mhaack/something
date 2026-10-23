import { describe, expect, it } from 'vitest';
import { MapObject, Terrain } from '../src/data/terrain';
import { START } from '../src/data/balance';
import { gridDistance, nodeX, nodeY, nodesInRadius } from '../src/sim/geometry';
import { isBuildableTerrain } from '../src/sim/map';
import { generateMap } from '../src/sim/mapgen';
import { hashSeed } from '../src/sim/rng';

function fingerprint(seed: number, size = 64, players = 2): number {
  const { map, starts } = generateMap({ seed, size, players });
  return hashSeed(JSON.stringify([map.heights, map.terrain, map.objects, map.resources, starts]));
}

describe('mapgen', () => {
  it('ist deterministisch', () => {
    expect(fingerprint(123)).toBe(fingerprint(123));
  });

  it('erzeugt für verschiedene Seeds verschiedene Karten', () => {
    expect(fingerprint(1)).not.toBe(fingerprint(2));
  });

  it('enthält Wasser am Rand und verschiedene Terraintypen', () => {
    const { map } = generateMap({ seed: 5, size: 128, players: 2 });
    expect(map.terrain[0]).toBe(Terrain.Water);
    const kinds = new Set(map.terrain);
    expect(kinds.has(Terrain.Water)).toBe(true);
    expect(kinds.has(Terrain.Mountain)).toBe(true);
    expect(kinds.has(Terrain.Meadow1) || kinds.has(Terrain.Meadow2)).toBe(true);
    expect(map.objects.filter((o) => o === MapObject.Tree).length).toBeGreaterThan(100);
    expect(map.resources.some((r) => r > 0)).toBe(true);
  });

  for (const seed of [1, 2, 3, 99, 2024]) {
    it(`Startpositionen sind fair und bebaubar (Seed ${seed})`, () => {
      const players = 4;
      const { map, starts } = generateMap({ seed, size: 128, players });
      expect(starts).toHaveLength(players);
      expect(new Set(starts).size).toBe(players);
      for (const s of starts) {
        expect(isBuildableTerrain(map, s)).toBe(true);
        let trees = 0;
        let rocks = 0;
        for (const j of nodesInRadius(map, s, START.RESOURCE_RADIUS)) {
          if (map.objects[j] === MapObject.Tree) trees++;
          if (map.objects[j] === MapObject.Rock) rocks++;
        }
        expect(trees).toBeGreaterThanOrEqual(START.MIN_TREES);
        expect(rocks).toBeGreaterThanOrEqual(START.MIN_ROCKS);
        for (const j of nodesInRadius(map, s, START.CLEAR_RADIUS)) {
          expect(map.objects[j]).toBe(MapObject.None);
        }
      }
      for (let a = 0; a < starts.length; a++) {
        for (let b = a + 1; b < starts.length; b++) {
          const d = gridDistance(
            nodeX(map, starts[a]),
            nodeY(map, starts[a]),
            nodeX(map, starts[b]),
            nodeY(map, starts[b]),
          );
          expect(d).toBeGreaterThan(START.RESOURCE_RADIUS);
        }
      }
    });
  }

  it('funktioniert auf kleinen und großen Karten', () => {
    expect(generateMap({ seed: 8, size: 64, players: 4 }).starts).toHaveLength(4);
    const big = generateMap({ seed: 8, size: 256, players: 2 });
    expect(big.map.heights).toHaveLength(256 * 256);
  });
});
