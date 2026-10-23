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
import { attackSources, isAttackable } from '../sim/military';
import { neededJob } from '../sim/buildings';
import { isMinableTerrain } from '../sim/map';
import type { World } from '../sim/world';
import {
  connectFlag,
  findMilitaryPlacement,
  findMountainFlag,
  findPlacement,
  fishAround,
  rocksAround,
  treesAround,
} from './placement';
import { buildView, type View } from './view';

interface Step {
  type: BuildingType;
  count: number;
  /** Zusätzliche Bedingung. */
  when?: (v: View) => boolean;
}

const lowStone = (v: View): boolean => v.stock.stone < 10;
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

/** Bauordnung je Stufe: Der erste unerfüllte Schritt mit passendem Bauplatz wird gebaut. */
const PROGRAM: Record<AiLevel, Step[]> = {
  easy: [
    ...BASIC,
    { type: 'weaponsmith', count: 1 },
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
    { type: 'weaponsmith', count: 1 },
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
    { type: 'weaponsmith', count: 1 },
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
    { type: 'weaponsmith', count: 2 },
    { type: 'fisher', count: 2 },
    { type: 'farm', count: 3 },
    { type: 'storehouse', count: 1, when: bigLand },
    { type: 'woodcutter', count: 4 },
    { type: 'sawmill', count: 2 },
  ],
};

/** Eine Entscheidung der KI für einen Spieler. */
export function think(world: World, player: number, level: AiLevel): Command[] {
  const view = buildView(world, player, level);
  if (!view.stores.length) return [];
  const cmds: Command[] = [];
  connectOrphan(view, cmds);
  demolishExhausted(view, cmds);
  if (AI.MANAGE_TOOLS[level]) manageTools(view, cmds);
  build(view, cmds);
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
    if (road) cmds.push({ type: 'buildRoad', player: view.player, path: road, autoFlags: true });
    else if (b.site && !b.site.usedPlanks && !b.site.usedStone) {
      cmds.push({ type: 'removeBuilding', player: view.player, building: b.id });
    }
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
    else if (def.kind === 'mine') gone = true;
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
  const mountains = needsMountains(view);
  if (wantMilitary && placeMilitary(view, cmds, mountains)) return;
  let blocked = false;
  for (const step of PROGRAM[level]) {
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
      if (def.kind === 'mine') sendGeologist(view, cmds);
      blocked = true;
      continue;
    }
    cmds.push({ type: 'placeBuilding', player, node: place.node, building: step.type });
    if (place.road) cmds.push({ type: 'buildRoad', player, path: place.road, autoFlags: true });
    return;
  }
  // Nichts mehr zu tun oder kein Platz: Gebiet vergrößern.
  if ((blocked || !wantMilitary) && view.militarySites < AI.MAX_MILITARY_SITES[level]) {
    placeMilitary(view, cmds, mountains);
  }
}

/** Soldaten, die für ein neues Militärgebäude bereitstehen (im Lager oder ausrüstbar). */
function freeSoldiers(view: View): number {
  let n = Math.min(view.stock.sword, view.stock.shield) - AI.HQ_RESERVE[view.level];
  for (const s of view.stores) n += s.soldiers.length;
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

/** Ein Bergwerk steht in der Bauordnung an, aber das eigene Gebiet hat keine Berge. */
function needsMountains(view: View): boolean {
  const w = view.world;
  const wantsMine = PROGRAM[view.level].some(
    (s) => BUILDINGS[s.type].kind === 'mine' && view.counts[s.type] < s.count,
  );
  if (!wantsMine) return false;
  for (let n = 0; n < w.owner.length; n++) {
    if (w.owner[n] === view.player && isMinableTerrain(w.map, n)) return false;
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
    cmds.push({ type: 'buildRoad', player: view.player, path: m.place.road, autoFlags: true });
  }
  return true;
}

/** Schickt einen Geologen in die eigenen Berge (legt dafür bei Bedarf eine Flagge an). */
function sendGeologist(view: View, cmds: Command[]): void {
  const w = view.world;
  if (cmds.some((c) => c.type === 'sendGeologist')) return;
  for (const id in w.settlers) {
    const s = w.settlers[id];
    if (s.owner === view.player && s.job === 'geologist') return;
  }
  // Verbundene Bergflagge ohne frische Schilder?
  for (const f of view.reachable) {
    const flag = w.flags[f];
    if (flag.building || !isMinableTerrain(w.map, flag.node)) continue;
    const surveyed = w.signs.some(
      (s) => s.owner === view.player && nodeDistance(w.map, s.node, flag.node) <= GEOLOGIST.RADIUS,
    );
    if (surveyed) continue;
    cmds.push({ type: 'sendGeologist', player: view.player, flag: f });
    return;
  }
  const road = findMountainFlag(view);
  if (road) cmds.push({ type: 'buildRoad', player: view.player, path: road, autoFlags: true });
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
