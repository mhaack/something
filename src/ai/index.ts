/**
 * Gegner-KI: regelbasiert. Sie liest den Weltzustand und erzeugt dieselben Befehle wie ein
 * menschlicher Spieler; diese landen wie alle Eingaben im Replay. Ihr einziger eigener Zustand ist
 * das Gedächtnis für Geologenfunde (`AiState`, außerhalb der Welt).
 */
import { AI } from '../data/balance';
import type { Command } from '../sim/commands';
import type { World } from '../sim/world';
import { think } from './brain';
import { memoryOf, type AiState } from './memory';

/** Befehle aller KI-Spieler für den nächsten Tick. */
export function aiCommands(world: World, state: AiState): Command[] {
  const out: Command[] = [];
  for (const p of world.players) {
    if (!p.ai || p.human || p.defeated) continue;
    if ((world.tick + p.id * AI.THINK_OFFSET) % AI.THINK_TICKS[p.ai] !== 0) continue;
    out.push(...think(world, p.id, p.ai, memoryOf(state, p.id)));
  }
  return out;
}

export { planAttack, think } from './brain';
export { createAiState, type AiState } from './memory';
