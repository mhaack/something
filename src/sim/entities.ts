import type { BuildingType } from '../data/buildings';
import type { Job, JobCounts, WareCounts, WareType } from '../data/wares';

export type BuildingStatus = 'ok' | 'noResources' | 'outputBlocked' | 'waitingInput';

/** Marker im Richtungsslot einer Flagge: hier hängt das Gebäude (NW-Richtung). */
export const SLOT_BUILDING = -1;

export interface Flag {
  id: number;
  owner: number;
  node: number;
  /** Waren-IDs auf der Flagge in Ankunftsreihenfolge. */
  wares: number[];
  /** Straße pro Richtung (Dir), 0 = frei, SLOT_BUILDING = Gebäude. */
  roads: number[];
  /** Gebäude an dieser Flagge (0 = keins). */
  building: number;
}

export interface Road {
  id: number;
  owner: number;
  /** Knotenfolge von Flagge A nach Flagge B (inklusive beider Flaggenknoten). */
  path: number[];
  flagA: number;
  flagB: number;
  /** Zugewiesene Träger (Siedler-IDs). Index 0: Träger, Index 1: Esel. 0 = keiner. */
  carriers: [number, number];
  /** Stark befahrene Straße (bekommt einen Esel). */
  busy: boolean;
  /** Transportierte Waren im aktuellen Auswertungsfenster. */
  traffic: number;
  /** Laufzeit in Ticks von A nach B bzw. B nach A (Steigung berücksichtigt). */
  costAB: number;
  costBA: number;
}

export type { BuildingType };

/** Bauzustand einer Baustelle. */
export interface Site {
  stage: 'level' | 'build';
  /** Knoten, die der Planierer auf `levelTarget` bringt. */
  levelNodes: number[];
  levelTarget: number;
  /** Bereits verbaute Bretter und Steine. */
  usedPlanks: number;
  usedStone: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  owner: number;
  node: number;
  flag: number;
  /** Lager: Bestand. Andere Gebäude: Eingangspuffer bzw. angeliefertes Baumaterial. */
  stock: WareCounts;
  /** Personen (nur Lager). */
  people: JobCounts;
  /** Baustelle (null = fertig). */
  site: Site | null;
  /** Zugewiesener Arbeiter: auf Baustellen Planierer/Bauarbeiter, sonst der Gebäudearbeiter. */
  worker: number;
  /** Letzter Arbeitsstatus für die Anzeige. */
  status: BuildingStatus;
  /** Produzierte Waren (Statistik). */
  produced: number;
  /** Ausgabewarteschlange: Waren, die das Lager auf seine Flagge legen soll. */
  outQueue: OutOrder[];
  outTimer: number;
  spawnTimer: number;
  /** Zähler automatisch entstandener Träger. */
  spawned: number;
}

export interface OutOrder {
  type: WareType;
  /** Zielgebäude (0 = keins). */
  dest: number;
  /** Zielflagge für Testwaren (0 = keine). */
  destFlag: number;
}

export interface Ware {
  id: number;
  type: WareType;
  owner: number;
  /** Aktuelle Flagge (0 = nicht auf einer Flagge). */
  flag: number;
  /** Tragender Siedler (0 = keiner). */
  carrier: number;
  /** Zielgebäude (0 = noch keins → nächstes Lager). */
  dest: number;
  /** Zielflagge (Testware), hat Vorrang vor dest. */
  destFlag: number;
  /** Nächste Straße von der aktuellen Flagge (0 = keine Route). */
  nextRoad: number;
  /** Siedler, der diese Ware abholen wird (0 = keiner). */
  reservedBy: number;
  /** Tick der Ankunft an der aktuellen Flagge. */
  since: number;
  /** Ware steht in der Routing-Warteschlange. */
  routePending: boolean;
}

export type SettlerState =
  | 'toRoad'
  | 'idle'
  | 'toMiddle'
  | 'fetch'
  | 'pickup'
  | 'carry'
  | 'drop'
  | 'enterBuilding'
  | 'leaveBuilding'
  | 'dropAndReturn'
  | 'returning'
  | 'enterStore'
  // Arbeiter
  | 'toBuilding'
  | 'inside'
  | 'toResource'
  | 'harvest'
  | 'toFlagOut'
  | 'outputWait'
  | 'enterHome'
  | 'producing'
  | 'leveling'
  | 'building'
  // Geologe
  | 'geoTravel'
  | 'geoWalk'
  | 'geoWork';

export interface Settler {
  id: number;
  owner: number;
  job: Job;
  state: SettlerState;
  /** Aktueller Knoten (bzw. Startknoten des laufenden Schritts). */
  node: number;
  /** Zielknoten des laufenden Schritts (-1 = steht). */
  next: number;
  progress: number;
  stepTicks: number;
  /** Verbleibende Knoten nach `next`. */
  path: number[];
  /** Zugewiesene Straße (0 = keine). */
  road: number;
  /** Getragene Ware (0 = keine). */
  ware: number;
  /** Ware, die am Ziel im Tausch aufgenommen wird (0 = keine). */
  swapWare: number;
  /** Ware, die abgeholt werden soll (0 = keine). */
  fetchWare: number;
  /** Flagge, zu der gerade geliefert bzw. gegangen wird (0 = keine). */
  targetFlag: number;
  /** Zielgebäude (Heimweg, Abliefern). */
  targetBuilding: number;
  /** Wartezeit für Aufnehmen/Ablegen bzw. Arbeit. */
  wait: number;
  /** Arbeitsstätte (0 = keine). */
  home: number;
  /** Zielknoten außerhalb (Baum, Fels, Pflanzplatz), -1 = keiner. */
  targetNode: number;
  /** Restzähler (z. B. verbleibende Probebohrungen des Geologen). */
  count: number;
}

/** Schild des Geologen: gefundener Bodenschatz an einem Knoten. */
export interface Sign {
  node: number;
  owner: number;
  /** Resource-ID (0 = nichts gefunden). */
  resource: number;
  /** 0 = wenig, 1 = viel. */
  rich: number;
  /** Tick, bis zu dem das Schild steht. */
  until: number;
}

export interface PlayerLedger {
  /** Je Warentyp: existierende Menge (Lager + unterwegs + Puffer). Ändert sich nur durch
   * Produktion, Verbrauch oder Zerstörung. */
  wares: WareCounts;
}
