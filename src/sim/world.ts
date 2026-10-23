import { START, TRANSPORT } from '../data/balance';
import type { Command } from './commands';
import { applyCommand } from './commandHandlers';
import type { Building, Flag, PlayerLedger, Road, Settler, Ware } from './entities';
import type { GameMap } from './map';
import { generateMap } from './mapgen';
import { createRng, type RngState } from './rng';
import { processRouteQueue, scheduleReroutes } from './routing';
import { updateSettler } from './carriers';
import { createHQ, requestWorkers, storeTick } from './store';

export const WORLD_VERSION = 2;

export interface Player {
  id: number;
  /** Farbindex für das Rendering. */
  color: number;
  human: boolean;
  /** Knoten des Hauptquartiers. */
  hqNode: number;
  /** Gebäude-ID des Hauptquartiers (0 = verloren). */
  hq: number;
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
}

export interface NewWorldOptions {
  seed: number | string;
  size: number;
  /** Gesamtzahl Spieler inkl. Mensch. */
  players: number;
}

export function createWorld(opts: NewWorldOptions): World {
  const players = Math.max(START.MIN_PLAYERS, Math.min(START.MAX_PLAYERS, opts.players));
  const { map, starts } = generateMap({ seed: opts.seed, size: opts.size, players });
  return createWorldFromMap(String(opts.seed), map, starts);
}

/** Erzeugt eine Welt auf einer vorgegebenen Karte (auch für Tests und Szenarien). */
export function createWorldFromMap(seed: string, map: GameMap, starts: number[]): World {
  const n = map.width * map.height;
  const world: World = {
    version: WORLD_VERSION,
    seed,
    tick: 0,
    rng: createRng(`${seed}:sim`),
    nextId: 1,
    map,
    players: starts.map((hqNode, id) => ({ id, color: id, human: id === 0, hqNode, hq: 0 })),
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
  };
  for (const p of world.players) createHQ(world, p);
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
  scheduleReroutes(world);
  processRouteQueue(world);
  if (world.tick % TRANSPORT.WORKER_REQUEST_INTERVAL_TICKS === 0) requestWorkers(world);
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
