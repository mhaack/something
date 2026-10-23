import { beforeAll, describe, expect, it } from 'vitest';
import { AI, MILITARY } from '../src/data/balance';
import { Terrain } from '../src/data/terrain';
import { aiCommands, planAttack, think } from '../src/ai';
import { reachableFlags } from '../src/ai/view';
import { isStore } from '../src/sim/store';
import { checkInvariants } from '../src/sim/invariants';
import { createEmptyMap } from '../src/sim/map';
import { nodeIndex } from '../src/sim/geometry';
import { planRoadSegment } from '../src/sim/roads';
import type { BuildingType } from '../src/data/buildings';
import {
  createWorld,
  createWorldFromMap,
  serializeWorld,
  step,
  type World,
} from '../src/sim/world';
import { cmd, runUntil } from './helpers';

/** Lässt die KI-Spieler n Ticks spielen und prüft regelmäßig die Invarianten. */
function play(w: World, ticks: number, onCheck?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    step(w, aiCommands(w));
    if (i % 500 === 0) {
      expect(checkInvariants(w)).toEqual([]);
      onCheck?.();
    }
  }
  expect(checkInvariants(w)).toEqual([]);
}

function land(w: World, p: number): number {
  return w.owner.filter((o) => o === p).length;
}

function owned(w: World, p: number, type: BuildingType): number {
  return Object.values(w.buildings).filter((b) => b.owner === p && b.type === type).length;
}

describe('Gegner-KI auf einer erzeugten Karte', () => {
  let w: World;
  let startLand: number;
  let maxSites = 0;

  beforeAll(() => {
    w = createWorld({ seed: 21, size: 128, players: 2, ai: ['normal'] });
    startLand = land(w, 1);
    play(w, 12000, () => {
      const sites = Object.values(w.buildings).filter((b) => b.owner === 1 && b.site).length;
      maxSites = Math.max(maxSites, sites);
    });
  });

  it('baut die Grundwirtschaft auf', () => {
    for (const t of ['woodcutter', 'quarry', 'sawmill', 'forester'] as const) {
      expect(owned(w, 1, t), t).toBeGreaterThan(0);
    }
    expect(w.stats[1].produced.planks).toBeGreaterThan(0);
  });

  it('dehnt ihr Gebiet mit Militärgebäuden aus', () => {
    expect(owned(w, 1, 'guardhut') + owned(w, 1, 'watchtower')).toBeGreaterThanOrEqual(2);
    expect(land(w, 1)).toBeGreaterThan(startLand);
  });

  it('hält sich an die Zahl gleichzeitiger Baustellen', () => {
    expect(maxSites).toBeGreaterThan(0);
    expect(maxSites).toBeLessThanOrEqual(AI.MAX_SITES.normal);
  });

  it('schließt alle Gebäude ans Straßennetz an', () => {
    const stores = Object.values(w.buildings).filter((b) => b.owner === 1 && isStore(b));
    const reach = reachableFlags(w, stores);
    const orphans = Object.values(w.buildings).filter((b) => b.owner === 1 && !reach.has(b.flag));
    expect(orphans.length).toBeLessThanOrEqual(1);
  });

  it('der Mensch (Spieler 0) wird nicht gesteuert', () => {
    expect(Object.values(w.buildings).filter((b) => b.owner === 0)).toHaveLength(1);
  });
});

describe('Gegner-KI: Regeln', () => {
  it('ist deterministisch', () => {
    const once = (): string => {
      const w = createWorld({ seed: 33, size: 64, players: 2, ai: ['hard'] });
      play(w, 3000);
      return serializeWorld(w);
    };
    expect(once()).toBe(once());
  });

  /** Flache Karte, Spieler 0 von der KI gesteuert, Spieler 1 passiv. */
  function duel(): World {
    const map = createEmptyMap(48, 32);
    map.heights.fill(10);
    map.terrain.fill(Terrain.Meadow1);
    const w = createWorldFromMap('ai', map, [nodeIndex(map, 12, 16), nodeIndex(map, 36, 16)]);
    w.players[0].human = false;
    w.players[0].ai = 'hard';
    w.players[1].ai = null;
    return w;
  }

  /** Entfernt Schwerter und Schilde (keine neuen Soldaten). */
  function disarm(w: World, p: number): void {
    const hq = w.buildings[w.players[p].hq];
    for (const t of ['sword', 'shield'] as const) {
      w.ledger[p].wares[t] -= hq.stock[t];
      hq.stock[t] = 0;
    }
  }

  function buildFor(w: World, p: number, x: number, y: number, type: BuildingType): number {
    const n = nodeIndex(w.map, x, y);
    cmd(w, { type: 'placeBuilding', player: p, node: n, building: type });
    const id = w.nodeBuilding[n];
    const hq = w.buildings[w.players[p].hq];
    const from = w.flags[hq.flag].node;
    const to = w.flags[w.buildings[id].flag].node;
    const seg = planRoadSegment(w, p, [from], to)!;
    cmd(w, { type: 'buildRoad', player: p, path: [from, ...seg], autoFlags: true });
    return id;
  }

  it('greift nur mit ausreichender Überlegenheit an', () => {
    const w = duel();
    w.buildings[w.players[0].hq].soldiers = [4, 4, 4, 4];
    w.buildings[w.players[1].hq].soldiers = [0];
    disarm(w, 1);
    const a = buildFor(w, 0, 19, 16, 'guardhut');
    const b = buildFor(w, 1, 29, 16, 'guardhut');
    runUntil(
      w,
      () => w.buildings[a].soldiers.length === 2 && w.buildings[b].soldiers.length === 1,
      10000,
    );
    // Ein Angreifer (Rang 4) gegen einen Rekruten: deutlich überlegen.
    expect(planAttack(w, 0, 'hard')).toEqual({ type: 'attack', player: 0, target: b, soldiers: 1 });
    // Gegen einen gleich starken Verteidiger reicht es nicht.
    w.buildings[b].soldiers = [4];
    expect(planAttack(w, 0, 'hard')).toBeNull();
  });

  it('erobert ein schwaches Nachbargebäude', () => {
    const w = duel();
    w.buildings[w.players[0].hq].soldiers = [4, 4, 4, 4, 4, 4];
    w.buildings[w.players[1].hq].soldiers = [0];
    disarm(w, 1);
    const b = buildFor(w, 1, 29, 16, 'guardhut');
    buildFor(w, 0, 19, 16, 'guardhut');
    runUntil(w, () => w.buildings[b].soldiers.length === 1, 10000);
    // Uhr auf den frühesten Angriffszeitpunkt stellen.
    w.tick = AI.ATTACK_START_TICKS.hard;
    for (let i = 0; i < 20000 && w.buildings[b]?.owner !== 0; i++) step(w, aiCommands(w));
    expect(w.buildings[b]?.owner).toBe(0);
    expect(checkInvariants(w)).toEqual([]);
  });

  it('fordert fehlende Werkzeuge mit hoher Priorität an', () => {
    const w = duel();
    const hq = w.buildings[w.players[0].hq];
    w.ledger[0].wares.axe -= hq.stock.axe;
    hq.stock.axe = 0;
    const id = buildFor(w, 0, 16, 12, 'woodcutter');
    w.buildings[id].site = null;
    const cmds = think(w, 0, 'normal');
    expect(cmds).toContainEqual({
      type: 'setToolPriority',
      player: 0,
      tool: 'axe',
      value: AI.TOOL_URGENT,
    });
    expect(cmds).toContainEqual({ type: 'setToolPriority', player: 0, tool: 'saw', value: 0 });
  });

  it('verbindet ein Gebäude ohne Straße', () => {
    const w = duel();
    const n = nodeIndex(w.map, 16, 12);
    cmd(w, { type: 'placeBuilding', player: 0, node: n, building: 'woodcutter' });
    const flagNode = w.flags[w.buildings[w.nodeBuilding[n]].flag].node;
    const road = think(w, 0, 'normal').find((c) => c.type === 'buildRoad');
    expect(road && road.type === 'buildRoad' && road.path[0]).toBe(flagNode);
  });

  it('plant Militärgebäude nur mit freien Soldaten', () => {
    const w = duel();
    const hq = w.buildings[w.players[0].hq];
    hq.soldiers = [];
    disarm(w, 0);
    const cmds = think(w, 0, 'easy');
    const military = cmds.filter(
      (c) =>
        c.type === 'placeBuilding' && ['guardhut', 'watchtower', 'fortress'].includes(c.building),
    );
    expect(military).toHaveLength(0);
    expect(MILITARY.CAPACITY.guardhut).toBeGreaterThan(0);
  });
});

describe('Gegner-KI: Laufzeit', () => {
  it('denkt auf einer 256er-Karte mit 3 Gegnern schnell genug', () => {
    const w = createWorld({ seed: 4, size: 256, players: 4, ai: ['hard', 'hard', 'hard'] });
    let worst = 0;
    let total = 0;
    const ticks = 1200;
    for (let i = 0; i < ticks; i++) {
      const t0 = performance.now();
      const c = aiCommands(w);
      const dt = performance.now() - t0;
      worst = Math.max(worst, dt);
      total += dt;
      step(w, c);
    }
    expect(total / ticks).toBeLessThan(2);
    expect(worst).toBeLessThan(100);
  }, 120000);
});
