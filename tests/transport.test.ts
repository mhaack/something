import { describe, expect, it } from 'vitest';
import { TRANSPORT, START_STOCK } from '../src/data/balance';
import { MapObject } from '../src/data/terrain';
import { canPlaceFlag } from '../src/sim/flags';
import { validateRoad } from '../src/sim/roads';
import { searchFlags, routeSteps } from '../src/sim/routing';
import { countWares } from '../src/sim/invariants';
import { Dir, cmd, flagAt, flatWorld, hqFlagNode, line, node, run, runUntil } from './helpers';
import type { World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commandHandlers';

function hq(w: World) {
  return w.buildings[w.players[0].hq];
}

function idleCarriers(w: World): number {
  return Object.values(w.settlers).filter((s) => s.state === 'idle').length;
}

function noWaresInTransit(w: World): boolean {
  return Object.keys(w.wares).length === 0 && hq(w).outQueue.length === 0;
}

describe('HQ und Flaggen', () => {
  it('legt das HQ mit Flagge, Bestand und Gebiet an', () => {
    const w = flatWorld();
    const b = hq(w);
    expect(b.stock.planks).toBe(START_STOCK.wares.planks);
    expect(flagAt(w, hqFlagNode(w)).building).toBe(b.id);
    expect(w.owner[b.node]).toBe(0);
    expect(w.ledger[0].wares.planks).toBe(START_STOCK.wares.planks);
  });

  it('prüft Flaggenregeln: Abstand, Gebiet, Objekte', () => {
    const w = flatWorld();
    const f = hqFlagNode(w);
    const [, n1, n2] = line(w, f, Dir.E, 2);
    expect(canPlaceFlag(w, 0, n1)).toBe('tooClose');
    expect(canPlaceFlag(w, 0, n2)).toBe('ok');
    expect(canPlaceFlag(w, 0, node(w, 1, 1))).toBe('outside');
    w.map.objects[n2] = MapObject.Tree;
    expect(canPlaceFlag(w, 0, n2)).toBe('blocked');
  });
});

describe('Straßenbau', () => {
  it('validiert Pfade (Start, Nachbarschaft, Steigung, Belegung)', () => {
    const w = flatWorld();
    const f = hqFlagNode(w);
    const p = line(w, f, Dir.E, 4);
    expect(validateRoad(w, 0, p)).toBe('ok');
    expect(validateRoad(w, 0, [p[1], p[2], p[3]])).toBe('noStartFlag');
    expect(validateRoad(w, 0, [p[0], p[2]])).toBe('notAdjacent');
    w.map.heights[p[2]] = 30;
    expect(validateRoad(w, 0, p)).toBe('tooSteep');
    w.map.heights[p[2]] = 10;
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: false });
    // Zweite Straße in denselben Richtungsslot ist verboten.
    expect(validateRoad(w, 0, p)).not.toBe('ok');
    // Kreuzen einer Straße außerhalb einer Flagge ist verboten.
    const cross = [p[4], ...line(w, p[4], Dir.SW, 1).slice(1)];
    expect(validateRoad(w, 0, [...line(w, cross[1], Dir.W, 2).reverse(), p[2]])).not.toBe('ok');
  });

  it('setzt Zwischenflaggen automatisch', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 6);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: true });
    expect(Object.keys(w.roads)).toHaveLength(3);
    expect(Object.keys(w.flags)).toHaveLength(4);
  });

  it('teilt eine Straße, wenn eine Flagge daraufgesetzt wird', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 6);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: false });
    run(w, 300);
    cmd(w, { type: 'placeFlag', player: 0, node: p[3] });
    expect(Object.keys(w.roads)).toHaveLength(2);
    run(w, 400);
    expect(idleCarriers(w)).toBe(2);
  });
});

describe('Träger und Warentransport', () => {
  it('schickt einen Träger aus dem HQ zur neuen Straße', () => {
    const w = flatWorld();
    const carriers = hq(w).people.carrier;
    cmd(w, {
      type: 'buildRoad',
      player: 0,
      path: line(w, hqFlagNode(w), Dir.E, 4),
      autoFlags: false,
    });
    runUntil(w, () => idleCarriers(w) === 1, 400);
    expect(hq(w).people.carrier).toBe(carriers - 1);
  });

  it('transportiert Waren zur Flagge und zurück ins Lager', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 8);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: true });
    const far = w.nodeFlag[p[8]];
    const before = countWares(w, 0);
    for (let i = 0; i < 5; i++) cmd(w, { type: 'sendWare', player: 0, flag: far, ware: 'planks' });
    runUntil(w, () => Object.keys(w.wares).length > 0, 200);
    runUntil(w, () => noWaresInTransit(w), 4000);
    expect(countWares(w, 0)).toEqual(before);
    expect(Object.values(w.roads).every((r) => r.carriers[0] > 0)).toBe(true);
  });

  it('staut sich an vollen Flaggen, verliert aber nichts', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 8);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: true });
    const far = w.nodeFlag[p[8]];
    for (let i = 0; i < 30; i++) cmd(w, { type: 'sendWare', player: 0, flag: far, ware: 'stone' });
    let maxLoad = 0;
    runUntil(
      w,
      () => {
        for (const f of Object.values(w.flags)) maxLoad = Math.max(maxLoad, f.wares.length);
        return noWaresInTransit(w);
      },
      20000,
    );
    expect(maxLoad).toBeGreaterThan(2);
    expect(maxLoad).toBeLessThanOrEqual(TRANSPORT.FLAG_CAPACITY + TRANSPORT.FLAG_OVERFLOW);
    expect(hq(w).stock.stone).toBe(START_STOCK.wares.stone);
  });

  it('löst volle Zyklen im Straßennetz ohne Deadlock auf', () => {
    const w = flatWorld();
    const f0 = hqFlagNode(w);
    // Ring: HQ-Flagge → O → SO → SW → W → zurück zur HQ-Flagge, mit Zwischenflaggen.
    const a = line(w, f0, Dir.E, 4);
    const b = line(w, a[4], Dir.SE, 4);
    const c = line(w, b[4], Dir.W, 4);
    const d = line(w, c[4], Dir.NW, 4);
    for (const p of [a, b, c]) cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: true });
    cmd(w, { type: 'buildRoad', player: 0, path: d, autoFlags: true });
    const targets = Object.values(w.flags).filter((f) => !f.building);
    for (let i = 0; i < 60; i++) {
      cmd(w, {
        type: 'sendWare',
        player: 0,
        flag: targets[i % targets.length].id,
        ware: i % 2 ? 'planks' : 'stone',
      });
    }
    runUntil(w, () => noWaresInTransit(w), 40000);
    expect(countWares(w, 0).planks).toBe(START_STOCK.wares.planks);
  });

  it('wählt Routen über den Flaggen-Graph mit Stau-Kosten', () => {
    const w = flatWorld();
    const f0 = hqFlagNode(w);
    const a = line(w, f0, Dir.E, 4);
    cmd(w, { type: 'buildRoad', player: 0, path: a, autoFlags: false });
    const target = w.nodeFlag[a[4]];
    const start = w.nodeFlag[f0];
    const res = searchFlags(w, start, 0, true, (f) => f === target);
    expect(res.found).toBe(target);
    expect(routeSteps(res, start)).toHaveLength(1);
    // Mit wartenden Waren steigen die Kosten.
    const base = res.dist.get(target)!;
    for (let i = 0; i < 4; i++) cmd(w, { type: 'sendWare', player: 0, flag: target, ware: 'wood' });
    run(w, 60);
    const res2 = searchFlags(w, start, 0, true, (f) => f === target);
    expect(res2.dist.get(target)!).toBeGreaterThanOrEqual(base);
  });
});

describe('Abriss ohne Warenverlust', () => {
  it('Straße abreißen während des Transports', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 8);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: true });
    const far = w.nodeFlag[p[8]];
    for (let i = 0; i < 12; i++) cmd(w, { type: 'sendWare', player: 0, flag: far, ware: 'planks' });
    runUntil(w, () => Object.values(w.settlers).some((s) => s.ware), 2000);
    const before = countWares(w, 0);
    const roadIds = Object.keys(w.roads).map(Number);
    cmd(w, { type: 'removeRoad', player: 0, road: roadIds[1] });
    run(w, 600);
    expect(countWares(w, 0)).toEqual(before);
    // Nach dem Wiederaufbau kommen alle Waren heim.
    cmd(w, { type: 'buildRoad', player: 0, path: p.slice(2, 5), autoFlags: false });
    runUntil(w, () => noWaresInTransit(w), 8000);
    expect(countWares(w, 0)).toEqual(before);
  });

  it('Flagge abreißen: Waren gehen ins Lager, Träger kehren heim', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 8);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: true });
    const far = w.nodeFlag[p[8]];
    for (let i = 0; i < 6; i++) cmd(w, { type: 'sendWare', player: 0, flag: far, ware: 'fish' });
    runUntil(w, () => w.flags[far].wares.length > 0, 3000);
    const carriersTotal = hq(w).people.carrier + Object.keys(w.settlers).length;
    cmd(w, { type: 'removeFlag', player: 0, flag: w.nodeFlag[p[4]] });
    runUntil(
      w,
      () => noWaresInTransit(w) || Object.values(w.wares).every((x) => x.flag && !x.nextRoad),
      6000,
    );
    expect(countWares(w, 0).fish).toBe(START_STOCK.wares.fish);
    // Alle Siedler ohne Straße sind zurück im Lager.
    runUntil(w, () => Object.values(w.settlers).every((s) => s.road), 2000);
    expect(hq(w).people.carrier + Object.keys(w.settlers).length).toBe(carriersTotal);
  });

  it('HQ-Flagge kann nicht entfernt werden', () => {
    const w = flatWorld();
    const flag = w.nodeFlag[hqFlagNode(w)];
    expect(applyCommand(w, { type: 'removeFlag', player: 0, flag })).toBe(false);
    expect(w.flags[flag]).toBeDefined();
  });
});

describe('Esel', () => {
  it('stark befahrene Straßen bekommen einen Esel', () => {
    const w = flatWorld();
    const p = line(w, hqFlagNode(w), Dir.E, 4);
    cmd(w, { type: 'buildRoad', player: 0, path: p, autoFlags: false });
    const far = w.nodeFlag[p[4]];
    for (let i = 0; i < 36; i++) cmd(w, { type: 'sendWare', player: 0, flag: far, ware: 'planks' });
    runUntil(w, () => Object.values(w.roads)[0].busy, TRANSPORT.TRAFFIC_WINDOW_TICKS * 3);
    runUntil(
      w,
      () => Object.values(w.settlers).some((s) => s.job === 'donkey' && s.state !== 'toRoad'),
      2000,
    );
  });
});
