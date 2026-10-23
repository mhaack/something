/** Terraintypen pro Dreieck und ihre Eigenschaften. */

export const Terrain = {
  Water: 0,
  Swamp: 1,
  Meadow1: 2,
  Meadow2: 3,
  Meadow3: 4,
  Desert: 5,
  Mountain: 6,
  Snow: 7,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainInfo {
  /** Schlüssel für i18n und Paletten. */
  key: string;
  walkable: boolean;
  /** Gebäude (klein/mittel/groß) dürfen hier stehen. */
  buildable: boolean;
  /** Bergwerke dürfen hier stehen. */
  minable: boolean;
  /** Bäume können hier wachsen. */
  arable: boolean;
}

export const TERRAIN_INFO: Record<TerrainId, TerrainInfo> = {
  [Terrain.Water]: {
    key: 'water',
    walkable: false,
    buildable: false,
    minable: false,
    arable: false,
  },
  [Terrain.Swamp]: {
    key: 'swamp',
    walkable: false,
    buildable: false,
    minable: false,
    arable: false,
  },
  [Terrain.Meadow1]: {
    key: 'meadow',
    walkable: true,
    buildable: true,
    minable: false,
    arable: true,
  },
  [Terrain.Meadow2]: {
    key: 'meadow',
    walkable: true,
    buildable: true,
    minable: false,
    arable: true,
  },
  [Terrain.Meadow3]: {
    key: 'meadow',
    walkable: true,
    buildable: true,
    minable: false,
    arable: true,
  },
  [Terrain.Desert]: {
    key: 'desert',
    walkable: true,
    buildable: false,
    minable: false,
    arable: false,
  },
  [Terrain.Mountain]: {
    key: 'mountain',
    walkable: true,
    buildable: false,
    minable: true,
    arable: false,
  },
  [Terrain.Snow]: { key: 'snow', walkable: false, buildable: false, minable: false, arable: false },
};

export function terrainInfo(t: number): TerrainInfo {
  return TERRAIN_INFO[t as TerrainId];
}

/** Objekte auf Knoten. */
export const MapObject = {
  None: 0,
  Tree: 1,
  Rock: 2,
  /** Getreidefeld (objectData = Wachstumsstufe). */
  Field: 3,
} as const;
export type MapObjectId = (typeof MapObject)[keyof typeof MapObject];

/** Unsichtbare Bodenschätze in Bergen. */
export const Resource = {
  None: 0,
  Coal: 1,
  Iron: 2,
  Gold: 3,
  Granite: 4,
  /** Fischbestand auf Wasserknoten. */
  Fish: 5,
} as const;
export type ResourceId = (typeof Resource)[keyof typeof Resource];
