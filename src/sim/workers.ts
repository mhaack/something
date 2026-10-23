/**
 * Arbeiter-Zustandsautomat: Planierer, Bauarbeiter und Gebäudearbeiter (Holzfäller, Förster,
 * Steinmetz, Werkstätten). Arbeiter laufen über Straßen zur Arbeitsstätte und am Ziel frei durchs
 * Gelände zu Bäumen, Felsen und Pflanzplätzen.
 */
import { BUILD, TRANSPORT } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { MapObject } from '../data/terrain';
import type { WareType } from '../data/wares';
import { findConsumer, releaseWorker } from './buildings';
import { putOnFlag } from './carriers';
import type { Building, Settler, Ware } from './entities';
import { gridDistance, nodeX, nodeY, nodesInRadius } from './geometry';
import { isTreeSpot } from './mapgen';
import { nextInt } from './rng';
import { freePath } from './routing';
import { flagLoad } from './store';
import { isMatureTree, plantTree, removeObject } from './trees';
import { allocId, type World } from './world';

function home(world: World, s: Settler): Building | undefined {
  const b = world.buildings[s.home];
  return b && b.worker === s.id ? b : undefined;
}

export function standWorker(world: World, s: Settler): void {
  const b = home(world, s);
  if (!b) return releaseWorker(world, s.id);
  switch (s.state) {
    case 'toBuilding':
    case 'enterHome':
      return arriveHome(world, s, b);
    case 'inside':
      return insideWork(world, s, b);
    case 'toResource':
      return startHarvest(world, s, b);
    case 'harvest':
      return finishHarvest(world, s, b);
    case 'toFlagOut':
    case 'outputWait':
      return deliverOutput(world, s, b);
    case 'producing':
      return finishProduction(world, s, b);
    case 'leveling':
      return levelStep(world, s, b);
    case 'building':
      return buildStep(world, s, b);
    default:
      return;
  }
}

function arriveHome(_world: World, s: Settler, b: Building): void {
  s.targetNode = -1;
  if (b.site) {
    s.state = b.site.stage === 'level' ? 'leveling' : 'building';
    s.wait = 1;
    return;
  }
  const first = s.state === 'toBuilding';
  s.state = 'inside';
  s.wait = first ? 1 : Math.max(1, BUILDINGS[b.type].restTicks);
}

function flagNode(world: World, b: Building): number {
  return world.flags[b.flag].node;
}

/** Wird ein Knoten bereits von einem anderen Arbeiter angesteuert? */
function targeted(world: World, node: number, self: number): boolean {
  for (const id in world.settlers) {
    const o = world.settlers[id];
    if (o.id !== self && o.targetNode === node) return true;
  }
  return false;
}

function candidatesByDistance(world: World, b: Building, accept: (n: number) => boolean): number[] {
  const map = world.map;
  const bx = nodeX(map, b.node);
  const by = nodeY(map, b.node);
  return nodesInRadius(map, b.node, BUILDINGS[b.type].radius)
    .filter(accept)
    .map((n) => [n, gridDistance(bx, by, nodeX(map, n), nodeY(map, n))] as const)
    .sort((p, q) => p[1] - q[1] || p[0] - q[0])
    .map(([n]) => n);
}

function isPlantable(world: World, n: number): boolean {
  return (
    isTreeSpot(world.map, n) &&
    !world.nodeFlag[n] &&
    !world.nodeRoad[n] &&
    !world.nodeBuilding[n] &&
    world.owner[n] >= 0
  );
}

/** Weg von der Flagge zum Ziel; bei Hindernissen (Fels, Baum) endet er auf dem Nachbarknoten. */
function pathTo(world: World, from: number, target: number, standBeside: boolean): number[] | null {
  const p = freePath(world, from, target);
  if (!p) return null;
  if (standBeside && p.length > 0) p.pop();
  return p;
}

function goOut(
  world: World,
  s: Settler,
  b: Building,
  candidates: number[],
  beside: boolean,
): boolean {
  const fn = flagNode(world, b);
  for (const target of candidates.slice(0, 6)) {
    const p = pathTo(world, fn, target, beside);
    if (!p) continue;
    s.targetNode = target;
    s.state = 'toResource';
    s.path = [fn, ...p];
    b.status = 'ok';
    return true;
  }
  return false;
}

function idleNoResources(s: Settler, b: Building): void {
  b.status = 'noResources';
  s.wait = BUILD.NO_RESOURCE_RETRY_TICKS;
}

function insideWork(world: World, s: Settler, b: Building): void {
  const def = BUILDINGS[b.type];
  const map = world.map;
  switch (def.kind) {
    case 'woodcutter': {
      const c = candidatesByDistance(
        world,
        b,
        (n) => isMatureTree(world, n) && !targeted(world, n, s.id),
      );
      if (!goOut(world, s, b, c, true)) idleNoResources(s, b);
      return;
    }
    case 'quarry': {
      const c = candidatesByDistance(
        world,
        b,
        (n) => map.objects[n] === MapObject.Rock && map.objectData[n] > 0,
      );
      if (!goOut(world, s, b, c, true)) idleNoResources(s, b);
      return;
    }
    case 'forester': {
      const c = candidatesByDistance(
        world,
        b,
        (n) => n !== b.node && isPlantable(world, n) && !targeted(world, n, s.id),
      );
      if (c.length === 0) return idleNoResources(s, b);
      // Zufälliger Platz unter den nächsten Kandidaten (deterministisch über den Welt-RNG).
      const pick = c[nextInt(world.rng, 0, Math.min(c.length, 12) - 1)];
      if (!goOut(world, s, b, [pick, ...c.filter((n) => n !== pick)], false)) {
        idleNoResources(s, b);
      }
      return;
    }
    case 'workshop': {
      const needs = Object.entries(def.consumes) as [WareType, number][];
      if (!needs.every(([t, n]) => b.stock[t] >= n)) {
        b.status = 'waitingInput';
        s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
        return;
      }
      for (const [t, n] of needs) {
        b.stock[t] -= n;
        world.ledger[b.owner].wares[t] -= n;
      }
      b.status = 'ok';
      s.state = 'producing';
      s.wait = def.workTicks;
      return;
    }
    case 'store':
      return;
  }
}

function startHarvest(world: World, s: Settler, b: Building): void {
  const def = BUILDINGS[b.type];
  const t = s.targetNode;
  const map = world.map;
  const valid =
    def.kind === 'woodcutter'
      ? isMatureTree(world, t)
      : def.kind === 'quarry'
        ? map.objects[t] === MapObject.Rock
        : isPlantable(world, t);
  if (!valid) return goHome(world, s, b);
  s.state = 'harvest';
  s.wait = def.workTicks;
}

/** Erzeugt eine neue Ware in der Hand des Arbeiters (Produktion). */
function produce(world: World, s: Settler, b: Building, type: WareType): void {
  const id = allocId(world);
  const w: Ware = {
    id,
    type,
    owner: b.owner,
    flag: 0,
    carrier: s.id,
    dest: 0,
    destFlag: 0,
    nextRoad: 0,
    reservedBy: 0,
    since: world.tick,
    routePending: false,
  };
  world.wares[id] = w;
  world.ledger[b.owner].wares[type]++;
  s.ware = id;
}

function finishHarvest(world: World, s: Settler, b: Building): void {
  const def = BUILDINGS[b.type];
  const t = s.targetNode;
  const map = world.map;
  if (def.kind === 'woodcutter' && isMatureTree(world, t)) {
    removeObject(world, t);
    produce(world, s, b, 'wood');
  } else if (def.kind === 'quarry' && map.objects[t] === MapObject.Rock) {
    map.objectData[t]--;
    if (map.objectData[t] <= 0) removeObject(world, t);
    else world.mapRevision++;
    produce(world, s, b, 'stone');
  } else if (def.kind === 'forester' && isPlantable(world, t)) {
    plantTree(world, t);
  }
  goHome(world, s, b);
}

/** Rückweg zur eigenen Flagge; mit Ware zum Ablegen, sonst direkt ins Gebäude. */
function goHome(world: World, s: Settler, b: Building): void {
  s.targetNode = -1;
  const fn = flagNode(world, b);
  const p = s.node === fn ? [] : (freePath(world, s.node, fn) ?? [fn]);
  if (s.ware) {
    s.state = 'toFlagOut';
    s.path = p;
  } else {
    s.state = 'enterHome';
    s.path = [...p, b.node];
  }
}

function deliverOutput(world: World, s: Settler, b: Building): void {
  const w = world.wares[s.ware];
  if (!w) {
    s.state = 'enterHome';
    s.path = [b.node];
    return;
  }
  if (flagLoad(world, b.flag) >= TRANSPORT.FLAG_CAPACITY) {
    b.status = 'outputBlocked';
    s.state = 'outputWait';
    s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
    return;
  }
  w.dest = findConsumer(world, b.owner, b.flag, w.type);
  putOnFlag(world, w, b.flag);
  s.ware = 0;
  b.produced++;
  b.status = 'ok';
  s.state = 'enterHome';
  s.path = [b.node];
}

function finishProduction(world: World, s: Settler, b: Building): void {
  const out = BUILDINGS[b.type].output;
  if (out) {
    produce(world, s, b, out);
    s.state = 'toFlagOut';
    s.path = [flagNode(world, b)];
    return;
  }
  s.state = 'inside';
  s.wait = 1;
}

function levelStep(world: World, s: Settler, b: Building): void {
  const site = b.site;
  if (!site || site.stage !== 'level') return arriveHome(world, s, b);
  const h = world.map.heights;
  const n = site.levelNodes.find((k) => h[k] !== site.levelTarget);
  if (n === undefined) {
    site.stage = 'build';
    site.levelNodes = [];
    b.worker = 0;
    return releaseWorker(world, s.id);
  }
  h[n] += h[n] < site.levelTarget ? 1 : -1;
  world.mapRevision++;
  s.wait = BUILD.LEVEL_STEP_TICKS;
}

function buildStep(world: World, s: Settler, b: Building): void {
  const site = b.site;
  if (!site) return arriveHome(world, s, b);
  if (site.stage === 'level') {
    // Planierer fehlt noch: Bauarbeiter wartet.
    s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
    return;
  }
  const cost = BUILDINGS[b.type].cost;
  if (site.usedPlanks >= cost.planks && site.usedStone >= cost.stone) {
    b.site = null;
    b.worker = 0;
    b.status = 'ok';
    world.mapRevision++;
    return releaseWorker(world, s.id);
  }
  const use = (type: 'planks' | 'stone'): void => {
    b.stock[type]--;
    world.ledger[b.owner].wares[type]--;
    if (type === 'planks') site.usedPlanks++;
    else site.usedStone++;
    b.status = 'ok';
    s.wait = BUILD.BUILD_TICKS_PER_UNIT;
  };
  if (site.usedPlanks < cost.planks && b.stock.planks > 0) return use('planks');
  if (site.usedStone < cost.stone && b.stock.stone > 0) return use('stone');
  b.status = 'waitingInput';
  s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
}

/** Baufortschritt 0..1 (für Anzeige). */
export function buildProgress(world: World, b: Building): number {
  if (!b.site) return 1;
  const cost = BUILDINGS[b.type].cost;
  const total = cost.planks + cost.stone;
  if (total === 0) return 1;
  let done = b.site.usedPlanks + b.site.usedStone;
  const w = world.settlers[b.worker];
  if (w && w.state === 'building' && w.wait > 0) {
    done -= w.wait / BUILD.BUILD_TICKS_PER_UNIT;
  }
  return Math.max(0, Math.min(1, done / total));
}
