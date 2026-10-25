import { describe, expect, it } from 'vitest';
import { buildingActivity } from '../src/sim/activity';
import { storeConnectedFlags } from '../src/sim/routing';
import type { World } from '../src/sim/world';
import { buildConnected, cmd, flatWorld, node, run, runUntil } from './helpers';

function activity(w: World, id: number) {
  const b = w.buildings[id];
  return buildingActivity(w, b, storeConnectedFlags(w, b.owner).has(b.flag));
}

describe('Arbeitsstand der Betriebe', () => {
  it('ohne Straße steht ein Betrieb still', () => {
    const w = flatWorld();
    const n = node(w, 26, 20);
    cmd(w, { type: 'placeBuilding', player: 0, node: n, building: 'sawmill' });
    const id = w.nodeBuilding[n];
    w.buildings[id].site = null;
    expect(activity(w, id)).toMatchObject({ kind: 'stalled', reason: 'noRoad' });
  });

  it('Sägewerk ohne Holz wartet auf Holz, mit Holz arbeitet es', () => {
    const w = flatWorld();
    const hq = w.buildings[w.players[0].hq];
    w.ledger[0].wares.wood -= hq.stock.wood;
    hq.stock.wood = 0;
    const id = buildConnected(w, node(w, 26, 20), 'sawmill');
    w.buildings[id].site = null;
    runUntil(w, () => activity(w, id).kind === 'stalled', 20000);
    expect(activity(w, id)).toMatchObject({ reason: 'waitingInput', missing: ['wood'] });
    hq.stock.wood = 6;
    w.ledger[0].wares.wood += 6;
    runUntil(w, () => activity(w, id).kind === 'working', 4000);
  });

  it('fehlendes Werkzeug wird benannt', () => {
    const w = flatWorld();
    const hq = w.buildings[w.players[0].hq];
    w.ledger[0].wares.saw -= hq.stock.saw;
    hq.stock.saw = 0;
    const id = buildConnected(w, node(w, 26, 20), 'sawmill');
    w.buildings[id].site = null;
    run(w, 200);
    expect(activity(w, id)).toMatchObject({ kind: 'stalled', reason: 'noTool', missing: ['saw'] });
  });
});
