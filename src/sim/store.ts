/** Lager (Hauptquartier): Bestand, Ausgabe auf die Flagge, Träger- und Eselnachschub. */
import { START_STOCK, STORE, TRANSPORT } from '../data/balance';
import { WARE_TYPES, emptyJobCounts, emptyWareCounts, type Job } from '../data/wares';
import { Dir, neighbor, nodesInRadius } from './geometry';
import type { Building, Road, Settler, Ware } from './entities';
import { SLOT_BUILDING } from './entities';
import { placeFlag } from './flags';
import { enqueueRoute, nodesAlongRoute, routeSteps, searchFlags } from './routing';
import { stepTicks } from './roads';
import { allocId, type Player, type World } from './world';

export function isStore(b: Building): boolean {
  return b.type === 'hq';
}

/** Knoten, die ein großes Gebäude belegt: der Bauplatz selbst sowie W, NW und NO. */
export function largeFootprint(world: World, node: number): number[] {
  const m = world.map;
  return [node, neighbor(m, node, Dir.W), neighbor(m, node, Dir.NW), neighbor(m, node, Dir.NE)];
}

export function createHQ(world: World, player: Player): Building {
  const map = world.map;
  for (const n of nodesInRadius(map, player.hqNode, STORE.HQ_RADIUS)) {
    if (world.owner[n] < 0) world.owner[n] = player.id;
  }
  const flagNode = neighbor(map, player.hqNode, Dir.SE);
  const flag = placeFlag(world, player.id, flagNode);
  const id = allocId(world);
  const stock = emptyWareCounts();
  for (const [k, v] of Object.entries(START_STOCK.wares)) stock[k as keyof typeof stock] = v;
  const people = emptyJobCounts();
  for (const [k, v] of Object.entries(START_STOCK.people)) people[k as Job] = v;
  const hq: Building = {
    id,
    type: 'hq',
    owner: player.id,
    node: player.hqNode,
    flag: flag.id,
    stock,
    people,
    outQueue: [],
    outTimer: 0,
    spawnTimer: 0,
    spawned: 0,
  };
  world.buildings[id] = hq;
  for (const n of largeFootprint(world, player.hqNode)) if (n >= 0) world.nodeBuilding[n] = id;
  flag.building = id;
  flag.roads[Dir.NW] = SLOT_BUILDING;
  player.hq = id;
  const ledger = emptyWareCounts();
  for (const t of WARE_TYPES) ledger[t] = stock[t];
  world.ledger[player.id] = { wares: ledger };
  return hq;
}

/** Nimmt eine Ware von der Flagge bzw. aus der Hand in ein Gebäude auf. */
export function acceptWare(world: World, b: Building, w: Ware): void {
  if (w.flag) {
    const f = world.flags[w.flag];
    f.wares = f.wares.filter((id) => id !== w.id);
  }
  b.stock[w.type]++;
  delete world.wares[w.id];
}

/** Flagge, an die ein Träger gerade liefert bzw. nach dem Abholen liefern wird (0 = keine). */
export function deliveryFlag(world: World, s: Settler): number {
  if (s.state === 'carry' || s.state === 'drop') return s.targetFlag;
  if ((s.state === 'fetch' || s.state === 'pickup') && s.fetchWare) {
    const road = world.roads[s.road];
    if (!road) return 0;
    return road.flagA === s.targetFlag ? road.flagB : road.flagA;
  }
  return 0;
}

/** Geht die Ware an dieser Flagge direkt ins dortige Zielgebäude (belegt keinen Flaggenplatz)? */
export function goesIntoBuildingAt(world: World, w: Ware, flagId: number): boolean {
  const f = world.flags[flagId];
  return !!f && !!f.building && w.dest === f.building && !w.destFlag;
}

/** Belegte plus angekündigte Plätze einer Flagge. */
export function flagLoad(world: World, flagId: number): number {
  const f = world.flags[flagId];
  let n = f.wares.length;
  for (const r of f.roads) {
    if (r <= 0) continue;
    const road = world.roads[r];
    for (const sid of road.carriers) {
      const s = sid ? world.settlers[sid] : undefined;
      if (!s || s.road !== r || s.swapWare) continue;
      if (deliveryFlag(world, s) !== flagId) continue;
      const w = world.wares[s.ware || s.fetchWare];
      if (w && goesIntoBuildingAt(world, w, flagId)) continue;
      n++;
    }
  }
  return n;
}

/** Darf eine Ware (zusätzlich) zu dieser Flagge gebracht werden? */
export function flagAccepts(world: World, flagId: number, w: Ware): boolean {
  if (goesIntoBuildingAt(world, w, flagId)) return true;
  const load = flagLoad(world, flagId);
  if (load < TRANSPORT.FLAG_CAPACITY) return true;
  const waited = world.tick - w.since >= TRANSPORT.OVERFLOW_WAIT_TICKS;
  return waited && load < TRANSPORT.FLAG_CAPACITY + TRANSPORT.FLAG_OVERFLOW;
}

export function storeTick(world: World, b: Building): void {
  if (!isStore(b)) return;
  if (b.spawned < STORE.CARRIER_SPAWN_MAX && ++b.spawnTimer >= STORE.CARRIER_SPAWN_TICKS) {
    b.spawnTimer = 0;
    b.spawned++;
    b.people.carrier++;
  }
  if (b.outTimer > 0) b.outTimer--;
  if (b.outQueue.length > 0 && b.outTimer === 0) {
    const order = b.outQueue[0];
    if (b.stock[order.type] <= 0) {
      b.outQueue.shift();
      return;
    }
    if (flagLoad(world, b.flag) >= TRANSPORT.FLAG_CAPACITY) return;
    b.outQueue.shift();
    b.stock[order.type]--;
    const id = allocId(world);
    const w: Ware = {
      id,
      type: order.type,
      owner: b.owner,
      flag: b.flag,
      carrier: 0,
      dest: order.dest,
      destFlag: order.destFlag,
      nextRoad: 0,
      reservedBy: 0,
      since: world.tick,
      routePending: false,
    };
    world.wares[id] = w;
    world.flags[b.flag].wares.push(id);
    enqueueRoute(world, w);
    b.outTimer = STORE.OUTPUT_TICKS;
  }
}

export function newSettler(world: World, owner: number, job: Job, node: number): Settler {
  const id = allocId(world);
  const s: Settler = {
    id,
    owner,
    job,
    state: 'returning',
    node,
    next: -1,
    progress: 0,
    stepTicks: 0,
    path: [],
    road: 0,
    ware: 0,
    swapWare: 0,
    fetchWare: 0,
    targetFlag: 0,
    targetBuilding: 0,
    wait: 0,
  };
  world.settlers[id] = s;
  return s;
}

/** Fordert für alle Straßen ohne Träger (bzw. stark befahrene ohne Esel) Personal an. */
export function requestWorkers(world: World): void {
  for (const id of Object.keys(world.roads)) {
    const road = world.roads[Number(id)];
    if (!road) continue;
    if (!road.carriers[0]) dispatchWorker(world, road, 'carrier', 0);
    if (road.busy && !road.carriers[1]) dispatchWorker(world, road, 'donkey', 1);
  }
}

function dispatchWorker(world: World, road: Road, job: Job, slot: 0 | 1): void {
  const owner = road.owner;
  const res = searchFlags(world, road.flagA, owner, false, (f) => {
    const b = world.buildings[world.flags[f].building];
    return !!b && b.owner === owner && isStore(b) && b.people[job] > 0;
  });
  if (res.found < 0) return;
  const store = world.buildings[world.flags[res.found].building];
  // Route vom Lager zur Straße: umgekehrte Suche ab Lagerflagge bis zu einer Endflagge.
  const back = searchFlags(
    world,
    res.found,
    owner,
    false,
    (f) => f === road.flagA || f === road.flagB,
  );
  if (back.found < 0) return;
  const steps = routeSteps(back, res.found).filter(([r]) => r !== road.id);
  store.people[job]--;
  const s = newSettler(world, owner, job, store.node);
  s.state = 'toRoad';
  s.road = road.id;
  s.targetFlag = back.found;
  const storeFlagNode = world.flags[store.flag].node;
  s.path = [storeFlagNode, ...nodesAlongRoute(world, steps)];
  road.carriers[slot] = s.id;
  startNextStep(world, s);
}

/** Beginnt den nächsten Schritt des Pfads, falls vorhanden. */
export function startNextStep(world: World, s: Settler): void {
  if (s.next >= 0 || s.path.length === 0) return;
  s.next = s.path.shift()!;
  s.progress = 0;
  s.stepTicks = stepTicks(world, s.node, s.next);
}
