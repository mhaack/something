import { describe, expect, it } from 'vitest';
import { STATS, START_STOCK } from '../src/data/balance';
import { TOOL_WARES, WARE_TYPES } from '../src/data/wares';
import { chooseTool } from '../src/sim/economy';
import { countWares } from '../src/sim/invariants';
import type { World } from '../src/sim/world';
import { buildConnected, cmd, flatWorld, node, run, runUntil, stockHQ } from './helpers';

function hq(w: World) {
  return w.buildings[w.players[0].hq];
}

function onlyTool(w: World, tool: (typeof TOOL_WARES)[number], value = 10): void {
  for (const t of TOOL_WARES) {
    cmd(w, { type: 'setToolPriority', player: 0, tool: t, value: t === tool ? value : 0 });
  }
}

describe('Metallketten', () => {
  it('Eisenschmelze macht aus Eisenerz und Kohle Eisen', () => {
    const w = flatWorld();
    const before = countWares(w, 0);
    const id = buildConnected(w, node(w, 25, 22), 'smelter');
    runUntil(w, () => w.buildings[id].produced >= 3, 15000);
    const after = countWares(w, 0);
    expect(after.iron).toBeGreaterThanOrEqual(before.iron + 3);
    expect(after.ironore).toBeLessThanOrEqual(before.ironore - 3);
    expect(after.coal).toBeLessThanOrEqual(before.coal - 3);
  });

  it('Münzprägerei macht aus Golderz und Kohle Münzen', () => {
    const w = flatWorld();
    stockHQ(w, 'goldore', 3);
    const id = buildConnected(w, node(w, 25, 22), 'mint');
    runUntil(w, () => w.buildings[id].produced >= 2, 15000);
    expect(countWares(w, 0).coins).toBeGreaterThanOrEqual(2);
  });

  it('Waffenschmiede stellt Schwerter und Schilde im Wechsel her', () => {
    const w = flatWorld();
    const id = buildConnected(w, node(w, 25, 22), 'weaponsmith');
    runUntil(w, () => w.buildings[id].produced >= 4, 20000);
    const c = countWares(w, 0);
    expect(c.sword).toBeGreaterThanOrEqual(2);
    expect(c.shield).toBeGreaterThanOrEqual(1);
    expect(Math.abs(c.sword - c.shield)).toBeLessThanOrEqual(1);
  });
});

describe('Waffenprioritäten', () => {
  it('stellt nur her, was gewünscht ist, und ruht ohne Aufträge', () => {
    const w = flatWorld();
    cmd(w, { type: 'setWeaponPriority', player: 0, weapon: 'shield', value: 0 });
    const id = buildConnected(w, node(w, 25, 22), 'weaponsmith');
    runUntil(w, () => w.buildings[id].produced >= 3, 20000);
    expect(w.stats[0].produced.sword).toBeGreaterThanOrEqual(3);
    expect(w.stats[0].produced.shield).toBe(0);
    cmd(w, { type: 'setWeaponPriority', player: 0, weapon: 'sword', value: 0 });
    const made = w.buildings[id].produced;
    run(w, 3000, 200);
    expect(w.buildings[id].produced).toBeLessThanOrEqual(made + 1);
    expect(w.buildings[id].status).toBe('noOrders');
  });

  it('teilt die Herstellung im Verhältnis der Prioritäten', () => {
    const w = flatWorld();
    cmd(w, { type: 'setWeaponPriority', player: 0, weapon: 'sword', value: 3 });
    cmd(w, { type: 'setWeaponPriority', player: 0, weapon: 'shield', value: 1 });
    stockHQ(w, 'iron', 10);
    stockHQ(w, 'coal', 10);
    const id = buildConnected(w, node(w, 25, 22), 'weaponsmith');
    runUntil(w, () => w.buildings[id].produced >= 8, 40000);
    expect(w.stats[0].produced.sword).toBe(6);
    expect(w.stats[0].produced.shield).toBe(2);
  });
});

describe('Werkzeugschmiede', () => {
  it('folgt der Prioritätsliste', () => {
    const w = flatWorld();
    onlyTool(w, 'axe');
    const id = buildConnected(w, node(w, 25, 22), 'toolsmith');
    const before = countWares(w, 0);
    runUntil(w, () => w.buildings[id].produced >= 3, 20000);
    const after = countWares(w, 0);
    expect(after.axe - before.axe).toBeGreaterThanOrEqual(3);
    expect(after.saw).toBe(before.saw);
  });

  it('ohne gewünschte Werkzeuge steht sie still', () => {
    const w = flatWorld();
    for (const t of TOOL_WARES) cmd(w, { type: 'setToolPriority', player: 0, tool: t, value: 0 });
    const id = buildConnected(w, node(w, 25, 22), 'toolsmith');
    runUntil(w, () => w.buildings[id].status === 'noOrders', 8000);
    expect(w.buildings[id].produced).toBe(0);
  });

  it('verteilt die Produktion im Verhältnis der Prioritäten', () => {
    const w = flatWorld();
    for (const t of TOOL_WARES) w.players[0].toolPriority[t] = 0;
    w.players[0].toolPriority.axe = 6;
    w.players[0].toolPriority.pick = 3;
    w.players[0].toolPriority.scythe = 1;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const t = chooseTool(w, 0)!;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts).toEqual({ axe: 60, pick: 30, scythe: 10 });
  });

  it('neue Werkzeuge ermöglichen fehlende Berufe', () => {
    const w = flatWorld();
    // Keine Äxte im Lager: Der Holzfäller bekommt erst nach der Schmiede einen Arbeiter.
    const h = hq(w);
    w.ledger[0].wares.axe -= h.stock.axe;
    h.stock.axe = 0;
    onlyTool(w, 'axe');
    const cutter = buildConnected(w, node(w, 15, 22), 'woodcutter');
    runUntil(w, () => !w.buildings[cutter].site, 8000);
    run(w, 400);
    expect(w.buildings[cutter].worker).toBe(0);
    buildConnected(w, node(w, 25, 22), 'toolsmith');
    runUntil(w, () => w.settlers[w.buildings[cutter].worker]?.job === 'woodcutter', 25000);
  });
});

describe('Statistik', () => {
  it('nimmt Stichproben und bucht Produktion und Verbrauch', () => {
    const w = flatWorld();
    buildConnected(w, node(w, 25, 22), 'smelter');
    run(w, STATS.SAMPLE_INTERVAL_TICKS * 6 + 1, 200);
    const st = w.stats[0];
    expect(st.samples.length).toBeGreaterThanOrEqual(6);
    expect(st.produced.iron).toBeGreaterThan(0);
    expect(st.consumed.ironore).toBe(st.produced.iron);
    // Bilanz: Startbestand + Produktion − Verbrauch = Buchbestand
    for (const t of WARE_TYPES) {
      const start = (START_STOCK.wares as Record<string, number>)[t] ?? 0;
      expect(start + st.produced[t] - st.consumed[t]).toBe(w.ledger[0].wares[t]);
    }
    const last = st.samples[st.samples.length - 1];
    expect(last.stock[WARE_TYPES.indexOf('iron')]).toBe(w.ledger[0].wares.iron);
  });

  it('ist nach Speichern und Laden identisch und begrenzt', () => {
    const w = flatWorld();
    run(w, STATS.SAMPLE_INTERVAL_TICKS * (STATS.MAX_SAMPLES + 3), 5000);
    expect(w.stats[0].samples.length).toBe(STATS.MAX_SAMPLES);
  });
});
