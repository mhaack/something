import { START } from '../data/balance';
import type { Command } from './commands';
import type { GameMap } from './map';
import { generateMap } from './mapgen';
import { createRng, type RngState } from './rng';

export const WORLD_VERSION = 1;

export interface Player {
  id: number;
  /** Farbindex für das Rendering. */
  color: number;
  human: boolean;
  /** Knoten des Hauptquartiers. */
  hqNode: number;
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
  return {
    version: WORLD_VERSION,
    seed: String(opts.seed),
    tick: 0,
    rng: createRng(`${opts.seed}:sim`),
    nextId: 1,
    map,
    players: starts.map((hqNode, id) => ({ id, color: id, human: id === 0, hqNode })),
  };
}

export function allocId(world: World): number {
  return world.nextId++;
}

/** Wendet einen Spielerbefehl an. Wird nur zu Tickbeginn aufgerufen. */
export function applyCommand(_world: World, cmd: Command): void {
  switch (cmd.type) {
    case 'noop':
      break;
  }
}

/** Ein Simulationsschritt. */
export function step(world: World, commands: readonly Command[] = []): void {
  for (const c of commands) applyCommand(world, c);
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
