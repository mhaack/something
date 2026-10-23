/**
 * Spielereignisse für Anzeige und Ton. Die Simulation sammelt sie pro Tick in `world.events`
 * (am Tickanfang geleert). Sie beeinflussen die Simulation nie und sind reine Daten.
 */
import type { World } from './world';

export type SimEventType =
  /** Baustelle fertig. */
  | 'built'
  /** Baum gefällt, Stein geschlagen, Getreide geerntet. */
  | 'chop'
  | 'stone'
  | 'harvest'
  /** Angriff gestartet (data = angegriffener Spieler). */
  | 'attack'
  /** Schlag im Zweikampf, gefallener Soldat. */
  | 'hit'
  | 'death'
  /** Gebäude erobert (player = neuer Besitzer, data = alter Besitzer). */
  | 'conquered'
  /** Gebäude abgebrannt. */
  | 'burned'
  /** Geologe hat etwas gefunden (data = Resource). */
  | 'found'
  /** Soldat befördert. */
  | 'promoted'
  /** Spieler besiegt. */
  | 'defeated';

export interface SimEvent {
  type: SimEventType;
  node: number;
  player: number;
  data: number;
}

export function emit(
  world: World,
  type: SimEventType,
  node: number,
  player: number,
  data = 0,
): void {
  world.events.push({ type, node, player, data });
}
