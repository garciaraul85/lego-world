import { describe, expect, it } from 'vitest';
import { BUILTIN_CHARACTERS } from '../../src/builtin/characters';
import { BUILTIN_CLIPS } from '../../src/builtin/clips';
import { sampleParams } from '../../src/engine/character/routine';
import { legacyRuntime } from '../../src/engine/legacy/runtime-modules';

const L = legacyRuntime() as unknown as {
  StudioMotion: {
    clips: { id: string; label: string; duration: number }[];
    parameters(c: unknown, u: number): Record<string, unknown>;
  };
  CharacterCatalog: { presets: Record<string, unknown>; preset(n: string): Record<string, unknown> };
};

const close = (a: unknown, b: unknown) => {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
};

describe('characters and clips as data (P3.5)', () => {
  it('every v68 preset is a built-in character with the same validated profile', () => {
    const names = Object.keys(L.CharacterCatalog.presets);
    expect(BUILTIN_CHARACTERS).toHaveLength(names.length);
    for (const c of BUILTIN_CHARACTERS) expect(c.profile).toEqual(L.CharacterCatalog.preset(c.name));
  });

  it('every v68 routine sampled from its keyframe clip gives exactly v68’s pose parameters', () => {
    expect(BUILTIN_CLIPS.filter((c) => c.group !== 'Gestures')).toHaveLength(L.StudioMotion.clips.length);
    for (const routine of L.StudioMotion.clips) {
      const clip = BUILTIN_CLIPS.find((c) => c.name === routine.label)!;
      expect(clip, routine.label).toBeTruthy();
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const want = L.StudioMotion.parameters(routine, u);
        const got = sampleParams(clip, u * routine.duration);
        for (const k of Object.keys(want)) expect(close(got[k], want[k]), `${routine.label} ${k} @${u}`).toBe(true);
      }
    }
  });
});

describe('Animator', async () => {
  const { Animator } = await import('../../src/engine/character/animator');
  const wave = {
    id: 'clp_wave000001',
    length: 1,
    loop: false,
    tracks: [
      {
        bone: 'rightArm',
        prop: 'z',
        keys: [
          [0, 0, 'linear'],
          [1, 2, 'linear'],
        ] as [number, number, 'linear'][],
      },
    ],
    events: [
      { t: 0.5, emit: 'wave-peak' },
      { t: 0.9, sound: 'snd_whoosh0001' },
    ],
  };
  it('samples tracks, fires events once as the playhead passes, and stops at the end of a one-shot clip', () => {
    const a = new Animator();
    a.play(wave);
    expect(a.step(0.25)).toEqual([]);
    expect((a.params()!.ra as number[])[2]).toBeCloseTo(0.5);
    expect(a.step(0.3)).toEqual([{ t: 0.5, emit: 'wave-peak' }]);
    expect(a.step(0.5)).toEqual([{ t: 0.9, sound: 'snd_whoosh0001' }]);
    expect(a.clip).toBeNull();
  });
  it('loops and crossfades between clips over 0.15 s', () => {
    const a = new Animator();
    a.play({ ...wave, loop: true, events: [] });
    a.step(0.9);
    a.step(0.2);
    expect(a.time).toBeCloseTo(0.1);
    const still = {
      ...wave,
      id: 'clp_still00001',
      tracks: [{ bone: 'rightArm', prop: 'z', keys: [[0, 0, 'linear']] as [number, number, 'linear'][] }],
    };
    a.play(still);
    a.step(0.075);
    const mid = (a.params()!.ra as number[])[2]!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.4);
    a.step(0.1);
    expect((a.params()!.ra as number[])[2]).toBe(0);
  });
});
