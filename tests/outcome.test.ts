import { describe, expect, it } from 'vitest';
import { OUTCOME, START_STOCK } from '../src/data/balance';
import { Terrain } from '../src/data/terrain';
import { nodeIndex } from '../src/sim/geometry';
import { createEmptyMap } from '../src/sim/map';
import { goalProgress, isDefeated } from '../src/sim/outcome';
import {
  createWorldFromMap,
  deserializeWorld,
  serializeWorld,
  step,
  type GameSetup,
} from '../src/sim/world';
import { run } from './helpers';

function world(players: number, setup: Partial<GameSetup> = {}) {
  const map = createEmptyMap(48, 32);
  map.heights.fill(10);
  map.terrain.fill(Terrain.Meadow1);
  const starts = [nodeIndex(map, 12, 16), nodeIndex(map, 36, 16)].slice(0, players);
  return createWorldFromMap('goal', map, starts, setup, ['hard']);
}

describe('Spielziele', () => {
  it('Allein entfällt das Eroberungsziel, die KI-Stufe steht am Gegner', () => {
    expect(world(1).setup.goals).toEqual([]);
    const w = world(2);
    expect(w.setup.goals).toEqual([{ type: 'conquer' }]);
    expect(w.players[0].ai).toBeNull();
    expect(w.players[1].ai).toBe('hard');
  });

  it('Produktionsziel führt zum Sieg', () => {
    const w = world(1, { goals: [{ type: 'produce', ware: 'planks', amount: 3 }] });
    run(w, OUTCOME.CHECK_INTERVAL_TICKS + 1);
    expect(w.outcome).toBeNull();
    w.stats[0].produced.planks = 3;
    expect(goalProgress(w, w.setup.goals[0])).toEqual({ value: 3, target: 3 });
    run(w, OUTCOME.CHECK_INTERVAL_TICKS);
    expect(w.outcome?.result).toBe('won');
  });

  it('Gebietsziel zählt eigene Knoten', () => {
    const w = world(1, { goals: [{ type: 'territory', nodes: 100000 }] });
    const p = goalProgress(w, w.setup.goals[0]);
    expect(p.value).toBe(w.owner.filter((o) => o === 0).length);
    expect(p.value).toBeGreaterThan(100);
  });

  it('Zeitlimit führt zur Niederlage', () => {
    const w = world(1, {
      goals: [{ type: 'produce', ware: 'coins', amount: 99 }],
      timeLimit: OUTCOME.CHECK_INTERVAL_TICKS * 2,
    });
    run(w, OUTCOME.CHECK_INTERVAL_TICKS * 2 + 1);
    expect(w.outcome).toMatchObject({ result: 'lost', reason: 'time' });
  });

  it('Ohne HQ und Militär ist ein Spieler besiegt', () => {
    const w = world(2);
    expect(isDefeated(w, 1)).toBe(false);
    // Nur zum Test: das HQ verschwindet ohne Eroberung.
    delete w.buildings[w.players[1].hq];
    expect(isDefeated(w, 1)).toBe(true);
  });

  it('Startbedingungen skalieren den Startbestand', () => {
    const low = world(1, { stock: 'low' });
    const high = world(1, { stock: 'high' });
    const hq = (w: typeof low) => w.buildings[w.players[0].hq];
    expect(hq(low).stock.planks).toBe(Math.round(START_STOCK.wares.planks * 0.5));
    expect(hq(high).stock.planks).toBe(START_STOCK.wares.planks * 2);
    expect(low.ledger[0].wares.planks).toBe(hq(low).stock.planks);
  });

  it('Einstellungen und Ergebnis sind serialisierbar', () => {
    const w = world(1, { mode: 'mission', mission: 2, timeLimit: 5 });
    for (let i = 0; i < OUTCOME.CHECK_INTERVAL_TICKS + 1; i++) step(w);
    const back = deserializeWorld(serializeWorld(w));
    expect(back.setup).toEqual(w.setup);
    expect(back.outcome).toEqual(w.outcome);
  });
});
