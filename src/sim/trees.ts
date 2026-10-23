/**
 * Wachstum von Bäumen und Getreidefeldern.
 * Bäume: objectData kodiert Art (Bits 0–1) und Wachstumsstufe (ab Bit 2).
 * Felder: objectData ist die Wachstumsstufe.
 * Gepflanztes wächst über `world.growing` bis zur reifen Stufe.
 */
import { FIELDS, TREES } from '../data/balance';
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
  world.growing.push({ node, timer: TREES.GROWTH_STAGE_TICKS });
  world.mapRevision++;
}

export function isMatureField(world: World, node: number): boolean {
  return (
    world.map.objects[node] === MapObject.Field && world.map.objectData[node] >= FIELDS.MATURE_STAGE
  );
}

/** Sät ein Getreidefeld (Stufe 0). */
export function sowField(world: World, node: number): void {
  world.map.objects[node] = MapObject.Field;
  world.map.objectData[node] = 0;
  world.growing.push({ node, timer: FIELDS.GROWTH_STAGE_TICKS });
  world.mapRevision++;
}

export function removeObject(world: World, node: number): void {
  world.map.objects[node] = MapObject.None;
  world.map.objectData[node] = 0;
  world.mapRevision++;
}

/** Lässt alles Gepflanzte (Bäume, Felder) um einen Tick wachsen. */
export function growTrees(world: World): void {
  const list = world.growing;
  const map = world.map;
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const g = list[r];
    const obj = map.objects[g.node];
    if (obj !== MapObject.Tree && obj !== MapObject.Field) continue;
    if (--g.timer <= 0) {
      world.mapRevision++;
      if (obj === MapObject.Tree) {
        const data = map.objectData[g.node];
        const stage = treeStage(data) + 1;
        map.objectData[g.node] = treeData(treeVariant(data), stage);
        if (stage >= TREES.MATURE_STAGE) continue;
        g.timer = TREES.GROWTH_STAGE_TICKS;
      } else {
        const stage = ++map.objectData[g.node];
        if (stage >= FIELDS.MATURE_STAGE) continue;
        g.timer = FIELDS.GROWTH_STAGE_TICKS;
      }
    }
    list[w++] = g;
  }
  list.length = w;
}
