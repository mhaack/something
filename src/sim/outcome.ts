/**
 * Sieg und Niederlage. Ein Spieler ist besiegt, wenn er weder ein Lager noch ein Gebiet
 * beanspruchendes Gebäude besitzt. Die Ziele gelten für Spieler 0 (Mensch).
 */
import { OUTCOME } from '../data/balance';
import type { Goal } from '../data/missions';
import { emit } from './events';
import { isStore } from './store';
import { claimsTerritory } from './territory';
import type { World } from './world';

export interface Outcome {
  result: 'won' | 'lost';
  reason: 'goals' | 'defeated' | 'time';
  tick: number;
}

export function isDefeated(world: World, player: number): boolean {
  for (const id in world.buildings) {
    const b = world.buildings[id];
    if (b.owner === player && !b.site && (isStore(b) || claimsTerritory(b))) return false;
  }
  return true;
}

/** Fortschritt eines Ziels für Spieler 0: aktueller Wert und Zielwert. */
export function goalProgress(world: World, goal: Goal): { value: number; target: number } {
  switch (goal.type) {
    case 'conquer': {
      const enemies = world.players.filter((p) => p.id !== 0);
      return { value: enemies.filter((p) => p.defeated).length, target: enemies.length };
    }
    case 'produce':
      return { value: world.stats[0].produced[goal.ware], target: goal.amount };
    case 'territory':
      return { value: world.owner.filter((o) => o === 0).length, target: goal.nodes };
  }
}

export function goalMet(world: World, goal: Goal): boolean {
  const { value, target } = goalProgress(world, goal);
  return value >= target;
}

export function updateOutcome(world: World): void {
  if (world.tick % OUTCOME.CHECK_INTERVAL_TICKS !== 0) return;
  for (const p of world.players) {
    if (!p.defeated && isDefeated(world, p.id)) {
      p.defeated = true;
      emit(world, 'defeated', p.hqNode, p.id);
    }
  }
  if (world.outcome) return;
  const end = (result: Outcome['result'], reason: Outcome['reason']): void => {
    world.outcome = { result, reason, tick: world.tick };
  };
  const { goals, timeLimit } = world.setup;
  if (world.players[0].defeated) end('lost', 'defeated');
  else if (goals.length > 0 && goals.every((g) => goalMet(world, g))) end('won', 'goals');
  else if (timeLimit > 0 && world.tick >= timeLimit) end('lost', 'time');
}
