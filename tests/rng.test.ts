import { describe, expect, it } from 'vitest';
import { createRng, hash2, nextFloat, nextInt, nextU32 } from '../src/sim/rng';

describe('rng', () => {
  it('liefert bei gleichem Seed die gleiche Folge', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('unterscheidet ähnliche Seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextU32(a)).not.toBe(nextU32(b));
  });

  it('bleibt nach JSON-Roundtrip identisch', () => {
    const a = createRng('abc');
    nextU32(a);
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 20; i++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('nextFloat liegt in [0,1) und nextInt im Bereich', () => {
    const s = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(s);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(s, 3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('hash2 ist zustandslos', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(4, 3, 5));
  });
});
