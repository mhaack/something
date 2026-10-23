/** Spielziele und Missionen. Texte stehen in der i18n-Datei (`mission.<id>.*`). */
import { SIM, type AiLevel, type StockLevel } from './balance';
import type { WareType } from './wares';

export type Goal =
  /** Alle Gegner besiegt. */
  | { type: 'conquer' }
  /** Insgesamt so viele Einheiten einer Ware hergestellt. */
  | { type: 'produce'; ware: WareType; amount: number }
  /** So viele Knoten Gebiet. */
  | { type: 'territory'; nodes: number };

export interface Mission {
  id: number;
  seed: string;
  size: number;
  /** KI-Stufe je Gegner (Länge = Zahl der Gegner). */
  opponents: AiLevel[];
  stock: StockLevel;
  goals: Goal[];
  /** Zeitlimit in Ticks (0 = keins). */
  timeLimit: number;
}

const MINUTE = SIM.TICKS_PER_SECOND * 60;

export const MISSIONS: Mission[] = [
  {
    id: 1,
    seed: 'mission-1',
    size: 64,
    opponents: [],
    stock: 'high',
    goals: [
      { type: 'produce', ware: 'planks', amount: 30 },
      { type: 'produce', ware: 'stone', amount: 15 },
      { type: 'territory', nodes: 700 },
    ],
    timeLimit: 0,
  },
  {
    id: 2,
    seed: 'mission-2',
    size: 128,
    opponents: [],
    stock: 'normal',
    goals: [
      { type: 'produce', ware: 'bread', amount: 15 },
      { type: 'produce', ware: 'meat', amount: 10 },
    ],
    timeLimit: 90 * MINUTE,
  },
  {
    id: 3,
    seed: 'mission-3',
    size: 128,
    opponents: [],
    stock: 'low',
    goals: [
      { type: 'produce', ware: 'iron', amount: 12 },
      { type: 'produce', ware: 'coins', amount: 8 },
    ],
    timeLimit: 0,
  },
  {
    id: 4,
    seed: 'mission-4',
    size: 128,
    opponents: ['easy'],
    stock: 'normal',
    goals: [{ type: 'conquer' }],
    timeLimit: 0,
  },
  {
    id: 5,
    seed: 'mission-5',
    size: 128,
    opponents: ['normal', 'normal'],
    stock: 'normal',
    goals: [{ type: 'conquer' }],
    timeLimit: 0,
  },
  {
    id: 6,
    seed: 'mission-6',
    size: 128,
    opponents: ['hard', 'normal', 'hard'],
    stock: 'low',
    goals: [{ type: 'conquer' }],
    timeLimit: 0,
  },
];
