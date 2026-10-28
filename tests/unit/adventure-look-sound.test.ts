import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENTS, DEFAULT_MUSIC, MUS, MUSIC, SND, SOUNDS } from '../../src/builtin/audio';
import { BUILTIN_EFFECTS } from '../../src/builtin/effects';
import { ADVENTURE_PACK } from '../../src/builtin/packs/adventure';
import { renderRecipe } from '../../src/builtin/audio/synth';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Effect } from '../../src/core/effects/schema';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { Project, SoundEvents } from '../../src/core/schema';
import { audioData } from '../../src/engine/audio/data';

/** Step 11, 4b: the adventure pack's look and sound: effects, sounds, music, and the screen look switch. */
describe('the adventure pack: look and sound', () => {
  it('five effects, all valid built-ins', () => {
    expect(ADVENTURE_PACK.effects).toHaveLength(5);
    for (const id of ADVENTURE_PACK.effects) {
      const e = BUILTIN_EFFECTS.find((x) => x.id === id);
      expect(e, id).toBeTruthy();
      expect(Effect.safeParse(e).success, id).toBe(true);
    }
  });

  it('five sounds and three pieces of music: they render, and every game has them (old games too)', () => {
    expect(ADVENTURE_PACK.sounds).toHaveLength(5);
    expect(ADVENTURE_PACK.music).toHaveLength(3);
    for (const n of ['itemget', 'secret', 'swish', 'bossroar', 'keyget']) {
      const pcm = renderRecipe(SOUNDS[n]!, 8000);
      expect(pcm.length, n).toBeGreaterThan(100);
      expect(Math.max(...pcm.map(Math.abs)), n).toBeGreaterThan(0.01);
    }
    for (const n of ['village', 'dungeon', 'boss']) expect(renderRecipe(MUSIC[n]!, 4000).length).toBeGreaterThan(1000);
    expect(SoundEvents.safeParse(DEFAULT_EVENTS).success).toBe(true);
    for (const x of ADVENTURE_PACK.sounds) expect(DEFAULT_EVENTS.events[x.id], x.name).toBeTruthy();
    for (const x of ADVENTURE_PACK.music) expect(DEFAULT_MUSIC.states[x.id], x.name).toBeTruthy();
    // a game with its own audio files still has the pack's
    const old = audioData({
      get: (p: string) =>
        p === 'audio/events.json'
          ? { events: { snd_creak00001: { ...DEFAULT_EVENTS.events[SND.door]!, name: 'Creak' } } }
          : undefined,
    });
    expect(old.events[SND.swish]).toBeTruthy();
    expect(old.music.states[MUS.boss]).toBeTruthy();
  });

  it('the screen look is a project setting: adventure, back to classic, undo', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'A', random: () => 0.6 }));
    const bus = registerAll(new CommandBus(s));
    const run = (payload: unknown) => bus.execute({ type: 'project.update', payload }, { source: 'user' });
    expect(s.manifest.uiLook).toBeUndefined();
    expect(run({ uiLook: 'adventure' }).ok).toBe(true);
    expect(s.manifest.uiLook).toBe('adventure');
    expect(Project.safeParse(s.manifest).success).toBe(true);
    expect(run({ uiLook: 'neon' }).ok).toBe(false);
    expect(run({ uiLook: 'classic' }).ok).toBe(true);
    expect('uiLook' in s.manifest).toBe(false);
    bus.undo();
    expect(s.manifest.uiLook).toBe('adventure');
  });
});
