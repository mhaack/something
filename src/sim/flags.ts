import { TRANSPORT } from '../data/balance';
import { MapObject } from '../data/terrain';
import { DIRS, nodesInRadius } from './geometry';
import { isWalkableTerrain } from './map';
import { removeRoad, splitRoad } from './roads';
import { findNearestStoreAnywhere, markNetworkChanged } from './routing';
import { allocId, type World } from './world';
import type { Flag } from './entities';

export type FlagPlacement = 'ok' | 'outside' | 'terrain' | 'blocked' | 'tooClose';

/** Prüft, ob ein Spieler an einem Knoten eine Flagge setzen darf. */
export function canPlaceFlag(world: World, player: number, node: number): FlagPlacement {
  const map = world.map;
  if (node < 0 || node >= map.width * map.height) return 'outside';
  if (world.owner[node] !== player) return 'outside';
  if (!isWalkableTerrain(map, node)) return 'terrain';
  if (world.nodeFlag[node] || world.nodeBuilding[node]) return 'blocked';
  if (map.objects[node] !== MapObject.None) return 'blocked';
  for (const j of nodesInRadius(map, node, TRANSPORT.FLAG_MIN_DISTANCE - 1)) {
    if (j !== node && world.nodeFlag[j]) return 'tooClose';
  }
  return 'ok';
}

/** Setzt eine Flagge (ohne Prüfung). Liegt der Knoten auf einer Straße, wird sie geteilt. */
export function placeFlag(world: World, player: number, node: number): Flag {
  const id = allocId(world);
  const flag: Flag = {
    id,
    owner: player,
    node,
    wares: [],
    roads: DIRS.map(() => 0),
    building: 0,
  };
  world.flags[id] = flag;
  world.nodeFlag[node] = id;
  const road = world.nodeRoad[node];
  if (road) splitRoad(world, road, node, flag);
  return flag;
}

/**
 * Entfernt eine Flagge samt angeschlossener Straßen. Flaggen mit Gebäude können nicht entfernt
 * werden. Waren auf der Flagge gehen ins nächste Lager des Besitzers (Annahme A9).
 */
export function removeFlag(world: World, flagId: number): boolean {
  const flag = world.flags[flagId];
  if (!flag || flag.building) return false;
  for (const r of flag.roads) if (r > 0) removeRoad(world, r);
  for (const wid of flag.wares) {
    const w = world.wares[wid];
    const store = findNearestStoreAnywhere(world, flag.owner, flag.node);
    if (store) store.stock[w.type]++;
    else world.ledger[w.owner].wares[w.type]--;
    delete world.wares[wid];
  }
  flag.wares = [];
  world.nodeFlag[flag.node] = 0;
  delete world.flags[flagId];
  markNetworkChanged(world);
  return true;
}
