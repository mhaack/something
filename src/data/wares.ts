/** Alle Warentypen des Spiels. Werkzeuge und Waffen sind ebenfalls Waren. */
export const WARE_TYPES = [
  'wood',
  'planks',
  'stone',
  'fish',
  'bread',
  'meat',
  'wheat',
  'flour',
  'water',
  'pig',
  'coal',
  'ironore',
  'goldore',
  'iron',
  'gold',
  'coins',
  'sword',
  'shield',
  'hammer',
  'shovel',
  'axe',
  'saw',
  'pick',
  'rod',
  'scythe',
  'cleaver',
  'rollingpin',
  'tongs',
  'crucible',
] as const;
export type WareType = (typeof WARE_TYPES)[number];

/** Berufe (Siedlerarten). Personen im Lager werden als Zähler geführt. */
export const JOBS = [
  'carrier',
  'donkey',
  'builder',
  'leveler',
  'woodcutter',
  'forester',
  'stonecutter',
  'sawyer',
  'fisher',
  'farmer',
  'waterer',
  'miller',
  'baker',
  'pigbreeder',
  'butcher',
  'donkeybreeder',
  'geologist',
  'miner',
  'smelter',
  'minter',
  'toolsmith',
  'weaponsmith',
] as const;
export type Job = (typeof JOBS)[number];

/** Werkzeug, mit dem aus einem Träger dieser Beruf wird (null = kein Werkzeug nötig). */
export const JOB_TOOLS: Record<Job, WareType | null> = {
  carrier: null,
  donkey: null,
  builder: 'hammer',
  leveler: 'shovel',
  woodcutter: 'axe',
  forester: 'shovel',
  stonecutter: 'pick',
  sawyer: 'saw',
  fisher: 'rod',
  farmer: 'scythe',
  waterer: null,
  miller: null,
  baker: 'rollingpin',
  pigbreeder: null,
  butcher: 'cleaver',
  donkeybreeder: null,
  geologist: 'hammer',
  miner: 'pick',
  smelter: 'crucible',
  minter: 'crucible',
  toolsmith: 'tongs',
  weaponsmith: 'hammer',
};

/** Werkzeuge, die die Werkzeugschmiede herstellen kann (Reihenfolge der Prioritätsliste). */
export const TOOL_WARES = [
  'hammer',
  'shovel',
  'axe',
  'saw',
  'pick',
  'rod',
  'scythe',
  'cleaver',
  'rollingpin',
  'tongs',
  'crucible',
] as const satisfies readonly WareType[];
export type ToolWare = (typeof TOOL_WARES)[number];

/** Nahrung, die Bergleute essen. */
export const FOOD: readonly WareType[] = ['fish', 'bread', 'meat'];

export type WareCounts = Record<WareType, number>;
export type JobCounts = Record<Job, number>;

export function emptyWareCounts(): WareCounts {
  const out = {} as WareCounts;
  for (const w of WARE_TYPES) out[w] = 0;
  return out;
}

export function emptyJobCounts(): JobCounts {
  const out = {} as JobCounts;
  for (const j of JOBS) out[j] = 0;
  return out;
}
