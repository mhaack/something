/**
 * Spielereingaben als serialisierbare Befehle. Jede Änderung am Weltzustand durch Spieler oder KI
 * läuft über einen Befehl, damit Replays (Seed + Befehlsliste) deterministisch nachspielbar sind.
 */

export type Command = { type: 'noop'; player: number };

/** Ein Eintrag im Replay: Befehl, der zu Beginn von `tick` angewendet wird. */
export interface ReplayEntry {
  tick: number;
  command: Command;
}
