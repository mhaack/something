/**
 * Wegfindung: Dijkstra auf dem Flaggen-Graph (Waren, Träger auf Straßen) und A* auf dem
 * Knotengitter (Querfeldein-Wege). Die Zahl der Routenberechnungen pro Tick ist gedeckelt.
 */
import { TRANSPORT } from '../data/balance';
import { DIRS, gridDistance, neighbor, nodeX, nodeY } from './geometry';
import { MinHeap } from './heap';
import { isPassable } from './map';
import { stepTicks } from './roads';
import type { Building, Road, Ware } from './entities';
import { acceptWare, isStore } from './store';
import type { World } from './world';

export function enqueueRoute(world: World, w: Ware): void {
  if (w.routePending) return;
  w.routePending = true;
  world.routeQueue.push(w.id);
}

/** Nach jeder Netzänderung: alle wartenden Waren neu routen. */
export function markNetworkChanged(world: World): void {
  for (const id in world.wares) {
    const w = world.wares[id];
    if (w.flag && !w.reservedBy) enqueueRoute(world, w);
  }
}

/** Verteilt periodische Neuberechnungen gleichmäßig über die Ticks. */
export function scheduleReroutes(world: World): void {
  const iv = TRANSPORT.REROUTE_INTERVAL_TICKS;
  const phase = world.tick % iv;
  for (const id in world.wares) {
    const w = world.wares[id];
    if (w.flag && !w.reservedBy && w.id % iv === phase) enqueueRoute(world, w);
  }
}

export function processRouteQueue(world: World): void {
  let budget = TRANSPORT.ROUTES_PER_TICK;
  let i = 0;
  const q = world.routeQueue;
  // Distanzfelder gelten nur innerhalb dieses Aufrufs (keine Wiederverwendung über Ticks).
  const ctx: RouteContext = { fields: new Map() };
  while (i < q.length && budget > 0) {
    const w = world.wares[q[i++]];
    if (!w) continue;
    w.routePending = false;
    routeWare(world, w, ctx);
    budget--;
  }
  q.splice(0, i);
}

/** Rückwärts berechnete Kosten jeder Flagge bis zum nächsten Ziel (inklusive Stau-Zuschlag). */
interface DistField {
  dist: Map<number, number>;
  /** Erreichte Zielflagge pro Flagge. */
  goal: Map<number, number>;
}

export interface RouteContext {
  fields: Map<string, DistField>;
}

/** Kosten der gerichteten Kante von Flagge `from` über Straße `road` inklusive Stau-Zuschlag. */
function edgeCost(world: World, road: Road, from: number): number {
  return (
    (road.flagA === from ? road.costAB : road.costBA) +
    TRANSPORT.CONGESTION_COST * waitingFor(world, from, road.id)
  );
}

function buildField(world: World, owner: number, goals: readonly number[]): DistField {
  const dist = new Map<number, number>();
  const goal = new Map<number, number>();
  const done = new Set<number>();
  const heap = new MinHeap();
  for (const g of goals) {
    dist.set(g, 0);
    goal.set(g, g);
    heap.push(0, g);
  }
  while (heap.size > 0) {
    const [d, o] = heap.pop();
    if (done.has(o)) continue;
    done.add(o);
    for (const r of world.flags[o].roads) {
      if (r <= 0) continue;
      const road = world.roads[r];
      const f = road.flagA === o ? road.flagB : road.flagA;
      const ff = world.flags[f];
      if (!ff || ff.owner !== owner || done.has(f)) continue;
      const nd = d + edgeCost(world, road, f);
      const old = dist.get(f);
      if (old === undefined || nd < old) {
        dist.set(f, nd);
        goal.set(f, goal.get(o)!);
        heap.push(nd, f);
      }
    }
  }
  return { dist, goal };
}

function fieldFor(
  world: World,
  ctx: RouteContext,
  key: string,
  owner: number,
  goals: () => number[],
): DistField {
  let f = ctx.fields.get(key);
  if (!f) {
    f = buildField(world, owner, goals());
    ctx.fields.set(key, f);
  }
  return f;
}

function storeFlags(world: World, owner: number): number[] {
  const out: number[] = [];
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner === owner && isStore(b)) out.push(b.flag);
  }
  return out;
}

/** Zahl der Waren an einer Flagge, die auf eine bestimmte Straße warten. */
export function waitingFor(world: World, flagId: number, roadId: number): number {
  const f = world.flags[flagId];
  let n = 0;
  for (const wid of f.wares) if (world.wares[wid].nextRoad === roadId) n++;
  return n;
}

export interface FlagSearchResult {
  found: number;
  dist: Map<number, number>;
  /** Vorgängerflagge und benutzte Straße pro erreichter Flagge. */
  prevFlag: Map<number, number>;
  prevRoad: Map<number, number>;
}

/** Dijkstra über Flaggen eines Besitzers bis zur ersten Zielflagge. */
export function searchFlags(
  world: World,
  start: number,
  owner: number,
  congestion: boolean,
  isTarget: (flagId: number) => boolean,
): FlagSearchResult {
  const dist = new Map<number, number>([[start, 0]]);
  const prevFlag = new Map<number, number>();
  const prevRoad = new Map<number, number>();
  const done = new Set<number>();
  const heap = new MinHeap();
  heap.push(0, start);
  while (heap.size > 0) {
    const [d, f] = heap.pop();
    if (done.has(f)) continue;
    done.add(f);
    if (isTarget(f)) return { found: f, dist, prevFlag, prevRoad };
    const flag = world.flags[f];
    for (const r of flag.roads) {
      if (r <= 0) continue;
      const road = world.roads[r];
      const other = road.flagA === f ? road.flagB : road.flagA;
      const of = world.flags[other];
      if (!of || of.owner !== owner || done.has(other)) continue;
      let c = road.flagA === f ? road.costAB : road.costBA;
      if (congestion) c += TRANSPORT.CONGESTION_COST * waitingFor(world, f, r);
      const nd = d + c;
      const old = dist.get(other);
      if (old === undefined || nd < old) {
        dist.set(other, nd);
        prevFlag.set(other, f);
        prevRoad.set(other, r);
        heap.push(nd, other);
      }
    }
  }
  return { found: -1, dist, prevFlag, prevRoad };
}

/** Rekonstruiert die Straßenfolge (Straße, Startflagge) vom Start zur gefundenen Flagge. */
export function routeSteps(res: FlagSearchResult, start: number): [number, number][] {
  const steps: [number, number][] = [];
  let f = res.found;
  while (f !== start && f >= 0) {
    const pf = res.prevFlag.get(f)!;
    steps.push([res.prevRoad.get(f)!, pf]);
    f = pf;
  }
  return steps.reverse();
}

function isStoreFlagOf(world: World, flagId: number, owner: number): boolean {
  const b = world.buildings[world.flags[flagId].building];
  return !!b && b.owner === owner && isStore(b);
}

/** Bestimmt für eine Ware auf einer Flagge die nächste Straße (oder liefert sie direkt ab). */
export function routeWare(world: World, w: Ware, ctx: RouteContext = { fields: new Map() }): void {
  if (!w.flag || w.carrier || w.reservedBy) return;
  const flag = world.flags[w.flag];
  if (w.destFlag && (!world.flags[w.destFlag] || w.destFlag === w.flag)) w.destFlag = 0;
  let field: DistField;
  let toStore = false;
  if (w.destFlag) {
    const df = w.destFlag;
    field = fieldFor(world, ctx, `f${df}`, w.owner, () => [df]);
  } else {
    let dest: Building | undefined = w.dest ? world.buildings[w.dest] : undefined;
    if (dest && dest.owner !== w.owner) dest = undefined;
    if (w.dest && !dest) w.dest = 0;
    if (dest) {
      if (dest.flag === w.flag) {
        acceptWare(world, dest, w);
        return;
      }
      field = fieldFor(world, ctx, `f${dest.flag}`, w.owner, () => [dest.flag]);
    } else {
      if (isStoreFlagOf(world, w.flag, w.owner)) {
        acceptWare(world, world.buildings[flag.building], w);
        return;
      }
      toStore = true;
      field = fieldFor(world, ctx, `s${w.owner}`, w.owner, () => storeFlags(world, w.owner));
    }
  }
  // Beste ausgehende Straße: Kantenkosten + Restdistanz des Nachbarn.
  let best = 0;
  let bestCost = Infinity;
  let bestGoal = 0;
  for (const r of flag.roads) {
    if (r <= 0) continue;
    const road = world.roads[r];
    const other = road.flagA === w.flag ? road.flagB : road.flagA;
    const rest = field.dist.get(other);
    if (rest === undefined) continue;
    const c = edgeCost(world, road, w.flag) + rest;
    if (c < bestCost) {
      bestCost = c;
      best = r;
      bestGoal = field.goal.get(other)!;
    }
  }
  w.nextRoad = best;
  if (best && toStore) w.dest = world.flags[bestGoal].building;
}

/** Geplante Flaggenroute einer Ware (für das Debug-Overlay). */
export function plannedRoute(world: World, w: Ware): number[] {
  const startFlag = w.flag || (w.carrier ? world.settlers[w.carrier]?.targetFlag : 0) || 0;
  if (!startFlag || !world.flags[startFlag]) return [];
  let target = w.destFlag;
  if (!target && w.dest && world.buildings[w.dest]) target = world.buildings[w.dest].flag;
  const res = searchFlags(world, startFlag, w.owner, true, (f) =>
    target ? f === target : isStoreFlagOf(world, f, w.owner),
  );
  if (res.found < 0) return [startFlag];
  return [
    startFlag,
    ...routeSteps(res, startFlag).map(([r, from]) => {
      const road = world.roads[r];
      return road.flagA === from ? road.flagB : road.flagA;
    }),
  ];
}

/** Knotenfolge über Straßen von einer Flagge zu einer anderen (ohne Startknoten). */
export function nodesAlongRoute(world: World, steps: [number, number][]): number[] {
  const out: number[] = [];
  for (const [r, from] of steps) {
    const road: Road = world.roads[r];
    if (road.flagA === from) for (let i = 1; i < road.path.length; i++) out.push(road.path[i]);
    else for (let i = road.path.length - 2; i >= 0; i--) out.push(road.path[i]);
  }
  return out;
}

/** Nächstes Lager nach Luftlinie (Notfall, z. B. für Waren einer abgerissenen Flagge). */
export function findNearestStoreAnywhere(
  world: World,
  owner: number,
  node: number,
  exclude = 0,
): Building | undefined {
  const map = world.map;
  let best: Building | undefined;
  let bestD = Infinity;
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner !== owner || !isStore(b) || b.id === exclude) continue;
    const d = gridDistance(
      nodeX(map, node),
      nodeY(map, node),
      nodeX(map, b.node),
      nodeY(map, b.node),
    );
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * A* querfeldein über begehbare Knoten. Gebäudeknoten sind gesperrt (außer dem Ziel).
 * Liefert die Knotenfolge ohne Start oder null.
 */
export function freePath(
  world: World,
  start: number,
  goal: number,
  maxExpansions: number = TRANSPORT.FREE_WALK_MAX_EXPANSIONS,
): number[] | null {
  if (start === goal) return [];
  const map = world.map;
  const gx = nodeX(map, goal);
  const gy = nodeY(map, goal);
  const h = (n: number): number =>
    gridDistance(nodeX(map, n), nodeY(map, n), gx, gy) * TRANSPORT.WALK_TICKS_PER_STEP;
  const g = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new MinHeap();
  heap.push(h(start), start);
  let expansions = 0;
  while (heap.size > 0 && expansions < maxExpansions) {
    const [, n] = heap.pop();
    if (closed.has(n)) continue;
    if (n === goal) {
      const out: number[] = [];
      let c = goal;
      while (c !== start) {
        out.push(c);
        c = prev.get(c)!;
      }
      return out.reverse();
    }
    closed.add(n);
    expansions++;
    const gn = g.get(n)!;
    for (const d of DIRS) {
      const m = neighbor(map, n, d);
      if (m < 0 || closed.has(m)) continue;
      if (m !== goal && (!isPassable(map, m) || world.nodeBuilding[m])) continue;
      const ng = gn + stepTicks(world, n, m);
      const old = g.get(m);
      if (old === undefined || ng < old) {
        g.set(m, ng);
        prev.set(m, n);
        heap.push(ng + h(m), m);
      }
    }
  }
  return null;
}

/** Flaggen eines Spielers, die über Straßen mit einem seiner Lager verbunden sind. */
export function storeConnectedFlags(world: World, owner: number): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner === owner && isStore(b) && !b.site && !seen.has(b.flag)) {
      seen.add(b.flag);
      queue.push(b.flag);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const f = world.flags[queue[q]];
    if (!f) continue;
    for (const r of f.roads) {
      if (r <= 0) continue;
      const road = world.roads[r];
      const other = road.flagA === f.id ? road.flagB : road.flagA;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}
