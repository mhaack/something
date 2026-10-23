import { Terrain } from '../src/data/terrain';
import type { Command } from '../src/sim/commands';
import { applyCommand } from '../src/sim/commandHandlers';
import { Dir, neighbor, nodeIndex } from '../src/sim/geometry';
import { checkInvariants } from '../src/sim/invariants';
import { createEmptyMap } from '../src/sim/map';
import { createWorldFromMap, step, type World } from '../src/sim/world';
import { expect } from 'vitest';

/** Flache Wiesenkarte mit einem Spieler (HQ in der Mitte). */
export function flatWorld(size = 40, players = 1): World {
  const map = createEmptyMap(size, size);
  map.heights.fill(10);
  map.terrain.fill(Terrain.Meadow1);
  const starts = [nodeIndex(map, size >> 1, size >> 1)];
  if (players > 1) starts.push(nodeIndex(map, 6, 6));
  return createWorldFromMap('test', map, starts);
}

export function node(w: World, x: number, y: number): number {
  return nodeIndex(w.map, x, y);
}

/** Läuft von einem Knoten n Schritte in eine Richtung, liefert den Pfad inklusive Start. */
export function line(w: World, start: number, d: Dir, steps: number): number[] {
  const out = [start];
  let c = start;
  for (let i = 0; i < steps; i++) {
    c = neighbor(w.map, c, d);
    out.push(c);
  }
  return out;
}

export function hqFlagNode(w: World, player = 0): number {
  const hq = w.buildings[w.players[player].hq];
  return w.flags[hq.flag].node;
}

export function cmd(w: World, c: Command): void {
  expect(applyCommand(w, c)).toBe(true);
}

/** Lässt n Ticks laufen und prüft dabei regelmäßig die Invarianten. */
export function run(w: World, ticks: number, checkEvery = 10): void {
  for (let i = 0; i < ticks; i++) {
    step(w);
    if (i % checkEvery === 0) expect(checkInvariants(w)).toEqual([]);
  }
  expect(checkInvariants(w)).toEqual([]);
}

/** Läuft, bis die Bedingung erfüllt ist (oder bricht nach maxTicks mit Fehler ab). */
export function runUntil(w: World, cond: () => boolean, maxTicks: number): number {
  for (let i = 0; i < maxTicks; i++) {
    if (cond()) return i;
    step(w);
    if (i % 25 === 0) expect(checkInvariants(w)).toEqual([]);
  }
  expect(cond()).toBe(true);
  return maxTicks;
}

export function flagAt(w: World, n: number) {
  return w.flags[w.nodeFlag[n]];
}

export { Dir };
