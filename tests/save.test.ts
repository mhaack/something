import { describe, expect, it } from 'vitest';
import { aiCommands, createAiState, type AiState } from '../src/ai';
import { checkInvariants } from '../src/sim/invariants';
import { SaveFormatError, decodeSave, encodeSave } from '../src/sim/save';
import { createWorld, serializeWorld, step, type World } from '../src/sim/world';

function play(w: World, ai: AiState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(w, aiCommands(w, ai));
}

describe('Spielstände', () => {
  it('Laden und Weiterspielen ergibt denselben Verlauf wie ohne Unterbrechung', () => {
    const w = createWorld({ seed: 5, size: 64, players: 3, ai: ['normal', 'hard'] });
    w.players[0].human = false;
    w.players[0].ai = 'easy';
    const ai = createAiState();
    play(w, ai, 3000);
    const json = encodeSave(w, { ai }, { name: 'Test', savedAt: 0, tick: w.tick });
    const loaded = decodeSave<{ ai: AiState }>(json);
    expect(loaded.meta.tick).toBe(3000);
    play(w, ai, 3000);
    play(loaded.world, loaded.extra.ai, 3000);
    expect(serializeWorld(loaded.world)).toBe(serializeWorld(w));
    expect(JSON.stringify(loaded.extra.ai)).toBe(JSON.stringify(ai));
    expect(checkInvariants(loaded.world)).toEqual([]);
  });

  it('erkennt fremde und unpassende Dateien', () => {
    const code = (f: () => unknown): string => {
      try {
        f();
        return 'ok';
      } catch (e) {
        return e instanceof SaveFormatError ? e.code : 'other';
      }
    };
    expect(code(() => decodeSave('kein json'))).toBe('notASave');
    expect(code(() => decodeSave('{"format":"etwas"}'))).toBe('notASave');
    const w = createWorld({ seed: 1, size: 64, players: 1 });
    const good = JSON.parse(encodeSave(w, {}, { name: '', savedAt: 0, tick: 0 }));
    expect(code(() => decodeSave(JSON.stringify({ ...good, version: 99 })))).toBe('newerSave');
    good.world.version = -1;
    expect(code(() => decodeSave(JSON.stringify(good)))).toBe('worldVersion');
  });
});
