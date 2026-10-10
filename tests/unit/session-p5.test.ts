import { describe, expect, it } from 'vitest';
import { MUS, SND } from '../../src/builtin/audio';
import { SCR } from '../../src/builtin/screens';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';
import { graph } from './logic-helpers';

function project() {
  const s = new ProjectStore(newProjectFiles({ name: 'Sound test', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const run = (type: string, payload: unknown) => {
    const r = bus.execute({ type, payload }, { source: 'user' });
    if (!r.ok) throw new Error(r.error);
  };
  return { s, bus, run, map: s.manifest.entry.map };
}
const steps = (g: PlaySession, n: number) => {
  for (let i = 0; i < n; i++) g.runtime.stepOnce();
};

describe('Game flow (P5.8)', () => {
  it('boots splash → title (after the splash wait) → HUD; Esc pauses and resumes; title pauses the game', () => {
    const { s } = project();
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio, boot: 'entry' });
    expect(g.screens.top()?.id).toBe(SCR.splash);
    expect(g.screenPaused).toBe(true);
    expect(audio.calls).toContainEqual(['stinger', 'splash']);
    for (let i = 0; i < 30; i++) g.runtime.advance(0.1); // the UI clock runs while paused
    expect(g.runtime.ticks).toBeGreaterThan(0); // runtime itself is not paused by the session (PlayView does that)
    expect(g.screens.top()?.id).toBe(SCR.title);
    expect(audio.musicNow).toBe(MUS.menu); // title music wins over the map music
    g.gameOp('start');
    expect(g.screens.ids).toEqual([SCR.hud]);
    expect(g.screenPaused).toBe(false);
    expect(audio.musicNow).toBe(MUS.explore); // the new project's map music
    g.back();
    expect(g.screens.top()?.kind).toBe('pause');
    expect(g.screenPaused).toBe(true);
    g.back();
    expect(g.screens.ids).toEqual([SCR.hud]);
    g.gameOp('quit');
    expect(g.screens.ids).toEqual([SCR.title]);
  });

  it('Play in the editor starts in the game with the HUD; bindings read the game', () => {
    const { s } = project();
    const g = new PlaySession(s.snapshot());
    expect(g.screens.ids).toEqual([SCR.hud]);
    expect(g.lookup('hp')).toBe(3);
    expect(g.lookup('maxHp')).toBe(3);
    expect(g.lookup('map.name')).toBe('Map 1');
    expect(g.lookup('game.name')).toBe('Sound test');
    g.inventory.set('coin', 2);
    expect(g.lookup('inventory.coin')).toBe(2);
  });

  it('losing every heart (hurt, or a zone action) is game over; Retry restores the hearts', () => {
    const { s, run, map } = project();
    run('map.addZone', {
      map,
      zone: {
        id: 'zn_lava000001',
        min: [4, 0, -2],
        max: [8, 4, 2],
        tags: ['Lava'],
        onEnter: [{ do: 'addVar', var: 'hp', value: -1 }],
      },
    });
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio });
    g.hurt(1);
    g.hurt(1);
    expect(audio.played(SND.hurt)).toBe(2);
    expect(g.over).toBe(false);
    g.placeAt([6, 0.4, 0], 0);
    steps(g, 3);
    expect(g.lookup('hp')).toBe(0);
    expect(g.over).toBe(true);
    expect(g.screens.top()?.kind).toBe('gameover');
    expect(audio.calls).toContainEqual(['stinger', 'gameover']);
    g.gameOp('retry');
    expect(g.lookup('hp')).toBe(3);
    expect(g.over).toBe(false);
    expect(g.screens.ids).toEqual([SCR.hud]);
  });
});

describe('Game audio (P5.3-5.5)', () => {
  it('the hero jumps and walks with sounds', () => {
    const { s } = project();
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio });
    steps(g, 5);
    g.input.jump = true;
    steps(g, 2);
    expect(audio.played(SND.jump)).toBe(1);
    steps(g, 90);
    g.input.keys.add('w');
    steps(g, 120);
    expect(audio.played(SND.step)).toBeGreaterThan(2);
  });

  it('a music zone switches the music on enter and the map music comes back on exit; ambience zones loop', () => {
    const { s, run, map } = project();
    run('map.addZone', {
      map,
      zone: {
        id: 'zn_castle0001',
        min: [4, 0, -2],
        max: [8, 4, 2],
        tags: ['Castle'],
        music: MUS.castle,
        ambience: SND.birds,
      },
    });
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio });
    expect(audio.musicNow).toBe(MUS.explore);
    g.placeAt([6, 0.4, 0], 0);
    steps(g, 2);
    expect(audio.musicNow).toBe(MUS.castle);
    expect(audio.loops.get('zone:zn_castle0001')).toBe(SND.birds);
    g.placeAt([-6, 0.4, 0], 0);
    steps(g, 2);
    expect(audio.musicNow).toBe(MUS.explore);
    expect(audio.loops.has('zone:zn_castle0001')).toBe(false);
  });

  it('emitters loop within maxDistance and are culled beyond it; interval emitters repeat', () => {
    const { s, run, map } = project();
    run('item.add', {
      map,
      item: {
        id: 'ins_fountain01',
        kind: 'emitter',
        sound: SND.wind,
        pos: [0, 1, 0],
        mode: 'loop',
        interval: [1, 1],
        maxDistance: 10,
        volume: 0,
      },
    });
    run('item.add', {
      map,
      item: {
        id: 'ins_birds00001',
        kind: 'emitter',
        sound: SND.birds,
        pos: [2, 1, 0],
        mode: 'interval',
        interval: [0.5, 0.5],
        maxDistance: 10,
        volume: -3,
      },
    });
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio });
    g.placeAt([0, 0.4, 2], 0);
    steps(g, 240);
    expect(audio.loops.get('em:ins_fountain01')).toBe(SND.wind);
    expect(audio.played(SND.birds)).toBeGreaterThanOrEqual(3);
    g.placeAt([40, 0.4, 40], 0);
    steps(g, 12);
    expect(audio.loops.has('em:ins_fountain01')).toBe(false);
    g.dispose();
    expect(audio.calls.at(-1)).toEqual(['stopAll']);
  });

  it('logic plays sounds, changes music and shows screens', () => {
    const { s, run } = project();
    run('logic.create', {
      graph: graph(
        [
          ['event.onStart'],
          ['audio.playSound', { sound: SND.victory }],
          ['audio.setMusic', { music: MUS.night }],
          ['screen.show', { screen: SCR.pause }],
        ],
        [
          [1, 'then', 2, 'in'],
          [2, 'then', 3, 'in'],
          [3, 'then', 4, 'in'],
        ],
        'lg_media00001',
      ),
    });
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio });
    steps(g, 2);
    expect(audio.played(SND.victory)).toBe(1);
    expect(audio.musicNow).toBe(MUS.night);
    expect(g.screens.top()?.kind).toBe('pause');
  });
});
