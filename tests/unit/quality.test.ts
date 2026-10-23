import { describe, expect, it } from 'vitest';
import settingsScreen from '../../src/builtin/screens/settings.json';
import { AI_COMMANDS } from '../../src/core/ai/commands';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import {
  AutoQuality,
  autoQuality,
  lowerQuality,
  QUALITY,
  QUALITY_LEVELS,
  resolveQuality,
  SLOW_FOR,
} from '../../src/core/render/quality';
import { PlayerSettings } from '../../src/core/save/progress';
import { paths, type Settings, validateFile } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';

/** P27 part 4: quality levels — the table, Auto, who decides, stepping down, and the game, editor and AI sides. */
describe('quality levels', () => {
  it('each level draws less than the one above', () => {
    expect(QUALITY_LEVELS).toEqual(['low', 'medium', 'high']);
    const keys = ['lights', 'shadowSize', 'particles', 'viewScale', 'detailScale', 'pixelRatio'] as const;
    for (const k of keys) {
      expect(QUALITY.low[k]).toBeLessThan(QUALITY.medium[k]);
      expect(QUALITY.medium[k]).toBeLessThan(QUALITY.high[k]);
    }
    expect(QUALITY.low.shadows).toBe(false);
    expect(QUALITY.high.shadows).toBe(true);
    expect(QUALITY.high.lights).toBe(8);
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('low')).toBe('low');
  });

  it('Auto picks from the device: phones and weak computers Low, strong ones High, unknown Medium', () => {
    expect(autoQuality({})).toBe('medium');
    expect(autoQuality({ touch: true, cores: 4, memory: 3 })).toBe('low');
    expect(autoQuality({ touch: true, cores: 8, memory: 8 })).toBe('medium');
    expect(autoQuality({ cores: 2 })).toBe('low');
    expect(autoQuality({ cores: 16, memory: 8 })).toBe('high');
    expect(autoQuality({ cores: 8 })).toBe('high');
    expect(autoQuality({ cores: 6, memory: 8 })).toBe('medium');
  });

  it('the player’s choice wins, then the maker’s default, then Auto', () => {
    const strong = { cores: 16, memory: 16 };
    expect(resolveQuality(undefined, undefined, strong)).toBe('high');
    expect(resolveQuality('auto', 'low', strong)).toBe('low');
    expect(resolveQuality('medium', 'low', strong)).toBe('medium');
    expect(resolveQuality('auto', 'auto', { touch: true })).toBe('low');
  });

  it('Auto steps down after seconds of slow frames, not after a hitch, and waits before stepping again', () => {
    const a = new AutoQuality();
    // one slow second among fast ones
    let down = false;
    for (let i = 0; i < 20; i++) down ||= a.frame(60);
    for (let i = 0; i < 120; i++) down ||= a.frame(16);
    expect(down).toBe(false);
    // slow for SLOW_FOR seconds: one step down
    let steps = 0;
    for (let t = 0; t < SLOW_FOR * 1000 + 100; t += 60) if (a.frame(60)) steps++;
    expect(steps).toBe(1);
    // fast again: no more
    for (let i = 0; i < 600; i++) if (a.frame(16)) steps++;
    expect(steps).toBe(1);
  });
});

describe('quality in the game', () => {
  const setup = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Q', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    return { store, bus };
  };

  it('Project › Graphics quality is saved in the settings file, checked, and undone', () => {
    const { store, bus } = setup();
    expect(store.get<Settings>(paths.settings)!.quality).toBe('auto');
    const r = bus.execute({ type: 'project.update', payload: { quality: 'low' } }, { source: 'user' });
    expect(r.ok, r.error).toBe(true);
    expect(bus.history().at(-1)?.label).toBe('Graphics quality');
    expect(store.get<Settings>(paths.settings)!.quality).toBe('low');
    expect(validateFile(paths.settings, store.get(paths.settings))).toEqual([]);
    expect(
      bus.execute({ type: 'project.update', payload: { quality: 'ultra' as never } }, { source: 'user' }).error,
    ).toMatch(/auto, low, medium or high/);
    bus.undo();
    expect(store.get<Settings>(paths.settings)!.quality).toBe('auto');
  });

  it('the game plays at the maker’s level, the player’s, or the editor’s preview; particles follow', () => {
    const { store, bus } = setup();
    bus.execute({ type: 'project.update', payload: { quality: 'low' } }, { source: 'user' });
    const p = new PlaySession(store.snapshot(), { device: { cores: 16, memory: 16 } });
    expect(p.quality).toBe('low');
    expect(p.effects.cap).toBe(QUALITY.low.particles);
    // the player picks High in Settings (Graphics: auto → low → medium → high)
    p.progress.setSetting('quality', 'high');
    expect(p.quality).toBe('high');
    expect(p.effects.cap).toBe(QUALITY.high.particles);
    expect(p.progress.value('settings.quality')).toBe('Graphics: high');
    // the editor's preview wins while it is on
    p.setQualityPreview('medium');
    expect(p.quality).toBe('medium');
    expect(p.qualityAuto).toBe(false);
    p.setQualityPreview(null);
    expect(p.quality).toBe('high');
    // Auto (the player's and the maker's): from the device
    p.progress.setSetting('quality', 'auto');
    expect(p.quality).toBe('low'); // the maker's Low
    const auto = new PlaySession(setup().store.snapshot(), { device: { cores: 16, memory: 16 } });
    expect(auto.quality).toBe('high');
    expect(auto.qualityAuto).toBe(true);
    const preview = new PlaySession(store.snapshot(), { quality: 'medium' });
    expect(preview.quality).toBe('medium');
  });

  it('Auto steps down while frames stay slow, says so, and stops at Low', () => {
    const p = new PlaySession(setup().store.snapshot(), { device: { cores: 16, memory: 16 } });
    expect(p.quality).toBe('high');
    const said: string[] = [];
    p.listeners.add((e) => said.push(e.msg));
    for (let t = 0; t < 30_000; t += 60) p.frameTime(60);
    expect(p.quality).toBe('low');
    expect(p.effects.cap).toBe(QUALITY.low.particles);
    expect(said.filter((m) => /Graphics lowered to/.test(m))).toEqual([
      'Graphics lowered to Medium to keep the game smooth',
      'Graphics lowered to Low to keep the game smooth',
    ]);
    // a chosen level never steps down
    const fixed = new PlaySession(setup().store.snapshot(), { quality: 'high' });
    for (let t = 0; t < 30_000; t += 60) fixed.frameTime(60);
    expect(fixed.quality).toBe('high');
  });

  it('the Settings screen has a Graphics button; old player records without it still read', () => {
    const json = JSON.stringify(settingsScreen);
    expect(json).toContain('{settings.quality}');
    expect(json).toContain('"key":"quality"');
    const old = { music: 80, sounds: 100, invertY: false, cameraSpeed: 100, textSize: 'normal', difficulty: 'normal' };
    expect(PlayerSettings.safeParse(old).success).toBe(true);
    expect(PlayerSettings.safeParse({ ...old, quality: 'medium' }).success).toBe(true);
    expect(PlayerSettings.safeParse({ ...old, quality: 'ultra' }).success).toBe(false);
  });

  it('the AI can set the game’s quality', () => {
    const cmd = AI_COMMANDS.find((c) => c.type === 'project.update')!;
    expect(cmd.schema.safeParse({ quality: 'medium' }).success).toBe(true);
    expect(cmd.schema.safeParse({ quality: 'ultra' }).success).toBe(false);
    expect(cmd.doc).toMatch(/quality/);
  });
});
