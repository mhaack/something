/**
 * Spielereingaben als serialisierbare Befehle. Jede Änderung am Weltzustand durch Spieler oder KI
 * läuft über einen Befehl, damit Replays (Seed + Befehlsliste) deterministisch nachspielbar sind.
 */
import type { BuildingType } from '../data/buildings';
import type { DistributionGroupId } from '../data/distribution';
import type { ToolWare, WareType, WeaponWare } from '../data/wares';

export type Command =
  | { type: 'noop'; player: number }
  | { type: 'placeFlag'; player: number; node: number }
  | { type: 'removeFlag'; player: number; flag: number }
  | { type: 'buildRoad'; player: number; path: number[]; autoFlags: boolean }
  | { type: 'removeRoad'; player: number; road: number }
  | { type: 'placeBuilding'; player: number; node: number; building: BuildingType }
  | { type: 'removeBuilding'; player: number; building: number }
  | { type: 'sendGeologist'; player: number; flag: number }
  | { type: 'setToolPriority'; player: number; tool: ToolWare; value: number }
  | { type: 'setWeaponPriority'; player: number; weapon: WeaponWare; value: number }
  | { type: 'attack'; player: number; target: number; soldiers: number }
  /** Warenverteilung: Gewicht einer Betriebsart in einer Gruppe. */
  | {
      type: 'setDistribution';
      player: number;
      group: DistributionGroupId;
      building: BuildingType;
      value: number;
    }
  /** Soldatenreserve im Hauptquartier. */
  | { type: 'setReserve'; player: number; value: number }
  /** Testfunktion: Das HQ schickt eine Ware zu einer Flagge, von dort geht sie zurück ins Lager. */
  | { type: 'sendWare'; player: number; flag: number; ware?: WareType };

/** Ein Eintrag im Replay: Befehl, der zu Beginn von `tick` angewendet wird. */
export interface ReplayEntry {
  tick: number;
  command: Command;
}
