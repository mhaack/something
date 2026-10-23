/** Gebäudedefinitionen. Zahlenwerte kommen aus balance.ts (BUILDING_VALUES). */
import { BUILDING_VALUES } from './balance';
import { Resource, type ResourceId } from './terrain';
import { FOOD, type Job, type WareType } from './wares';

export type BuildingType = keyof typeof BUILDING_VALUES;
export type BuildingSize = 'small' | 'medium' | 'large' | 'mine';

/** Art der Arbeit, die das Gebäude verrichtet. */
export type WorkKind =
  'store' | 'woodcutter' | 'forester' | 'quarry' | 'workshop' | 'fisher' | 'farm' | 'mine';

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
  /** Verbrauch pro Zyklus: eine Einheit irgendeiner dieser Waren (Bergwerke: Nahrung). */
  consumesAny: WareType[];
  /** Abgebauter Bodenschatz (Bergwerke). */
  resource: ResourceId;
  /** Menügruppe. */
  group: 'basic' | 'food' | 'mining' | 'store';
  /** Eingangspuffer pro Ware. */
  inputs: Partial<Record<WareType, number>>;
  cost: { planks: number; stone: number };
  radius: number;
  workTicks: number;
  restTicks: number;
  /** Kann vom Spieler gebaut werden. */
  buildable: boolean;
}

interface DefExtra {
  consumes?: Partial<Record<WareType, number>>;
  consumesAny?: WareType[];
  resource?: ResourceId;
  buildable?: boolean;
}

function def(
  type: BuildingType,
  size: BuildingSize,
  kind: WorkKind,
  group: BuildingDef['group'],
  worker: Job | null,
  output: WareType | null,
  extra: DefExtra = {},
): BuildingDef {
  const v = BUILDING_VALUES[type];
  return {
    type,
    size,
    kind,
    group,
    worker,
    output,
    consumes: extra.consumes ?? {},
    consumesAny: extra.consumesAny ?? [],
    resource: extra.resource ?? Resource.None,
    inputs: v.inputs as Partial<Record<WareType, number>>,
    cost: { planks: v.planks, stone: v.stone },
    radius: v.radius,
    workTicks: v.workTicks,
    restTicks: v.restTicks,
    buildable: extra.buildable ?? true,
  };
}

const MINE = (resource: ResourceId): DefExtra => ({ consumesAny: [...FOOD], resource });

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  hq: def('hq', 'large', 'store', 'store', null, null, { buildable: false }),
  storehouse: def('storehouse', 'medium', 'store', 'store', null, null),
  woodcutter: def('woodcutter', 'small', 'woodcutter', 'basic', 'woodcutter', 'wood'),
  forester: def('forester', 'small', 'forester', 'basic', 'forester', null),
  quarry: def('quarry', 'small', 'quarry', 'basic', 'stonecutter', 'stone'),
  sawmill: def('sawmill', 'medium', 'workshop', 'basic', 'sawyer', 'planks', {
    consumes: { wood: 1 },
  }),
  fisher: def('fisher', 'small', 'fisher', 'food', 'fisher', 'fish'),
  farm: def('farm', 'large', 'farm', 'food', 'farmer', 'wheat'),
  well: def('well', 'small', 'workshop', 'food', 'waterer', 'water'),
  mill: def('mill', 'medium', 'workshop', 'food', 'miller', 'flour', { consumes: { wheat: 1 } }),
  bakery: def('bakery', 'medium', 'workshop', 'food', 'baker', 'bread', {
    consumes: { flour: 1, water: 1 },
  }),
  pigfarm: def('pigfarm', 'large', 'workshop', 'food', 'pigbreeder', 'pig', {
    consumes: { wheat: 1, water: 1 },
  }),
  butcher: def('butcher', 'medium', 'workshop', 'food', 'butcher', 'meat', {
    consumes: { pig: 1 },
  }),
  coalmine: def('coalmine', 'mine', 'mine', 'mining', 'miner', 'coal', MINE(Resource.Coal)),
  ironmine: def('ironmine', 'mine', 'mine', 'mining', 'miner', 'ironore', MINE(Resource.Iron)),
  goldmine: def('goldmine', 'mine', 'mine', 'mining', 'miner', 'goldore', MINE(Resource.Gold)),
  granitemine: def(
    'granitemine',
    'mine',
    'mine',
    'mining',
    'miner',
    'stone',
    MINE(Resource.Granite),
  ),
};

/** Reihenfolge im Baumenü. */
export const BUILD_MENU: BuildingType[] = [
  'woodcutter',
  'forester',
  'quarry',
  'sawmill',
  'fisher',
  'farm',
  'well',
  'mill',
  'bakery',
  'pigfarm',
  'butcher',
  'coalmine',
  'ironmine',
  'goldmine',
  'granitemine',
  'storehouse',
];

const SIZE_RANK: Record<BuildingSize, number> = { small: 1, medium: 2, large: 3, mine: 0 };

/** Passt ein Gebäude der Größe `need` auf einen Platz der Größe `have`? */
export function sizeFits(need: BuildingSize, have: BuildingSize | null): boolean {
  if (!have) return false;
  if (need === 'mine' || have === 'mine') return need === have;
  return SIZE_RANK[have] >= SIZE_RANK[need];
}
