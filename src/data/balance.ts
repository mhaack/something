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
  /** Fischbestand auf Wasserknoten nahe der Küste. */
  FISH_COAST_DISTANCE: 3,
  FISH_MIN: 2,
  FISH_MAX: 8,
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
  /** Maximaler Höhenunterschied zu den Nachbarn, damit ein Knoten als eben gilt (Startplatz). */
  BUILD_MAX_SLOPE: 3,
  /** Maximale Steigung rund um einen Bauplatz je Größe (der Planierer ebnet den Rest). */
  BUILD_SLOPE_SMALL: 6,
  BUILD_SLOPE_MEDIUM: 5,
  BUILD_SLOPE_LARGE: 4,
  /** Höhendifferenz pro Straßenschritt, ab der eine Straße als steil gilt (langsamer). */
  ROAD_STEEP_SLOPE: 4,
  /** Höhendifferenz pro Straßenschritt, ab der keine Straße gebaut werden darf. */
  ROAD_MAX_SLOPE: 9,
} as const;

export const VIEW = {
  /** Ziel-Basisbreiten der Zoomstufen in Pixeln (ganzzahlige Skalierung wird daraus berechnet). */
  ZOOM_BASE_WIDTHS: [960, 640, 480, 320] as const,
  DEFAULT_ZOOM: 1,
  /** Randscrollen: Breite der Randzone in CSS-Pixeln. */
  EDGE_SCROLL_MARGIN: 6,
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
  /** Stau-Overlay: ab so vielen Waren wird eine Flagge markiert. */
  CONGESTION_WARN: 5,
  /** Aktualisierungsintervall der Infofenster in ms. */
  PANEL_REFRESH_MS: 250,
  /** Anzeigedauer von Meldungen in ms. */
  TOAST_MS: 2500,
} as const;

export const TRANSPORT = {
  /** Mindestabstand zwischen zwei Flaggen in Knotenschritten. */
  FLAG_MIN_DISTANCE: 2,
  /** Warenpuffer einer Flagge. */
  FLAG_CAPACITY: 8,
  /** Notfall-Überlauf einer Flagge gegen Deadlocks in vollen Zyklen. */
  FLAG_OVERFLOW: 2,
  /** Wartezeit einer Ware in Ticks, ab der sie den Überlauf der Zielflagge nutzen darf. */
  OVERFLOW_WAIT_TICKS: 400,
  /** Ticks pro Schritt auf ebener Strecke. */
  WALK_TICKS_PER_STEP: 10,
  /** Faktor für steile Schritte bergauf bzw. bergab (Höhendifferenz ≥ ROAD_STEEP_SLOPE). */
  STEEP_UPHILL_FACTOR: 1.8,
  STEEP_DOWNHILL_FACTOR: 1.2,
  /** Zusätzlicher Faktor pro Höheneinheit bergauf (auch auf flachen Straßen). */
  UPHILL_PER_HEIGHT: 0.06,
  /** Ticks zum Aufnehmen bzw. Ablegen einer Ware. */
  PICKUP_TICKS: 4,
  DROP_TICKS: 4,
  /** Routing: Zusatzkosten (in Schritt-Ticks) pro wartender Ware an einer Flagge in Richtung Straße. */
  CONGESTION_COST: 12,
  /** Höchstzahl Routenberechnungen pro Tick (gedeckelt). */
  ROUTES_PER_TICK: 40,
  /** Intervall, in dem wartende Waren ihre Route mit aktuellen Stau-Kosten neu prüfen. */
  REROUTE_INTERVAL_TICKS: 100,
  /** Esel: Auswertungsfenster und Mindestzahl transportierter Waren für „stark befahren". */
  TRAFFIC_WINDOW_TICKS: 1200,
  BUSY_ROAD_THRESHOLD: 12,
  /** Wartende Träger suchen nur alle n Ticks nach Arbeit (gestaffelt nach ID). */
  IDLE_CHECK_INTERVAL: 4,
  /** Intervall, in dem fehlende Träger/Esel angefordert werden. */
  WORKER_REQUEST_INTERVAL_TICKS: 20,
  /** Höchstzahl Knotenexpansionen bei der Straßenplanung im Bau-Modus. */
  ROAD_PLAN_MAX_EXPANSIONS: 3000,
  /** Höchstzahl Knotenexpansionen für Querfeldein-Wege (A*). */
  FREE_WALK_MAX_EXPANSIONS: 20000,
} as const;

export const STORE = {
  /** Gebietsradius des Hauptquartiers (bis zum Territoriumssystem in Phase 6). */
  HQ_RADIUS: 9,
  /** Ticks zwischen zwei Waren, die ein Lager auf seine Flagge legt. */
  OUTPUT_TICKS: 10,
  /** Ein neuer Träger entsteht im Lager alle n Ticks. */
  CARRIER_SPAWN_TICKS: 600,
  /** Obergrenze für automatisch entstehende Träger pro Lager. */
  CARRIER_SPAWN_MAX: 60,
} as const;

/** Startbestand des Hauptquartiers. */
export const START_STOCK = {
  wares: {
    wood: 16,
    planks: 40,
    stone: 30,
    fish: 8,
    bread: 8,
    meat: 8,
    coal: 12,
    ironore: 8,
    iron: 6,
    hammer: 8,
    shovel: 4,
    axe: 4,
    saw: 2,
    pick: 4,
    rod: 2,
    scythe: 2,
    cleaver: 1,
    rollingpin: 1,
    tongs: 1,
    crucible: 1,
    sword: 0,
    shield: 0,
  },
  people: {
    carrier: 30,
    donkey: 4,
  },
} as const;

export const BUILD = {
  /** Ticks, die der Planierer für eine Höheneinheit an einem Knoten braucht. */
  LEVEL_STEP_TICKS: 24,
  /** Ticks, die der Bauarbeiter pro verbautem Material arbeitet. */
  BUILD_TICKS_PER_UNIT: 50,
  /** Intervall, in dem Gebäude Waren und Arbeiter anfordern. */
  REQUEST_INTERVAL_TICKS: 20,
  /** Wartezeit, bevor ein Arbeiter ohne Ressourcen erneut sucht. */
  NO_RESOURCE_RETRY_TICKS: 200,
} as const;

/** Gemeinsame Werte der Bergwerke: Nahrungspuffer je Sorte, Radius für Bodenschätze. */
const MINE_VALUES = {
  planks: 4,
  stone: 0,
  radius: 2,
  workTicks: 200,
  restTicks: 100,
  inputs: { fish: 2, bread: 2, meat: 2 },
} as const;

/** Werte pro Gebäudetyp. Kosten in Brettern/Steinen, Zeiten in Ticks, Radien in Knoten. */
export const BUILDING_VALUES = {
  hq: { planks: 0, stone: 0, radius: 0, workTicks: 0, restTicks: 0, inputs: {} },
  storehouse: { planks: 4, stone: 3, radius: 0, workTicks: 0, restTicks: 0, inputs: {} },
  woodcutter: { planks: 2, stone: 0, radius: 6, workTicks: 100, restTicks: 120, inputs: {} },
  forester: { planks: 2, stone: 0, radius: 5, workTicks: 60, restTicks: 220, inputs: {} },
  quarry: { planks: 2, stone: 0, radius: 6, workTicks: 120, restTicks: 120, inputs: {} },
  sawmill: { planks: 3, stone: 2, radius: 0, workTicks: 140, restTicks: 20, inputs: { wood: 6 } },
  fisher: { planks: 2, stone: 0, radius: 7, workTicks: 160, restTicks: 140, inputs: {} },
  farm: { planks: 3, stone: 1, radius: 3, workTicks: 80, restTicks: 100, inputs: {} },
  well: { planks: 2, stone: 0, radius: 0, workTicks: 80, restTicks: 100, inputs: {} },
  mill: { planks: 3, stone: 2, radius: 0, workTicks: 120, restTicks: 40, inputs: { wheat: 6 } },
  bakery: {
    planks: 3,
    stone: 2,
    radius: 0,
    workTicks: 140,
    restTicks: 40,
    inputs: { flour: 4, water: 4 },
  },
  pigfarm: {
    planks: 4,
    stone: 2,
    radius: 0,
    workTicks: 300,
    restTicks: 100,
    inputs: { wheat: 4, water: 4 },
  },
  butcher: { planks: 3, stone: 2, radius: 0, workTicks: 120, restTicks: 40, inputs: { pig: 4 } },
  donkeybreeder: {
    planks: 4,
    stone: 2,
    radius: 0,
    workTicks: 400,
    restTicks: 100,
    inputs: { wheat: 4, water: 4 },
  },
  smelter: {
    planks: 3,
    stone: 3,
    radius: 0,
    workTicks: 160,
    restTicks: 40,
    inputs: { ironore: 4, coal: 4 },
  },
  mint: {
    planks: 3,
    stone: 3,
    radius: 0,
    workTicks: 180,
    restTicks: 40,
    inputs: { goldore: 4, coal: 4 },
  },
  toolsmith: {
    planks: 3,
    stone: 2,
    radius: 0,
    workTicks: 160,
    restTicks: 40,
    inputs: { iron: 4, coal: 4 },
  },
  weaponsmith: {
    planks: 3,
    stone: 3,
    radius: 0,
    workTicks: 180,
    restTicks: 40,
    inputs: { iron: 4, coal: 4 },
  },
  coalmine: MINE_VALUES,
  ironmine: MINE_VALUES,
  goldmine: MINE_VALUES,
  granitemine: MINE_VALUES,
} as const;

export const FIELDS = {
  /** Ticks pro Wachstumsstufe eines Getreidefelds (Stufen 0..MATURE). */
  GROWTH_STAGE_TICKS: 900,
  MATURE_STAGE: 3,
} as const;

export const GEOLOGIST = {
  /** Suchradius um die Zielflagge. */
  RADIUS: 6,
  /** Zahl der Probebohrungen pro Einsatz. */
  SURVEYS: 8,
  WORK_TICKS: 60,
  /** Lebensdauer eines Schilds. */
  SIGN_LIFETIME_TICKS: 6000,
  /** Ab dieser Restmenge zeigt das Schild „viel“. */
  RICH_AMOUNT: 10,
} as const;

export const TREES = {
  /** Ticks pro Wachstumsstufe eines gepflanzten Baums (Stufen 0..MATURE). */
  GROWTH_STAGE_TICKS: 1100,
  /** Ausgewachsene Stufe (nur ausgewachsene Bäume werden gefällt). */
  MATURE_STAGE: 3,
} as const;

export const TOOLS = {
  /** Höchster Wert eines Prioritätsreglers. */
  PRIORITY_MAX: 10,
  /** Startpriorität je Werkzeug. */
  DEFAULT_PRIORITY: {
    hammer: 5,
    shovel: 5,
    axe: 5,
    saw: 3,
    pick: 5,
    rod: 3,
    scythe: 3,
    cleaver: 2,
    rollingpin: 2,
    tongs: 2,
    crucible: 2,
  },
} as const;

export const STATS = {
  /** Abstand zwischen zwei Statistik-Stichproben in Ticks (30 s bei 1x). */
  SAMPLE_INTERVAL_TICKS: 600,
  /** Gespeicherte Stichproben (120 × 30 s = 1 Stunde Spielzeit). */
  MAX_SAMPLES: 120,
} as const;
