/**
 * Warenverteilung: Gruppen knapper Waren und die Betriebe, die darum konkurrieren. Gewichte je
 * Betriebsart (0 = bekommt nichts) stehen in balance.ts (DISTRIBUTION).
 */
import type { BuildingType } from './buildings';
import type { WareType } from './wares';

export interface DistributionGroup {
  wares: readonly WareType[];
  consumers: readonly BuildingType[];
}

export const DISTRIBUTION_GROUPS = {
  food: {
    wares: ['fish', 'bread', 'meat'],
    consumers: ['coalmine', 'ironmine', 'goldmine', 'granitemine'],
  },
  coal: { wares: ['coal'], consumers: ['smelter', 'mint', 'toolsmith', 'weaponsmith'] },
  iron: { wares: ['iron'], consumers: ['toolsmith', 'weaponsmith'] },
  wheat: { wares: ['wheat'], consumers: ['mill', 'pigfarm', 'donkeybreeder'] },
  water: { wares: ['water'], consumers: ['bakery', 'pigfarm', 'donkeybreeder'] },
  coins: { wares: ['coins'], consumers: ['guardhut', 'watchtower', 'fortress'] },
} as const satisfies Record<string, DistributionGroup>;

export type DistributionGroupId = keyof typeof DISTRIBUTION_GROUPS;
export const DISTRIBUTION_GROUP_IDS = Object.keys(DISTRIBUTION_GROUPS) as DistributionGroupId[];

/** Gruppe einer Ware (oder null, wenn sie nicht verteilt wird). */
export function groupOfWare(type: WareType): DistributionGroupId | null {
  for (const g of DISTRIBUTION_GROUP_IDS) {
    if ((DISTRIBUTION_GROUPS[g].wares as readonly WareType[]).includes(type)) return g;
  }
  return null;
}
