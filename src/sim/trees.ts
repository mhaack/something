/**
 * Bäume: objectData kodiert Art (Bits 0–1) und Wachstumsstufe (ab Bit 2).
 * Gepflanzte Bäume wachsen über `world.growingTrees` bis zur ausgewachsenen Stufe.
 */
import { TREES } from '../data/balance';
import { MapObject } from '../data/terrain';
import { nextInt } from './rng';
import type { World } from './world';

export function treeVariant(data: number): number {
  return data & 3;
}

export function treeStage(data: number): number {
  return data >> 2;
}

export function treeData(variant: number, stage: number): number {
  return (variant & 3) | (stage << 2);
}

export function isMatureTree(world: World, node: number): boolean {
  return (
    world.map.objects[node] === MapObject.Tree &&
    treeStage(world.map.objectData[node]) >= TREES.MATURE_STAGE
  );
}

/** Pflanzt einen Setzling (Stufe 0) mit zufälliger Art. */
export function plantTree(world: World, node: number): void {
  world.map.objects[node] = MapObject.Tree;
  world.map.objectData[node] = treeData(nextInt(world.rng, 0, 3), 0);
  world.growingTrees.push({ node, timer: TREES.GROWTH_STAGE_TICKS });
  world.mapRevision++;
}

export function removeObject(world: World, node: number): void {
  world.map.objects[node] = MapObject.None;
  world.map.objectData[node] = 0;
  world.mapRevision++;
}

/** Lässt alle wachsenden Bäume um einen Tick altern. */
export function growTrees(world: World): void {
  const list = world.growingTrees;
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const g = list[r];
    if (world.map.objects[g.node] !== MapObject.Tree) continue;
    if (--g.timer <= 0) {
      const data = world.map.objectData[g.node];
      const stage = treeStage(data) + 1;
      world.map.objectData[g.node] = treeData(treeVariant(data), stage);
      world.mapRevision++;
      if (stage >= TREES.MATURE_STAGE) continue;
      g.timer = TREES.GROWTH_STAGE_TICKS;
    }
    list[w++] = g;
  }
  list.length = w;
}
