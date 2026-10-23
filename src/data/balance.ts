/**
 * Alle Spielwerte zentral. Nirgends sonst Zahlenwerte für Dauer, Kosten, Kapazitäten oder Radien.
 */

export const SIM = {
  /** Simulationsticks pro Sekunde bei 1x-Tempo. */
  TICKS_PER_SECOND: 20,
  /** Erlaubte Tempostufen. */
  SPEEDS: [1, 2, 4, 8] as const,
  /** Maximale Ticks pro gerendertem Frame (Schutz gegen Spirale nach Tab-Wechsel). */
  MAX_TICKS_PER_FRAME: 40,
} as const;

export const MAP = {
  /** Wählbare Kartengrößen (quadratisch, in Knoten). */
  SIZES: [64, 128, 256] as const,
  DEFAULT_SIZE: 128,
  MAX_HEIGHT: 48,
  /** Höhenanteile (0..1 des Höhenbereichs) für die Terrainklassen. */
  WATER_LEVEL: 0.3,
  MOUNTAIN_LEVEL: 0.66,
  SNOW_LEVEL: 0.84,
  /** Breite des Randabfalls ins Wasser: Anteil der Kartengröße, gedeckelt in Knoten. */
  BORDER_FALLOFF_SHARE: 0.07,
  BORDER_FALLOFF_MAX: 10,
  BORDER_FALLOFF_MIN: 4,
  /** Noise-Parameter. */
  HEIGHT_OCTAVES: 5,
  HEIGHT_BASE_PERIOD: 48,
  MOISTURE_PERIOD: 40,
  FOREST_PERIOD: 20,
  /** Feuchte-Schwellen: darüber Sumpf (nur nahe Wasserhöhe), darunter Wüste. */
  SWAMP_MOISTURE: 0.72,
  SWAMP_MAX_HEIGHT: 0.38,
  DESERT_MOISTURE: 0.24,
  /** Waldschwelle und Baumdichte im Wald. */
  FOREST_THRESHOLD: 0.58,
  FOREST_DENSITY: 0.55,
  /** Einzelbäume außerhalb von Wäldern. */
  SCATTER_TREE_CHANCE: 0.02,
  /** Felscluster: Anzahl pro 1000 Knoten, Radius, Dichte. */
  ROCK_CLUSTERS_PER_1000: 0.9,
  ROCK_CLUSTER_RADIUS: 2,
  ROCK_DENSITY: 0.6,
  /** Größe eines Felsens (Steineinheiten). */
  ROCK_STONE_MIN: 4,
  ROCK_STONE_MAX: 8,
  /** Rohstoffe in Bergen. */
  RESOURCE_PERIOD: 14,
  RESOURCE_THRESHOLD: 0.55,
  RESOURCE_MAX_AMOUNT: 20,
} as const;

export const START = {
  /** Spieleranzahl insgesamt (inkl. Mensch). */
  MIN_PLAYERS: 1,
  MAX_PLAYERS: 4,
  /** Radius um das HQ, der frei und überwiegend bebaubar sein muss. */
  CLEAR_RADIUS: 3,
  /** Prüfradius für Bebaubarkeit bei der Kandidatensuche. */
  BUILDABLE_RADIUS: 6,
  MIN_BUILDABLE_SHARE: 0.7,
  /** Fairness-Ausgleich: im Ressourcenradius garantierte Mindestzahl Bäume/Felsen. */
  RESOURCE_RADIUS: 12,
  MIN_TREES: 30,
  MIN_ROCKS: 6,
  /** Maximal gesuchte Berg-Distanz (nur Bewertung, kein Ausgleich). */
  MOUNTAIN_SEARCH_RADIUS: 20,
} as const;

export const TERRAIN_RULES = {
  /** Maximaler Höhenunterschied zu den Nachbarn, damit ein Knoten als eben gilt (Bauplatz). */
  BUILD_MAX_SLOPE: 3,
  /** Großer Bauplatz verlangt zusätzlich ebene zweite Nachbarschaft bis zu diesem Wert. */
  BUILD_LARGE_MAX_SLOPE: 4,
  /** Höhendifferenz pro Straßenschritt, ab der eine Straße als steil gilt (langsamer). */
  ROAD_STEEP_SLOPE: 4,
  /** Höhendifferenz pro Straßenschritt, ab der keine Straße gebaut werden darf. */
  ROAD_MAX_SLOPE: 9,
} as const;

export const VIEW = {
  /** Ziel-Basisbreiten der Zoomstufen in Pixeln (ganzzahlige Skalierung wird daraus berechnet). */
  ZOOM_BASE_WIDTHS: [640, 480, 320] as const,
  DEFAULT_ZOOM: 1,
  /** Scrollgeschwindigkeit der Tastatur in Basispixeln pro Sekunde. */
  KEY_SCROLL_SPEED: 360,
  /** Chunkgröße des Terrain-Caches in Knoten. */
  TERRAIN_CHUNK: 8,
  /** Maximal neu gerasterte Terrain-Chunks pro Frame. */
  TERRAIN_CHUNKS_PER_FRAME: 8,
  /** Maximal gecachte Terrain-Chunks (LRU). */
  TERRAIN_CACHE_MAX: 160,
  /** Pixel pro Knoten der Minikarte (horizontal doppelt, wegen 2:1-Kachelseitenverhältnis). */
  MINIMAP_MAX_PIXELS: 192,
} as const;
