import { describe, expect, it } from 'vitest';
import { COMBAT_CLIPS } from '../../src/builtin/clips/combat';
import { EMOTE_CLIPS } from '../../src/builtin/clips/emotes';
import { restValue } from '../../src/editor/components/timeline/Timeline';
import { ALL_TRACKS } from '../../src/engine/character/clip-params';

/** P9d: the clip review — every built-in move actually moves, and new tracks start where the joint rests. */
describe('built-in clips', () => {
  it('every one-shot combat move and gesture changes a joint over its length', () => {
    for (const c of [...COMBAT_CLIPS, ...EMOTE_CLIPS].filter((x) => !x.loop)) {
      const moves = c.tracks.some((t) => new Set(t.keys.map((k) => k[1])).size > 1);
      expect(moves, c.name).toBe(true);
    }
  });

  it('keys are in time order, inside the clip', () => {
    for (const c of [...COMBAT_CLIPS, ...EMOTE_CLIPS])
      for (const t of c.tracks) {
        const ts = t.keys.map((k) => k[0]);
        expect([...ts].sort((a, b) => a - b), `${c.name} ${t.bone}.${t.prop}`).toEqual(ts);
        expect(Math.max(...ts), c.name).toBeLessThanOrEqual(c.length + 1e-9);
      }
  });

  it('a new track’s first key is the standing value (height 1.78, not 0)', () => {
    const at = (bone: string, prop: string) => restValue(ALL_TRACKS.find((a) => a.bone === bone && a.prop === prop)!);
    expect(at('root', 'height')).toBe(1.78);
    expect(at('rightArm', 'z')).toBe(0.06);
    expect(at('rightArm', 'x')).toBe(0);
    expect(at('root', 'free')).toBe(0);
  });
});
