import { describe, expect, it } from 'vitest';
import { FIELDS, GEOLOGIST, START_STOCK } from '../src/data/balance';
import { BUILDINGS } from '../src/data/buildings';
import { MapObject, Resource, Terrain } from '../src/data/terrain';
import { buildSize } from '../src/sim/buildings';
import { countWares } from '../src/sim/invariants';
import { Dir, neighbor } from '../src/sim/geometry';
import type { World } from '../src/sim/world';
import {
  buildConnected,
  cmd,
  flatWorld,
  node,
  paintTerrain,
  run,
  runUntil,
  stockHQ,
} from './helpers';
import { applyCommand } from '../src/sim/commandHandlers';

function hq(w: World) {
  return w.buildings[w.players[0].hq];
}

function finished(w: World, id: number): () => boolean {
  return () => !w.buildings[id].site && w.settlers[w.buildings[id].worker]?.state === 'inside';
}

/** Bergland mit Bodenschatz rund um `center`. */
function mountain(w: World, center: number, resource: number, amount: number): void {
  for (const n of paintTerrain(w, center, 2, Terrain.Mountain)) {
    w.map.resources[n] = resource;
    w.map.resourceAmounts[n] = amount;
  }
}

describe('Nahrung', () => {
  it('Fischer fängt Fisch am Ufer, der Bestand nimmt ab', () => {
    const w = flatWorld();
    const lake = node(w, 30, 22);
    const water = paintTerrain(w, lake, 2, Terrain.Water);
    for (const n of water) {
      w.map.resources[n] = Resource.Fish;
      w.map.resourceAmounts[n] = 2;
    }
    const before = water.reduce((a, n) => a + w.map.resourceAmounts[n], 0);
    buildConnected(w, node(w, 25, 22), 'fisher');
    runUntil(w, () => hq(w).stock.fish >= START_STOCK.wares.fish + 2, 15000);
    const after = water.reduce((a, n) => a + w.map.resourceAmounts[n], 0);
    expect(after).toBeLessThanOrEqual(before - 2);
  });

  it('Bauer sät Felder, sie reifen und werden zu Weizen geerntet', () => {
    const w = flatWorld();
    const n = node(w, 25, 24);
    expect(buildSize(w, 0, n)).toBe('large');
    const id = buildConnected(w, n, 'farm');
    runUntil(w, finished(w, id), 6000);
    runUntil(w, () => w.map.objects.some((o) => o === MapObject.Field), 3000);
    runUntil(w, () => hq(w).stock.wheat >= 2, FIELDS.GROWTH_STAGE_TICKS * 8);
  });

  it('Brunnen liefert Wasser', () => {
    const w = flatWorld();
    buildConnected(w, node(w, 25, 22), 'well');
    runUntil(w, () => hq(w).stock.water >= 2, 8000);
  });

  it('Kette Weizen → Mühle → Mehl, Mehl + Wasser → Bäckerei → Brot', () => {
    const w = flatWorld();
    stockHQ(w, 'wheat', 4);
    stockHQ(w, 'water', 4);
    const mill = buildConnected(w, node(w, 25, 22), 'mill');
    const bakery = buildConnected(w, node(w, 15, 22), 'bakery');
    runUntil(w, () => w.buildings[mill].produced >= 2, 15000);
    runUntil(w, () => w.buildings[bakery].produced >= 2, 15000);
    expect(countWares(w, 0).bread).toBeGreaterThanOrEqual(START_STOCK.wares.bread + 2);
  });

  it('Schweinezucht und Metzger erzeugen Fleisch', () => {
    const w = flatWorld();
    stockHQ(w, 'wheat', 3);
    stockHQ(w, 'water', 3);
    const pig = buildConnected(w, node(w, 25, 24), 'pigfarm');
    const butcher = buildConnected(w, node(w, 15, 22), 'butcher');
    runUntil(w, () => w.buildings[pig].produced >= 1, 15000);
    runUntil(w, () => w.buildings[butcher].produced >= 1, 15000);
    expect(countWares(w, 0).meat).toBeGreaterThanOrEqual(START_STOCK.wares.meat + 1);
  });
});

describe('Eselzucht', () => {
  it('züchtet aus Weizen und Wasser Esel, die ins Lager gehen und Straßen bedienen', () => {
    const w = flatWorld();
    const h = hq(w);
    h.people.donkey = 0;
    stockHQ(w, 'wheat', 4);
    stockHQ(w, 'water', 4);
    const before = countWares(w, 0);
    const id = buildConnected(w, node(w, 25, 24), 'donkeybreeder');
    runUntil(w, () => h.people.donkey >= 1, 20000);
    expect(w.buildings[id].produced).toBeGreaterThanOrEqual(1);
    const after = countWares(w, 0);
    expect(after.wheat).toBeLessThan(before.wheat);
    expect(after.water).toBeLessThan(before.water);
    // Eine stark befahrene Straße bekommt den gezüchteten Esel.
    const road = Object.values(w.roads)[0];
    road.busy = true;
    runUntil(w, () => !!road.carriers[1] && w.settlers[road.carriers[1]]?.job === 'donkey', 2000);
  });
});

describe('Bergbau', () => {
  it('Kohlebergwerk fördert nur mit Nahrung und verbraucht sie', () => {
    const w = flatWorld();
    const n = node(w, 26, 16);
    mountain(w, n, Resource.Coal, 3);
    expect(buildSize(w, 0, n)).toBe('mine');
    const id = buildConnected(w, n, 'coalmine');
    const food = (): number => {
      const c = countWares(w, 0);
      return c.fish + c.bread + c.meat;
    };
    const before = food();
    runUntil(w, () => w.buildings[id].produced >= 2, 15000);
    expect(food()).toBeLessThanOrEqual(before - 2);
    expect(countWares(w, 0).coal).toBeGreaterThanOrEqual(START_STOCK.wares.coal + 2);
  });

  it('ohne Nahrung wartet das Bergwerk, ohne Vorkommen meldet es leer', () => {
    const w = flatWorld();
    const h = hq(w);
    for (const f of ['fish', 'bread', 'meat'] as const) {
      w.ledger[0].wares[f] -= h.stock[f];
      h.stock[f] = 0;
    }
    const n = node(w, 26, 16);
    mountain(w, n, Resource.Iron, 1);
    const id = buildConnected(w, n, 'ironmine');
    runUntil(w, () => w.buildings[id].status === 'waitingInput', 8000);
    stockHQ(w, 'bread', 30);
    runUntil(w, () => w.buildings[id].status === 'noResources', 40000);
    // Der Radius ist erschöpft: genau so viele Erze wie Vorkommen.
    const veins = 19; // Knoten im Radius 2
    expect(w.buildings[id].produced).toBeLessThanOrEqual(veins);
    expect(w.buildings[id].produced).toBeGreaterThan(0);
  });

  it('nur Bergwerke passen auf Bergplätze', () => {
    const w = flatWorld();
    const n = node(w, 26, 16);
    mountain(w, n, Resource.Gold, 5);
    expect(
      applyCommand(w, { type: 'placeBuilding', player: 0, node: n, building: 'woodcutter' }),
    ).toBe(false);
    expect(BUILDINGS.goldmine.size).toBe('mine');
    cmd(w, { type: 'placeBuilding', player: 0, node: n, building: 'goldmine' });
  });
});

describe('Geologe', () => {
  it('untersucht die Umgebung einer Flagge und stellt Schilder auf', () => {
    const w = flatWorld();
    const center = node(w, 26, 15);
    mountain(w, center, Resource.Granite, 15);
    const flagNode = neighbor(w.map, center, Dir.SE);
    cmd(w, { type: 'placeFlag', player: 0, node: flagNode });
    buildConnectedFlag(w, flagNode);
    const geologists = hq(w).people.geologist + countWares(w, 0).hammer;
    cmd(w, { type: 'sendGeologist', player: 0, flag: w.nodeFlag[flagNode] });
    runUntil(w, () => w.signs.length >= GEOLOGIST.SURVEYS, 12000);
    for (const sign of w.signs) {
      if (sign.resource) {
        expect(sign.resource).toBe(Resource.Granite);
        expect(sign.rich).toBe(1);
      }
    }
    expect(w.signs.some((s) => s.resource === Resource.Granite)).toBe(true);
    runUntil(w, () => hq(w).people.geologist === 1, 6000);
    expect(hq(w).people.geologist + countWares(w, 0).hammer).toBe(geologists);
    // Schilder verschwinden nach ihrer Lebensdauer.
    run(w, GEOLOGIST.SIGN_LIFETIME_TICKS + 10, 200);
    expect(w.signs.length).toBe(0);
  });
});

function buildConnectedFlag(w: World, flagNode: number): void {
  // Straße von der HQ-Flagge zur Zielflagge (gleiche Planung wie die UI).
  const id = w.nodeFlag[flagNode];
  expect(id).toBeGreaterThan(0);
  const hqFlag = w.flags[hq(w).flag].node;
  const seg = planRoad(w, hqFlag, flagNode);
  cmd(w, { type: 'buildRoad', player: 0, path: [hqFlag, ...seg], autoFlags: true });
}

import { planRoadSegment } from '../src/sim/roads';
function planRoad(w: World, from: number, to: number): number[] {
  const seg = planRoadSegment(w, 0, [from], to);
  expect(seg).not.toBeNull();
  return seg!;
}
