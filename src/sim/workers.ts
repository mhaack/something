/**
 * Arbeiter-Zustandsautomat: Planierer, Bauarbeiter und Gebäudearbeiter (Holzfäller, Förster,
 * Steinmetz, Werkstätten). Arbeiter laufen über Straßen zur Arbeitsstätte und am Ziel frei durchs
 * Gelände zu Bäumen, Felsen und Pflanzplätzen.
 */
import { BUILD, GEOLOGIST, TRANSPORT } from '../data/balance';
import { BUILDINGS } from '../data/buildings';
import { MapObject, Resource } from '../data/terrain';
import type { WareType } from '../data/wares';
import { findConsumer, releaseWorker } from './buildings';
import { putOnFlag } from './carriers';
import type { Building, Settler, Ware } from './entities';
import { gridDistance, nodeX, nodeY, nodesInRadius } from './geometry';
import { isTreeSpot } from './mapgen';
import { nextInt } from './rng';
import { freePath } from './routing';
import { flagLoad, newSettler } from './store';
import { standSoldier } from './military';
import { chooseTool, hasToolOrders, recordConsumed, recordProduced } from './economy';
import { isMatureField, isMatureTree, plantTree, removeObject, sowField } from './trees';
import { isMinableTerrain, isPassable } from './map';
import { allocId, type World } from './world';

function home(world: World, s: Settler): Building | undefined {
  const b = world.buildings[s.home];
  return b && b.worker === s.id ? b : undefined;
}

export function standWorker(world: World, s: Settler): void {
  if (s.job === 'geologist') return standGeologist(world, s);
  if (s.job === 'soldier') return standSoldier(world, s);
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
      if (def.outputChoice === 'tools' && !hasToolOrders(world, b.owner)) {
        b.status = 'noOrders';
        s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
        return;
      }
      if (!needs.every(([t, n]) => b.stock[t] >= n)) {
        b.status = 'waitingInput';
        s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
        return;
      }
      for (const [t, n] of needs) {
        b.stock[t] -= n;
        recordConsumed(world, b.owner, t, n);
      }
      b.status = 'ok';
      s.state = 'producing';
      s.wait = def.workTicks;
      return;
    }
    case 'fisher': {
      const c = candidatesByDistance(
        world,
        b,
        (n) =>
          map.resources[n] === Resource.Fish &&
          map.resourceAmounts[n] > 0 &&
          !targeted(world, n, s.id),
      );
      if (!goOut(world, s, b, c, true)) idleNoResources(s, b);
      return;
    }
    case 'farm': {
      // Erst reife Felder ernten, sonst ein neues Feld säen.
      const ripe = candidatesByDistance(
        world,
        b,
        (n) => isMatureField(world, n) && !targeted(world, n, s.id),
      );
      if (ripe.length && goOut(world, s, b, ripe, false)) return;
      const free = candidatesByDistance(
        world,
        b,
        (n) => isFieldSpot(world, b, n) && !targeted(world, n, s.id),
      );
      if (!goOut(world, s, b, free, false)) idleNoResources(s, b);
      return;
    }
    case 'mine': {
      const food = def.consumesAny.find((t) => b.stock[t] > 0);
      if (!food) {
        b.status = 'waitingInput';
        s.wait = TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS;
        return;
      }
      const vein = candidatesByDistance(
        world,
        b,
        (n) => map.resources[n] === def.resource && map.resourceAmounts[n] > 0,
      )[0];
      if (vein === undefined) return idleNoResources(s, b);
      b.stock[food]--;
      recordConsumed(world, b.owner, food);
      if (--map.resourceAmounts[vein] <= 0) map.resources[vein] = Resource.None;
      b.status = 'ok';
      s.state = 'producing';
      s.wait = def.workTicks;
      return;
    }
    case 'store':
      return;
  }
}

/** Freier, fruchtbarer Knoten im eigenen Gebiet, nicht direkt am Gebäude. */
function isFieldSpot(world: World, b: Building, n: number): boolean {
  return n !== b.node && isPlantable(world, n) && world.owner[n] === b.owner;
}

function startHarvest(world: World, s: Settler, b: Building): void {
  const def = BUILDINGS[b.type];
  const t = s.targetNode;
  const map = world.map;
  let valid: boolean;
  switch (def.kind) {
    case 'woodcutter':
      valid = isMatureTree(world, t);
      break;
    case 'quarry':
      valid = map.objects[t] === MapObject.Rock;
      break;
    case 'fisher':
      valid = map.resources[t] === Resource.Fish && map.resourceAmounts[t] > 0;
      break;
    case 'farm':
      valid = isMatureField(world, t) || isFieldSpot(world, b, t);
      break;
    default:
      valid = isPlantable(world, t);
  }
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
  recordProduced(world, b.owner, type);
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
  } else if (def.kind === 'fisher' && map.resourceAmounts[t] > 0) {
    if (--map.resourceAmounts[t] <= 0) map.resources[t] = Resource.None;
    produce(world, s, b, 'fish');
  } else if (def.kind === 'farm') {
    if (isMatureField(world, t)) {
      removeObject(world, t);
      produce(world, s, b, 'wheat');
    } else if (isFieldSpot(world, b, t)) {
      sowField(world, t);
    }
  }
  goHome(world, s, b);
}

// --- Geologe ---------------------------------------------------------------------------------

function standGeologist(world: World, s: Settler): void {
  switch (s.state) {
    case 'geoTravel':
      return nextSurvey(world, s);
    case 'geoWalk':
      s.state = 'geoWork';
      s.wait = GEOLOGIST.WORK_TICKS;
      return;
    case 'geoWork':
      placeSign(world, s);
      s.count--;
      return nextSurvey(world, s);
    default:
      return;
  }
}

function placeSign(world: World, s: Settler): void {
  const map = world.map;
  const n = s.node;
  const r = map.resources[n];
  const found = r !== Resource.None && r !== Resource.Fish && map.resourceAmounts[n] > 0;
  world.signs = world.signs.filter((g) => g.node !== n);
  world.signs.push({
    node: n,
    owner: s.owner,
    resource: found ? r : Resource.None,
    rich: found && map.resourceAmounts[n] >= GEOLOGIST.RICH_AMOUNT ? 1 : 0,
    until: world.tick + GEOLOGIST.SIGN_LIFETIME_TICKS,
  });
}

/** Nächste Probebohrung an einem zufälligen freien Knoten um die Zielflagge, sonst heimgehen. */
function nextSurvey(world: World, s: Settler): void {
  const flag = world.flags[s.targetFlag];
  if (!flag || s.count <= 0) return releaseWorker(world, s.id);
  const map = world.map;
  let spots = nodesInRadius(map, flag.node, GEOLOGIST.RADIUS).filter(
    (n) =>
      isPassable(map, n) &&
      map.objects[n] === MapObject.None &&
      !world.nodeFlag[n] &&
      !world.nodeRoad[n] &&
      !world.nodeBuilding[n] &&
      !world.signs.some((g) => g.node === n && g.until > world.tick),
  );
  // Bodenschätze gibt es nur im Berg: liegen Bergknoten in Reichweite, wird nur dort gebohrt.
  const rock = spots.filter((n) => isMinableTerrain(map, n));
  if (rock.length > 0) spots = rock;
  for (let tries = 0; tries < 8 && spots.length > 0; tries++) {
    const k = nextInt(world.rng, 0, spots.length - 1);
    const target = spots[k];
    const p = freePath(world, s.node, target);
    if (p) {
      s.state = 'geoWalk';
      s.targetNode = target;
      s.path = p;
      return;
    }
    spots.splice(k, 1);
  }
  releaseWorker(world, s.id);
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
  const def = BUILDINGS[b.type];
  let out: WareType | null = def.output;
  if (def.outputChoice === 'tools') out = chooseTool(world, b.owner);
  else if (def.outputChoice === 'weapons') out = b.produced % 2 === 0 ? 'sword' : 'shield';
  if (def.producesJob) {
    // Neues Tier bzw. neue Person läuft selbstständig ins nächste Lager.
    const born = newSettler(world, b.owner, def.producesJob, b.node);
    born.state = 'returning';
    born.path = [flagNode(world, b)];
    b.produced++;
    s.state = 'inside';
    s.wait = Math.max(1, def.restTicks);
    return;
  }
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
    recordConsumed(world, b.owner, type);
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
