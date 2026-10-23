import { describe, expect, it } from 'vitest';
import { SIM } from '../src/data/balance';
import { GameClock } from '../src/ui/clock';

describe('GameClock', () => {
  it('führt bei 1x genau TICKS_PER_SECOND Ticks pro Sekunde aus', () => {
    const c = new GameClock();
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += c.advance(1000 / 60);
    expect(ticks).toBeGreaterThanOrEqual(SIM.TICKS_PER_SECOND - 1);
    expect(ticks).toBeLessThanOrEqual(SIM.TICKS_PER_SECOND);
  });

  it('Tempo multipliziert die Ticks, Pause stoppt sie', () => {
    const c = new GameClock();
    c.faster();
    c.faster();
    expect(c.speed).toBe(4);
    expect(c.advance(1000)).toBe(Math.min(SIM.MAX_TICKS_PER_FRAME, 4 * SIM.TICKS_PER_SECOND));
    c.paused = true;
    expect(c.advance(1000)).toBe(0);
  });

  it('deckelt Ticks pro Frame', () => {
    const c = new GameClock();
    for (let i = 0; i < 5; i++) c.faster();
    expect(c.advance(100000)).toBe(SIM.MAX_TICKS_PER_FRAME);
  });
});
