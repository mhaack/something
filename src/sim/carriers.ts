/**
 * Siedlerbewegung und Träger-Zustandsautomat. Träger bedienen genau eine Straße, tragen eine Ware
 * gleichzeitig und holen nur ab, wenn die Zielflagge Platz hat oder dort ein Tausch möglich ist.
 */
import { TRANSPORT } from '../data/balance';
import type { Road, Settler, Ware } from './entities';
import { releaseSettler, roadIndexOf, roadSlice } from './roads';
import { enqueueRoute, findNearestStoreAnywhere, freePath } from './routing';
import { acceptWare, flagAccepts, startNextStep } from './store';
import { standWorker } from './workers';
import type { World } from './world';

export function updateSettler(world: World, s: Settler): void {
  if (s.wait > 0) {
    s.wait--;
    if (s.wait > 0) return;
    stand(world, s);
    return;
  }
  if (s.next >= 0) {
    s.progress++;
    if (s.progress < s.stepTicks) return;
    s.node = s.next;
    s.next = -1;
    s.progress = 0;
    if (s.path.length > 0) {
      if (s.state === 'toMiddle') {
        const road = world.roads[s.road];
        if (road && findWork(world, s, road, 0)) return;
      }
      startNextStep(world, s);
      return;
    }
  }
  if (s.path.length > 0) {
    startNextStep(world, s);
    return;
  }
  stand(world, s);
}

/** Wird aufgerufen, wenn der Siedler steht (Pfad abgearbeitet, keine Wartezeit). */
function stand(world: World, s: Settler): void {
  switch (s.state) {
    case 'toRoad':
      return arriveAtRoad(world, s);
    case 'toMiddle':
      s.state = 'idle';
      return;
    case 'idle': {
      // Gestaffelte Arbeitssuche spart Rechenzeit bei vielen wartenden Trägern.
      if ((s.id + world.tick) % TRANSPORT.IDLE_CHECK_INTERVAL !== 0) return;
      const road = world.roads[s.road];
      if (!road) return releaseSettler(world, s);
      findWork(world, s, road, 0);
      return;
    }
    case 'fetch':
      s.state = 'pickup';
      s.wait = TRANSPORT.PICKUP_TICKS;
      return;
    case 'pickup':
      return doPickup(world, s);
    case 'carry':
      return arriveWithWare(world, s);
    case 'drop':
      return doDrop(world, s);
    case 'enterBuilding':
      return insideBuilding(world, s);
    case 'leaveBuilding':
      return leftBuilding(world, s);
    case 'dropAndReturn':
      if (s.ware && world.flags[s.targetFlag]) forceDrop(world, s, s.targetFlag);
      return releaseSettler(world, s);
    case 'returning':
      return goHome(world, s);
    case 'enterStore':
      return enterStore(world, s);
    default:
      return standWorker(world, s);
  }
}

function slotOf(s: Settler): 0 | 1 {
  return s.job === 'donkey' ? 1 : 0;
}

function myRoad(world: World, s: Settler): Road | undefined {
  const r = world.roads[s.road];
  return r && r.carriers[slotOf(s)] === s.id ? r : undefined;
}

function arriveAtRoad(world: World, s: Settler): void {
  const road = myRoad(world, s);
  const idx = road ? roadIndexOf(road, s.node) : -1;
  if (!road || idx < 0) {
    if (road) road.carriers[slotOf(s)] = 0;
    return releaseSettler(world, s);
  }
  s.state = 'toMiddle';
  s.targetFlag = 0;
  s.path = roadSlice(road, idx, road.path.length >> 1);
}

function goToMiddle(s: Settler, road: Road): void {
  s.state = 'toMiddle';
  s.targetFlag = 0;
  const idx = roadIndexOf(road, s.node);
  s.path = idx >= 0 ? roadSlice(road, idx, road.path.length >> 1) : [];
}

interface Job {
  ware: Ware;
  from: number;
  swap: Ware | undefined;
}

/**
 * Sucht Arbeit auf der eigenen Straße: die am längsten wartende Ware, die abgeholt werden darf.
 * `prefer` bevorzugt eine Endflagge (z. B. die, an der der Träger gerade steht).
 */
function findWork(world: World, s: Settler, road: Road, prefer: number): boolean {
  let best: Job | undefined;
  let bestPreferred = false;
  for (const from of [road.flagA, road.flagB]) {
    const f = world.flags[from];
    const to = from === road.flagA ? road.flagB : road.flagA;
    if (!f || !world.flags[to]) continue;
    for (const wid of f.wares) {
      const w = world.wares[wid];
      if (w.nextRoad !== road.id || w.reservedBy) continue;
      const preferred = from === prefer;
      if (best && bestPreferred && !preferred) continue;
      if (best && bestPreferred === preferred && w.since >= best.ware.since) continue;
      let swap: Ware | undefined;
      if (!flagAccepts(world, to, w)) {
        swap = findSwap(world, road, to);
        if (!swap) continue;
      }
      best = { ware: w, from, swap };
      bestPreferred = preferred;
    }
  }
  if (!best) return false;
  best.ware.reservedBy = s.id;
  s.fetchWare = best.ware.id;
  if (best.swap) {
    best.swap.reservedBy = s.id;
    s.swapWare = best.swap.id;
  }
  s.targetFlag = best.from;
  s.state = 'fetch';
  const fromNode = world.flags[best.from].node;
  const idx = roadIndexOf(road, s.node);
  s.path = idx >= 0 && s.node !== fromNode ? roadSlice(road, idx, roadIndexOf(road, fromNode)) : [];
  return true;
}

/** Ware an einer vollen Flagge, die über dieselbe Straße zurück will (Tausch statt Stau). */
function findSwap(world: World, road: Road, flagId: number): Ware | undefined {
  for (const wid of world.flags[flagId].wares) {
    const w = world.wares[wid];
    if (w.nextRoad === road.id && !w.reservedBy) return w;
  }
  return undefined;
}

function doPickup(world: World, s: Settler): void {
  const road = myRoad(world, s);
  const w = world.wares[s.fetchWare];
  if (!road || !w || w.flag !== s.targetFlag || w.reservedBy !== s.id) {
    if (w && w.reservedBy === s.id) w.reservedBy = 0;
    const sw = world.wares[s.swapWare];
    if (sw && sw.reservedBy === s.id) sw.reservedBy = 0;
    s.fetchWare = s.swapWare = 0;
    if (!road) return releaseSettler(world, s);
    return goToMiddle(s, road);
  }
  const f = world.flags[w.flag];
  f.wares = f.wares.filter((id) => id !== w.id);
  w.flag = 0;
  w.carrier = s.id;
  w.reservedBy = 0;
  w.routePending = false;
  s.ware = w.id;
  s.fetchWare = 0;
  const to = road.flagA === s.targetFlag ? road.flagB : road.flagA;
  s.targetFlag = to;
  s.state = 'carry';
  s.path = roadSlice(road, roadIndexOf(road, s.node), roadIndexOf(road, world.flags[to].node));
}

function arriveWithWare(world: World, s: Settler): void {
  const w = world.wares[s.ware];
  const f = world.flags[s.targetFlag];
  if (!w || !f) return releaseSettler(world, s);
  if (f.building && w.dest === f.building && !w.destFlag && world.buildings[f.building]) {
    s.state = 'enterBuilding';
    s.targetBuilding = f.building;
    s.path = [world.buildings[f.building].node];
    return;
  }
  s.state = 'drop';
  s.wait = TRANSPORT.DROP_TICKS;
}

export function putOnFlag(world: World, w: Ware, flagId: number): void {
  const f = world.flags[flagId];
  f.wares.push(w.id);
  w.flag = flagId;
  w.carrier = 0;
  w.since = world.tick;
  w.nextRoad = 0;
  w.reservedBy = 0;
  enqueueRoute(world, w);
}

function doDrop(world: World, s: Settler): void {
  const road = myRoad(world, s);
  const w = world.wares[s.ware];
  const flagId = s.targetFlag;
  if (!w || !world.flags[flagId]) return releaseSettler(world, s);
  putOnFlag(world, w, flagId);
  s.ware = 0;
  if (road) road.traffic++;
  if (!road) return releaseSettler(world, s);
  afterDelivery(world, s, road, flagId);
}

function afterDelivery(world: World, s: Settler, road: Road, flagId: number): void {
  const sw = world.wares[s.swapWare];
  s.swapWare = 0;
  if (sw && sw.flag === flagId && sw.reservedBy === s.id && sw.nextRoad === road.id) {
    s.fetchWare = sw.id;
    s.targetFlag = flagId;
    s.state = 'pickup';
    s.wait = TRANSPORT.PICKUP_TICKS;
    return;
  }
  if (sw && sw.reservedBy === s.id) sw.reservedBy = 0;
  if (findWork(world, s, road, flagId)) return;
  goToMiddle(s, road);
}

function insideBuilding(world: World, s: Settler): void {
  const b = world.buildings[s.targetBuilding];
  const w = world.wares[s.ware];
  if (b && w) {
    acceptWare(world, b, w);
    s.ware = 0;
    const road = world.roads[s.road];
    if (road) road.traffic++;
  }
  s.state = 'leaveBuilding';
  s.path = [world.flags[s.targetFlag]?.node ?? s.node];
}

function leftBuilding(world: World, s: Settler): void {
  if (s.ware && world.flags[s.targetFlag]) forceDrop(world, s, s.targetFlag);
  s.targetBuilding = 0;
  const road = myRoad(world, s);
  if (!road) return releaseSettler(world, s);
  afterDelivery(world, s, road, s.targetFlag);
}

/** Legt die getragene Ware ab, auch wenn die Flagge voll ist (Straße wurde abgerissen). */
function forceDrop(world: World, s: Settler, flagId: number): void {
  const w = world.wares[s.ware];
  if (w) putOnFlag(world, w, flagId);
  s.ware = 0;
}

function goHome(world: World, s: Settler): void {
  const target = world.buildings[s.targetBuilding];
  if (target && world.flags[target.flag] && s.node === world.flags[target.flag].node) {
    s.state = 'enterStore';
    s.path = [target.node];
    return;
  }
  if (target && s.node === target.node) return enterStore(world, s);
  const store = findNearestStoreAnywhere(world, s.owner, s.node);
  if (!store) {
    // Kein Lager mehr: Siedler verschwindet, getragene Ware wird zerstört.
    const w = world.wares[s.ware];
    if (w) {
      world.ledger[w.owner].wares[w.type]--;
      delete world.wares[w.id];
    }
    delete world.settlers[s.id];
    return;
  }
  s.targetBuilding = store.id;
  if (s.node === store.node) return enterStore(world, s);
  const path = freePath(world, s.node, world.flags[store.flag].node);
  if (path === null) return enterStore(world, s); // unerreichbar: direkt einlagern (Annahme A10)
  s.path = path;
  if (path.length === 0) {
    s.state = 'enterStore';
    s.path = [store.node];
  }
}

function enterStore(world: World, s: Settler): void {
  const store =
    world.buildings[s.targetBuilding] ?? findNearestStoreAnywhere(world, s.owner, s.node);
  if (!store) {
    s.state = 'returning';
    return goHome(world, s);
  }
  const w = world.wares[s.ware];
  if (w) acceptWare(world, store, w);
  store.people[s.job]++;
  delete world.settlers[s.id];
}
