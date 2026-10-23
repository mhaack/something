/**
 * Gedächtnis der KI: was ihre Geologen gefunden haben und wo schon gesucht wurde. Schilder
 * verschwinden nach einer Weile; ein menschlicher Spieler merkt sich die Funde, die KI auch.
 *
 * Das Gedächtnis liegt bewusst außerhalb des Weltzustands: Die Simulation liest es nie, Replays
 * (die nur Befehle abspielen) bleiben damit exakt. Es besteht nur aus Zahlen und ist
 * JSON-serialisierbar (für Spielstände).
 */
import { AI } from '../data/balance';
import type { World } from '../sim/world';

export interface Deposit {
  node: number;
  resource: number;
  rich: number;
}

export interface AiMemory {
  deposits: Deposit[];
  /** Knoten, an denen schon gebohrt wurde (auch ohne Fund). */
  surveyed: number[];
}

export interface AiState {
  players: Record<number, AiMemory>;
}

export function createAiState(): AiState {
  return { players: {} };
}

export function memoryOf(state: AiState, player: number): AiMemory {
  return (state.players[player] ??= { deposits: [], surveyed: [] });
}

/** Übernimmt neue Schilder des Spielers ins Gedächtnis. */
export function remember(world: World, player: number, mem: AiMemory): void {
  for (const s of world.signs) {
    if (s.owner !== player) continue;
    if (!mem.surveyed.includes(s.node)) mem.surveyed.push(s.node);
    if (s.resource && !mem.deposits.some((d) => d.node === s.node)) {
      mem.deposits.push({ node: s.node, resource: s.resource, rich: s.rich });
    }
  }
  if (mem.surveyed.length > AI.MEMORY_MAX)
    mem.surveyed.splice(0, mem.surveyed.length - AI.MEMORY_MAX);
  if (mem.deposits.length > AI.MEMORY_MAX)
    mem.deposits.splice(0, mem.deposits.length - AI.MEMORY_MAX);
}
