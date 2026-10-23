import { TERRAIN_RULES, TRANSPORT } from '../data/balance';
import { MapObject } from '../data/terrain';
import { DIRS, dirBetween, gridDistance, neighbor, nodeX, nodeY, type Dir } from './geometry';
import { MinHeap } from './heap';
import { isWalkableTerrain } from './map';
import { canPlaceFlag, placeFlag } from './flags';
import type { Flag, Road, Settler } from './entities';
import { markNetworkChanged } from './routing';
import { allocId, type World } from './world';

export type RoadValidation =
  | 'ok'
  | 'tooShort'
  | 'noStartFlag'
  | 'notAdjacent'
  | 'tooSteep'
  | 'blocked'
  | 'outside'
  | 'slotTaken'
  | 'badEnd';

/** Ticks für einen Schritt von `a` nach `b` abhängig von der Steigung. */
export function stepTicks(world: World, a: number, b: number): number {
  const dh = world.map.heights[b] - world.map.heights[a];
  let f = 1;
  if (dh >= TERRAIN_RULES.ROAD_STEEP_SLOPE) f = TRANSPORT.STEEP_UPHILL_FACTOR;
  else if (dh <= -TERRAIN_RULES.ROAD_STEEP_SLOPE) f = TRANSPORT.STEEP_DOWNHILL_FACTOR;
  else if (dh > 0) f = 1 + dh * TRANSPORT.UPHILL_PER_HEIGHT;
  return Math.max(1, Math.round(TRANSPORT.WALK_TICKS_PER_STEP * f));
}

/** Gesamtkosten (Ticks) entlang eines Pfads. */
export function pathCost(world: World, path: readonly number[]): number {
  let c = 0;
  for (let i = 1; i < path.length; i++) c += stepTicks(world, path[i - 1], path[i]);
  return c;
}

/** Ist dieser Knoten als Straßen-Innenknoten frei? */
export function isRoadNodeFree(world: World, player: number, node: number): boolean {
  if (world.owner[node] !== player) return false;
  if (!isWalkableTerrain(world.map, node)) return false;
  if (world.nodeFlag[node] || world.nodeRoad[node] || world.nodeBuilding[node]) return false;
  return world.map.objects[node] === MapObject.None;
}

/** Ist der Schritt a→b für Straßen nicht zu steil? */
export function isRoadStepAllowed(world: World, a: number, b: number): boolean {
  return Math.abs(world.map.heights[a] - world.map.heights[b]) <= TERRAIN_RULES.ROAD_MAX_SLOPE;
}

/** Prüft einen Straßenpfad: Start an eigener Flagge, Ende an Flagge oder gültigem Flaggenplatz. */
export function validateRoad(
  world: World,
  player: number,
  path: readonly number[],
): RoadValidation {
  if (path.length < 2) return 'tooShort';
  const start = world.flags[world.nodeFlag[path[0]]];
  if (!start || start.owner !== player) return 'noStartFlag';
  const seen = new Set<number>([path[0]]);
  for (let i = 1; i < path.length; i++) {
    if (dirBetween(world.map, path[i - 1], path[i]) < 0) return 'notAdjacent';
    if (!isRoadStepAllowed(world, path[i - 1], path[i])) return 'tooSteep';
    if (seen.has(path[i])) return 'blocked';
    seen.add(path[i]);
  }
  for (let i = 1; i < path.length - 1; i++) {
    if (world.owner[path[i]] !== player) return 'outside';
    if (!isRoadNodeFree(world, player, path[i])) return 'blocked';
  }
  const last = path[path.length - 1];
  const endFlag = world.flags[world.nodeFlag[last]];
  if (endFlag) {
    if (endFlag.owner !== player || endFlag.id === start.id) return 'badEnd';
    const d = dirBetween(world.map, last, path[path.length - 2]) as Dir;
    if (endFlag.roads[d] !== 0) return 'slotTaken';
  } else if (canPlaceFlag(world, player, last) !== 'ok') {
    return 'badEnd';
  }
  const d0 = dirBetween(world.map, path[0], path[1]) as Dir;
  if (start.roads[d0] !== 0) return 'slotTaken';
  return 'ok';
}

function attach(world: World, flag: Flag, towards: number, roadId: number): void {
  const d = dirBetween(world.map, flag.node, towards) as Dir;
  flag.roads[d] = roadId;
}

function createRoad(world: World, player: number, path: number[], busy: boolean): Road {
  const id = allocId(world);
  const a = world.flags[world.nodeFlag[path[0]]];
  const b = world.flags[world.nodeFlag[path[path.length - 1]]];
  const road: Road = {
    id,
    owner: player,
    path,
    flagA: a.id,
    flagB: b.id,
    carriers: [0, 0],
    busy,
    traffic: 0,
    costAB: pathCost(world, path),
    costBA: pathCost(world, [...path].reverse()),
  };
  world.roads[id] = road;
  attach(world, a, path[1], id);
  attach(world, b, path[path.length - 2], id);
  for (let i = 1; i < path.length - 1; i++) world.nodeRoad[path[i]] = id;
  return road;
}

/** Baut eine (bereits validierte) Straße, setzt ggf. die Endflagge und Zwischenflaggen. */
export function buildRoad(world: World, player: number, path: number[], autoFlags: boolean): Road {
  const last = path[path.length - 1];
  if (!world.nodeFlag[last]) placeFlag(world, player, last);
  const road = createRoad(world, player, [...path], false);
  markNetworkChanged(world);
  if (autoFlags) {
    for (let i = 2; i < path.length - 2; i++) {
      if (canPlaceFlag(world, player, path[i]) === 'ok') {
        placeFlag(world, player, path[i]);
        i++;
      }
    }
  }
  return road;
}

/** Index eines Knotens im Straßenpfad. */
export function roadIndexOf(road: Road, node: number): number {
  return road.path.indexOf(node);
}

/** Andere Endflagge der Straße. */
export function otherEnd(road: Road, flagId: number): number {
  return road.flagA === flagId ? road.flagB : road.flagA;
}

/** Endknoten der Straße zu einer Endflagge. */
export function endNode(road: Road, flagId: number): number {
  return flagId === road.flagA ? road.path[0] : road.path[road.path.length - 1];
}

/** Knotenfolge entlang der Straße von Index `from` (exklusiv) bis `to` (inklusiv). */
export function roadSlice(road: Road, from: number, to: number): number[] {
  const out: number[] = [];
  if (to > from) for (let i = from + 1; i <= to; i++) out.push(road.path[i]);
  else for (let i = from - 1; i >= to; i--) out.push(road.path[i]);
  return out;
}

/** Position eines Siedlers für Pfad-Neuberechnung: Zielknoten des laufenden Schritts. */
export function settlerPos(s: Settler): number {
  return s.next >= 0 ? s.next : s.node;
}

/** Löst eine Reservierung einer Ware durch den Siedler. */
export function unreserve(world: World, s: Settler, wareId: number): void {
  const w = world.wares[wareId];
  if (w && w.reservedBy === s.id) w.reservedBy = 0;
}

/**
 * Teilt eine Straße an einem Innenknoten, auf dem gerade eine neue Flagge gesetzt wurde.
 * Träger bleiben auf der Hälfte, auf der sie stehen, Ziele werden angepasst.
 */
export function splitRoad(world: World, roadId: number, node: number, flag: Flag): void {
  const old = world.roads[roadId];
  const k = roadIndexOf(old, node);
  const p1 = old.path.slice(0, k + 1);
  const p2 = old.path.slice(k);
  const fa = world.flags[old.flagA];
  const fb = world.flags[old.flagB];
  // Alte Straße entfernen (ohne Träger zu entlassen), zwei neue anlegen.
  for (const f of [fa, fb]) for (let d = 0; d < 6; d++) if (f.roads[d] === roadId) f.roads[d] = 0;
  for (let i = 1; i < old.path.length - 1; i++) world.nodeRoad[old.path[i]] = 0;
  delete world.roads[roadId];
  const r1 = createRoad(world, old.owner, p1, old.busy);
  const r2 = createRoad(world, old.owner, p2, old.busy);
  r1.traffic = r2.traffic = old.traffic;

  for (const sid of old.carriers) {
    if (!sid) continue;
    const s = world.settlers[sid];
    if (!s) continue;
    let target: Road;
    if (s.state === 'toRoad') {
      target = s.targetFlag === old.flagA ? r1 : r2;
    } else {
      const pos = settlerPos(s);
      const idx = roadIndexOf(old, pos);
      const headingA = s.targetFlag === old.flagA;
      if (idx >= 0 && (idx < k || (idx === k && headingA))) target = r1;
      else if (idx > k || idx === k) target = r2;
      else {
        // Im Gebäude bzw. an einer Endflagge: Hälfte mit dieser Endflagge.
        target = s.targetFlag === old.flagB ? r2 : r1;
      }
    }
    const slot = s.job === 'donkey' ? 1 : 0;
    if (target.carriers[slot]) {
      // Platz schon vergeben (zweiter Träger derselben Hälfte): nach Hause schicken.
      releaseSettler(world, s);
      continue;
    }
    target.carriers[slot] = s.id;
    s.road = target.id;
    retargetAfterSplit(world, s, target, flag.id);
  }
  // Waren, deren nächste Straße die alte war, müssen neu geroutet werden.
  for (const f of [fa, fb, flag]) {
    for (const wid of f.wares) {
      const w = world.wares[wid];
      if (w.nextRoad === roadId) {
        w.nextRoad = 0;
        if (w.reservedBy && !world.settlers[w.reservedBy]) w.reservedBy = 0;
      }
    }
  }
  markNetworkChanged(world);
}

function retargetAfterSplit(world: World, s: Settler, road: Road, newFlag: number): void {
  if (s.state === 'toRoad') return;
  const ends = [road.flagA, road.flagB];
  const fixFlag = (f: number): number => (ends.includes(f) ? f : newFlag);
  if (s.state === 'fetch') {
    if (!ends.includes(s.targetFlag)) {
      unreserve(world, s, s.fetchWare);
      unreserve(world, s, s.swapWare);
      s.fetchWare = s.swapWare = 0;
      s.state = 'toMiddle';
      s.targetFlag = 0;
    } else if (s.swapWare) {
      const sw = world.wares[s.swapWare];
      if (!sw || !ends.includes(sw.flag)) {
        unreserve(world, s, s.swapWare);
        s.swapWare = 0;
      }
    }
  } else if (s.state === 'carry') {
    s.targetFlag = fixFlag(s.targetFlag);
    if (s.swapWare) {
      const sw = world.wares[s.swapWare];
      if (!sw || sw.flag !== s.targetFlag) {
        unreserve(world, s, s.swapWare);
        s.swapWare = 0;
      }
    }
  } else if (s.state === 'enterBuilding' || s.state === 'leaveBuilding') {
    return;
  }
  // Pfad entlang der neuen Straße neu setzen.
  const pos = settlerPos(s);
  const from = roadIndexOf(road, pos);
  if (from < 0) return;
  let toIdx: number;
  if (s.state === 'fetch' || s.state === 'carry') {
    toIdx = roadIndexOf(road, world.flags[s.targetFlag].node);
  } else {
    toIdx = road.path.length >> 1;
    s.state = 'toMiddle';
  }
  s.path = roadSlice(road, from, toIdx);
}

/** Schickt einen Siedler nach Hause (ins nächste Lager). */
export function releaseSettler(world: World, s: Settler): void {
  const road = world.roads[s.road];
  if (road) for (const k of [0, 1] as const) if (road.carriers[k] === s.id) road.carriers[k] = 0;
  unreserve(world, s, s.fetchWare);
  unreserve(world, s, s.swapWare);
  s.fetchWare = s.swapWare = 0;
  s.road = 0;
  s.state = 'returning';
  s.path = [];
  s.targetFlag = 0;
  s.targetBuilding = 0;
}

/**
 * Reißt eine Straße ab. Träger mit Ware bringen sie zur nächsten noch vorhandenen Endflagge und
 * gehen dann heim; Waren mit dieser Straße als nächster Station werden neu geroutet.
 */
export function removeRoad(world: World, roadId: number): void {
  const road = world.roads[roadId];
  if (!road) return;
  for (const fid of [road.flagA, road.flagB]) {
    const f = world.flags[fid];
    if (!f) continue;
    for (let d = 0; d < 6; d++) if (f.roads[d] === roadId) f.roads[d] = 0;
    for (const wid of f.wares) {
      const w = world.wares[wid];
      if (w.nextRoad === roadId) w.nextRoad = 0;
    }
  }
  for (let i = 1; i < road.path.length - 1; i++) world.nodeRoad[road.path[i]] = 0;
  delete world.roads[roadId];

  for (const sid of road.carriers) {
    if (!sid) continue;
    const s = world.settlers[sid];
    if (!s) continue;
    const wasEntering = s.state === 'enterBuilding' || s.state === 'leaveBuilding';
    unreserve(world, s, s.fetchWare);
    unreserve(world, s, s.swapWare);
    s.fetchWare = s.swapWare = 0;
    s.road = 0;
    if (wasEntering) continue; // beendet den Gang ins Gebäude, geht danach heim
    if (s.ware && s.state !== 'toRoad') {
      // Zur nächstgelegenen vorhandenen Endflagge.
      const pos = settlerPos(s);
      const idx = roadIndexOf(road, pos);
      const candidates: [number, number][] = [];
      if (world.flags[road.flagA]) candidates.push([road.flagA, idx >= 0 ? idx : 0]);
      if (world.flags[road.flagB]) {
        candidates.push([road.flagB, idx >= 0 ? road.path.length - 1 - idx : 0]);
      }
      candidates.sort((a, b) => a[1] - b[1]);
      if (idx >= 0 && candidates.length > 0) {
        const fid = candidates[0][0];
        s.state = 'dropAndReturn';
        s.targetFlag = fid;
        s.path = roadSlice(road, idx, fid === road.flagA ? 0 : road.path.length - 1);
        continue;
      }
    }
    releaseSettler(world, s);
  }
  markNetworkChanged(world);
}

/**
 * Plant ein Straßenteilstück vom Ende eines angefangenen Pfads zu `target` (A* über freie Knoten).
 * Das Ziel darf eine eigene Flagge oder ein gültiger Flaggenplatz sein. Liefert die neuen Knoten
 * (ohne den bisherigen Endknoten) oder null.
 */
export function planRoadSegment(
  world: World,
  player: number,
  path: readonly number[],
  target: number,
  maxExpansions: number = TRANSPORT.ROAD_PLAN_MAX_EXPANSIONS,
): number[] | null {
  const start = path[path.length - 1];
  if (target === start || path.includes(target)) return null;
  const map = world.map;
  const tf = world.flags[world.nodeFlag[target]];
  const targetOk =
    (tf && tf.owner === player) ||
    isRoadNodeFree(world, player, target) ||
    canPlaceFlag(world, player, target) === 'ok';
  if (!targetOk) return null;
  const used = new Set(path);
  const tx = nodeX(map, target);
  const ty = nodeY(map, target);
  const h = (n: number): number =>
    gridDistance(nodeX(map, n), nodeY(map, n), tx, ty) * TRANSPORT.WALK_TICKS_PER_STEP;
  const g = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new MinHeap();
  heap.push(h(start), start);
  let expansions = 0;
  while (heap.size > 0 && expansions < maxExpansions) {
    const [, n] = heap.pop();
    if (closed.has(n)) continue;
    if (n === target) {
      const out: number[] = [];
      let c = target;
      while (c !== start) {
        out.push(c);
        c = prev.get(c)!;
      }
      return out.reverse();
    }
    closed.add(n);
    expansions++;
    for (const d of DIRS) {
      const m = neighbor(map, n, d);
      if (m < 0 || closed.has(m) || used.has(m)) continue;
      if (m !== target && !isRoadNodeFree(world, player, m)) continue;
      if (!isRoadStepAllowed(world, n, m)) continue;
      const ng = g.get(n)! + stepTicks(world, n, m);
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

/** Steigungsklasse eines Schritts: 0 eben, 1 leicht, 2 steil (für die Anzeige). */
export function slopeClass(world: World, a: number, b: number): 0 | 1 | 2 {
  const dh = Math.abs(world.map.heights[b] - world.map.heights[a]);
  if (dh >= TERRAIN_RULES.ROAD_STEEP_SLOPE) return 2;
  return dh >= 2 ? 1 : 0;
}
