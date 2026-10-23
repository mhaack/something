import { describe, expect, it } from 'vitest';
import { MILITARY, OUTCOME } from '../src/data/balance';
import { Terrain } from '../src/data/terrain';
import type { BuildingType } from '../src/data/buildings';
import { buildSize } from '../src/sim/buildings';
import { applyCommand } from '../src/sim/commandHandlers';
import { DIRS, neighbor, nodeIndex } from '../src/sim/geometry';
import { countWares } from '../src/sim/invariants';
import { createEmptyMap } from '../src/sim/map';
import { availableAttackers } from '../src/sim/military';
import { planRoadSegment } from '../src/sim/roads';
import { createWorldFromMap, serializeWorld, type World } from '../src/sim/world';
import { cmd, run, runUntil } from './helpers';

/** Flache Karte mit zwei Hauptquartieren im Abstand von 24 Knoten. */
function twoPlayers(): World {
  const map = createEmptyMap(48, 32);
  map.heights.fill(10);
  map.terrain.fill(Terrain.Meadow1);
  return createWorldFromMap('war', map, [nodeIndex(map, 12, 16), nodeIndex(map, 36, 16)]);
}

const N = (w: World, x: number, y: number): number => nodeIndex(w.map, x, y);

function hq(w: World, p: number) {
  return w.buildings[w.players[p].hq];
}

/** Baut ein Gebäude für Spieler p und verbindet es mit dessen HQ-Flagge. */
function build(w: World, p: number, n: number, type: BuildingType): number {
  cmd(w, { type: 'placeBuilding', player: p, node: n, building: type });
  const id = w.nodeBuilding[n];
  const from = w.flags[hq(w, p).flag].node;
  const to = w.flags[w.buildings[id].flag].node;
  const seg = planRoadSegment(w, p, [from], to);
  expect(seg).not.toBeNull();
  cmd(w, { type: 'buildRoad', player: p, path: [from, ...seg!], autoFlags: true });
  return id;
}

/** Jeder Spieler muss mit jedem seiner Gebiete an einem eigenen Militärgebäude hängen. */
function territoryConnected(w: World): boolean {
  for (const p of w.players) {
    const starts = Object.values(w.buildings)
      .filter((b) => b.owner === p.id && (b.type === 'hq' || b.soldiers.length > 0) && !b.site)
      .map((b) => b.node);
    const seen = new Set(starts.filter((s) => w.owner[s] === p.id));
    const queue = [...seen];
    for (let q = 0; q < queue.length; q++) {
      for (const d of DIRS) {
        const m = neighbor(w.map, queue[q], d);
        if (m >= 0 && !seen.has(m) && w.owner[m] === p.id) {
          seen.add(m);
          queue.push(m);
        }
      }
    }
    const owned = w.owner.filter((o) => o === p.id).length;
    if (owned !== seen.size) return false;
  }
  return true;
}

describe('Territorium', () => {
  it('HQs beanspruchen ihren Radius, dazwischen ist neutrales Land', () => {
    const w = twoPlayers();
    expect(w.owner[N(w, 12, 16)]).toBe(0);
    expect(w.owner[N(w, 36, 16)]).toBe(1);
    expect(w.owner[N(w, 24, 16)]).toBe(-1);
    expect(territoryConnected(w)).toBe(true);
  });

  it('Wachhütte erweitert das Gebiet, sobald ein Soldat eingezogen ist', () => {
    const w = twoPlayers();
    const n = N(w, 19, 16);
    expect(buildSize(w, 0, n)).not.toBeNull();
    const id = build(w, 0, n, 'guardhut');
    expect(w.owner[N(w, 24, 16)]).toBe(-1);
    runUntil(w, () => w.buildings[id].soldiers.length > 0, 8000);
    run(w, 2);
    expect(w.owner[N(w, 24, 16)]).toBe(0);
    runUntil(w, () => w.buildings[id].soldiers.length === MILITARY.CAPACITY.guardhut, 4000);
    expect(territoryConnected(w)).toBe(true);
  });

  it('Soldaten entstehen aus Träger, Schwert und Schild', () => {
    const w = twoPlayers();
    const h = hq(w, 0);
    h.soldiers = [];
    h.stock.sword = 1;
    h.stock.shield = 1;
    w.ledger[0].wares.sword = 1;
    w.ledger[0].wares.shield = 1;
    const id = build(w, 0, N(w, 19, 16), 'guardhut');
    runUntil(w, () => w.buildings[id].soldiers.length === 1, 8000);
    expect(countWares(w, 0).sword).toBe(0);
    expect(countWares(w, 0).shield).toBe(0);
    run(w, 600);
    expect(w.buildings[id].soldiers.length).toBe(1);
  });

  it('Münzen befördern Soldaten', () => {
    const w = twoPlayers();
    hq(w, 0).soldiers = [0, 0];
    hq(w, 0).stock.coins = 3;
    w.ledger[0].wares.coins = 3;
    const id = build(w, 0, N(w, 19, 16), 'guardhut');
    runUntil(w, () => w.buildings[id].soldiers.length === 2, 8000);
    runUntil(w, () => w.buildings[id].soldiers.reduce((a, r) => a + r, 0) >= 2, 8000);
    expect(countWares(w, 0).coins).toBeLessThanOrEqual(1);
  });
});

describe('Angriff und Kampf', () => {
  /** Beide Spieler mit besetzter Wachhütte an der Grenze. */
  function frontline(): { w: World; a: number; b: number } {
    const w = twoPlayers();
    hq(w, 0).soldiers = [4, 4, 4, 4, 4, 4];
    hq(w, 1).soldiers = [0, 0];
    const a = build(w, 0, N(w, 19, 16), 'guardhut');
    const b = build(w, 1, N(w, 29, 16), 'guardhut');
    runUntil(
      w,
      () => w.buildings[a].soldiers.length === 2 && w.buildings[b].soldiers.length >= 1,
      10000,
    );
    run(w, 2);
    return { w, a, b };
  }

  it('erobert eine feindliche Wachhütte; das Gebiet verschiebt sich', () => {
    const { w, b } = frontline();
    // Ein Betrieb von Spieler 1 im Einflussbereich der Hütte brennt nach der Eroberung ab.
    const victimNode = N(w, 30, 20);
    cmd(w, { type: 'placeBuilding', player: 1, node: victimNode, building: 'woodcutter' });
    const victim = w.nodeBuilding[victimNode];
    expect(availableAttackers(w, 0, w.buildings[b])).toBeGreaterThan(0);
    const before = countWares(w, 0).planks + countWares(w, 1).planks;
    cmd(w, { type: 'attack', player: 0, target: b, soldiers: 4 });
    runUntil(w, () => w.buildings[b].owner === 0, 15000);
    run(w, 5);
    expect(w.owner[w.buildings[b].node]).toBe(0);
    expect(w.buildings[victim]).toBeUndefined();
    expect(w.fires.length).toBeGreaterThan(0);
    expect(territoryConnected(w)).toBe(true);
    // Material der abgebrannten Baustelle ging nicht verloren (ins Lager von Spieler 1).
    expect(countWares(w, 0).planks + countWares(w, 1).planks).toBe(before);
  });

  it('starke Verteidiger schlagen schwache Angreifer zurück', () => {
    const w = twoPlayers();
    hq(w, 0).soldiers = [0, 0, 0, 0];
    hq(w, 1).soldiers = [4, 4, 4];
    const a = build(w, 0, N(w, 19, 16), 'guardhut');
    const b = build(w, 1, N(w, 29, 16), 'guardhut');
    runUntil(
      w,
      () => w.buildings[a].soldiers.length === 2 && w.buildings[b].soldiers.length === 2,
      10000,
    );
    cmd(w, { type: 'attack', player: 0, target: b, soldiers: 3 });
    runUntil(
      w,
      () =>
        !Object.values(w.settlers).some(
          (s) => s.job === 'soldier' && s.owner === 0 && s.targetBuilding,
        ),
      15000,
    );
    expect(w.buildings[b].owner).toBe(1);
    expect(w.buildings[b].soldiers.length).toBeGreaterThan(0);
  });

  it('die Eroberung des HQ zerstört es', () => {
    const w = twoPlayers();
    hq(w, 0).soldiers = [4, 4, 4, 4, 4, 4, 4];
    hq(w, 1).soldiers = [0];
    const a = build(w, 0, N(w, 19, 16), 'guardhut');
    runUntil(w, () => w.buildings[a].soldiers.length > 0, 8000);
    run(w, 2);
    const t = build(w, 0, N(w, 24, 15), 'watchtower');
    runUntil(w, () => w.buildings[t]?.soldiers.length >= 4, 20000);
    const target = w.players[1].hq;
    expect(availableAttackers(w, 0, w.buildings[target])).toBeGreaterThan(0);
    cmd(w, { type: 'attack', player: 0, target, soldiers: 5 });
    runUntil(w, () => !w.buildings[target], 20000);
    expect(w.players[1].hq).toBe(0);
    run(w, 2 * OUTCOME.CHECK_INTERVAL_TICKS);
    expect(w.players[1].defeated).toBe(true);
    expect(w.outcome).toMatchObject({ result: 'won', reason: 'goals' });
  });

  it('Kämpfe sind deterministisch', () => {
    const play = (): string => {
      const { w, b } = frontline();
      applyCommand(w, { type: 'attack', player: 0, target: b, soldiers: 4 });
      run(w, 3000, 500);
      return serializeWorld(w);
    };
    expect(play()).toBe(play());
  });
});
