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
export const JOBS = ['carrier', 'donkey'] as const;
export type Job = (typeof JOBS)[number];

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
