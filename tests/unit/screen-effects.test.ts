import { describe, expect, it } from 'vitest';
import { BUILTIN_SCREEN_EFFECTS, DEFAULT_SCREEN_EVENTS, SFX } from '../../src/builtin/screen-effects';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Mood, SCREEN_EVENTS, ScreenEffect, ScreenHooks } from '../../src/core/effects/screen';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type MapDoc, paths } from '../../src/core/schema';
import { ScreenFx, screenEffectLength } from '../../src/engine/effects/screen';
import { shaken } from '../../src/engine/runtime/play-renderer';
import { PlaySession } from '../../src/engine/runtime/session';

/** P23 part 2: screen effects — shake, flash, fade, hit-stop and slow motion; a map's mood. */
const def = (id: string) => BUILTIN_SCREEN_EFFECTS.find((e) => e.id === id)!;
const run = (fx: ScreenFx, seconds: number, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) fx.step(step);
};

describe('the built-in screen effects', () => {
  it('are valid, have unique ids, and cover everything that happens', () => {
    for (const e of BUILTIN_SCREEN_EFFECTS) expect(ScreenEffect.safeParse(e).success, e.name).toBe(true);
    expect(new Set(BUILTIN_SCREEN_EFFECTS.map((e) => e.id)).size).toBe(BUILTIN_SCREEN_EFFECTS.length);
    for (const ev of SCREEN_EVENTS)
      expect(BUILTIN_SCREEN_EFFECTS.some((e) => e.id === DEFAULT_SCREEN_EVENTS[ev])).toBe(true);
  });
  it('a screen effect does at least one thing; hooks and moods are checked', () => {
    expect(ScreenEffect.safeParse({ id: 'sce_aaaaaaaaaa', name: 'Nothing' }).success).toBe(false);
    expect(ScreenHooks.safeParse({ events: { hurt: 'none', levelUp: SFX.goldFlash }, lowHealth: false }).success).toBe(
      true,
    );
    expect(ScreenHooks.safeParse({ events: { sneeze: SFX.goldFlash } }).success).toBe(false);
    expect(Mood.safeParse({ grade: 'night', vignette: 0.6, drift: 'rain', amount: 0.8 }).success).toBe(true);
    expect(Mood.safeParse({ grade: 'purple', vignette: 0.6, drift: 'rain', amount: 0.8 }).success).toBe(false);
  });
});

describe('ScreenFx', () => {
  it('a shake moves the camera and dies away; a rumble is slower than a shake', () => {
    const fx = new ScreenFx();
    fx.play(def(SFX.bigShake));
    run(fx, 0.05);
    const [x, y] = fx.shake();
    expect(Math.hypot(x, y)).toBeGreaterThan(0.01);
    run(fx, 1);
    expect(fx.shake()).toEqual([0, 0, 0]);
    expect(fx.count).toBe(0);
    // a camera shaken keeps looking the same way, moved sideways
    const cam = {
      eye: [0, 0, 10] as [number, number, number],
      right: [1, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      forward: [0, 0, -1] as [number, number, number],
      fov: 1,
      distance: 10,
    };
    expect(shaken(cam, [0.5, 0, 0]).eye).toEqual([0.5, 0, 10]);
    expect(shaken(cam, [0, 0, 0])).toBe(cam);
  });
  it('a flash fades back; a fade to black holds until a fade in', () => {
    const fx = new ScreenFx();
    fx.play(def(SFX.whiteFlash));
    expect(fx.layers()[0]).toEqual({ color: '#ffffff', alpha: 0.7 });
    run(fx, 0.15);
    expect(fx.layers()[0]!.alpha).toBeLessThan(0.7);
    run(fx, 0.3);
    expect(fx.layers()).toEqual([]);
    fx.play(def(SFX.fadeOut));
    run(fx, 1.2);
    expect(fx.layers()).toEqual([{ color: '#000000', alpha: 1 }]);
    fx.play(def(SFX.fadeIn));
    run(fx, 0.5);
    expect(fx.layers()[0]!.alpha).toBeCloseTo(0.5, 1);
    run(fx, 0.6);
    expect(fx.layers()).toEqual([]);
  });
  it('hit-stop freezes the game for a moment on real time; slow motion eases back to full speed', () => {
    const fx = new ScreenFx();
    fx.play(def(SFX.bigHit));
    expect(fx.speed()).toBe(0);
    run(fx, 0.1);
    expect(fx.speed()).toBe(1);
    fx.play(def(SFX.slowMo));
    run(fx, 0.2);
    expect(fx.speed()).toBeCloseTo(0.35);
    run(fx, 1.4);
    expect(fx.speed()).toBeGreaterThan(0.6);
    run(fx, 0.2);
    expect(fx.speed()).toBe(1);
  });
  it('Reduce motion: shakes a quarter as strong, flashes faint, hit-stop half as long', () => {
    const a = new ScreenFx();
    const b = new ScreenFx();
    b.reduceMotion = true;
    for (const fx of [a, b]) {
      fx.play(def(SFX.finisher));
      run(fx, 0.05);
    }
    const ka = Math.hypot(...a.shake().slice(0, 2));
    const kb = Math.hypot(...b.shake().slice(0, 2));
    expect(kb).toBeCloseTo(ka / 4, 5);
    expect(Math.max(...b.layers().map((l) => l.alpha))).toBeLessThanOrEqual(0.25);
    expect(screenEffectLength(def(SFX.finisher))).toBe(1.2);
  });
});

describe('in Play', () => {
  const game = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Moody', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    return { store, bus };
  };
  it('the hero hurt flashes red and charged hits play the big hit; a game can pick its own or none', () => {
    const { store, bus } = game();
    let s = new PlaySession(store.snapshot());
    s.hurt(1);
    expect(s.screenFx.layers()[0]?.color).toBe('#ff2a2a');
    expect(
      bus.execute([{ type: 'project.update', payload: { screenEffects: { events: { hurt: 'none' } } } }], {
        source: 'user',
      }).ok,
    ).toBe(true);
    s = new PlaySession(store.snapshot());
    s.hurt(1);
    expect(s.screenFx.layers()).toEqual([]);
    expect(
      bus.execute([{ type: 'project.update', payload: { screenEffects: { events: { hurt: 'sce_nothere00' } } } }], {
        source: 'user',
      }).ok,
    ).toBe(false);
  });
  it('a hit-stop freezes the game clock, not the screen effects', () => {
    const { store } = game();
    const s = new PlaySession(store.snapshot());
    s.runtime.advance(0.1);
    s.playScreenEffect(SFX.hitStop);
    // a step already owed may still run; no new game time comes while it holds
    s.runtime.advance(0.02);
    const t0 = s.runtime.ticks;
    expect(s.runtime.slow).toBe(0);
    s.runtime.advance(0.04);
    expect(s.runtime.ticks).toBe(t0);
    s.runtime.advance(0.05);
    s.runtime.advance(0.05);
    expect(s.runtime.slow).toBe(1);
    expect(s.runtime.ticks).toBeGreaterThan(t0);
  });
  it('a map has a mood; logic changes it while the game plays and Clear brings it back', () => {
    const { store, bus } = game();
    const map = store.manifest.entry.map;
    const mood = { grade: 'night', vignette: 0.5, drift: 'rain', amount: 0.7 } as const;
    expect(bus.execute([{ type: 'map.setEnvironment', payload: { map, mood } }], { source: 'user' }).ok).toBe(true);
    expect(store.get<MapDoc>(paths.map(map))?.mood).toEqual(mood);
    const s = new PlaySession(store.snapshot());
    expect(s.mood.grade).toBe('night');
    s.screenFxOp('mood', { grade: 'warm', vignette: 0, drift: 'none', amount: 0.5 });
    expect(s.mood.grade).toBe('warm');
    s.screenFxOp('clear');
    expect(s.mood.grade).toBe('night');
    // no mood: the map file stays as it was
    bus.execute([{ type: 'map.setEnvironment', payload: { map, mood: null } }], { source: 'user' });
    expect('mood' in store.get<MapDoc>(paths.map(map))!).toBe(false);
  });
  it('a game’s own screen effect, played from an action; one in use cannot be deleted', () => {
    const { store, bus } = game();
    const own = { id: 'sce_thunder000', name: 'Thunder', flash: { color: '#e8f0ff', alpha: 0.8, seconds: 0.4 } };
    expect(bus.execute([{ type: 'screenEffect.put', payload: { effect: own } }], { source: 'user' }).ok).toBe(true);
    expect(
      bus.execute([{ type: 'screenEffect.put', payload: { effect: { ...def(SFX.bigShake), name: 'Mine' } } }], {
        source: 'user',
      }).ok,
    ).toBe(false);
    bus.execute([{ type: 'project.update', payload: { screenEffects: { events: { levelUp: own.id } } } }], {
      source: 'user',
    });
    expect(bus.execute([{ type: 'screenEffect.delete', payload: { id: own.id } }], { source: 'user' }).ok).toBe(false);
    const s = new PlaySession(store.snapshot());
    s.actions.run([{ do: 'screenEffect', effect: own.id }], 0);
    expect(s.screenFx.layers()[0]?.color).toBe('#e8f0ff');
  });
});
