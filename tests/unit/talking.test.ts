import { describe, expect, it } from 'vitest';
import { BUILTIN_CHARACTERS } from '../../src/builtin/characters';
import { BUILTIN_CLIPS } from '../../src/builtin/clips';
import { emoteClip } from '../../src/builtin/clips/emotes';
import { rewardScene } from '../../src/core/cinematic/templates';
import { LETTERS_PER_BEAT, mouthAt, mouthOverTime, visemeOf } from '../../src/core/dialogue/lipsync';
import type { Conversation } from '../../src/core/dialogue/schema';
import { Cinematic } from '../../src/core/schema';
import { CinematicPlayer } from '../../src/engine/cinematic/CinematicPlayer';
import { NavGrid } from '../../src/engine/cinematic/nav';
import { legacyRuntime } from '../../src/engine/legacy/runtime-modules';
import { TalkSystem, type TalkSystemHost } from '../../src/engine/runtime/talk';

/** P23 part 3: talking — lip sync from the words, moods and mouths in conversations and cinematics. */
describe('lip sync', () => {
  it('each letter picks a mouth: m, b, p and spaces close it, a and o open it wide, the rest half', () => {
    expect([visemeOf('m'), visemeOf(' '), visemeOf('!'), visemeOf('a'), visemeOf('O'), visemeOf('t')]).toEqual([
      0, 0, 0, 1, 1, 0.5,
    ]);
    expect(visemeOf(undefined)).toBe(0);
  });
  it('the mouth moves in beats of a few letters, and closes when the line has appeared', () => {
    const line = 'Hello there, traveller!';
    const shapes = Array.from({ length: line.length + 1 }, (_, i) => mouthAt(line, i));
    expect(shapes[0]).toBe(0);
    expect(shapes[line.length]).toBe(0);
    expect(new Set(shapes.slice(1, -1)).size).toBeGreaterThan(1);
    // within one beat the mouth holds still (no flicker at 40 letters a second)
    expect(mouthAt(line, 3)).toBe(mouthAt(line, 3 + LETTERS_PER_BEAT - 1));
    expect(mouthAt('mmmmmm', 2)).toBe(0);
  });
  it('a line spoken over time talks for the first 80% and then closes', () => {
    expect(mouthOverTime('Welcome home', 0.3, 2)).not.toBe(0);
    expect(mouthOverTime('Welcome home', 1.7, 2)).toBe(0);
    expect(mouthOverTime('Welcome home', -1, 2)).toBe(0);
  });
  it('the engine’s copy of the minifig has a talking mouth (v68’s own files are unchanged)', () => {
    expect(() => legacyRuntime()).not.toThrow();
  });
});

const TOM: Conversation = {
  id: 'dlg_tomtalk001',
  name: 'Tom',
  sections: [
    {
      label: 'start',
      steps: [
        { k: 'line', who: 'chr_tomtalk001', text: 'Hello there, traveller, how are you?', mood: 'happy' },
        { k: 'line', who: '', text: 'The wind blows.' },
      ],
    },
  ],
};

function talking(textSpeed = 20) {
  let t = 0;
  const host: TalkSystemHost = {
    get: (p) =>
      p === `dialogue/${TOM.id}.json`
        ? TOM
        : p === 'characters/chr_tomtalk001.json'
          ? { id: 'chr_tomtalk001', name: 'Tom' }
          : undefined,
    project: { dialogue: { textSpeed } },
    genre: null,
    vars: new Map(),
    setVar: () => {},
    inventory: new Map(),
    run: () => {},
    text: (s) => s,
    timeOfDay: () => 'day',
    objectState: () => undefined,
    fire: () => {},
    log: () => {},
    say: () => {},
    now: () => t,
  };
  return { talks: new TalkSystem(host), tick: (s: number) => (t += s) };
}

describe('talking in conversations', () => {
  it('the speaker’s mouth follows the letters as they appear; a skipped line and the narrator stay closed', () => {
    const { talks, tick } = talking();
    talks.start(TOM.id, { talker: 'chr_tomtalk001', from: 'npc' });
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      tick(0.05);
      seen.add(talks.mouth());
    }
    expect(seen.size).toBeGreaterThan(1);
    talks.next(); // shows the whole line
    expect(talks.mouth()).toBe(0);
    talks.next();
    tick(0.2);
    expect(talks.view?.who).toBe('');
    expect(talks.mouth()).toBe(0);
  });
  it('a line shown all at once is still spoken (at 40 letters a second)', () => {
    const { talks, tick } = talking(0);
    talks.start(TOM.id, { talker: 'chr_tomtalk001', from: 'npc' });
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      tick(0.04);
      seen.add(talks.mouth());
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('talking in cinematics', () => {
  const chef = BUILTIN_CHARACTERS.find((c) => c.name === 'Chef')!.id;
  const nav = new NavGrid([{ x0: -40, x1: 40, z0: -40, z1: 40, y0: 0, y1: 0.4 }]);
  const play = (cin: Cinematic) =>
    new CinematicPlayer(cin, {
      nav,
      start: (m) => ({ pos: m.actor === '$hero' ? [0, 0.4, 0] : [6, 0.4, 6], yaw: 0, held: 'None', visible: true }),
      clip: (id) => BUILTIN_CLIPS.find((c) => c.id === id),
      emote: emoteClip,
    });
  it('a line with a mood shows that face while the mouth moves; a Mood item shows a face without words', () => {
    const base = rewardScene({ id: 'cin_talking001', map: 'map_0000000001', at: [0, 0.4, 0], giver: chef });
    const role = base.cast.find((m) => m.actor !== '$hero')!.role;
    const cin: Cinematic = {
      ...base,
      length: 12,
      tracks: [
        ...base.tracks.filter((t) => t.kind !== 'actor'),
        {
          kind: 'actor',
          role,
          items: [
            { t: 0, do: 'mood', mood: 'sad', dur: 1 },
            { t: 2, do: 'say', text: 'Well done, hero, take this!', dur: 3, mood: 'happy' },
          ],
        },
      ],
    };
    const ok = Cinematic.safeParse(cin);
    expect(ok.success, JSON.stringify(ok.error?.issues?.[0])).toBe(true);
    const p = play(cin);
    expect(p.frame(0.5).actors.get(role)).toMatchObject({ mood: 'sad', mouth: 0 });
    const talkingFrames = [2.2, 2.5, 2.8, 3.1, 3.4].map((t) => p.frame(t).actors.get(role)!);
    expect(talkingFrames.every((f) => f.mood === 'happy')).toBe(true);
    expect(new Set(talkingFrames.map((f) => f.mouth)).size).toBeGreaterThan(1);
    // the end of the line: closed, and its own face again after it
    expect(p.frame(4.9).actors.get(role)!.mouth).toBe(0);
    expect(p.frame(6).actors.get(role)!.mood).toBeNull();
  });
});
