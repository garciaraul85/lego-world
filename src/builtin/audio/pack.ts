import { builtinMediaRef, type MediaRefString } from '../../core/media/hash';
import type { Mixer, Music, SoundEvent, SoundEvents } from '../../core/schema';
import type { MusicRecipe, Recipe, SfxRecipe, Track } from './synth';

/** Built-in ids are readable: snd_<name padded with 0 to 10 chars>. */
const pad = (s: string) => s + '0'.repeat(10 - s.length);
export const sndId = (name: string) => `snd_${pad(name)}` as const;
export const musId = (name: string) => `mus_${pad(name)}` as const;

const sfx = (tones: SfxRecipe['tones'], seed = 1): SfxRecipe => ({
  kind: 'sfx',
  tones,
  seed,
});

/** Every built-in sound (generated, CC0). Names are the media names shown in the Audio workspace. */
export const SOUNDS: Record<string, SfxRecipe> = {
  smash: sfx([
    { wave: 'noise', f0: 2600, f1: 500, dur: 0.32, gain: 0.8 },
    { wave: 'sine', f0: 140, f1: 45, dur: 0.22, gain: 0.7 },
    { wave: 'square', f0: 900, f1: 300, at: 0.02, dur: 0.06, gain: 0.15 },
  ]),
  smash2: sfx(
    [
      { wave: 'noise', f0: 3200, f1: 700, dur: 0.28, gain: 0.8 },
      { wave: 'sine', f0: 170, f1: 55, dur: 0.2, gain: 0.6 },
      { wave: 'square', f0: 1200, f1: 500, at: 0.05, dur: 0.05, gain: 0.12 },
    ],
    3,
  ),
  place: sfx([
    { wave: 'square', f0: 1100, f1: 700, dur: 0.035, gain: 0.25 },
    { wave: 'sine', f0: 320, f1: 260, dur: 0.07, gain: 0.5 },
  ]),
  rebuild: sfx([{ wave: 'tri', f0: 660, f1: 700, dur: 0.06, gain: 0.4 }]),
  rebuilt: sfx([
    { wave: 'sine', f0: 523, dur: 0.18, gain: 0.4 },
    { wave: 'sine', f0: 659, at: 0.07, dur: 0.18, gain: 0.4 },
    { wave: 'sine', f0: 784, at: 0.14, dur: 0.2, gain: 0.4 },
    { wave: 'sine', f0: 1047, at: 0.21, dur: 0.35, gain: 0.45 },
  ]),
  jump: sfx([{ wave: 'square', f0: 280, f1: 620, dur: 0.14, gain: 0.22, lp: 2500 }]),
  land: sfx([
    { wave: 'noise', f0: 500, dur: 0.09, gain: 0.6 },
    { wave: 'sine', f0: 95, f1: 50, dur: 0.1, gain: 0.5 },
  ]),
  step1: sfx([{ wave: 'noise', f0: 900, dur: 0.05, gain: 0.35 }], 11),
  step2: sfx([{ wave: 'noise', f0: 1200, dur: 0.045, gain: 0.3 }], 12),
  step3: sfx([{ wave: 'noise', f0: 750, dur: 0.055, gain: 0.35 }], 13),
  pickup: sfx([
    { wave: 'sine', f0: 880, dur: 0.08, gain: 0.4 },
    { wave: 'sine', f0: 1320, at: 0.07, dur: 0.16, gain: 0.4 },
  ]),
  chest: sfx([
    { wave: 'saw', f0: 180, f1: 380, dur: 0.22, gain: 0.25, lp: 1400 },
    { wave: 'sine', f0: 660, at: 0.18, dur: 0.25, gain: 0.35 },
    { wave: 'sine', f0: 990, at: 0.26, dur: 0.3, gain: 0.3 },
  ]),
  door: sfx([
    { wave: 'noise', f0: 400, dur: 0.3, gain: 0.5 },
    { wave: 'square', f0: 110, f1: 90, dur: 0.25, gain: 0.15, lp: 600 },
  ]),
  gate: sfx([
    { wave: 'sine', f0: 200, f1: 1200, dur: 0.6, gain: 0.4, attack: 0.1 },
    { wave: 'noise', f0: 3000, dur: 0.5, gain: 0.25, attack: 0.15 },
  ]),
  uiclick: sfx([{ wave: 'sine', f0: 1250, dur: 0.035, gain: 0.35 }]),
  uiback: sfx([{ wave: 'sine', f0: 720, f1: 480, dur: 0.07, gain: 0.35 }]),
  uiconfirm: sfx([
    { wave: 'sine', f0: 660, dur: 0.07, gain: 0.35 },
    { wave: 'sine', f0: 990, at: 0.06, dur: 0.12, gain: 0.35 },
  ]),
  talk1: sfx([{ wave: 'square', f0: 520, f1: 560, dur: 0.05, gain: 0.15, lp: 1800 }]),
  talk2: sfx([{ wave: 'square', f0: 610, f1: 580, dur: 0.05, gain: 0.15, lp: 1800 }]),
  talk3: sfx([{ wave: 'square', f0: 470, f1: 520, dur: 0.06, gain: 0.15, lp: 1800 }]),
  hurt: sfx([
    { wave: 'saw', f0: 420, f1: 140, dur: 0.28, gain: 0.35, lp: 1600 },
    { wave: 'noise', f0: 1500, dur: 0.1, gain: 0.3 },
  ]),
  gameover: sfx([
    { wave: 'tri', f0: 392, dur: 0.3, gain: 0.45 },
    { wave: 'tri', f0: 330, at: 0.28, dur: 0.3, gain: 0.45 },
    { wave: 'tri', f0: 262, at: 0.56, dur: 0.3, gain: 0.45 },
    { wave: 'tri', f0: 196, at: 0.84, dur: 0.9, gain: 0.5 },
  ]),
  splash: sfx([
    {
      wave: 'sine',
      f0: 523,
      dur: 1.4,
      gain: 0.25,
      attack: 0.2,
      trem: [6, 0.3],
    },
    {
      wave: 'sine',
      f0: 659,
      at: 0.1,
      dur: 1.3,
      gain: 0.22,
      attack: 0.2,
      trem: [5, 0.3],
    },
    {
      wave: 'sine',
      f0: 784,
      at: 0.2,
      dur: 1.2,
      gain: 0.2,
      attack: 0.2,
      trem: [7, 0.3],
    },
    { wave: 'sine', f0: 1568, at: 0.3, dur: 1.0, gain: 0.08, attack: 0.3 },
  ]),
  victory: sfx([
    { wave: 'square', f0: 523, dur: 0.12, gain: 0.2, lp: 3000 },
    { wave: 'square', f0: 659, at: 0.12, dur: 0.12, gain: 0.2, lp: 3000 },
    { wave: 'square', f0: 784, at: 0.24, dur: 0.12, gain: 0.2, lp: 3000 },
    { wave: 'square', f0: 1047, at: 0.36, dur: 0.6, gain: 0.22, lp: 3000 },
    { wave: 'sine', f0: 262, at: 0.36, dur: 0.6, gain: 0.3 },
  ]),
  /** P32: an item found in a chest — a rising shimmer, then a bright cadence (an original fanfare) */
  treasure: sfx(
    [
      { wave: 'noise', f0: 5200, f1: 9000, dur: 0.5, gain: 0.08, attack: 0.2 },
      { wave: 'tri', f0: 392, dur: 0.16, gain: 0.32 },
      { wave: 'tri', f0: 494, at: 0.14, dur: 0.16, gain: 0.32 },
      { wave: 'tri', f0: 587, at: 0.28, dur: 0.16, gain: 0.32 },
      { wave: 'square', f0: 698, at: 0.42, dur: 0.34, gain: 0.16, lp: 2600 },
      { wave: 'sine', f0: 523, at: 0.78, dur: 1.3, gain: 0.3, trem: [6, 0.15] },
      {
        wave: 'sine',
        f0: 659,
        at: 0.78,
        dur: 1.3,
        gain: 0.26,
        trem: [6, 0.15],
      },
      {
        wave: 'sine',
        f0: 784,
        at: 0.78,
        dur: 1.3,
        gain: 0.24,
        trem: [6, 0.15],
      },
      { wave: 'square', f0: 1047, at: 0.78, dur: 1.1, gain: 0.12, lp: 3200 },
      { wave: 'sine', f0: 131, at: 0.78, dur: 1.2, gain: 0.35 },
      { wave: 'sine', f0: 2093, at: 0.95, dur: 0.12, gain: 0.08 },
      { wave: 'sine', f0: 2637, at: 1.1, dur: 0.12, gain: 0.08 },
      { wave: 'sine', f0: 3136, at: 1.25, dur: 0.18, gain: 0.07 },
    ],
    7,
  ),
  wind: sfx([
    {
      wave: 'noise',
      f0: 260,
      f1: 420,
      dur: 4,
      gain: 0.5,
      attack: 0.001,
      trem: [0.25, 0.5],
    },
    {
      wave: 'noise',
      f0: 600,
      f1: 300,
      dur: 4,
      gain: 0.25,
      attack: 0.001,
      trem: [0.5, 0.6],
    },
  ]),
  lava: sfx([
    {
      wave: 'noise',
      f0: 140,
      dur: 4,
      gain: 0.7,
      attack: 0.001,
      trem: [0.75, 0.4],
    },
    {
      wave: 'sine',
      f0: 48,
      f1: 44,
      dur: 4,
      gain: 0.3,
      attack: 0.001,
      trem: [0.5, 0.5],
    },
  ]),
  birds: sfx([
    { wave: 'sine', f0: 2400, f1: 3200, at: 0.2, dur: 0.12, gain: 0.15 },
    { wave: 'sine', f0: 3100, f1: 2600, at: 0.36, dur: 0.1, gain: 0.12 },
    { wave: 'sine', f0: 2800, f1: 3500, at: 1.6, dur: 0.15, gain: 0.13 },
    { wave: 'sine', f0: 2200, f1: 2900, at: 2.7, dur: 0.1, gain: 0.12 },
    { wave: 'sine', f0: 3000, f1: 2500, at: 2.85, dur: 0.1, gain: 0.12 },
    { wave: 'noise', f0: 200, dur: 4, gain: 0.08, attack: 0.001 },
  ]),
  /** Step 11, 4b (adventure pack): a short rising jingle for a small item */
  itemget: sfx([
    { wave: 'tri', f0: 587, dur: 0.1, gain: 0.32 },
    { wave: 'tri', f0: 740, at: 0.09, dur: 0.1, gain: 0.32 },
    { wave: 'tri', f0: 880, at: 0.18, dur: 0.1, gain: 0.32 },
    { wave: 'square', f0: 1175, at: 0.27, dur: 0.4, gain: 0.14, lp: 3000 },
    { wave: 'sine', f0: 294, at: 0.27, dur: 0.4, gain: 0.3 },
  ]),
  /** a secret found: a climbing, sparkly run that settles on a bright chord */
  secret: sfx(
    [
      { wave: 'sine', f0: 784, dur: 0.09, gain: 0.3 },
      { wave: 'sine', f0: 740, at: 0.09, dur: 0.09, gain: 0.3 },
      { wave: 'sine', f0: 622, at: 0.18, dur: 0.09, gain: 0.3 },
      { wave: 'sine', f0: 440, at: 0.27, dur: 0.09, gain: 0.3 },
      { wave: 'sine', f0: 415, at: 0.36, dur: 0.09, gain: 0.3 },
      { wave: 'sine', f0: 659, at: 0.45, dur: 0.09, gain: 0.3 },
      { wave: 'sine', f0: 831, at: 0.54, dur: 0.09, gain: 0.3 },
      { wave: 'tri', f0: 1047, at: 0.63, dur: 0.6, gain: 0.34, trem: [7, 0.2] },
      { wave: 'noise', f0: 7000, at: 0.6, dur: 0.5, gain: 0.05, attack: 0.1 },
    ],
    5,
  ),
  /** a sword swing: a quick airy whoosh */
  swish: sfx(
    [
      {
        wave: 'noise',
        f0: 1800,
        f1: 5200,
        dur: 0.16,
        gain: 0.45,
        attack: 0.03,
      },
      { wave: 'sine', f0: 380, f1: 220, dur: 0.1, gain: 0.12 },
    ],
    9,
  ),
  /** a big creature's roar: low growl with a rasp */
  bossroar: sfx(
    [
      {
        wave: 'saw',
        f0: 120,
        f1: 70,
        dur: 1.2,
        gain: 0.4,
        lp: 900,
        attack: 0.08,
        trem: [18, 0.4],
      },
      {
        wave: 'square',
        f0: 90,
        f1: 55,
        dur: 1.1,
        gain: 0.18,
        lp: 500,
        attack: 0.1,
      },
      { wave: 'noise', f0: 700, f1: 300, dur: 1.0, gain: 0.35, attack: 0.1 },
    ],
    4,
  ),
  /** a key picked up: two bright bell taps */
  keyget: sfx([
    { wave: 'sine', f0: 1319, dur: 0.12, gain: 0.35 },
    { wave: 'sine', f0: 2637, dur: 0.1, gain: 0.08 },
    {
      wave: 'sine',
      f0: 1760,
      at: 0.12,
      dur: 0.35,
      gain: 0.35,
      trem: [8, 0.15],
    },
    { wave: 'sine', f0: 3520, at: 0.12, dur: 0.2, gain: 0.07 },
  ]),
  /** Step 12a (puzzles): a heavy stone block scraping over stone */
  scrape: sfx(
    [
      { wave: 'noise', f0: 500, f1: 350, dur: 0.38, gain: 0.5, attack: 0.04, trem: [26, 0.5] },
      { wave: 'sine', f0: 70, f1: 60, dur: 0.38, gain: 0.35, attack: 0.04 },
    ],
    11,
  ),
  /** a switch pressed: a stone click and a low thunk */
  click: sfx([
    { wave: 'square', f0: 1400, f1: 900, dur: 0.03, gain: 0.25 },
    { wave: 'sine', f0: 160, f1: 90, at: 0.02, dur: 0.14, gain: 0.55 },
  ]),
  /** a timed switch running down: one tick */
  tick: sfx([{ wave: 'square', f0: 2200, f1: 1800, dur: 0.025, gain: 0.18, lp: 5000 }]),
  /** a lock turned: a metal clunk and the bolt sliding back */
  unlock: sfx(
    [
      { wave: 'square', f0: 620, f1: 420, dur: 0.05, gain: 0.25, lp: 2400 },
      { wave: 'noise', f0: 3000, f1: 1500, at: 0.06, dur: 0.18, gain: 0.25 },
      { wave: 'sine', f0: 220, f1: 140, at: 0.2, dur: 0.16, gain: 0.45 },
    ],
    6,
  ),
};

// ---------- music ----------

/** one chord per bar: arpeggio, bass and a soft pad, 16 steps per bar */
function song(
  bpm: number,
  chords: number[][],
  style: { arp: Track['wave']; bassWave?: Track['wave']; slow?: boolean },
): MusicRecipe {
  const arp: Array<number | null> = [];
  const bass: Array<number | null> = [];
  const pad: Array<number | null> = [];
  for (const c of chords) {
    for (let s = 0; s < 16; s++) {
      arp.push(
        style.slow
          ? s % 4 === 0
            ? c[(s / 4) % c.length]! + 12
            : null
          : s % 2 === 0
            ? c[(s / 2) % c.length]! + 12
            : null,
      );
      bass.push(s % 8 === 0 ? c[0]! - 12 : null);
      pad.push(s === 0 ? c[1]! : null);
    }
  }
  return {
    kind: 'music',
    bpm,
    bars: chords.length,
    tracks: [
      {
        wave: style.arp,
        gain: 0.16,
        notes: arp,
        len: style.slow ? 4 : 2,
        lp: 2600,
      },
      { wave: style.bassWave ?? 'tri', gain: 0.35, notes: bass, len: 7 },
      { wave: 'sine', gain: 0.12, notes: pad, len: 16 },
    ],
  };
}
const C = [60, 64, 67];
const Am = [57, 60, 64];
const F = [53, 57, 60];
const G = [55, 59, 62];
const Dm = [62, 65, 69];
const Em = [64, 67, 71];

export const MUSIC: Record<string, MusicRecipe> = {
  explore: song(112, [C, Am, F, G, C, Em, F, G], { arp: 'square' }),
  night: song(72, [Am, F, C, G, Am, Dm, Em, Am], { arp: 'sine', slow: true }),
  menu: song(96, [F, G, Em, Am], { arp: 'tri' }),
  castle: song(
    88,
    [Dm, Am, G, Am, Dm, F, G, Am].map((c) => c.map((n) => n - 2)),
    { arp: 'saw', bassWave: 'square' },
  ),
  /** 4b: a cheerful village tune, a darker dungeon loop and a driving boss theme (original) */
  village: song(
    104,
    [F, C, Dm, G, F, C, G, C].map((c) => c.map((n) => n + 2)),
    { arp: 'tri' },
  ),
  dungeon: song(
    66,
    [Am, Dm, Am, Em, Am, F, Dm, Em].map((c) => c.map((n) => n - 3)),
    {
      arp: 'sine',
      bassWave: 'square',
      slow: true,
    },
  ),
  boss: song(
    144,
    [Am, Am, F, G, Am, Am, Dm, Em].map((c) => c.map((n) => n - 5)),
    { arp: 'saw', bassWave: 'saw' },
  ),
};

export const RECIPES: Record<string, Recipe> = { ...SOUNDS, ...MUSIC };

/** MediaRef → built-in recipe name. */
export const BUILTIN_MEDIA = new Map<MediaRefString, string>(Object.keys(RECIPES).map((n) => [builtinMediaRef(n), n]));
export const ref = (name: string): MediaRefString => {
  if (!RECIPES[name]) throw new Error(`no built-in media ${name}`);
  return builtinMediaRef(name);
};

// ---------- default events, music and mixer ----------

const ev = (
  name: string,
  clips: string[],
  o: Partial<Omit<SoundEvent, 'clips' | 'name'>> = {},
): [string, SoundEvent] => [
  sndId(name),
  {
    name,
    clips: clips.map(ref),
    pick: o.pick ?? 'random',
    volume: o.volume ?? 0,
    pitch: o.pitch ?? [1, 1],
    bus: o.bus ?? 'sfx',
    spatial: o.spatial ?? true,
    maxVoices: o.maxVoices ?? 4,
    cooldown: o.cooldown ?? 0,
  },
];

/** The sounds the game makes on its own (ids used by the runtime). */
export const SND = {
  smash: sndId('smash'),
  place: sndId('place'),
  rebuild: sndId('rebuild'),
  rebuilt: sndId('rebuilt'),
  jump: sndId('jump'),
  land: sndId('land'),
  step: sndId('step'),
  pickup: sndId('pickup'),
  chest: sndId('chest'),
  door: sndId('door'),
  gate: sndId('gate'),
  uiclick: sndId('uiclick'),
  uiback: sndId('uiback'),
  uiconfirm: sndId('uiconfirm'),
  talk: sndId('talk'),
  hurt: sndId('hurt'),
  gameover: sndId('gameover'),
  splash: sndId('splash'),
  victory: sndId('victory'),
  treasure: sndId('treasure'),
  wind: sndId('wind'),
  lava: sndId('lava'),
  birds: sndId('birds'),
  itemget: sndId('itemget'),
  secret: sndId('secret'),
  swish: sndId('swish'),
  bossroar: sndId('bossroar'),
  keyget: sndId('keyget'),
  scrape: sndId('scrape'),
  click: sndId('click'),
  tick: sndId('tick'),
  unlock: sndId('unlock'),
} as const;

export const MUS = {
  explore: musId('explore'),
  night: musId('night'),
  menu: musId('menu'),
  castle: musId('castle'),
  village: musId('village'),
  dungeon: musId('dungeon'),
  boss: musId('boss'),
} as const;

/** Step 11, 4b: the adventure pack's sound events (new games have them; older games add them from the pack panel) */
export const ADVENTURE_EVENTS: [string, SoundEvent][] = [
  ev('itemget', ['itemget'], { bus: 'ui', spatial: false, maxVoices: 1 }),
  ev('secret', ['secret'], { bus: 'ui', spatial: false, maxVoices: 1 }),
  ev('swish', ['swish'], { pitch: [0.9, 1.15], maxVoices: 3, volume: -4 }),
  ev('bossroar', ['bossroar'], { maxVoices: 1 }),
  ev('keyget', ['keyget'], { bus: 'ui', spatial: false, maxVoices: 1 }),
  // step 12a: puzzles
  ev('scrape', ['scrape'], { maxVoices: 2, cooldown: 0.15 }),
  ev('click', ['click'], { maxVoices: 2 }),
  ev('tick', ['tick'], { bus: 'ui', spatial: false, maxVoices: 1, volume: -6 }),
  ev('unlock', ['unlock'], { maxVoices: 1 }),
];

export const DEFAULT_EVENTS: SoundEvents = {
  events: Object.fromEntries([
    ev('smash', ['smash', 'smash2'], { pitch: [0.9, 1.1], maxVoices: 6 }),
    ev('place', ['place'], { bus: 'ui', spatial: false, pitch: [0.95, 1.05] }),
    ev('rebuild', ['rebuild'], {
      pitch: [0.9, 1.2],
      maxVoices: 2,
      cooldown: 0.2,
      volume: -6,
    }),
    ev('rebuilt', ['rebuilt'], { maxVoices: 2 }),
    ev('jump', ['jump'], { pitch: [0.95, 1.05], volume: -4, maxVoices: 2 }),
    ev('land', ['land'], {
      pitch: [0.9, 1.1],
      volume: -6,
      maxVoices: 2,
      cooldown: 0.15,
    }),
    ev('step', ['step1', 'step2', 'step3'], {
      pick: 'shuffle',
      pitch: [0.9, 1.1],
      volume: -12,
      maxVoices: 3,
    }),
    ev('pickup', ['pickup'], { maxVoices: 3 }),
    ev('chest', ['chest'], {}),
    ev('door', ['door'], {}),
    ev('gate', ['gate'], { spatial: false }),
    ev('uiclick', ['uiclick'], { bus: 'ui', spatial: false, maxVoices: 2 }),
    ev('uiback', ['uiback'], { bus: 'ui', spatial: false, maxVoices: 2 }),
    ev('uiconfirm', ['uiconfirm'], { bus: 'ui', spatial: false, maxVoices: 2 }),
    ev('talk', ['talk1', 'talk2', 'talk3'], {
      bus: 'voice',
      pick: 'sequence',
      spatial: false,
      maxVoices: 1,
      cooldown: 0.07,
    }),
    ev('hurt', ['hurt'], { spatial: false, maxVoices: 2 }),
    ev('gameover', ['gameover'], { bus: 'ui', spatial: false, maxVoices: 1 }),
    ev('splash', ['splash'], { bus: 'ui', spatial: false, maxVoices: 1 }),
    ev('victory', ['victory'], { bus: 'ui', spatial: false, maxVoices: 1 }),
    ev('treasure', ['treasure'], { bus: 'ui', spatial: false, maxVoices: 1 }),
    ev('wind', ['wind'], {
      bus: 'ambience',
      spatial: false,
      maxVoices: 2,
      volume: -8,
    }),
    ev('lava', ['lava'], { bus: 'ambience', maxVoices: 4, volume: -4 }),
    ev('birds', ['birds'], { bus: 'ambience', maxVoices: 4, volume: -6 }),
    ...ADVENTURE_EVENTS,
  ]),
};

const state = (name: string, volume = 0): [string, Music['states'][string]] => [
  musId(name),
  {
    name,
    layers: [{ media: ref(name), volume }],
    loop: true,
    bpm: MUSIC[name]!.bpm,
  },
];

/** Step 11, 4b: the adventure pack's music states */
export const ADVENTURE_MUSIC = () => [state('village', -4), state('dungeon', -3), state('boss', -5)];

export const DEFAULT_MUSIC: Music = {
  states: Object.fromEntries([
    state('explore', -4),
    state('night', -3),
    state('menu', -4),
    state('castle', -4),
    ...ADVENTURE_MUSIC(),
  ]),
  crossfade: 1.5,
  stingers: {
    victory: ref('victory'),
    gameover: ref('gameover'),
    splash: ref('splash'),
    treasure: ref('treasure'),
  },
};

export const DEFAULT_MIXER: Mixer = {
  buses: { master: 0, music: -6, sfx: 0, voice: 0, ui: -3, ambience: -6 },
  duck: [
    { when: 'voice', target: 'music', amount: -8, attack: 0.05, release: 0.4 },
    {
      when: 'stinger',
      target: 'music',
      amount: -6,
      attack: 0.05,
      release: 0.6,
    },
  ],
};
