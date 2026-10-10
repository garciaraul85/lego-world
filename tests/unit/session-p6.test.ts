import { describe, expect, it } from 'vitest';
import { MUS, SND } from '../../src/builtin/audio';
import { BUILTIN_CHARACTERS } from '../../src/builtin/characters';
import { usesOf } from '../../src/core/audio/usage';
import { rewardScene } from '../../src/core/cinematic/templates';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { MapDoc } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';
import { graph } from './logic-helpers';

const chef = BUILTIN_CHARACTERS.find((c) => c.name === 'Chef')!.id;

function project() {
  const s = new ProjectStore(newProjectFiles({ name: 'Scene test', random: () => 0.55 }));
  const bus = registerAll(new CommandBus(s));
  const run = (type: string, payload: unknown) => {
    const r = bus.execute({ type, payload }, { source: 'user' });
    if (!r.ok) throw new Error(r.error);
  };
  const map = s.manifest.entry.map;
  const doc = s.get<MapDoc>(`maps/${map}/map.json`)!;
  run('cinematic.put', {
    cinematic: rewardScene({
      id: 'cin_reward0001',
      map,
      at: doc.spawns[0]!.pos as [number, number, number],
      giver: chef,
    }),
  });
  return { s, bus, run, map };
}
const steps = (g: PlaySession, n: number) => {
  for (let i = 0; i < n; i++) g.runtime.stepOnce();
};

describe('Cinematics in Play (P6.2 / phase exit)', () => {
  it('a reward scene with dialogue, camera cuts and music plays when the quest finishes', () => {
    const { s, run } = project();
    // quest: when `repaired` reaches 3, play the reward scene; afterwards the logic sees it finish
    run('logic.create', {
      graph: graph(
        [
          ['event.onVarChanged', { var: 'repaired' }],
          ['flow.branch'],
          ['compare.gte', { b: 3 }],
          ['var.get', { var: 'repaired' }],
          ['cinematic.play', { cinematic: 'cin_reward0001', once: true }],
          ['event.onCinematicDone', { cinematic: 'cin_reward0001' }],
          ['var.set', { var: 'questDone', value: true }],
        ],
        [
          [1, 'then', 2, 'in'],
          [4, 'value', 3, 'a'],
          [3, 'out', 2, 'cond'],
          [2, 'true', 5, 'in'],
          [6, 'then', 7, 'in'],
        ],
        'lg_quest00001',
      ),
    });
    const audio = new RecordingAudio();
    const g = new PlaySession(s.snapshot(), { audio });
    steps(g, 2);
    for (let i = 1; i <= 3; i++) {
      g.logic.setVar('repaired', i);
      steps(g, 2);
    }
    expect(g.cine.active).toBe(true);
    const shots = new Set<string>();
    let spoke = false;
    let lb = false;
    let musicDuring: string | null = null;
    for (let i = 0; i < 60 * 10 && g.cine.active; i++) {
      g.runtime.stepOnce();
      const f = g.cine.frame;
      if (f?.shot) shots.add(f.shot);
      if (g.dialogue?.text.includes('fixed every house')) spoke = true;
      if (f?.post.letterbox) lb = true;
      if (f && f.t > 1 && f.t < 7) musicDuring = audio.musicNow;
    }
    expect(g.cine.active).toBe(false);
    expect([...shots]).toEqual(['Wide', 'Close on mayor', 'Two shot']);
    expect(spoke).toBe(true);
    expect(lb).toBe(true);
    expect(musicDuring).toBe(MUS.menu);
    expect(audio.musicNow).toBe(MUS.explore); // map music back after the scene
    expect(audio.played(SND.victory)).toBe(1);
    expect(audio.played('snd_talk000000')).toBeGreaterThan(5);
    steps(g, 3);
    expect(g.logic.vars.get('rewarded')).toBe(true);
    expect(g.logic.vars.has('questDone')).toBe(true);
    // once: not again
    g.logic.setVar('repaired', 4);
    steps(g, 3);
    expect(g.cine.active).toBe(false);
  });

  it('the hero is held during the scene and Esc skips to the end state', () => {
    const { s } = project();
    const g = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    steps(g, 2);
    expect(g.cine.play('cin_reward0001')).toBe(true);
    g.input.keys.add('w');
    steps(g, 30);
    g.back();
    expect(g.cine.active).toBe(false);
    expect(g.logic.vars.get('rewarded')).toBe(true);
    expect(g.dialogue).toBeNull();
    expect(g.screens.screens().some((x) => x.kind === 'dialogue')).toBe(false);
  });

  it('triggers: a zone action, a gate on-arrive and a clip marker each play the scene', () => {
    const { s, run, map } = project();
    run('map.addZone', {
      map,
      zone: {
        id: 'zn_stage00001',
        min: [4, 0, -2],
        max: [8, 4, 2],
        tags: ['Stage'],
        onEnter: [{ do: 'cinematic', cinematic: 'cin_reward0001' }],
      },
    });
    const g = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    steps(g, 2);
    g.placeAt([6, 0.4, 0], 0);
    steps(g, 2);
    expect(g.cine.active).toBe(true);
    g.cine.stop();
    // clip marker
    g.heroAnim.play({
      id: 'clp_marker0001',
      length: 1,
      loop: false,
      tracks: [],
      events: [{ t: 0.1, cinematic: 'cin_reward0001' }],
    });
    steps(g, 12);
    expect(g.cine.active).toBe(true);
    g.cine.stop();
  });

  it('a gate’s on-arrive actions play a scene on the map you arrive in', () => {
    const { s, run, map, bus } = project();
    run('map.create', { id: 'map_castle0001', name: 'Castle' });
    const sp = (m: string) => s.get<MapDoc>(`maps/${m}/map.json`)!.spawns[0]!.id;
    run('gate.connect', {
      id: 'gt_castle0001',
      from: { map, spawn: sp(map) },
      to: { map: 'map_castle0001', spawn: sp('map_castle0001') },
    });
    const castleScene = rewardScene({
      id: 'cin_castle0001',
      map: 'map_castle0001',
      at: [0, 0.4, 0],
      giver: chef,
      name: 'Castle',
    });
    run('cinematic.put', { cinematic: castleScene });
    run('gate.update', {
      gate: 'gt_castle0001',
      onArrive: [{ do: 'cinematic', cinematic: 'cin_castle0001', once: true }],
    });
    expect(usesOf(s, 'cin_castle0001').map((u) => u.what)).toEqual(['gate gt_castle0001 · on arrive']);
    expect(
      bus.execute({ type: 'cinematic.delete', payload: { id: 'cin_castle0001' } }, { source: 'user' }).error,
    ).toMatch(/Still used by gate/);
    const g = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    steps(g, 2);
    g.travel('map_castle0001', sp('map_castle0001'), 'gt_castle0001');
    steps(g, 1);
    expect(g.cine.player?.cin.id).toBe('cin_castle0001');
  });
});
