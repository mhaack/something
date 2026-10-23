import { describe, expect, it } from 'vitest';
import type { Command, ReplayEntry } from '../src/sim/commands';
import { Dir, neighbor } from '../src/sim/geometry';
import { checkInvariants } from '../src/sim/invariants';
import { validateRoad } from '../src/sim/roads';
import { createWorld, deserializeWorld, serializeWorld, step, type World } from '../src/sim/world';
import { createRng, nextInt } from '../src/sim/rng';

/** Erzeugt ein Straßennetz um das HQ per Zufallsbefehle (Seed-gesteuert, also reproduzierbar). */
function scriptedCommands(world: World, seed: number): ReplayEntry[] {
  const rng = createRng(seed);
  const out: ReplayEntry[] = [];
  const hq = world.buildings[world.players[0].hq];
  let tip = world.flags[hq.flag].node;
  let tick = 1;
  for (let k = 0; k < 6; k++) {
    const d = nextInt(rng, 0, 5) as Dir;
    const path = [tip];
    for (let i = 0; i < 4; i++) {
      const n = neighbor(world.map, path[path.length - 1], d);
      if (n < 0) break;
      path.push(n);
    }
    out.push({ tick, command: { type: 'buildRoad', player: 0, path, autoFlags: true } });
    if (validateRoad(world, 0, path) === 'ok') tip = path[path.length - 1];
    tick += 30;
  }
  for (let i = 0; i < 25; i++) {
    out.push({ tick: 200 + i * 7, command: { type: 'sendWare', player: 0, flag: -1 } as Command });
  }
  out.push({ tick: 900, command: { type: 'removeRoad', player: 0, road: -1 } as Command });
  return out;
}

/** Spielt Befehle ab; Platzhalter-IDs (-1) werden zur Laufzeit deterministisch aufgelöst. */
function play(world: World, entries: ReplayEntry[], until: number, from = 0): void {
  for (let t = from; t < until; t++) {
    const cmds = entries.filter((e) => e.tick === t).map((e) => resolve(world, e.command));
    step(world, cmds);
  }
}

function resolve(world: World, c: Command): Command {
  if (c.type === 'sendWare' && c.flag === -1) {
    const flags = Object.values(world.flags).filter((f) => !f.building && f.owner === 0);
    return flags.length
      ? { ...c, flag: flags[world.tick % flags.length].id }
      : { type: 'noop', player: 0 };
  }
  if (c.type === 'removeRoad' && c.road === -1) {
    const roads = Object.keys(world.roads).map(Number);
    return roads.length ? { ...c, road: roads[roads.length >> 1] } : { type: 'noop', player: 0 };
  }
  return c;
}

describe('Determinismus', () => {
  it('gleicher Seed + gleiche Befehle = gleicher Zustand', () => {
    const a = createWorld({ seed: 77, size: 64, players: 2 });
    const b = createWorld({ seed: 77, size: 64, players: 2 });
    const script = scriptedCommands(a, 5);
    play(a, script, 2500);
    play(b, script, 2500);
    expect(serializeWorld(a)).toBe(serializeWorld(b));
    expect(Object.keys(a.roads).length).toBeGreaterThan(0);
    expect(checkInvariants(a)).toEqual([]);
  });

  it('Speichern und Laden mitten im Spiel ändert den Verlauf nicht', () => {
    const a = createWorld({ seed: 78, size: 64, players: 1 });
    const script = scriptedCommands(a, 9);
    const b = createWorld({ seed: 78, size: 64, players: 1 });
    play(a, script, 2000);
    play(b, script, 700);
    const c = deserializeWorld(serializeWorld(b));
    play(c, script, 2000, 700);
    expect(serializeWorld(c)).toBe(serializeWorld(a));
  });
});
