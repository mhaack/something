import { describe, expect, it } from 'vitest';
import { createWorld, deserializeWorld, serializeWorld, step } from '../src/sim/world';

describe('world', () => {
  it('ist JSON-serialisierbar ohne Verlust', () => {
    const w = createWorld({ seed: 11, size: 64, players: 2 });
    for (let i = 0; i < 10; i++) step(w);
    const copy = deserializeWorld(serializeWorld(w));
    expect(copy).toEqual(w);
    step(w);
    step(copy);
    expect(serializeWorld(copy)).toBe(serializeWorld(w));
  });

  it('begrenzt die Spielerzahl', () => {
    expect(createWorld({ seed: 1, size: 64, players: 9 }).players).toHaveLength(4);
    expect(createWorld({ seed: 1, size: 64, players: 0 }).players).toHaveLength(1);
  });
});
