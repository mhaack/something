/**
 * Militär: Besetzung von Militärgebäuden, Beförderung mit Münzen, Angriffe mit Zweikämpfen,
 * Eroberung und die Folgen von Gebietsverlust (Gebäude brennen ab).
 */
import { MILITARY } from '../data/balance';
import { BUILDINGS, isMilitaryType } from '../data/buildings';
import { WARE_TYPES } from '../data/wares';
import type { Building, Settler } from './entities';
import { SLOT_BUILDING } from './entities';
import { recordConsumed } from './economy';
import { emit } from './events';
import { removeFlag } from './flags';
import { Dir, gridDistance, nodeX, nodeY } from './geometry';
import { nextFloat } from './rng';
import { releaseSettler, removeRoad } from './roads';
import {
  findNearestStoreAnywhere,
  freePath,
  markNetworkChanged,
  nodesAlongRoute,
  routeSteps,
  searchFlags,
} from './routing';
import { isStore, newSettler, startNextStep } from './store';
import { claimsTerritory, recomputeTerritory } from './territory';
import { footprint, removeBuilding } from './buildings';
import type { World } from './world';

export function isMilitaryBuilding(b: Building): boolean {
  return BUILDINGS[b.type].kind === 'military';
}

export function capacity(b: Building): number {
  return isMilitaryBuilding(b) ? MILITARY.CAPACITY[b.type as keyof typeof MILITARY.CAPACITY] : 0;
}

// --- Nachschub ---------------------------------------------------------------------------------

function storeQueued(store: Building, type: string): number {
  let n = 0;
  for (const o of store.outQueue) if (o.type === type) n++;
  return n;
}

/** Soldaten, die das Hauptquartier als Reserve behält (andere Lager: keine). */
export function reserveOf(world: World, store: Building): number {
  return store.type === 'hq' ? world.players[store.owner].reserve : 0;
}

/** Soldaten eines Lagers, die es abgeben darf. */
export function spareSoldiers(world: World, store: Building): number {
  return Math.max(0, store.soldiers.length - reserveOf(world, store));
}

function canEquip(store: Building): boolean {
  return (
    store.people.carrier > 0 &&
    store.stock.sword - storeQueued(store, 'sword') > 0 &&
    store.stock.shield - storeQueued(store, 'shield') > 0
  );
}

/**
 * Kann dieses Lager einen Soldaten stellen (über der Reserve vorhanden oder Träger + Schwert +
 * Schild, sobald die Reserve voll ist)?
 */
export function canSupplySoldier(world: World, store: Building): boolean {
  if (spareSoldiers(world, store) > 0) return true;
  return store.soldiers.length >= reserveOf(world, store) && canEquip(store);
}

/** Bildet einen neuen Soldaten (Rang 0) aus Träger, Schwert und Schild. */
function equipSoldier(world: World, store: Building): number {
  store.people.carrier--;
  store.stock.sword--;
  store.stock.shield--;
  recordConsumed(world, store.owner, 'sword');
  recordConsumed(world, store.owner, 'shield');
  return 0;
}

/** Entnimmt einen Soldaten (niedrigster Rang zuerst) oder bildet einen neuen aus. */
function takeSoldier(world: World, store: Building): number {
  if (spareSoldiers(world, store) > 0) {
    let k = 0;
    for (let i = 1; i < store.soldiers.length; i++)
      if (store.soldiers[i] < store.soldiers[k]) k = i;
    return store.soldiers.splice(k, 1)[0];
  }
  return equipSoldier(world, store);
}

/** Soldaten unterwegs je Zielgebäude (einmal pro Runde gezählt). */
function soldiersOnTheWay(world: World): Map<number, number> {
  const out = new Map<number, number>();
  for (const id in world.settlers) {
    const s = world.settlers[id];
    if (s.job === 'soldier' && s.state === 'toBuilding')
      out.set(s.home, (out.get(s.home) ?? 0) + 1);
  }
  return out;
}

/** Schickt Soldaten zu Militärgebäuden, die noch Platz haben (einer pro Gebäude und Runde). */
export function dispatchSoldiers(world: World): void {
  // Zuerst füllt jedes Hauptquartier seine Reserve mit neu ausgerüsteten Soldaten auf.
  for (const p of world.players) {
    const hq = world.buildings[p.hq];
    if (hq && hq.soldiers.length < p.reserve && canEquip(hq))
      hq.soldiers.push(equipSoldier(world, hq));
  }
  const onTheWay = soldiersOnTheWay(world);
  // Spieler, deren Lager überhaupt Soldaten stellen können (sonst keine Suche).
  const supply = new Set<number>();
  for (const id in world.buildings) {
    const st = world.buildings[id];
    if (isStore(st) && !st.site && canSupplySoldier(world, st)) supply.add(st.owner);
  }
  for (const id of Object.keys(world.buildings)) {
    const b = world.buildings[Number(id)];
    if (!b || b.site || !isMilitaryBuilding(b) || !supply.has(b.owner)) continue;
    if (b.soldiers.length + (onTheWay.get(b.id) ?? 0) >= capacity(b)) continue;
    const res = searchFlags(world, b.flag, b.owner, false, (f) => {
      const s = world.buildings[world.flags[f].building];
      return !!s && s.owner === b.owner && isStore(s) && canSupplySoldier(world, s);
    });
    if (res.found < 0) continue;
    const store = world.buildings[world.flags[res.found].building];
    const back = searchFlags(world, res.found, b.owner, false, (f) => f === b.flag);
    if (back.found < 0) continue;
    const rank = takeSoldier(world, store);
    const s = newSettler(world, b.owner, 'soldier', store.node);
    s.rank = rank;
    s.home = b.id;
    s.state = 'toBuilding';
    s.path = [
      world.flags[store.flag].node,
      ...nodesAlongRoute(world, routeSteps(back, res.found)),
      b.node,
    ];
    startNextStep(world, s);
  }
}

// --- Laufender Betrieb -------------------------------------------------------------------------

/** Beförderungen mit Münzen und das Erlöschen alter Brände. */
export function militaryTick(world: World): void {
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.site || !isMilitaryBuilding(b) || b.soldiers.length === 0) continue;
    if (++b.promoTimer < MILITARY.PROMOTION_TICKS) continue;
    b.promoTimer = 0;
    if (b.stock.coins <= 0) continue;
    let k = -1;
    for (let i = 0; i < b.soldiers.length; i++) {
      if (b.soldiers[i] < MILITARY.MAX_RANK && (k < 0 || b.soldiers[i] < b.soldiers[k])) k = i;
    }
    if (k < 0) continue;
    b.soldiers[k]++;
    emit(world, 'promoted', b.node, b.owner, b.soldiers[k]);
    b.stock.coins--;
    recordConsumed(world, b.owner, 'coins');
  }
  if (world.fires.length && world.fires[0].until <= world.tick) {
    world.fires = world.fires.filter((f) => f.until > world.tick);
  }
}

// --- Angriff -----------------------------------------------------------------------------------

/** Kann `player` dieses Gebäude angreifen? */
export function isAttackable(_world: World, player: number, target: Building | undefined): boolean {
  return (
    !!target &&
    target.owner !== player &&
    isMilitaryType(target.type) &&
    !target.site &&
    claimsTerritory(target)
  );
}

/** Eigene Militärgebäude in Reichweite und die Zahl der dort entbehrlichen Soldaten. */
export function attackSources(
  world: World,
  player: number,
  target: Building,
): { building: Building; available: number }[] {
  const map = world.map;
  const tx = nodeX(map, target.node);
  const ty = nodeY(map, target.node);
  const out: { building: Building; available: number; dist: number }[] = [];
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner !== player || b.site || !isMilitaryType(b.type)) continue;
    const dist = gridDistance(tx, ty, nodeX(map, b.node), nodeY(map, b.node));
    if (dist > MILITARY.ATTACK_RADIUS) continue;
    const keep = Math.max(MILITARY.KEEP_SOLDIERS, reserveOf(world, b));
    const available = b.soldiers.length - keep;
    if (available > 0) out.push({ building: b, available, dist });
  }
  out.sort((a, b) => a.dist - b.dist || a.building.id - b.building.id);
  return out.map(({ building, available }) => ({ building, available }));
}

export function availableAttackers(world: World, player: number, target: Building): number {
  return attackSources(world, player, target).reduce((a, s) => a + s.available, 0);
}

/** Startet einen Angriff mit bis zu `count` Soldaten. Liefert die Zahl losgeschickter Soldaten. */
export function launchAttack(
  world: World,
  player: number,
  targetId: number,
  count: number,
): number {
  const target = world.buildings[targetId];
  if (!isAttackable(world, player, target)) return 0;
  const goal = world.flags[target.flag].node;
  let sent = 0;
  for (const src of attackSources(world, player, target)) {
    let n = Math.min(src.available, count - sent);
    while (n-- > 0) {
      const path = freePath(world, src.building.node, goal);
      if (!path) break;
      // Die stärksten Soldaten ziehen in den Kampf.
      let k = 0;
      for (let i = 1; i < src.building.soldiers.length; i++) {
        if (src.building.soldiers[i] > src.building.soldiers[k]) k = i;
      }
      const rank = src.building.soldiers.splice(k, 1)[0];
      const s = newSettler(world, player, 'soldier', src.building.node);
      s.rank = rank;
      s.home = src.building.id;
      s.targetBuilding = target.id;
      s.state = 'atkMarch';
      s.path = path;
      startNextStep(world, s);
      sent++;
    }
    if (sent >= count) break;
  }
  if (sent > 0) emit(world, 'attack', target.node, player, target.owner);
  return sent;
}

// --- Zustandsautomat der Soldaten --------------------------------------------------------------

export function standSoldier(world: World, s: Settler): void {
  switch (s.state) {
    case 'toBuilding':
      return enterGarrison(world, s);
    case 'atkMarch':
      return arriveAtTarget(world, s);
    case 'atkWait':
      return awaitDefender(world, s);
    case 'defend':
      return startDuel(world, s);
    case 'duel':
      return duelRound(world, s);
    case 'defReturn':
      return enterGarrison(world, s);
    case 'soldierReturn':
      return returnHome(world, s);
    default:
      return;
  }
}

function deleteSettler(world: World, s: Settler): void {
  delete world.settlers[s.id];
}

/** Soldat betritt sein Gebäude; ist es weg, fremd oder voll, geht er ins Lager. */
function enterGarrison(world: World, s: Settler): void {
  const b = world.buildings[s.home];
  const fits =
    !!b &&
    b.owner === s.owner &&
    !b.site &&
    isMilitaryType(b.type) &&
    (b.type === 'hq' || b.soldiers.length < capacity(b));
  if (!fits || s.node !== b!.node) {
    s.home = 0;
    return releaseSettler(world, s);
  }
  const wasEmpty = b!.soldiers.length === 0;
  b!.soldiers.push(s.rank);
  if (wasEmpty) world.territoryDirty = true;
  deleteSettler(world, s);
}

/** Ziel eines laufenden Angriffs noch gültig? (Verteidiger dürfen alle draußen sein.) */
function stillTarget(world: World, s: Settler): Building | undefined {
  const t = world.buildings[s.targetBuilding];
  return t && t.owner !== s.owner && isMilitaryType(t.type) && !t.site ? t : undefined;
}

function arriveAtTarget(world: World, s: Settler): void {
  if (!stillTarget(world, s)) return retreat(world, s);
  s.state = 'atkWait';
  s.wait = 1;
}

/** Angreifer vor dem Ziel: Verteidiger herausrufen oder das leere Gebäude erobern. */
function awaitDefender(world: World, s: Settler): void {
  const t = stillTarget(world, s);
  if (!t) return retreat(world, s);
  if (s.duel) return;
  if (t.soldiers.length > 0) {
    // Verteidiger kommt aus dem Gebäude zur Flagge.
    const rank = t.soldiers.shift()!;
    const d = newSettler(world, t.owner, 'soldier', t.node);
    d.rank = rank;
    d.home = t.id;
    d.state = 'defend';
    d.duel = s.id;
    d.path = [world.flags[t.flag].node];
    s.duel = d.id;
    startNextStep(world, d);
    return;
  }
  const defendersOut = Object.values(world.settlers).some(
    (o) => o.job === 'soldier' && o.home === t.id && o.owner === t.owner && o.duel,
  );
  if (defendersOut) {
    s.wait = MILITARY.DUEL_ROUND_TICKS;
    return;
  }
  conquer(world, t, s);
}

function startDuel(world: World, d: Settler): void {
  const a = world.settlers[d.duel];
  if (!a) {
    d.duel = 0;
    d.state = 'defReturn';
    d.path = [world.buildings[d.home]?.node ?? d.node];
    return;
  }
  a.hp = MILITARY.HP[a.rank];
  d.hp = MILITARY.HP[d.rank];
  a.state = 'duel';
  d.state = 'duel';
  a.wait = MILITARY.DUEL_ROUND_TICKS;
}

/** Ein Schlagabtausch; der Angreifer (mit Ziel) würfelt, der Verteidiger wartet. */
function duelRound(world: World, s: Settler): void {
  const opp = world.settlers[s.duel];
  const isAttacker = s.targetBuilding !== 0;
  if (!opp) {
    s.duel = 0;
    if (isAttacker) {
      s.state = 'atkWait';
      s.wait = 1;
    } else {
      s.state = 'defReturn';
      s.path = [world.buildings[s.home]?.node ?? s.node];
    }
    return;
  }
  if (!isAttacker) return;
  const pa = MILITARY.ATTACK[s.rank] / (MILITARY.ATTACK[s.rank] + MILITARY.ATTACK[opp.rank]);
  if (nextFloat(world.rng) < pa) opp.hp--;
  else s.hp--;
  emit(world, 'hit', opp.node, s.owner);
  if (opp.hp <= 0) {
    emit(world, 'death', opp.node, opp.owner);
    deleteSettler(world, opp);
    s.duel = 0;
    s.state = 'atkWait';
    s.wait = 1;
  } else if (s.hp <= 0) {
    emit(world, 'death', s.node, s.owner);
    deleteSettler(world, s);
    opp.duel = 0;
    opp.state = 'defReturn';
    opp.path = [world.buildings[opp.home]?.node ?? opp.node];
  } else {
    s.wait = MILITARY.DUEL_ROUND_TICKS;
  }
}

/** Rückzug bzw. Heimweg nach dem Kampf. */
function retreat(_world: World, s: Settler): void {
  s.targetBuilding = 0;
  s.duel = 0;
  s.state = 'soldierReturn';
  s.wait = 1;
}

function returnHome(world: World, s: Settler): void {
  const b = world.buildings[s.home];
  if (
    b &&
    b.owner === s.owner &&
    !b.site &&
    isMilitaryType(b.type) &&
    (b.type === 'hq' || b.soldiers.length + (soldiersOnTheWay(world).get(b.id) ?? 0) < capacity(b))
  ) {
    const path = freePath(world, s.node, b.node);
    if (path) {
      s.state = 'toBuilding';
      s.path = path;
      return;
    }
  }
  s.home = 0;
  releaseSettler(world, s);
}

// --- Eroberung und Zerstörung ------------------------------------------------------------------

/** Übergibt ein Gebäude samt Bestand an einen anderen Spieler (Warenbuch wird umgebucht). */
function transferBuilding(world: World, b: Building, newOwner: number): void {
  const old = b.owner;
  for (const t of WARE_TYPES) {
    if (!b.stock[t]) continue;
    world.ledger[old].wares[t] -= b.stock[t];
    world.ledger[newOwner].wares[t] += b.stock[t];
  }
  b.owner = newOwner;
  b.outQueue = [];
  b.promoTimer = 0;
  const flag = world.flags[b.flag];
  for (const r of [...flag.roads]) if (r > 0) removeRoad(world, r);
  for (const wid of flag.wares) {
    const w = world.wares[wid];
    world.ledger[w.owner].wares[w.type]--;
    world.ledger[newOwner].wares[w.type]++;
    w.owner = newOwner;
    w.dest = 0;
  }
  flag.owner = newOwner;
  markNetworkChanged(world);
}

function conquer(world: World, target: Building, s: Settler): void {
  emit(world, 'conquered', target.node, s.owner, target.owner);
  if (target.type === 'hq') {
    destroyBuilding(world, target);
    deleteSettler(world, s);
    world.territoryDirty = true;
    for (const o of Object.values(world.settlers)) {
      if (o.targetBuilding === target.id) retreat(world, o);
    }
    return;
  }
  transferBuilding(world, target, s.owner);
  target.soldiers = [s.rank];
  deleteSettler(world, s);
  world.conquered.push(target.id);
  world.territoryDirty = true;
  // Weitere Angreifer ziehen ein, solange Platz ist; der Rest geht heim.
  for (const o of Object.values(world.settlers)) {
    if (o.targetBuilding !== target.id || o.owner !== target.owner) continue;
    o.targetBuilding = 0;
    if (target.soldiers.length < capacity(target) && !o.duel) {
      o.home = target.id;
      o.state = 'toBuilding';
      o.path = freePath(world, o.node, target.node) ?? [target.node];
    } else {
      retreat(world, o);
    }
  }
}

/**
 * Zerstört ein Gebäude durch Feuer (Gebietsverlust oder Eroberung des HQ). Bestand und Personen
 * gehen ins nächste Lager des Besitzers; beim HQ ohne weiteres Lager gehen sie verloren.
 */
export function destroyBuilding(world: World, b: Building): void {
  emit(world, 'burned', b.node, b.owner);
  world.fires.push({ node: b.node, type: b.type, until: world.tick + MILITARY.FIRE_TICKS });
  if (b.type !== 'hq') {
    const target = findNearestStoreAnywhere(world, b.owner, b.node, b.id);
    if (target) target.soldiers.push(...b.soldiers);
    b.soldiers = [];
    removeBuilding(world, b.id);
    return;
  }
  const target = findNearestStoreAnywhere(world, b.owner, b.node, b.id);
  for (const t of WARE_TYPES) {
    if (!b.stock[t]) continue;
    if (target) target.stock[t] += b.stock[t];
    else world.ledger[b.owner].wares[t] -= b.stock[t];
    b.stock[t] = 0;
  }
  if (target) {
    target.soldiers.push(...b.soldiers);
    for (const [job, n] of Object.entries(b.people)) {
      target.people[job as keyof typeof b.people] += n;
    }
  }
  for (const n of footprint(world, b.node, BUILDINGS[b.type].size)) {
    if (n >= 0 && world.nodeBuilding[n] === b.id) world.nodeBuilding[n] = 0;
  }
  const flag = world.flags[b.flag];
  if (flag) {
    flag.building = 0;
    if (flag.roads[Dir.NW] === SLOT_BUILDING) flag.roads[Dir.NW] = 0;
  }
  for (const o of Object.values(world.buildings)) {
    if (o.outQueue.length) o.outQueue = o.outQueue.filter((q) => q.dest !== b.id);
  }
  const p = world.players[b.owner];
  if (p.hq === b.id) p.hq = 0;
  delete world.buildings[b.id];
  markNetworkChanged(world);
}

/** Gebiet neu berechnen und alles entfernen, was danach auf fremdem Boden steht. */
export function applyTerritoryChange(world: World): void {
  world.territoryDirty = false;
  const forced = world.conquered;
  world.conquered = [];
  recomputeTerritory(world, forced);
  for (const id of Object.keys(world.buildings)) {
    const b = world.buildings[Number(id)];
    if (b && b.type !== 'hq' && world.owner[b.node] !== b.owner) destroyBuilding(world, b);
  }
  for (const id of Object.keys(world.flags)) {
    const f = world.flags[Number(id)];
    if (f && world.owner[f.node] !== f.owner && !f.building) removeFlag(world, f.id);
  }
  for (const id of Object.keys(world.roads)) {
    const r = world.roads[Number(id)];
    if (r && r.path.some((n) => world.owner[n] !== r.owner)) removeRoad(world, r.id);
  }
}
