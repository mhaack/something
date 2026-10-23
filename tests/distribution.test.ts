import { describe, expect, it } from 'vitest';
import { DISTRIBUTION } from '../src/data/balance';
import type { BuildingType } from '../src/data/buildings';
import { requestWares } from '../src/sim/buildings';
import { planRoadSegment } from '../src/sim/roads';
import type { World } from '../src/sim/world';
import { cmd, flatWorld, hqFlagNode, node } from './helpers';

/** Fertiges, angeschlossenes Gebäude (Baustelle übersprungen). */
function ready(w: World, x: number, y: number, type: BuildingType): number {
  const n = node(w, x, y);
  cmd(w, { type: 'placeBuilding', player: 0, node: n, building: type });
  const id = w.nodeBuilding[n];
  const from = hqFlagNode(w);
  const to = w.flags[w.buildings[id].flag].node;
  cmd(w, {
    type: 'buildRoad',
    player: 0,
    path: [from, ...planRoadSegment(w, 0, [from], to)!],
    autoFlags: false,
  });
  w.buildings[id].site = null;
  return id;
}

/** Kohle im HQ auf genau n setzen (Warenbuch mitführen). */
function setCoal(w: World, n: number): void {
  const hq = w.buildings[w.players[0].hq];
  w.ledger[0].wares.coal += n - hq.stock.coal;
  hq.stock.coal = n;
}

function queuedFor(w: World, id: number): number {
  return w.buildings[w.players[0].hq].outQueue.filter((o) => o.dest === id && o.type === 'coal')
    .length;
}

describe('Warenverteilung', () => {
  it('teilt knappe Kohle im Verhältnis der Gewichte', () => {
    const w = flatWorld();
    const smelter = ready(w, 24, 18, 'smelter');
    const smith = ready(w, 16, 18, 'weaponsmith');
    cmd(w, { type: 'setDistribution', player: 0, group: 'coal', building: 'smelter', value: 3 });
    cmd(w, {
      type: 'setDistribution',
      player: 0,
      group: 'coal',
      building: 'weaponsmith',
      value: 1,
    });
    setCoal(w, 4);
    requestWares(w);
    expect(queuedFor(w, smelter)).toBe(3);
    expect(queuedFor(w, smith)).toBe(1);
  });

  it('Gewicht 0 bekommt nichts', () => {
    const w = flatWorld();
    const smelter = ready(w, 24, 18, 'smelter');
    const smith = ready(w, 16, 18, 'weaponsmith');
    cmd(w, {
      type: 'setDistribution',
      player: 0,
      group: 'coal',
      building: 'weaponsmith',
      value: 0,
    });
    setCoal(w, 10);
    requestWares(w);
    expect(queuedFor(w, smith)).toBe(0);
    expect(queuedFor(w, smelter)).toBeGreaterThan(0);
  });

  it('Befehl begrenzt den Wert und kennt nur Abnehmer der Gruppe', () => {
    const w = flatWorld();
    cmd(w, { type: 'setDistribution', player: 0, group: 'food', building: 'coalmine', value: 99 });
    expect(w.players[0].distribution.food.coalmine).toBe(DISTRIBUTION.MAX);
    expect(Object.keys(w.players[0].distribution.food).includes('sawmill')).toBe(false);
  });
});
