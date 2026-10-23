import { describe, expect, it } from 'vitest';
import { Dir, neighbor, nodeIndex } from '../src/sim/geometry';
import { checkInvariants } from '../src/sim/invariants';
import { enqueueRoute } from '../src/sim/routing';
import { applyCommand } from '../src/sim/commandHandlers';
import { createWorldFromMap, step, type World } from '../src/sim/world';
import { createEmptyMap } from '../src/sim/map';
import { Terrain } from '../src/data/terrain';
import type { Ware } from '../src/sim/entities';

/** Großes Straßengitter mit vielen Trägern und Waren (Performance-Ziel aus CLAUDE.md). */
function bigNetwork(): World {
  const size = 128;
  const map = createEmptyMap(size, size);
  map.heights.fill(10);
  map.terrain.fill(Terrain.Meadow1);
  const w = createWorldFromMap('perf', map, [nodeIndex(map, 20, 21)]);
  w.owner.fill(0);
  const hq = w.buildings[w.players[0].hq];
  hq.people.carrier = 2000;
  const flagNode = w.flags[hq.flag].node;
  const fx = flagNode % size;
  const fy = (flagNode / size) | 0;
  for (let j = 0; j < 20; j++) {
    for (let i = 0; i < 20; i++) {
      const a = nodeIndex(map, fx + 2 * i, fy + 2 * j);
      const east = [a, neighbor(map, a, Dir.E), neighbor(map, neighbor(map, a, Dir.E), Dir.E)];
      const se = neighbor(map, a, Dir.SE);
      const south = [a, se, neighbor(map, se, Dir.SW)];
      if (i < 19) applyCommand(w, { type: 'buildRoad', player: 0, path: east, autoFlags: false });
      if (j < 19) applyCommand(w, { type: 'buildRoad', player: 0, path: south, autoFlags: false });
    }
  }
  return w;
}

function injectWares(w: World, n: number): void {
  const flags = Object.values(w.flags).filter((f) => !f.building);
  for (let k = 0; k < n; k++) {
    const f = flags[(k * 7919) % flags.length];
    if (f.wares.length >= 6) continue;
    const id = w.nextId++;
    const ware: Ware = {
      id,
      type: 'planks',
      owner: 0,
      flag: f.id,
      carrier: 0,
      dest: 0,
      destFlag: 0,
      nextRoad: 0,
      reservedBy: 0,
      since: w.tick,
      routePending: false,
    };
    w.wares[id] = ware;
    f.wares.push(id);
    w.ledger[0].wares.planks++;
    enqueueRoute(w, ware);
  }
}

describe('Performance', () => {
  it('simuliert ~700 Träger und ~1000 Waren schnell genug', () => {
    const w = bigNetwork();
    expect(Object.keys(w.roads).length).toBeGreaterThan(700);
    for (let i = 0; i < 600; i++) step(w); // Träger verteilen sich
    injectWares(w, 1200);
    const wares = Object.keys(w.wares).length;
    expect(wares).toBeGreaterThan(900);
    const t0 = performance.now();
    const ticks = 200;
    for (let i = 0; i < ticks; i++) step(w);
    const ms = (performance.now() - t0) / ticks;
    console.log(
      `Settler ${Object.keys(w.settlers).length}, Waren ${wares}, ${ms.toFixed(2)} ms/Tick`,
    );
    expect(checkInvariants(w)).toEqual([]);
    // 20 Ticks/s bei 1x, 8x-Tempo = 160 Ticks/s → Budget großzügig für langsame CI-Maschinen.
    expect(ms).toBeLessThan(10);
  });
});
