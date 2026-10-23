import { WARE_TYPES } from '../data/wares';
import { TOOLS } from '../data/balance';
import { launchAttack } from './military';
import type { Command } from './commands';
import { canPlaceFlag, placeFlag, removeFlag } from './flags';
import { buildRoad, removeRoad, validateRoad } from './roads';
import { canBuild, placeBuilding, removeBuilding, sendGeologist } from './buildings';
import type { World } from './world';

/**
 * Wendet einen Spielerbefehl an. Ungültige Befehle werden ignoriert (die UI prüft vorher mit
 * denselben Regeln), damit Replays nie an Fehlern hängen bleiben.
 */
export function applyCommand(world: World, cmd: Command): boolean {
  switch (cmd.type) {
    case 'noop':
      return true;
    case 'placeFlag':
      if (canPlaceFlag(world, cmd.player, cmd.node) !== 'ok') return false;
      placeFlag(world, cmd.player, cmd.node);
      return true;
    case 'removeFlag': {
      const f = world.flags[cmd.flag];
      if (!f || f.owner !== cmd.player) return false;
      return removeFlag(world, cmd.flag);
    }
    case 'buildRoad':
      if (validateRoad(world, cmd.player, cmd.path) !== 'ok') return false;
      buildRoad(world, cmd.player, cmd.path, cmd.autoFlags);
      return true;
    case 'removeRoad': {
      const r = world.roads[cmd.road];
      if (!r || r.owner !== cmd.player) return false;
      removeRoad(world, cmd.road);
      return true;
    }
    case 'placeBuilding':
      if (canBuild(world, cmd.player, cmd.node, cmd.building) !== 'ok') return false;
      placeBuilding(world, cmd.player, cmd.node, cmd.building);
      return true;
    case 'removeBuilding': {
      const b = world.buildings[cmd.building];
      if (!b || b.owner !== cmd.player) return false;
      return removeBuilding(world, cmd.building);
    }
    case 'sendGeologist':
      return sendGeologist(world, cmd.player, cmd.flag);
    case 'setToolPriority': {
      const p = world.players[cmd.player];
      if (!p || !(cmd.tool in p.toolPriority)) return false;
      p.toolPriority[cmd.tool] = Math.max(0, Math.min(TOOLS.PRIORITY_MAX, Math.round(cmd.value)));
      return true;
    }
    case 'attack':
      return launchAttack(world, cmd.player, cmd.target, Math.max(0, Math.floor(cmd.soldiers))) > 0;
    case 'sendWare': {
      const p = world.players[cmd.player];
      const hq = p ? world.buildings[p.hq] : undefined;
      const f = world.flags[cmd.flag];
      if (!hq || !f || f.owner !== cmd.player) return false;
      const type = cmd.ware ?? WARE_TYPES.find((t) => hq.stock[t] > 0);
      if (!type || hq.stock[type] <= 0) return false;
      const queued = hq.outQueue.filter((o) => o.type === type).length;
      if (queued >= hq.stock[type]) return false;
      hq.outQueue.push({ type, dest: 0, destFlag: cmd.flag });
      return true;
    }
  }
}
