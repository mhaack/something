import {
  BUILD,
  START,
  STOCK_FACTOR,
  TRANSPORT,
  type AiLevel,
  type StockLevel,
} from '../data/balance';
import type { Goal } from '../data/missions';
import { updateOutcome, type Outcome } from './outcome';
import { requestWares } from './buildings';
import { growTrees } from './trees';
import type { ToolWare } from '../data/wares';
import {
  defaultToolPriority,
  emptyStats,
  sampleStats,
  zeroToolCredit,
  type PlayerStats,
} from './economy';
import type { Command } from './commands';
import { applyCommand } from './commandHandlers';
import type { Building, Fire, Flag, PlayerLedger, Road, Settler, Sign, Ware } from './entities';
import { recomputeTerritory } from './territory';
import { applyTerritoryChange, militaryTick } from './military';
import type { GameMap } from './map';
import { generateMap } from './mapgen';
import { createRng, type RngState } from './rng';
import { processRouteQueue, scheduleReroutes } from './routing';
import { updateSettler } from './carriers';
import { createHQ, requestWorkers, storeTick } from './store';

export const WORLD_VERSION = 7;

export interface Player {
  id: number;
  /** Farbindex für das Rendering. */
  color: number;
  human: boolean;
  /** KI-Stufe (null = Mensch bzw. passiv). */
  ai: AiLevel | null;
  /** Kein Lager und kein besetztes Militärgebäude mehr. */
  defeated: boolean;
  /** Knoten des Hauptquartiers. */
  hqNode: number;
  /** Gebäude-ID des Hauptquartiers (0 = verloren). */
  hq: number;
  /** Prioritäten der Werkzeugschmiede (0 = nicht herstellen). */
  toolPriority: Record<ToolWare, number>;
  /** Guthaben für den gewichteten Rundlauf der Werkzeugwahl. */
  toolCredit: Record<ToolWare, number>;
}

/** Kompletter, JSON-serialisierbarer Weltzustand. */
export interface World {
  version: number;
  seed: string;
  tick: number;
  rng: RngState;
  nextId: number;
  map: GameMap;
  players: Player[];
  /** Besitzer pro Knoten (-1 = niemand). */
  owner: number[];
  /** Belegung pro Knoten: Flaggen-ID, Straßen-ID (nur Innenknoten), Gebäude-ID (0 = frei). */
  nodeFlag: number[];
  nodeRoad: number[];
  nodeBuilding: number[];
  flags: Record<number, Flag>;
  roads: Record<number, Road>;
  buildings: Record<number, Building>;
  settlers: Record<number, Settler>;
  wares: Record<number, Ware>;
  /** Waren, deren Route neu berechnet werden muss (gedeckelt pro Tick abgearbeitet). */
  routeQueue: number[];
  ledger: PlayerLedger[];
  /** Gepflanzte Bäume und Felder im Wachstum. */
  growing: { node: number; timer: number }[];
  /** Schilder des Geologen. */
  signs: Sign[];
  /** Zähler für Änderungen an Höhen und Kartenobjekten (für Render-Caches). */
  mapRevision: number;
  /** Produktions- und Bestandsstatistik je Spieler. */
  stats: PlayerStats[];
  /** Gebiet muss neu berechnet werden. */
  territoryDirty: boolean;
  /** Brennende Ruinen (Anzeige). */
  fires: Fire[];
  /** Seit der letzten Gebietsberechnung eroberte Gebäude. */
  conquered: number[];
  /** Spielmodus und Ziele. */
  setup: GameSetup;
  /** Ergebnis für den menschlichen Spieler (null = Spiel läuft). */
  outcome: Outcome | null;
}

export interface GameSetup {
  mode: 'free' | 'mission';
  /** Missionsnummer (0 = freies Spiel). */
  mission: number;
  stock: StockLevel;
  /** Siegbedingungen für Spieler 0 (leer = Endlosspiel). */
  goals: Goal[];
  /** Zeitlimit in Ticks (0 = keins). */
  timeLimit: number;
}

export function defaultSetup(): GameSetup {
  return { mode: 'free', mission: 0, stock: 'normal', goals: [{ type: 'conquer' }], timeLimit: 0 };
}

export interface NewWorldOptions {
  seed: number | string;
  size: number;
  /** Gesamtzahl Spieler inkl. Mensch. */
  players: number;
  /** KI-Stufe je Gegner (fehlende: `normal`). */
  ai?: AiLevel[];
  setup?: Partial<GameSetup>;
}

export function createWorld(opts: NewWorldOptions): World {
  const players = Math.max(START.MIN_PLAYERS, Math.min(START.MAX_PLAYERS, opts.players));
  const { map, starts } = generateMap({ seed: opts.seed, size: opts.size, players });
  return createWorldFromMap(String(opts.seed), map, starts, opts.setup, opts.ai);
}

/** Erzeugt eine Welt auf einer vorgegebenen Karte (auch für Tests und Szenarien). */
export function createWorldFromMap(
  seed: string,
  map: GameMap,
  starts: number[],
  setup: Partial<GameSetup> = {},
  ai: readonly AiLevel[] = [],
): World {
  const fullSetup: GameSetup = { ...defaultSetup(), ...setup };
  // Allein gibt es niemanden zu besiegen: dann nur die übrigen Ziele.
  if (starts.length < 2) fullSetup.goals = fullSetup.goals.filter((g) => g.type !== 'conquer');
  const n = map.width * map.height;
  const world: World = {
    version: WORLD_VERSION,
    seed,
    tick: 0,
    rng: createRng(`${seed}:sim`),
    nextId: 1,
    map,
    players: starts.map((hqNode, id) => ({
      id,
      color: id,
      human: id === 0,
      ai: id === 0 ? null : (ai[id - 1] ?? 'normal'),
      defeated: false,
      hqNode,
      hq: 0,
      toolPriority: defaultToolPriority(),
      toolCredit: zeroToolCredit(),
    })),
    owner: new Array<number>(n).fill(-1),
    nodeFlag: new Array<number>(n).fill(0),
    nodeRoad: new Array<number>(n).fill(0),
    nodeBuilding: new Array<number>(n).fill(0),
    flags: {},
    roads: {},
    buildings: {},
    settlers: {},
    wares: {},
    routeQueue: [],
    ledger: [],
    growing: [],
    signs: [],
    mapRevision: 0,
    stats: starts.map(() => emptyStats()),
    territoryDirty: false,
    fires: [],
    conquered: [],
    setup: fullSetup,
    outcome: null,
  };
  for (const p of world.players) createHQ(world, p, STOCK_FACTOR[fullSetup.stock]);
  recomputeTerritory(world);
  return world;
}

export function allocId(world: World): number {
  return world.nextId++;
}

/** Ein Simulationsschritt. */
export function step(world: World, commands: readonly Command[] = []): void {
  for (const c of commands) applyCommand(world, c);
  // Schlüssel vorab sammeln: Während des Ticks entstehen und verschwinden Entities.
  for (const id of Object.keys(world.buildings)) {
    const b = world.buildings[Number(id)];
    if (b) storeTick(world, b);
  }
  for (const id of Object.keys(world.settlers)) {
    const s = world.settlers[Number(id)];
    if (s) updateSettler(world, s);
  }
  militaryTick(world);
  if (world.territoryDirty) applyTerritoryChange(world);
  growTrees(world);
  sampleStats(world);
  if (world.tick % BUILD.REQUEST_INTERVAL_TICKS === 0 && world.signs.length) {
    world.signs = world.signs.filter((s) => s.until > world.tick);
  }
  if (world.tick % BUILD.REQUEST_INTERVAL_TICKS === 0) requestWares(world);
  scheduleReroutes(world);
  processRouteQueue(world);
  if (world.tick % TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS === 0) requestWorkers(world);
  updateOutcome(world);
  if (world.tick % TRANSPORT.TRAFFIC_WINDOW_TICKS === TRANSPORT.TRAFFIC_WINDOW_TICKS - 1) {
    for (const id in world.roads) {
      const r = world.roads[id];
      if (r.traffic >= TRANSPORT.BUSY_ROAD_THRESHOLD) r.busy = true;
      r.traffic = 0;
    }
  }
  world.tick++;
}

export function serializeWorld(world: World): string {
  return JSON.stringify(world);
}

export function deserializeWorld(json: string): World {
  const w = JSON.parse(json) as World;
  if (w.version !== WORLD_VERSION) {
    throw new Error(`Unbekannte Spielstandversion ${w.version}`);
  }
  return w;
}
