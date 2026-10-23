/** Gebäudedefinitionen. Zahlenwerte kommen aus balance.ts (BUILDING_VALUES). */
import { BUILDING_VALUES } from './balance';
import type { Job, WareType } from './wares';

export type BuildingType = keyof typeof BUILDING_VALUES;
export type BuildingSize = 'small' | 'medium' | 'large' | 'mine';

/** Art der Arbeit, die das Gebäude verrichtet. */
export type WorkKind = 'store' | 'woodcutter' | 'forester' | 'quarry' | 'workshop';

export interface BuildingDef {
  type: BuildingType;
  size: BuildingSize;
  kind: WorkKind;
  /** Arbeiterberuf (null = kein Arbeiter). */
  worker: Job | null;
  /** Erzeugte Ware (null = keine). */
  output: WareType | null;
  /** Verbrauch pro Zyklus (Werkstätten). */
  consumes: Partial<Record<WareType, number>>;
  /** Eingangspuffer pro Ware. */
  inputs: Partial<Record<WareType, number>>;
  cost: { planks: number; stone: number };
  radius: number;
  workTicks: number;
  restTicks: number;
  /** Kann vom Spieler gebaut werden. */
  buildable: boolean;
}

function def(
  type: BuildingType,
  size: BuildingSize,
  kind: WorkKind,
  worker: Job | null,
  output: WareType | null,
  consumes: Partial<Record<WareType, number>> = {},
  buildable = true,
): BuildingDef {
  const v = BUILDING_VALUES[type];
  return {
    type,
    size,
    kind,
    worker,
    output,
    consumes,
    inputs: v.inputs as Partial<Record<WareType, number>>,
    cost: { planks: v.planks, stone: v.stone },
    radius: v.radius,
    workTicks: v.workTicks,
    restTicks: v.restTicks,
    buildable,
  };
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: def('hq', 'large', 'store', null, null, {}, false),
  storehouse: def('storehouse', 'medium', 'store', null, null),
  woodcutter: def('woodcutter', 'small', 'woodcutter', 'woodcutter', 'wood'),
  forester: def('forester', 'small', 'forester', 'forester', null),
  quarry: def('quarry', 'small', 'quarry', 'stonecutter', 'stone'),
  sawmill: def('sawmill', 'medium', 'workshop', 'sawyer', 'planks', { wood: 1 }),
};

/** Reihenfolge im Baumenü. */
export const BUILD_MENU: BuildingType[] = [
  'woodcutter',
  'forester',
  'quarry',
  'sawmill',
  'storehouse',
];

const SIZE_RANK: Record<BuildingSize, number> = { small: 1, medium: 2, large: 3, mine: 0 };

/** Passt ein Gebäude der Größe `need` auf einen Platz der Größe `have`? */
export function sizeFits(need: BuildingSize, have: BuildingSize | null): boolean {
  if (!have) return false;
  if (need === 'mine' || have === 'mine') return need === have;
  return SIZE_RANK[have] >= SIZE_RANK[need];
}
