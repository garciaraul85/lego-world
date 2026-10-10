import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENTS, DEFAULT_MUSIC, MUSIC, RECIPES, ref, SND, SOUNDS } from '../../src/builtin/audio';
import { encodeWav, renderRecipe } from '../../src/builtin/audio/synth';
import type { SoundEvent } from '../../src/core/schema';
import { MediaIndex, Music, SoundEvents } from '../../src/core/schema';
import { audioData } from '../../src/engine/audio/data';
import { MusicDirector } from '../../src/engine/audio/MusicDirector';
import { SoundEventPicker } from '../../src/engine/audio/SoundEvents';

const ev = (o: Partial<SoundEvent>): SoundEvent => ({
  clips: [ref('step1'), ref('step2'), ref('step3')],
  pick: 'random',
  volume: -3,
  pitch: [0.9, 1.1],
  bus: 'sfx',
  spatial: true,
  maxVoices: 4,
  cooldown: 0,
  ...o,
});

function seeded(seed = 3) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('Sound events (P5.3)', () => {
  it('sequence plays clips in order and wraps', () => {
    const p = new SoundEventPicker(seeded());
    const e = ev({ pick: 'sequence' });
    const clips = Array.from({ length: 5 }, (_, i) => p.pick('x', e, i)!.clip);
    expect(clips).toEqual([e.clips[0], e.clips[1], e.clips[2], e.clips[0], e.clips[1]]);
  });

  it('shuffle plays every clip once per round and never repeats across a round boundary', () => {
    const p = new SoundEventPicker(seeded(9));
    const e = ev({ pick: 'shuffle' });
    const got = Array.from({ length: 30 }, (_, i) => p.pick('x', e, i)!.clip);
    for (let r = 0; r < 10; r++) expect(new Set(got.slice(r * 3, r * 3 + 3)).size).toBe(3);
    for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
  });

  it('random picks within the pitch range and honours the cooldown and volume', () => {
    const p = new SoundEventPicker(seeded(5));
    const e = ev({ cooldown: 0.5 });
    const a = p.pick('x', e, 0)!;
    expect(a.rate).toBeGreaterThanOrEqual(0.9);
    expect(a.rate).toBeLessThanOrEqual(1.1);
    expect(a.gainDb).toBe(-3);
    expect(p.pick('x', e, 0.2)).toBeNull();
    expect(p.pick('x', e, 0.6)).not.toBeNull();
    const seen = new Set(Array.from({ length: 60 }, (_, i) => p.pick('y', ev({}), i)!.clip));
    expect(seen.size).toBe(3);
  });

  it('built-in events, music and media are valid and every clip has a recipe', () => {
    expect(SoundEvents.safeParse(DEFAULT_EVENTS).success).toBe(true);
    expect(Music.safeParse(DEFAULT_MUSIC).success).toBe(true);
    for (const id of Object.values(SND)) expect(DEFAULT_EVENTS.events[id]).toBeTruthy();
    expect(Object.keys(RECIPES).length).toBe(Object.keys(SOUNDS).length + Object.keys(MUSIC).length);
    expect(
      MediaIndex.safeParse({ items: { [ref('smash')]: { name: 'x', kind: 'audio', mime: 'audio/wav', bytes: 1 } } })
        .success,
    ).toBe(true);
  });

  it('renders every built-in recipe to audible, bounded, deterministic samples', () => {
    for (const [name, r] of Object.entries(RECIPES)) {
      const a = renderRecipe(r, 8000);
      let peak = 0;
      for (const v of a) peak = Math.max(peak, Math.abs(v));
      expect(peak, name).toBeGreaterThan(0.02);
      expect(peak, name).toBeLessThanOrEqual(1);
      expect(renderRecipe(r, 8000)).toEqual(a);
    }
    const wav = encodeWav(renderRecipe(SOUNDS.place!, 8000), 8000);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
  });

  it('project audio files override built-ins by id and keep the rest', () => {
    const files = new Map<string, unknown>([
      ['audio/events.json', { events: { [SND.smash]: { ...DEFAULT_EVENTS.events[SND.smash]!, volume: -20 } } }],
    ]);
    const d = audioData(files);
    expect(d.events[SND.smash]!.volume).toBe(-20);
    expect(d.events[SND.jump]).toBe(DEFAULT_EVENTS.events[SND.jump]);
    expect(d.music.states).toEqual(DEFAULT_MUSIC.states);
  });
});

describe('MusicDirector (P5.4)', () => {
  it('cinematic > screen > logic > zone > map; null is silence, clearing a layer falls back', () => {
    const m = new MusicDirector();
    expect(m.set('map', 'mus_explore000')).toEqual({ from: null, to: 'mus_explore000' });
    expect(m.set('zone', 'mus_castle0000')).toEqual({ from: 'mus_explore000', to: 'mus_castle0000' });
    expect(m.set('map', 'mus_night00000')).toBeUndefined(); // zone still wins
    expect(m.set('zone', undefined)).toEqual({ from: 'mus_castle0000', to: 'mus_night00000' });
    expect(m.set('logic', null)).toEqual({ from: 'mus_night00000', to: null });
    expect(m.set('cinematic', 'mus_menu000000')?.to).toBe('mus_menu000000');
    expect(m.winner()).toBe('cinematic');
    m.set('cinematic', undefined);
    expect(m.resolve()).toBeNull();
  });
});
