/**
 * Entscheidungen der Gegner-KI. Pro Denkschritt höchstens ein neues Gebäude; dazu Anschluss
 * verwaister Flaggen, Abriss erschöpfter Betriebe, Geologen, Werkzeugprioritäten und Angriffe.
 * Die KI gibt nur Befehle aus, wie ein menschlicher Spieler.
 */
import { AI, GEOLOGIST, MILITARY, type AiLevel } from '../data/balance';
import { BUILDINGS, isMilitaryType, type BuildingType } from '../data/buildings';
import { nodeDistance, nodesInRadius } from '../sim/geometry';
import { claimRadius, claimsTerritory } from '../sim/territory';
import { FOOD, JOB_TOOLS, TOOL_WARES, type ToolWare } from '../data/wares';
import type { Command } from '../sim/commands';
import type { Building } from '../sim/entities';
import { attackSources, isAttackable, reserveOf, spareSoldiers } from '../sim/military';
import { neededJob } from '../sim/buildings';
import { isMinableTerrain } from '../sim/map';
import type { World } from '../sim/world';
import {
  connectFlag,
  findMilitaryPlacement,
  findMountainFlag,
  findPlacement,
  findShortcut,
  fishAround,
  rocksAround,
  surveyValue,
  surveyed,
  treesAround,
} from './placement';
import { buildView, type View } from './view';
import { remember, type AiMemory } from './memory';

interface Step {
  type: BuildingType;
  count: number;
  /** Zusätzliche Bedingung. */
  when?: (v: View) => boolean;
}

const lowStone = (v: View): boolean => v.stock.stone < 10;
/** Waffen erst, wenn Kohle und Eisenerz nachkommen; sonst frisst die Schmiede das Starteisen. */
const minesRunning = (v: View): boolean =>
  ['coalmine', 'ironmine'].every((t) => v.buildings.some((b) => b.type === t && !b.site));
const bigLand = (v: View): boolean => v.world.owner.filter((o) => o === v.player).length > 1400;

const BASIC: Step[] = [
  { type: 'woodcutter', count: 1 },
  { type: 'quarry', count: 1 },
  { type: 'sawmill', count: 1 },
  { type: 'forester', count: 1 },
  { type: 'woodcutter', count: 2 },
  { type: 'fisher', count: 1 },
  { type: 'well', count: 1 },
  { type: 'farm', count: 1 },
  { type: 'mill', count: 1 },
  { type: 'bakery', count: 1 },
  { type: 'coalmine', count: 1 },
  { type: 'ironmine', count: 1 },
  { type: 'smelter', count: 1 },
];

/** Zusätzliche Nahrungsbetriebe, wenn Bergwerke auf Nahrung warten. */
const FOOD_EXTRA: Step[] = [
  { type: 'fisher', count: 3 },
  { type: 'farm', count: 3 },
  { type: 'well', count: 2 },
  { type: 'mill', count: 1 },
  { type: 'bakery', count: 2 },
  { type: 'pigfarm', count: 1 },
  { type: 'butcher', count: 1 },
  { type: 'fisher', count: 4 },
  { type: 'farm', count: 4 },
  { type: 'well', count: 3 },
  { type: 'pigfarm', count: 2 },
  { type: 'butcher', count: 2 },
];

/** Bauordnung je Stufe: Der erste unerfüllte Schritt mit passendem Bauplatz wird gebaut. */
const PROGRAM: Record<AiLevel, Step[]> = {
  easy: [
    ...BASIC,
    { type: 'weaponsmith', count: 1, when: minesRunning },
    { type: 'toolsmith', count: 1 },
    { type: 'quarry', count: 2 },
    { type: 'woodcutter', count: 3 },
  ],
  normal: [
    ...BASIC,
    { type: 'toolsmith', count: 1 },
    { type: 'farm', count: 2 },
    { type: 'pigfarm', count: 1 },
    { type: 'butcher', count: 1 },
    { type: 'well', count: 2 },
    { type: 'weaponsmith', count: 1, when: minesRunning },
    { type: 'goldmine', count: 1 },
    { type: 'mint', count: 1 },
    { type: 'coalmine', count: 2 },
    { type: 'quarry', count: 2 },
    { type: 'woodcutter', count: 3 },
    { type: 'forester', count: 2 },
    { type: 'granitemine', count: 1, when: lowStone },
    { type: 'fisher', count: 2 },
    { type: 'farm', count: 3 },
    { type: 'storehouse', count: 1, when: bigLand },
  ],
  hard: [
    ...BASIC,
    { type: 'toolsmith', count: 1 },
    { type: 'weaponsmith', count: 1, when: minesRunning },
    { type: 'farm', count: 2 },
    { type: 'pigfarm', count: 1 },
    { type: 'butcher', count: 1 },
    { type: 'well', count: 2 },
    { type: 'coalmine', count: 2 },
    { type: 'goldmine', count: 1 },
    { type: 'mint', count: 1 },
    { type: 'quarry', count: 2 },
    { type: 'woodcutter', count: 3 },
    { type: 'forester', count: 2 },
    { type: 'granitemine', count: 1, when: lowStone },
    { type: 'ironmine', count: 2 },
    { type: 'coalmine', count: 3 },
    { type: 'weaponsmith', count: 2, when: minesRunning },
    { type: 'fisher', count: 2 },
    { type: 'farm', count: 3 },
    { type: 'storehouse', count: 1, when: bigLand },
    { type: 'woodcutter', count: 4 },
    { type: 'sawmill', count: 2 },
  ],
};

/** Straßenbefehl; Zwischenflaggen nur auf langen Straßen (jedes Teilstück braucht einen Träger). */
function roadCmd(view: View, path: number[]): Command {
  return {
    type: 'buildRoad',
    player: view.player,
    path,
    autoFlags: path.length > AI.AUTOFLAG_MIN_LEN,
  };
}

/** Warten schon zu viele Straßen auf Träger, baut die KI erst einmal nichts Neues. */
function carriersShort(view: View): boolean {
  if (view.stores.some((s) => s.people.carrier > 0)) return false;
  let waiting = 0;
  for (const id in view.world.roads) {
    const r = view.world.roads[id];
    if (r.owner === view.player && !r.carriers[0]) waiting++;
  }
  return waiting > AI.MAX_WAITING_ROADS;
}

/** Eine Entscheidung der KI für einen Spieler. */
export function think(
  world: World,
  player: number,
  level: AiLevel,
  memory: AiMemory = { deposits: [], surveyed: [] },
): Command[] {
  remember(world, player, memory);
  const view = buildView(world, player, level, memory);
  if (!view.stores.length) return [];
  const cmds: Command[] = [];
  // Fehlt Erz, gehen auch Reservesoldaten an die Grenze (sonst kommt die KI nie an die Funde).
  const reserve = needsOre(view) ? AI.HQ_RESERVE_MIN : AI.HQ_RESERVE[level];
  if (world.players[player].reserve !== reserve) {
    cmds.push({ type: 'setReserve', player, value: reserve });
  }
  connectOrphan(view, cmds);
  demolishExhausted(view, cmds);
  removeDeadEnd(view, cmds);
  if (AI.MANAGE_TOOLS[level]) manageTools(view, cmds);
  const short = carriersShort(view);
  if (!short) build(view, cmds);
  // Früh nach Erz suchen: Funde bleiben im Gedächtnis, bis die Bauordnung bei den Bergwerken ist.
  if (needsOre(view)) sendGeologist(view, cmds);
  if (!short && !cmds.some((c) => c.type === 'buildRoad' || c.type === 'placeBuilding')) {
    const road = findShortcut(view);
    if (road) cmds.push(roadCmd(view, road));
  }
  if (attackDue(world, player, level)) {
    const a = planAttack(world, player, level);
    if (a) cmds.push(a);
  }
  return cmds;
}

/** Erster Denkschritt eines Angriffsfensters (die KI hat kein Gedächtnis, nur die Uhr). */
function attackDue(world: World, player: number, level: AiLevel): boolean {
  return (
    world.tick >= AI.ATTACK_START_TICKS[level] &&
    (world.tick + player * AI.THINK_OFFSET) % AI.ATTACK_INTERVAL_TICKS[level] === 0
  );
}

/** Verbindet eine Gebäudeflagge ohne Weg zum Lager; gelingt das nicht, wird die Baustelle aufgegeben. */
function connectOrphan(view: View, cmds: Command[]): void {
  const w = view.world;
  for (const b of view.buildings) {
    if (view.reachable.has(b.flag) || b.type === 'hq') continue;
    const road = connectFlag(view, w.flags[b.flag].node);
    if (road) cmds.push(roadCmd(view, road));
    else if (b.site && !b.site.usedPlanks && !b.site.usedStone) {
      cmds.push({ type: 'removeBuilding', player: view.player, building: b.id });
    }
    return;
  }
}

/**
 * Reißt eine Stichstraße zu einer Flagge ohne Gebäude ab (Geologenflaggen, Reste abgerissener
 * Betriebe). Sie bindet einen Träger und versperrt Bauplätze, gerade in den Bergen.
 */
function removeDeadEnd(view: View, cmds: Command[]): void {
  const w = view.world;
  const targets = new Set<number>();
  for (const id in w.settlers) {
    const s = w.settlers[id];
    if (s.owner === view.player && s.job === 'geologist') targets.add(s.targetFlag);
  }
  for (const f of view.reachable) {
    const flag = w.flags[f];
    if (flag.building || flag.wares.length || targets.has(f)) continue;
    if (flag.roads.filter((r) => r > 0).length !== 1) continue;
    // Gerade erst gebaut (Geologe noch nicht losgeschickt)? Nur abreißen, wenn schon gesucht wurde.
    if (isMinableTerrain(w.map, flag.node) && !surveyed(view, flag.node)) continue;
    cmds.push({ type: 'removeFlag', player: view.player, flag: f });
    return;
  }
}

/** Reißt Betriebe ab, deren Rohstoffe aufgebraucht sind. */
function demolishExhausted(view: View, cmds: Command[]): void {
  for (const b of view.buildings) {
    if (b.site || b.status !== 'noResources') continue;
    const def = BUILDINGS[b.type];
    let gone = false;
    if (def.kind === 'quarry') gone = rocksAround(view, b.node, def.radius) === 0;
    else if (def.kind === 'woodcutter') {
      gone =
        treesAround(view, b.node, def.radius) === 0 &&
        !view.buildings.some((o) => o.type === 'forester' && o.owner === b.owner);
    } else if (def.kind === 'fisher') gone = fishAround(view, b.node, def.radius) < AI.MIN_FISH;
    else if (def.kind === 'mine') {
      gone = true;
      view.memory.deposits = view.memory.deposits.filter(
        (d) =>
          d.resource !== def.resource || nodeDistance(view.world.map, d.node, b.node) > def.radius,
      );
    }
    if (gone) {
      cmds.push({ type: 'removeBuilding', player: view.player, building: b.id });
      return;
    }
  }
}

/** Werkzeuge für fehlende Berufe dringend, alle anderen nicht herstellen. */
function manageTools(view: View, cmds: Command[]): void {
  const urgent = new Set<ToolWare>();
  for (const b of view.buildings) {
    if (b.worker) continue;
    const job = neededJob(b);
    const tool = job ? JOB_TOOLS[job] : null;
    if (!job || !tool || view.stock[tool] > 0) continue;
    if (view.stores.some((s) => s.people[job] > 0)) continue;
    urgent.add(tool as ToolWare);
  }
  // Geologen brauchen einen Hammer.
  if (needsOre(view) && !view.stock.hammer && !view.stores.some((s) => s.people.geologist > 0)) {
    urgent.add('hammer');
  }
  const prio = view.world.players[view.player].toolPriority;
  for (const t of TOOL_WARES) {
    const want = urgent.has(t) ? AI.TOOL_URGENT : AI.TOOL_IDLE;
    if (prio[t] !== want)
      cmds.push({ type: 'setToolPriority', player: view.player, tool: t, value: want });
  }
}

function economyCount(view: View): number {
  return view.buildings.filter((b) => !isMilitaryType(b.type) && b.type !== 'storehouse').length;
}

function militaryCount(view: View): number {
  return view.buildings.filter((b) => isMilitaryType(b.type) && b.type !== 'hq').length;
}

/** Bergwerke warten auf Nahrung und im Lager ist kaum welche. */
function foodShort(view: View): boolean {
  if (FOOD.reduce((a, f) => a + view.stock[f], 0) >= AI.MINE_MIN_FOOD) return false;
  return view.buildings.some(
    (b) => BUILDINGS[b.type].kind === 'mine' && b.status === 'waitingInput',
  );
}

function hasFood(view: View): boolean {
  return (
    FOOD.reduce((a, f) => a + view.stock[f], 0) >= AI.MINE_MIN_FOOD ||
    view.counts.fisher + view.counts.bakery + view.counts.butcher > 0
  );
}

function build(view: View, cmds: Command[]): void {
  const { level, player } = view;
  if (view.sites >= AI.MAX_SITES[level]) return;
  const wantMilitary =
    view.militarySites < AI.MAX_MILITARY_SITES[level] &&
    militaryCount(view) < AI.MILITARY_SHARE[level] * economyCount(view) + 1;
  if (placeFoundMine(view, cmds)) return;
  const mountains = needsMountains(view);
  if (wantMilitary && placeMilitary(view, cmds, mountains)) return;
  let blocked = false;
  const program = foodShort(view) ? [...FOOD_EXTRA, ...PROGRAM[level]] : PROGRAM[level];
  for (const step of program) {
    if (view.counts[step.type] >= step.count) continue;
    if (step.when && !step.when(view)) continue;
    const def = BUILDINGS[step.type];
    if (def.kind === 'mine' && !hasFood(view)) continue;
    // Nur bauen, wenn das Material da ist (Baustellen warten sonst ewig).
    if (
      view.sites > 0 &&
      (view.stock.planks < def.cost.planks || view.stock.stone < def.cost.stone)
    ) {
      return;
    }
    const place = findPlacement(view, step.type);
    if (!place) {
      if (def.kind === 'mine') {
        // Der Geologe braucht einen freien Träger: bis dahin nichts anderes bauen.
        if (!view.stores.some((s) => s.people.carrier > 0)) return;
        sendGeologist(view, cmds);
      }
      blocked = true;
      continue;
    }
    cmds.push({ type: 'placeBuilding', player, node: place.node, building: step.type });
    if (place.road) cmds.push(roadCmd(view, place.road));
    return;
  }
  // Nichts mehr zu tun oder kein Platz: Gebiet vergrößern.
  if ((blocked || !wantMilitary) && view.militarySites < AI.MAX_MILITARY_SITES[level]) {
    placeMilitary(view, cmds, mountains);
  }
}

/** Höchstzahl je Bergwerkstyp laut Bauordnung. */
function mineCap(level: AiLevel, type: BuildingType): number {
  return Math.max(0, ...PROGRAM[level].filter((s) => s.type === type).map((s) => s.count));
}

/**
 * Baut ein Bergwerk, sobald ein Geologe das Vorkommen gefunden hat (Schilder verschwinden nach
 * einer Weile, die KI hat kein Gedächtnis). Kohle und Eisen zuerst.
 */
function placeFoundMine(view: View, cmds: Command[]): boolean {
  if (!hasFood(view)) return false;
  for (const type of MINE_ORDER) {
    if (view.counts[type] >= mineCap(view.level, type)) continue;
    if (type === 'granitemine' && !lowStone(view)) continue;
    const def = BUILDINGS[type];
    if (view.stock.planks < def.cost.planks) return false;
    const place = findPlacement(view, type);
    if (!place) continue;
    cmds.push({ type: 'placeBuilding', player: view.player, node: place.node, building: type });
    if (place.road) {
      cmds.push(roadCmd(view, place.road));
    }
    return true;
  }
  return false;
}

const MINE_ORDER: BuildingType[] = ['coalmine', 'ironmine', 'goldmine', 'granitemine'];

/** Soldaten, die für ein neues Militärgebäude bereitstehen (über der Reserve oder ausrüstbar). */
function freeSoldiers(view: View): number {
  const w = view.world;
  let n = 0;
  for (const s of view.stores) {
    n += spareSoldiers(w, s);
    // Neue Waffen füllen zuerst die Reserve auf.
    const missing = Math.max(0, reserveOf(w, s) - s.soldiers.length);
    n += Math.max(0, Math.min(s.stock.sword, s.stock.shield, s.people.carrier) - missing);
  }
  // Noch unbesetzte Gebäude bekommen die nächsten Soldaten.
  for (const b of view.buildings) {
    if (isMilitaryType(b.type) && b.type !== 'hq' && b.soldiers.length === 0) n--;
  }
  return n;
}

/**
 * Gibt ein Militärgebäude im Landesinneren auf, dessen Gebiet vollständig von anderen eigenen
 * Gebäuden abgedeckt ist. Seine Soldaten gehen ins Lager und stehen für die Grenze bereit.
 */
function releaseInterior(view: View, cmds: Command[]): void {
  const w = view.world;
  const map = w.map;
  const claims = view.buildings.filter((b) => claimsTerritory(b));
  for (const b of claims) {
    if (b.type === 'hq') continue;
    const r = claimRadius(b);
    const covered = nodesInRadius(map, b.node, r + AI.INTERIOR_MARGIN).every(
      (n) =>
        w.owner[n] !== view.player ||
        claims.some((c) => c !== b && nodeDistance(map, c.node, n) <= claimRadius(c)),
    );
    if (!covered) continue;
    cmds.push({ type: 'removeBuilding', player: view.player, building: b.id });
    return;
  }
}

/**
 * Neue Berge erschließen: Ein Bergwerk steht an, aber das eigene Gebiet hat keine Berge, oder es
 * fehlt Erz und alle eigenen Berge sind schon abgesucht.
 */
function needsMountains(view: View): boolean {
  const w = view.world;
  const wantsMine = PROGRAM[view.level].some(
    (s) => BUILDINGS[s.type].kind === 'mine' && view.counts[s.type] < s.count,
  );
  if (!wantsMine) return false;
  const ore = needsOre(view);
  for (let n = 0; n < w.owner.length; n++) {
    if (w.owner[n] !== view.player || !isMinableTerrain(w.map, n)) continue;
    if (!ore || surveyValue(view, n) >= AI.SURVEY_MIN_VALUE) return false;
  }
  return true;
}

function placeMilitary(view: View, cmds: Command[], towardsMountains: boolean): boolean {
  if (freeSoldiers(view) <= 0) {
    releaseInterior(view, cmds);
    return false;
  }
  const m = findMilitaryPlacement(view, towardsMountains);
  if (!m) return false;
  const def = BUILDINGS[m.type];
  if (view.stock.planks < def.cost.planks || view.stock.stone < def.cost.stone) return false;
  cmds.push({ type: 'placeBuilding', player: view.player, node: m.place.node, building: m.type });
  if (m.place.road) {
    cmds.push(roadCmd(view, m.place.road));
  }
  return true;
}

/** Schickt einen Geologen in die eigenen Berge (legt dafür bei Bedarf eine Flagge an). */
function sendGeologist(view: View, cmds: Command[]): void {
  const w = view.world;
  if (cmds.some((c) => c.type === 'sendGeologist')) return;
  if (!view.stores.some((s) => s.people.geologist > 0 || s.stock.hammer > 0)) return;
  if (!view.stores.some((s) => s.people.geologist > 0 || s.people.carrier > 0)) return;
  // Ziele der Geologen, die schon unterwegs sind.
  const busy: number[] = [];
  for (const id in w.settlers) {
    const s = w.settlers[id];
    if (s.owner === view.player && s.job === 'geologist' && w.flags[s.targetFlag]) {
      busy.push(w.flags[s.targetFlag].node);
    }
  }
  if (busy.length >= AI.GEOLOGISTS[view.level]) return;
  const free = (n: number): boolean =>
    !surveyed(view, n) && busy.every((b) => nodeDistance(w.map, b, n) > GEOLOGIST.RADIUS);
  // Verbundene Bergflagge in einer noch nicht untersuchten Gegend?
  let best = -1;
  let bestV = -Infinity;
  for (const f of view.reachable) {
    const flag = w.flags[f];
    if (flag.building || !isMinableTerrain(w.map, flag.node) || !free(flag.node)) continue;
    const v = surveyValue(view, flag.node);
    if (v > bestV || (v === bestV && f < best)) {
      bestV = v;
      best = f;
    }
  }
  if (best > 0 && bestV >= AI.SURVEY_MIN_VALUE) {
    cmds.push({ type: 'sendGeologist', player: view.player, flag: best });
    return;
  }
  if (cmds.some((c) => c.type === 'buildRoad')) return;
  const road = findMountainFlag(view, free);
  if (road) cmds.push(roadCmd(view, road));
}

/** Braucht die KI noch Kohle oder Eisen, ohne ein bekanntes Vorkommen zu haben? */
function needsOre(view: View): boolean {
  if (!view.counts.sawmill) return false;
  for (const type of ['coalmine', 'ironmine'] as const) {
    if (view.counts[type] >= mineCap(view.level, type)) continue;
    const res = BUILDINGS[type].resource;
    if (!view.memory.deposits.some((d) => d.resource === res)) return true;
  }
  return false;
}

/** Kampfkraft eines Soldaten. */
function strength(rank: number): number {
  return MILITARY.HP[rank] * MILITARY.ATTACK[rank];
}

/**
 * Wählt ein Angriffsziel: das feindliche Gebäude, das mit den wenigsten eigenen Soldaten bei
 * ausreichender Überlegenheit (`ATTACK_RATIO`) angegriffen werden kann.
 */
export function planAttack(world: World, player: number, level: AiLevel): Command | null {
  let best: { target: Building; n: number; hq: boolean } | null = null;
  for (const id in world.buildings) {
    const target = world.buildings[id];
    if (!isAttackable(world, player, target)) continue;
    const pool: number[] = [];
    for (const src of attackSources(world, player, target)) {
      const ranks = [...src.building.soldiers].sort((a, b) => b - a);
      pool.push(...ranks.slice(0, src.available));
    }
    if (!pool.length) continue;
    pool.sort((a, b) => b - a);
    const defense = target.soldiers.reduce((a, r) => a + strength(r), 0);
    const need = AI.ATTACK_RATIO[level] * Math.max(1, defense);
    let att = 0;
    let n = 0;
    while (n < pool.length && att < need) att += strength(pool[n++]);
    if (att < need) continue;
    const hq = target.type === 'hq';
    if (!best || n < best.n || (n === best.n && hq && !best.hq)) best = { target, n, hq };
  }
  return best ? { type: 'attack', player, target: best.target.id, soldiers: best.n } : null;
}
