import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/data/buildings';
import { START_STOCK, TREES } from '../src/data/balance';
import { MapObject } from '../src/data/terrain';
import type { BuildingType } from '../src/data/buildings';
import { buildSize, canBuild } from '../src/sim/buildings';
import { applyCommand } from '../src/sim/commandHandlers';
import { Dir, neighbor } from '../src/sim/geometry';
import { countWares } from '../src/sim/invariants';
import { planRoadSegment } from '../src/sim/roads';
import { treeData } from '../src/sim/trees';
import { serializeWorld, type World } from '../src/sim/world';
import { cmd, flatWorld, hqFlagNode, node, run, runUntil } from './helpers';

function hq(w: World) {
  return w.buildings[w.players[0].hq];
}

/** Baut ein Gebäude und verbindet seine Flagge per Straße mit der HQ-Flagge. */
function buildConnected(w: World, n: number, type: BuildingType): number {
  cmd(w, { type: 'placeBuilding', player: 0, node: n, building: type });
  const id = w.nodeBuilding[n];
  const flagNode = w.flags[w.buildings[id].flag].node;
  const seg = planRoadSegment(w, 0, [hqFlagNode(w)], flagNode);
  expect(seg).not.toBeNull();
  cmd(w, { type: 'buildRoad', player: 0, path: [hqFlagNode(w), ...seg!], autoFlags: true });
  return id;
}

function plantMature(w: World, n: number): void {
  w.map.objects[n] = MapObject.Tree;
  w.map.objectData[n] = treeData(0, TREES.MATURE_STAGE);
}

describe('Bauplätze', () => {
  it('bestimmt Größen nach Hindernissen, Steigung und Gebiet', () => {
    const w = flatWorld();
    const n = node(w, 25, 24);
    expect(buildSize(w, 0, n)).toBe('large');
    w.map.objects[neighbor(w.map, n, Dir.E)] = MapObject.Tree;
    expect(buildSize(w, 0, n)).toBe('small');
    w.map.objects[neighbor(w.map, n, Dir.E)] = MapObject.None;
    w.map.heights[neighbor(w.map, n, Dir.E)] = 20;
    expect(buildSize(w, 0, n)).toBeNull();
    expect(buildSize(w, 0, node(w, 2, 2))).toBeNull();
  });

  it('verhindert zu große Gebäude und belegt Knoten und Flagge', () => {
    const w = flatWorld();
    const n = node(w, 25, 24);
    w.map.objects[neighbor(w.map, n, Dir.E)] = MapObject.Tree;
    expect(canBuild(w, 0, n, 'sawmill')).toBe('tooSmall');
    expect(canBuild(w, 0, n, 'woodcutter')).toBe('ok');
    cmd(w, { type: 'placeBuilding', player: 0, node: n, building: 'woodcutter' });
    const b = w.buildings[w.nodeBuilding[n]];
    expect(b.site).not.toBeNull();
    expect(w.flags[b.flag].node).toBe(neighbor(w.map, n, Dir.SE));
    expect(buildSize(w, 0, n)).toBeNull();
  });
});

describe('Baustellen', () => {
  it('Bauarbeiter baut mit angelieferten Brettern, nichts geht verloren', () => {
    const w = flatWorld();
    const before = countWares(w, 0);
    const id = buildConnected(w, node(w, 25, 24), 'woodcutter');
    runUntil(w, () => !w.buildings[id].site, 6000);
    const cost = BUILDINGS.woodcutter.cost.planks;
    expect(hq(w).stock.planks).toBe(START_STOCK.wares.planks - cost);
    // Werkzeug für den Bauarbeiter verbraucht, alles andere gleich.
    const after = countWares(w, 0);
    expect(after.planks).toBe(before.planks - cost);
    expect(after.hammer).toBe(before.hammer - 1);
    runUntil(w, () => hq(w).people.builder === 1, 3000);
  });

  it('Planierer ebnet unebenen Boden vor dem Bau', () => {
    const w = flatWorld();
    const n = node(w, 25, 24);
    w.map.heights[n] = 14;
    const id = buildConnected(w, n, 'woodcutter');
    expect(w.buildings[id].site!.stage).toBe('level');
    runUntil(w, () => w.buildings[id].site?.stage === 'build', 4000);
    expect(w.map.heights[n]).toBe(w.buildings[id].site!.levelTarget);
    expect(countWares(w, 0).shovel).toBe(START_STOCK.wares.shovel - 1);
    runUntil(w, () => !w.buildings[id].site, 6000);
  });

  it('Abriss einer Baustelle bringt Material und Arbeiter zurück', () => {
    const w = flatWorld();
    const id = buildConnected(w, node(w, 25, 24), 'sawmill');
    runUntil(w, () => w.buildings[id].stock.planks > 0, 4000);
    const before = countWares(w, 0);
    cmd(w, { type: 'removeBuilding', player: 0, building: id });
    expect(w.buildings[id]).toBeUndefined();
    run(w, 1500);
    expect(countWares(w, 0)).toEqual(before);
    expect(Object.values(w.settlers).filter((s) => s.home === id)).toHaveLength(0);
  });
});

describe('Produktion', () => {
  it('Holzfäller fällt Bäume und liefert Holz ins Lager', () => {
    const w = flatWorld();
    const trees = [node(w, 28, 20), node(w, 29, 22), node(w, 27, 18)];
    for (const t of trees) plantMature(w, t);
    const id = buildConnected(w, node(w, 25, 22), 'woodcutter');
    runUntil(w, () => hq(w).stock.wood >= START_STOCK.wares.wood + 2, 12000);
    expect(trees.filter((t) => w.map.objects[t] === MapObject.Tree).length).toBeLessThan(3);
    expect(w.buildings[id].produced).toBeGreaterThanOrEqual(2);
  });

  it('Holzfäller ohne Bäume meldet fehlende Ressourcen', () => {
    const w = flatWorld();
    const id = buildConnected(w, node(w, 25, 22), 'woodcutter');
    runUntil(w, () => w.buildings[id].status === 'noResources', 8000);
  });

  it('Förster pflanzt Bäume, die heranwachsen', () => {
    const w = flatWorld();
    buildConnected(w, node(w, 25, 22), 'forester');
    runUntil(w, () => w.growingTrees.length > 0, 8000);
    const planted = w.growingTrees[0].node;
    runUntil(
      w,
      () => w.map.objectData[planted] >> 2 >= TREES.MATURE_STAGE,
      TREES.GROWTH_STAGE_TICKS * (TREES.MATURE_STAGE + 1),
    );
  });

  it('Steinbruch baut Felsen ab', () => {
    const w = flatWorld();
    const rock = node(w, 28, 21);
    w.map.objects[rock] = MapObject.Rock;
    w.map.objectData[rock] = 2;
    buildConnected(w, node(w, 25, 22), 'quarry');
    runUntil(w, () => hq(w).stock.stone >= START_STOCK.wares.stone + 2, 12000);
    expect(w.map.objects[rock]).toBe(MapObject.None);
  });

  it('Sägewerk verarbeitet angeforderte Baumstämme zu Brettern', () => {
    const w = flatWorld();
    const id = buildConnected(w, node(w, 25, 22), 'sawmill');
    const cost = BUILDINGS.sawmill.cost;
    runUntil(w, () => w.buildings[id].produced >= 3, 15000);
    runUntil(w, () => Object.keys(w.wares).length === 0, 4000);
    expect(hq(w).stock.planks).toBeGreaterThanOrEqual(
      START_STOCK.wares.planks - cost.planks + 3 - 0,
    );
    expect(countWares(w, 0).wood).toBeLessThanOrEqual(START_STOCK.wares.wood - 3);
  });

  it('Bretter aus dem Sägewerk gehen direkt zur Baustelle, die sie braucht', () => {
    const w = flatWorld();
    const saw = buildConnected(w, node(w, 25, 22), 'sawmill');
    runUntil(w, () => !w.buildings[saw].site && w.buildings[saw].worker > 0, 8000);
    // Lager leeren, damit nur das Sägewerk Bretter liefern kann.
    const h = hq(w);
    w.ledger[0].wares.planks -= h.stock.planks;
    h.stock.planks = 0;
    const site = buildConnected(w, node(w, 17, 22), 'woodcutter');
    runUntil(w, () => !w.buildings[site].site, 20000);
  });
});

describe('Determinismus mit Gebäuden', () => {
  it('zwei Läufe mit gleichen Befehlen sind identisch', () => {
    const make = (): World => {
      const w = flatWorld();
      for (const t of [node(w, 28, 20), node(w, 29, 22)]) plantMature(w, t);
      buildConnected(w, node(w, 25, 22), 'woodcutter');
      buildConnected(w, node(w, 17, 22), 'forester');
      expect(applyCommand(w, { type: 'noop', player: 0 })).toBe(true);
      run(w, 3000, 100);
      return w;
    };
    expect(serializeWorld(make())).toBe(serializeWorld(make()));
  });
});
