/**
 * Gebäude: Bauplatzgrößen, Baustellen anlegen, Abriss, Warenanforderungen und Arbeiterzuweisung.
 */
import { GEOLOGIST, TERRAIN_RULES } from '../data/balance';
import { BUILDINGS, sizeFits, type BuildingSize, type BuildingType } from '../data/buildings';
import { MapObject } from '../data/terrain';
import {
  JOB_TOOLS,
  WARE_TYPES,
  emptyJobCounts,
  emptyWareCounts,
  type Job,
  type WareCounts,
  type WareType,
} from '../data/wares';
import { DIRS, Dir, neighbor } from './geometry';
import type { Building } from './entities';
import { SLOT_BUILDING } from './entities';
import { canPlaceFlag, placeFlag } from './flags';
import { isBuildableTerrain, isMinableTerrain } from './map';
import { releaseSettler } from './roads';
import {
  findNearestStoreAnywhere,
  markNetworkChanged,
  nodesAlongRoute,
  routeSteps,
  searchFlags,
} from './routing';
import { isStore, newSettler, startNextStep } from './store';
import { allocId, type World } from './world';
import { recordConsumed } from './economy';

/** Knoten, die ein Gebäude belegt: groß = Bauplatz sowie W, NW und NO, sonst nur der Bauplatz. */
export function footprint(world: World, node: number, size: BuildingSize): number[] {
  if (size !== 'large') return [node];
  const m = world.map;
  return [node, neighbor(m, node, Dir.W), neighbor(m, node, Dir.NW), neighbor(m, node, Dir.NE)];
}

function nodeFree(world: World, n: number): boolean {
  return (
    n >= 0 &&
    !world.nodeFlag[n] &&
    !world.nodeRoad[n] &&
    !world.nodeBuilding[n] &&
    world.map.objects[n] === MapObject.None
  );
}

/** Kein Gebäude, kein Baum, kein Fels auf dem Knoten (Straßen sind erlaubt). */
function nodeClearish(world: World, n: number): boolean {
  return n >= 0 && !world.nodeBuilding[n] && world.map.objects[n] === MapObject.None;
}

function slopeAround(world: World, nodes: readonly number[], ref: number): number {
  const h = world.map.heights;
  let m = 0;
  for (const n of nodes) {
    if (n < 0) continue;
    m = Math.max(m, Math.abs(h[n] - h[ref]));
    for (const d of DIRS) {
      const k = neighbor(world.map, n, d);
      if (k >= 0) m = Math.max(m, Math.abs(h[k] - h[ref]));
    }
  }
  return m;
}

/**
 * Größte Bauplatzgröße an einem Knoten für einen Spieler (null = kein Gebäude möglich).
 * Das Gebäude steht auf dem Knoten, seine Flagge rechts unten (SO).
 */
export function buildSize(world: World, player: number, node: number): BuildingSize | null {
  const map = world.map;
  if (node < 0 || world.owner[node] !== player || !nodeFree(world, node)) return null;
  const flagNode = neighbor(map, node, Dir.SE);
  if (flagNode < 0 || world.owner[flagNode] !== player || world.nodeBuilding[flagNode]) return null;
  const existing = world.flags[world.nodeFlag[flagNode]];
  if (existing) {
    if (existing.owner !== player || existing.building || existing.roads[Dir.NW] !== 0) return null;
  } else if (canPlaceFlag(world, player, flagNode) !== 'ok') return null;
  for (const d of DIRS) {
    if (d === Dir.SE) continue;
    const n = neighbor(map, node, d);
    if (n < 0 || world.nodeFlag[n] || world.nodeBuilding[n]) return null;
  }
  const slope = slopeAround(world, [node], node);
  if (isMinableTerrain(map, node)) {
    return slope <= TERRAIN_RULES.BUILD_SLOPE_SMALL ? 'mine' : null;
  }
  if (!isBuildableTerrain(map, node) || slope > TERRAIN_RULES.BUILD_SLOPE_SMALL) return null;
  let size: BuildingSize = 'small';
  const ring = DIRS.map((d) => neighbor(map, node, d));
  if (slope > TERRAIN_RULES.BUILD_SLOPE_MEDIUM || !ring.every((n) => nodeClearish(world, n))) {
    return size;
  }
  size = 'medium';
  const big = footprint(world, node, 'large');
  const extra = big.slice(1);
  const okLarge =
    extra.every(
      (n) =>
        nodeFree(world, n) &&
        world.owner[n] === player &&
        isBuildableTerrain(map, n) &&
        DIRS.every((d) => {
          const k = neighbor(map, n, d);
          return k >= 0 && (k === node || nodeClearish(world, k)) && !world.nodeFlag[k];
        }),
    ) && slopeAround(world, big, node) <= TERRAIN_RULES.BUILD_SLOPE_LARGE;
  if (okLarge) size = 'large';
  return size;
}

export type BuildCheck = 'ok' | 'noSpace' | 'tooSmall' | 'unknown';

export function canBuild(
  world: World,
  player: number,
  node: number,
  type: BuildingType,
): BuildCheck {
  const def = BUILDINGS[type];
  if (!def || !def.buildable) return 'unknown';
  const have = buildSize(world, player, node);
  if (!have) return 'noSpace';
  return sizeFits(def.size, have) ? 'ok' : 'tooSmall';
}

function newBuilding(
  world: World,
  type: BuildingType,
  owner: number,
  node: number,
  flag: number,
): Building {
  return {
    id: allocId(world),
    type,
    owner,
    node,
    flag,
    stock: emptyWareCounts(),
    people: emptyJobCounts(),
    site: null,
    worker: 0,
    status: 'ok',
    produced: 0,
    outQueue: [],
    outTimer: 0,
    spawnTimer: 0,
    spawned: 0,
  };
}

/** Legt eine Baustelle an (ohne Prüfung). */
export function placeBuilding(
  world: World,
  player: number,
  node: number,
  type: BuildingType,
): Building {
  const def = BUILDINGS[type];
  const map = world.map;
  const flagNode = neighbor(map, node, Dir.SE);
  const flag = world.flags[world.nodeFlag[flagNode]] ?? placeFlag(world, player, flagNode);
  const b = newBuilding(world, type, player, node, flag.id);
  const nodes = footprint(world, node, def.size);
  // Planierziel: Mittel aus Bauplatz und Nachbarschaft.
  const around = new Set<number>(nodes);
  for (const n of nodes) {
    for (const d of DIRS) {
      const k = neighbor(map, n, d);
      if (k >= 0) around.add(k);
    }
  }
  let sum = 0;
  for (const n of around) sum += map.heights[n];
  const target = Math.round(sum / around.size);
  const levelNodes = nodes.filter((n) => map.heights[n] !== target);
  b.site = {
    stage: levelNodes.length > 0 ? 'level' : 'build',
    levelNodes,
    levelTarget: target,
    usedPlanks: 0,
    usedStone: 0,
  };
  world.buildings[b.id] = b;
  for (const n of nodes) world.nodeBuilding[n] = b.id;
  flag.building = b.id;
  flag.roads[Dir.NW] = SLOT_BUILDING;
  markNetworkChanged(world);
  return b;
}

/** Verschiebt Bestand und Personen eines Gebäudes ins nächste andere Lager (Annahme A9). */
function evacuate(world: World, b: Building): void {
  const target = findNearestStoreAnywhere(world, b.owner, b.node, b.id);
  for (const t of WARE_TYPES) {
    const n = b.stock[t];
    if (!n) continue;
    if (target) target.stock[t] += n;
    else world.ledger[b.owner].wares[t] -= n;
    b.stock[t] = 0;
  }
  for (const [job, n] of Object.entries(b.people) as [Job, number][]) {
    if (n && target) target.people[job] += n;
    b.people[job] = 0;
  }
}

/** Reißt ein Gebäude ab (das Hauptquartier nicht). Nichts geht verloren. */
export function removeBuilding(world: World, id: number): boolean {
  const b = world.buildings[id];
  if (!b || b.type === 'hq') return false;
  evacuate(world, b);
  const worker = world.settlers[b.worker];
  if (worker && worker.home === b.id) releaseWorker(world, worker.id);
  for (const sid in world.settlers) {
    const s = world.settlers[sid];
    if (s.home === b.id) releaseWorker(world, s.id);
  }
  for (const other of Object.values(world.buildings)) {
    if (other.outQueue.length) other.outQueue = other.outQueue.filter((o) => o.dest !== b.id);
  }
  for (const n of footprint(world, b.node, BUILDINGS[b.type].size)) {
    if (n >= 0 && world.nodeBuilding[n] === b.id) world.nodeBuilding[n] = 0;
  }
  const flag = world.flags[b.flag];
  if (flag) {
    flag.building = 0;
    if (flag.roads[Dir.NW] === SLOT_BUILDING) flag.roads[Dir.NW] = 0;
  }
  delete world.buildings[id];
  markNetworkChanged(world);
  return true;
}

/** Schickt einen Arbeiter nach Hause; getragene Ware nimmt er mit ins Lager. */
export function releaseWorker(world: World, sid: number): void {
  const s = world.settlers[sid];
  if (!s) return;
  s.home = 0;
  s.targetNode = -1;
  s.wait = 0;
  releaseSettler(world, s);
}

// --- Bedarf ------------------------------------------------------------------------------------

/** Sollbestand eines Gebäudes je Ware (Baumaterial bzw. Eingangspuffer). */
export function wanted(b: Building): Partial<Record<WareType, number>> {
  const def = BUILDINGS[b.type];
  if (b.site) {
    return {
      planks: def.cost.planks - b.site.usedPlanks,
      stone: def.cost.stone - b.site.usedStone,
    };
  }
  return def.inputs;
}

/** Waren unterwegs zu jedem Gebäude (Waren-Entities und Lageraufträge). */
export function incomingMap(world: World): Map<number, WareCounts> {
  const map = new Map<number, WareCounts>();
  const get = (id: number): WareCounts => {
    let c = map.get(id);
    if (!c) map.set(id, (c = emptyWareCounts()));
    return c;
  };
  for (const id in world.wares) {
    const w = world.wares[id];
    if (w.dest && !w.destFlag) get(w.dest)[w.type]++;
  }
  for (const id in world.buildings) {
    for (const o of world.buildings[id].outQueue) if (o.dest) get(o.dest)[o.type]++;
  }
  return map;
}

/** Fehlmenge einer Ware für ein Gebäude unter Berücksichtigung laufender Lieferungen. */
export function shortage(b: Building, type: WareType, incoming: WareCounts | undefined): number {
  if (isStore(b)) return 0;
  const want = wanted(b)[type] ?? 0;
  return Math.max(0, want - b.stock[type] - (incoming ? incoming[type] : 0));
}

function storeAvailable(b: Building, type: WareType): number {
  let queued = 0;
  for (const o of b.outQueue) if (o.type === type) queued++;
  return b.stock[type] - queued;
}

/** Fordert fehlende Waren aus dem nächsten Lager mit Bestand an. */
export function requestWares(world: World): void {
  const incoming = incomingMap(world);
  for (const id of Object.keys(world.buildings)) {
    const b = world.buildings[Number(id)];
    if (!b || isStore(b)) continue;
    const want = wanted(b);
    for (const type of Object.keys(want) as WareType[]) {
      let missing = shortage(b, type, incoming.get(b.id));
      if (missing <= 0) continue;
      const res = searchFlags(world, b.flag, b.owner, false, (f) => {
        const s = world.buildings[world.flags[f].building];
        return !!s && s.owner === b.owner && isStore(s) && storeAvailable(s, type) > 0;
      });
      if (res.found < 0) continue;
      const store = world.buildings[world.flags[res.found].building];
      const before = missing;
      while (missing > 0 && storeAvailable(store, type) > 0) {
        store.outQueue.push({ type, dest: b.id, destFlag: 0 });
        missing--;
      }
      const inc = incoming.get(b.id) ?? emptyWareCounts();
      inc[type] += before - missing;
      incoming.set(b.id, inc);
    }
  }
}

/** Nächstes Gebäude (über Straßen), das diese Ware braucht; 0 = keins (dann ins Lager). */
export function findConsumer(
  world: World,
  owner: number,
  fromFlag: number,
  type: WareType,
): number {
  const incoming = incomingMap(world);
  const res = searchFlags(world, fromFlag, owner, false, (f) => {
    const b = world.buildings[world.flags[f].building];
    return !!b && b.owner === owner && shortage(b, type, incoming.get(b.id)) > 0;
  });
  return res.found < 0 ? 0 : world.flags[res.found].building;
}

// --- Arbeiter ----------------------------------------------------------------------------------

/** Benötigter Beruf eines Gebäudes im aktuellen Zustand (null = keiner). */
export function neededJob(b: Building): Job | null {
  if (b.site) return b.site.stage === 'level' ? 'leveler' : 'builder';
  return BUILDINGS[b.type].worker;
}

/** Kann dieses Lager den Beruf stellen (vorhanden oder Träger + Werkzeug)? */
export function canSupply(store: Building, job: Job): boolean {
  if (store.people[job] > 0) return true;
  if (job === 'carrier' || job === 'donkey' || store.people.carrier <= 0) return false;
  const tool = JOB_TOOLS[job];
  // Berufe ohne Werkzeug entstehen direkt aus einem Träger.
  return !tool || store.stock[tool] - queuedOf(store, tool) > 0;
}

function queuedOf(store: Building, type: WareType): number {
  let n = 0;
  for (const o of store.outQueue) if (o.type === type) n++;
  return n;
}

/** Entnimmt einen Arbeiter aus dem Lager; fehlt er, wird ein Träger mit Werkzeug ausgebildet. */
function takeWorker(world: World, store: Building, job: Job): void {
  if (store.people[job] > 0) {
    store.people[job]--;
    return;
  }
  const tool = JOB_TOOLS[job];
  store.people.carrier--;
  if (!tool) return;
  store.stock[tool]--;
  recordConsumed(world, store.owner, tool);
}

/** Findet ein erreichbares Lager, das den Beruf stellen kann, samt Route zur Zielflagge. */
function findSupplier(
  world: World,
  owner: number,
  flagId: number,
  job: Job,
): { store: Building; path: number[] } | null {
  const res = searchFlags(world, flagId, owner, false, (f) => {
    const s = world.buildings[world.flags[f].building];
    return !!s && s.owner === owner && isStore(s) && canSupply(s, job);
  });
  if (res.found < 0) return null;
  const store = world.buildings[world.flags[res.found].building];
  const back = searchFlags(world, res.found, owner, false, (f) => f === flagId);
  if (back.found < 0) return null;
  const storeFlagNode = world.flags[store.flag].node;
  return {
    store,
    path: [storeFlagNode, ...nodesAlongRoute(world, routeSteps(back, res.found))],
  };
}

/** Schickt einen Geologen zu einer Flagge. Liefert false, wenn keiner verfügbar ist. */
export function sendGeologist(world: World, player: number, flagId: number): boolean {
  const flag = world.flags[flagId];
  if (!flag || flag.owner !== player) return false;
  const sup = findSupplier(world, player, flagId, 'geologist');
  if (!sup) return false;
  takeWorker(world, sup.store, 'geologist');
  const s = newSettler(world, player, 'geologist', sup.store.node);
  s.state = 'geoTravel';
  s.targetFlag = flagId;
  s.count = GEOLOGIST.SURVEYS;
  s.path = sup.path;
  startNextStep(world, s);
  return true;
}

/** Schickt fehlende Arbeiter zu Baustellen und Gebäuden. */
export function dispatchBuildingWorkers(world: World): void {
  for (const id of Object.keys(world.buildings)) {
    const b = world.buildings[Number(id)];
    if (!b) continue;
    const job = neededJob(b);
    if (!job) continue;
    const w = world.settlers[b.worker];
    if (w && w.home === b.id) continue;
    b.worker = 0;
    const sup = findSupplier(world, b.owner, b.flag, job);
    if (!sup) continue;
    takeWorker(world, sup.store, job);
    const s = newSettler(world, b.owner, job, sup.store.node);
    s.state = 'toBuilding';
    s.home = b.id;
    s.path = [...sup.path, b.node];
    b.worker = s.id;
    startNextStep(world, s);
  }
}
