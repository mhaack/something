/**
 * Bauplatzwahl und Straßenanschluss der KI. Jeder Bauplatz bekommt je Gebäudetyp eine Bewertung;
 * die besten werden der Reihe nach auf eine kurze, gültige Anschlussstraße geprüft.
 */
import { AI, BUILDING_VALUES, GEOLOGIST, TRANSPORT } from '../data/balance';
import { BUILDINGS, sizeFits, type BuildingType } from '../data/buildings';
import { MapObject, Resource } from '../data/terrain';
import { footprint } from '../sim/buildings';
import { gridDistance, nodeX, nodeY, nodesInRadius } from '../sim/geometry';
import { isMinableTerrain } from '../sim/map';
import { isTreeSpot } from '../sim/mapgen';
import { planRoadSegment, validateRoad } from '../sim/roads';
import { searchFlags } from '../sim/routing';
import type { Slot, View } from './view';

export interface Placement {
  node: number;
  /** Anschlussstraße (null = Flagge ist schon verbunden). */
  road: number[] | null;
}

function dist(view: View, a: number, b: number): number {
  const m = view.world.map;
  return gridDistance(nodeX(m, a), nodeY(m, a), nodeX(m, b), nodeY(m, b));
}

function nearestDist(view: View, node: number, types: readonly BuildingType[]): number {
  let best = Infinity;
  for (const b of view.buildings) {
    if (types.includes(b.type)) best = Math.min(best, dist(view, node, b.node));
  }
  return best;
}

function countAround(view: View, node: number, r: number, pred: (n: number) => boolean): number {
  let c = 0;
  for (const n of nodesInRadius(view.world.map, node, r)) if (pred(n)) c++;
  return c;
}

function isFree(view: View, n: number): boolean {
  const w = view.world;
  return !w.nodeFlag[n] && !w.nodeRoad[n] && !w.nodeBuilding[n] && w.owner[n] === view.player;
}

export function treesAround(view: View, node: number, r: number): number {
  return countAround(view, node, r, (n) => view.world.map.objects[n] === MapObject.Tree);
}

export function rocksAround(view: View, node: number, r: number): number {
  const map = view.world.map;
  return countAround(
    view,
    node,
    r,
    (n) => map.objects[n] === MapObject.Rock && map.objectData[n] > 0,
  );
}

export function fishAround(view: View, node: number, r: number): number {
  const map = view.world.map;
  return countAround(
    view,
    node,
    r,
    (n) => map.resources[n] === Resource.Fish && map.resourceAmounts[n] > 0,
  );
}

/** Bekanntes Vorkommen dieses Bodenschatzes in Reichweite (2 = viel, 1 = wenig, 0 = keins). */
function depositScore(view: View, node: number, resource: number, r: number): number {
  let best = 0;
  for (const d of view.memory.deposits) {
    if (d.resource !== resource) continue;
    if (dist(view, node, d.node) <= r) best = Math.max(best, d.rich ? 2 : 1);
  }
  return best;
}

/** Wurde um diesen Knoten schon gründlich gesucht? */
export function surveyed(view: View, node: number): boolean {
  let n = 0;
  for (const s of view.memory.surveyed) {
    if (dist(view, node, s) <= GEOLOGIST.RADIUS && ++n >= AI.SURVEY_COVERED) return true;
  }
  return false;
}

/** Bewertung eines Bauplatzes für einen Typ (null = ungeeignet). */
function score(view: View, type: BuildingType, slot: Slot): number | null {
  const def = BUILDINGS[type];
  const map = view.world.map;
  const fd = view.flagDist[slot.flagNode];
  if (fd < 0 || fd > AI.ROAD_MAX_LEN) return null;
  let s = -2 * fd;
  // Große Plätze für große Gebäude aufheben.
  if (slot.size === 'large' && def.size !== 'large') s -= 6;
  const hq = view.stores[0]?.node ?? slot.node;
  switch (def.kind) {
    case 'woodcutter': {
      const trees = treesAround(view, slot.node, def.radius);
      // Neben einem Förster lohnt sich ein Holzfäller auch ohne alten Wald.
      const forester =
        nearestDist(view, slot.node, ['forester']) <= BUILDING_VALUES.forester.radius;
      if (trees < AI.MIN_TREES && !forester) return null;
      s += trees * 2 + (forester ? 10 : 0);
      if (nearestDist(view, slot.node, ['woodcutter']) < def.radius) s -= 15;
      return s;
    }
    case 'forester': {
      const space = countAround(
        view,
        slot.node,
        def.radius,
        (n) => isTreeSpot(map, n) && isFree(view, n),
      );
      // Ohne Holzfäller (kein Wald in Reichweite) pflanzt der Förster zuerst einen Wald nahe dem Lager.
      const near = view.counts.woodcutter
        ? nearestDist(view, slot.node, ['woodcutter'])
        : dist(view, slot.node, hq) / 2;
      if (near > BUILDING_VALUES.woodcutter.radius || space < AI.MIN_FOREST_SPACE) return null;
      s += space;
      if (nearestDist(view, slot.node, ['forester']) < def.radius) s -= 20;
      return s - near;
    }
    case 'quarry': {
      const rocks = rocksAround(view, slot.node, def.radius);
      if (rocks < AI.MIN_ROCKS) return null;
      if (nearestDist(view, slot.node, ['quarry']) < def.radius) s -= 15;
      return s + rocks * 4;
    }
    case 'fisher': {
      const fish = fishAround(view, slot.node, def.radius);
      if (fish < AI.MIN_FISH) return null;
      if (nearestDist(view, slot.node, ['fisher']) < def.radius) s -= 15;
      return s + fish;
    }
    case 'farm': {
      const space = countAround(
        view,
        slot.node,
        def.radius,
        (n) =>
          isTreeSpot(map, n) &&
          isFree(view, n) &&
          !footprint(view.world, slot.node, 'large').includes(n),
      );
      if (space < AI.MIN_FARM_SPACE) return null;
      return s + space * 2 - dist(view, slot.node, hq) / 2;
    }
    case 'mine': {
      const sign = depositScore(view, slot.node, def.resource, def.radius);
      if (!sign) return null;
      return s + sign * 10;
    }
    case 'store':
      // Lagerhaus weit weg von den vorhandenen Lagern.
      return s + Math.min(...view.stores.map((b) => dist(view, slot.node, b.node)));
    default:
      return s - dist(view, slot.node, hq);
  }
}

/** Plant eine gültige Anschlussstraße zu einer erreichbaren Flagge. */
function roadTo(view: View, flagNode: number, avoid: readonly number[]): number[] | null {
  const w = view.world;
  const existing = w.nodeFlag[flagNode];
  if (existing && view.reachable.has(existing)) return [];
  const targets = [...view.reachable]
    .map((f) => w.flags[f].node)
    .filter((n) => n !== flagNode)
    .sort((a, b) => dist(view, flagNode, a) - dist(view, flagNode, b) || a - b)
    .slice(0, AI.ROAD_TARGETS);
  let best: number[] | null = null;
  for (const t of targets) {
    if (dist(view, flagNode, t) > AI.ROAD_MAX_LEN) break;
    // Vom Netz zur neuen Flagge planen; existiert die Flagge schon, von ihr aus ins Netz.
    const from = existing ? flagNode : t;
    const to = existing ? t : flagNode;
    const seg = planRoadSegment(w, view.player, [from], to);
    if (!seg || seg.length > AI.ROAD_MAX_LEN) continue;
    if (seg.some((n) => avoid.includes(n) && n !== to)) continue;
    const path = [from, ...seg];
    if (validateRoad(w, view.player, path) !== 'ok') continue;
    if (!best || path.length < best.length) best = path;
  }
  return best;
}

export function connectFlag(view: View, flagNode: number): number[] | null {
  const r = roadTo(view, flagNode, []);
  return r && r.length ? r : null;
}

/** Bester Bauplatz mit Anschlussstraße für ein Wirtschaftsgebäude oder Lager. */
export function findPlacement(view: View, type: BuildingType): Placement | null {
  const need = BUILDINGS[type].size;
  const scored: [number, Slot][] = [];
  for (const slot of view.slots) {
    if (!sizeFits(need, slot.size)) continue;
    const s = score(view, type, slot);
    if (s !== null) scored.push([s, slot]);
  }
  return tryPlacements(view, type, scored);
}

function tryPlacements(view: View, type: BuildingType, scored: [number, Slot][]): Placement | null {
  scored.sort((a, b) => b[0] - a[0] || a[1].node - b[1].node);
  for (const [, slot] of scored.slice(0, AI.PLACE_TRIES)) {
    const fp = footprint(view.world, slot.node, BUILDINGS[type].size);
    const road = roadTo(view, slot.flagNode, fp);
    if (road) return { node: slot.node, road: road.length ? road : null };
  }
  return null;
}

/** Liegt fremdes Gebiet in der Nähe? */
function enemyNear(view: View, node: number, r: number): boolean {
  const w = view.world;
  return nodesInRadius(w.map, node, r).some((n) => w.owner[n] >= 0 && w.owner[n] !== view.player);
}

/** Militärgebäude an der Grenze, das möglichst viel neues Land (und Rohstoffe) bringt. */
export function findMilitaryPlacement(
  view: View,
  towardsMountains = false,
): { type: BuildingType; place: Placement } | null {
  const w = view.world;
  const map = w.map;
  const mountainDist = towardsMountains ? distanceToFreeMountains(view) : null;
  // Bekannte Erzfunde jenseits der Grenze ziehen die Ausdehnung an.
  const ore = new Set(
    view.memory.deposits
      .filter((d) => d.resource === Resource.Coal || d.resource === Resource.Iron)
      .map((d) => d.node),
  );
  const best = new Map<BuildingType, [number, Slot][]>();
  for (const slot of view.slots) {
    const bd = view.borderDist[slot.node];
    if (bd < 0 || bd > AI.BORDER_DIST) continue;
    const fd = view.flagDist[slot.flagNode];
    if (fd < 0 || fd > AI.ROAD_MAX_LEN) continue;
    if (slot.size === 'mine') continue;
    const type = militaryType(view, slot);
    const r = BUILDING_VALUES[type].radius;
    let gain = 0;
    for (const n of nodesInRadius(map, slot.node, r)) {
      if (w.owner[n] !== -1) continue;
      gain += 1;
      if (map.objects[n] === MapObject.Tree) gain += 0.3;
      else if (map.objects[n] === MapObject.Rock) gain += 1;
      if (isMinableTerrain(map, n)) gain += mountainDist ? AI.MOUNTAIN_BONUS : 0.5;
      if (map.resources[n] === Resource.Fish) gain += 0.3;
      if (ore.has(n)) gain += AI.DEPOSIT_BONUS;
    }
    if (gain < r) continue;
    let s = gain - 2 * fd;
    if (mountainDist && mountainDist[slot.node] >= 0)
      s -= AI.MOUNTAIN_PULL * mountainDist[slot.node];
    if (!best.has(type)) best.set(type, []);
    best.get(type)!.push([s, slot]);
  }
  // Der Typ mit dem besten Platz gewinnt.
  let pick: { type: BuildingType; place: Placement; s: number } | null = null;
  for (const [type, list] of best) {
    list.sort((a, b) => b[0] - a[0] || a[1].node - b[1].node);
    if (pick && list[0][0] <= pick.s) continue;
    const place = tryPlacements(view, type, list);
    if (place) pick = { type, place, s: list[0][0] };
  }
  return pick ? { type: pick.type, place: pick.place } : null;
}

/** Schritte zum nächsten Bergknoten, der noch niemandem gehört (über die ganze Karte). */
function distanceToFreeMountains(view: View): Int32Array {
  const w = view.world;
  const map = w.map;
  const dist = new Int32Array(map.width * map.height).fill(-1);
  const queue: number[] = [];
  for (let n = 0; n < dist.length; n++) {
    if (w.owner[n] === -1 && isMinableTerrain(map, n)) {
      dist[n] = 0;
      queue.push(n);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    for (const m of nodesInRadius(map, queue[q], 1)) {
      if (dist[m] < 0) {
        dist[m] = dist[queue[q]] + 1;
        queue.push(m);
      }
    }
  }
  return dist;
}

function militaryType(view: View, slot: Slot): BuildingType {
  const stone = view.stock.stone;
  const front =
    AI.STRONG_FRONT[view.level] &&
    enemyNear(view, slot.node, BUILDING_VALUES.watchtower.radius + 4);
  if (
    front &&
    view.level === 'hard' &&
    slot.size === 'large' &&
    stone >= 2 * BUILDING_VALUES.fortress.stone
  ) {
    return 'fortress';
  }
  // Im Hinterland reichen Wachhütten: Sie brauchen die wenigsten Soldaten.
  if (front && sizeFits('medium', slot.size)) {
    return 'watchtower';
  }
  return 'guardhut';
}

/**
 * Querverbindung gegen Umwege: Zwei eigene Flaggen liegen nah beieinander, sind über das
 * Straßennetz aber weit voneinander entfernt. Pro Denkschritt werden einige Startflaggen
 * reihum geprüft (Reihenfolge nur aus der Uhr, die KI hat kein Gedächtnis).
 */
export function findShortcut(view: View): number[] | null {
  const w = view.world;
  const flags = [...view.reachable].sort((a, b) => a - b);
  if (flags.length < AI.SHORTCUT_MIN_FLAGS) return null;
  const turn = Math.floor(w.tick / AI.THINK_TICKS[view.level]);
  let best: { path: number[]; gain: number } | null = null;
  for (let k = 0; k < AI.SHORTCUT_TRIES; k++) {
    const f = flags[(turn * AI.SHORTCUT_TRIES + k) % flags.length];
    const from = w.flags[f];
    const net = searchFlags(w, f, view.player, false, () => false).dist;
    for (const g of flags) {
      if (g === f) continue;
      const to = w.flags[g];
      const d = dist(view, from.node, to.node);
      if (d < 2 || d > AI.SHORTCUT_RANGE) continue;
      const direct = d * TRANSPORT.WALK_TICKS_PER_STEP;
      const viaNet = net.get(g) ?? Infinity;
      const gain = viaNet - AI.SHORTCUT_DETOUR * direct;
      if (gain <= 0 || (best && gain <= best.gain)) continue;
      const seg = planRoadSegment(w, view.player, [from.node], to.node);
      if (!seg || seg.length > d + AI.SHORTCUT_SLACK) continue;
      const path = [from.node, ...seg];
      if (validateRoad(w, view.player, path) !== 'ok') continue;
      best = { path, gain };
    }
  }
  return best?.path ?? null;
}

/** Freier Bergknoten für eine Geologenflagge, möglichst nah am Straßennetz. */
/** Wie lohnend ist eine Bohrung hier: Bergknoten im Geologenradius, abzüglich bekannter Bohrungen. */
export function surveyValue(view: View, node: number): number {
  const map = view.world.map;
  let v = 0;
  for (const n of nodesInRadius(map, node, GEOLOGIST.RADIUS)) if (isMinableTerrain(map, n)) v++;
  for (const s of view.memory.surveyed)
    if (dist(view, node, s) <= GEOLOGIST.RADIUS) v -= AI.SURVEY_PENALTY;
  return v;
}

export function findMountainFlag(view: View, free: (n: number) => boolean): number[] | null {
  const w = view.world;
  const map = w.map;
  const cands: [number, number][] = [];
  for (let n = 0; n < map.width * map.height; n++) {
    if (w.owner[n] !== view.player || !isMinableTerrain(map, n)) continue;
    const fd = view.flagDist[n];
    if (fd < 2 || fd > AI.ROAD_MAX_LEN) continue;
    // Nicht dorthin, wo schon gesucht wird oder wurde.
    if (!free(n)) continue;
    const v = surveyValue(view, n);
    if (v < AI.SURVEY_MIN_VALUE) continue;
    cands.push([2 * fd - v, n]);
  }
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, n] of cands.slice(0, AI.PLACE_TRIES)) {
    const road = roadTo(view, n, []);
    if (road && road.length) return road;
  }
  return null;
}
