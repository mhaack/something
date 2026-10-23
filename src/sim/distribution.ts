/**
 * Warenverteilung nach Gewichten (Annahme A50). Konkurrieren mehrere Betriebsarten um eine knappe
 * Ware, bekommen sie Lieferungen im Verhältnis ihrer Gewichte (gewichteter Rundlauf über ein
 * Guthaben je Betriebsart, wie bei den Werkzeugprioritäten). Gewicht 0 = keine Lieferungen.
 */
import { DISTRIBUTION } from '../data/balance';
import type { BuildingType } from '../data/buildings';
import {
  DISTRIBUTION_GROUPS,
  DISTRIBUTION_GROUP_IDS,
  groupOfWare,
  type DistributionGroupId,
} from '../data/distribution';
import type { WareType } from '../data/wares';
import type { World } from './world';

export type Distribution = Record<DistributionGroupId, Record<string, number>>;

export function defaultDistribution(): Distribution {
  const out = {} as Distribution;
  for (const g of DISTRIBUTION_GROUP_IDS) {
    out[g] = {};
    for (const c of DISTRIBUTION_GROUPS[g].consumers) out[g][c] = DISTRIBUTION.DEFAULT[g]?.[c] ?? 0;
  }
  return out;
}

export function zeroDistributionCredit(): Distribution {
  const out = {} as Distribution;
  for (const g of DISTRIBUTION_GROUP_IDS) {
    out[g] = {};
    for (const c of DISTRIBUTION_GROUPS[g].consumers) out[g][c] = 0;
  }
  return out;
}

/** Ist diese Betriebsart Abnehmer in der Gruppe der Ware? Liefert die Gruppe oder null. */
export function contested(type: WareType, building: BuildingType): DistributionGroupId | null {
  const g = groupOfWare(type);
  if (!g) return null;
  return (DISTRIBUTION_GROUPS[g].consumers as readonly BuildingType[]).includes(building)
    ? g
    : null;
}

/** Gewicht eines Betriebs für eine Ware (nicht verteilte Waren: immer 1). */
export function weightOf(
  world: World,
  owner: number,
  type: WareType,
  building: BuildingType,
): number {
  const g = contested(type, building);
  return g ? (world.players[owner].distribution[g][building] ?? 0) : 1;
}

export function creditOf(
  world: World,
  owner: number,
  g: DistributionGroupId,
  building: string,
): number {
  return world.players[owner].distCredit[g][building] ?? 0;
}

/**
 * Bucht eine Lieferung an `building` unter den gerade konkurrierenden Betriebsarten: Alle
 * Beteiligten bekommen ihr Gewicht gutgeschrieben, der Belieferte zahlt die Summe.
 */
export function chargeDelivery(
  world: World,
  owner: number,
  g: DistributionGroupId,
  building: string,
  participants: ReadonlySet<string>,
): void {
  const p = world.players[owner];
  let sum = 0;
  for (const c of participants) {
    const w = p.distribution[g][c] ?? 0;
    p.distCredit[g][c] += w;
    sum += w;
  }
  p.distCredit[g][building] -= sum;
}
