/**
 * Warenbuchführung und Statistik: Jede Produktion und jeder Verbrauch läuft über diese
 * Funktionen, damit Warenbuch (Invariante) und Statistik immer zusammenpassen.
 * Außerdem die Werkzeugwahl der Schmiede nach der Prioritätsliste des Spielers.
 */
import { STATS, TOOLS, WEAPONS } from '../data/balance';
import {
  TOOL_WARES,
  WARE_TYPES,
  WEAPON_WARES,
  type WeaponWare,
  emptyWareCounts,
  type ToolWare,
  type WareCounts,
  type WareType,
} from '../data/wares';
import type { World } from './world';

export interface StatsSample {
  tick: number;
  /** Bestand je Ware (Reihenfolge WARE_TYPES). */
  stock: number[];
  /** Kumulierte Produktion bzw. Verbrauch je Ware bis zu diesem Zeitpunkt. */
  produced: number[];
  consumed: number[];
}

export interface PlayerStats {
  produced: WareCounts;
  consumed: WareCounts;
  samples: StatsSample[];
}

export function emptyStats(): PlayerStats {
  return { produced: emptyWareCounts(), consumed: emptyWareCounts(), samples: [] };
}

export function defaultToolPriority(): Record<ToolWare, number> {
  const out = {} as Record<ToolWare, number>;
  for (const t of TOOL_WARES) out[t] = TOOLS.DEFAULT_PRIORITY[t];
  return out;
}

export function zeroToolCredit(): Record<ToolWare, number> {
  const out = {} as Record<ToolWare, number>;
  for (const t of TOOL_WARES) out[t] = 0;
  return out;
}

export function defaultWeaponPriority(): Record<WeaponWare, number> {
  return { ...WEAPONS.DEFAULT_PRIORITY };
}

export function zeroWeaponCredit(): Record<WeaponWare, number> {
  return { sword: 0, shield: 0 };
}

/** Bucht neu entstandene Waren. */
export function recordProduced(world: World, owner: number, type: WareType, n = 1): void {
  world.ledger[owner].wares[type] += n;
  world.stats[owner].produced[type] += n;
}

/** Bucht verbrauchte Waren (verarbeitet, verbaut, gegessen, als Werkzeug ausgegeben). */
export function recordConsumed(world: World, owner: number, type: WareType, n = 1): void {
  world.ledger[owner].wares[type] -= n;
  world.stats[owner].consumed[type] += n;
}

/** Nimmt in festen Abständen eine Stichprobe für die Verlaufsdiagramme. */
export function sampleStats(world: World): void {
  if (world.tick % STATS.SAMPLE_INTERVAL_TICKS !== 0) return;
  for (const p of world.players) {
    const st = world.stats[p.id];
    const ledger = world.ledger[p.id].wares;
    st.samples.push({
      tick: world.tick,
      stock: WARE_TYPES.map((t) => ledger[t]),
      produced: WARE_TYPES.map((t) => st.produced[t]),
      consumed: WARE_TYPES.map((t) => st.consumed[t]),
    });
    if (st.samples.length > STATS.MAX_SAMPLES) st.samples.shift();
  }
}

export function hasToolOrders(world: World, owner: number): boolean {
  const prio = world.players[owner].toolPriority;
  return TOOL_WARES.some((t) => prio[t] > 0);
}

/**
 * Wählt das nächste Werkzeug per gewichtetem Rundlauf: Jedes Werkzeug sammelt pro Zyklus seine
 * Priorität als Guthaben, das höchste Guthaben gewinnt und zahlt die Summe aller Prioritäten.
 * So entstehen Werkzeuge im Verhältnis ihrer Prioritäten, gleichmäßig verteilt und deterministisch.
 */
export function chooseTool(world: World, owner: number): ToolWare | null {
  const p = world.players[owner];
  let sum = 0;
  for (const t of TOOL_WARES) sum += p.toolPriority[t];
  if (sum <= 0) return null;
  let best: ToolWare | null = null;
  for (const t of TOOL_WARES) {
    if (p.toolPriority[t] <= 0) continue;
    p.toolCredit[t] += p.toolPriority[t];
    if (!best || p.toolCredit[t] > p.toolCredit[best]) best = t;
  }
  p.toolCredit[best!] -= sum;
  return best;
}

export function hasWeaponOrders(world: World, owner: number): boolean {
  const prio = world.players[owner].weaponPriority;
  return WEAPON_WARES.some((t) => prio[t] > 0);
}

/** Nächste Waffe im gewichteten Rundlauf über die Prioritäten (null = keine gewünscht). */
export function chooseWeapon(world: World, owner: number): WeaponWare | null {
  const p = world.players[owner];
  let sum = 0;
  for (const t of WEAPON_WARES) sum += p.weaponPriority[t];
  if (sum <= 0) return null;
  let best: WeaponWare | null = null;
  for (const t of WEAPON_WARES) {
    if (p.weaponPriority[t] <= 0) continue;
    p.weaponCredit[t] += p.weaponPriority[t];
    if (!best || p.weaponCredit[t] > p.weaponCredit[best]) best = t;
  }
  p.weaponCredit[best!] -= sum;
  return best;
}
