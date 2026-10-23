import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import {
  DEFAULT_DAY_MINUTES,
  FOG_PRESET,
  FOG_PRESETS,
  Fog,
  fogPresetOf,
  skyElapsed,
} from '../../src/core/lighting/atmosphere';
import { LIGHT_PRESET, presetOf } from '../../src/core/lighting/light';
import { CATALOG } from '../../src/core/logic/catalog';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type MapDoc, paths } from '../../src/core/schema';
import { ambientOf, atmosphere, fogParams } from '../../src/engine/lighting/atmosphere';
import { gatherLights, pointLights } from '../../src/engine/lighting/lights';
import { FRAGMENT } from '../../src/engine/render/shaders';
import { PlaySession } from '../../src/engine/runtime/session';

/** P27 part 2: fog, the shadows' colour, and day and night. */
const sky = { horizon: [0.6, 0.7, 0.8], zenith: [0.3, 0.5, 0.9], ambient: [0.4, 0.4, 0.4], night: 0 };
const cycle: Parameters<typeof atmosphere>[2] = {
  // a stand-in for v68's sky: night after half a day
  sample: (time: string, elapsed: number) =>
    ({
      ...sky,
      night: (time === 'night' ? 1 : 0) ^ (elapsed % 1200 >= 600 ? 1 : 0),
    }) as never,
};
const map = (over: Partial<MapDoc> = {}) =>
  ({ sky: { time: 'day' }, weather: { rain: 0, snow: 0, snowing: false }, ...over }) as MapDoc;

describe('atmosphere', () => {
  it('fog presets are valid fogs, and a fog knows its preset until it is changed', () => {
    for (const k of FOG_PRESETS) {
      expect(Fog.safeParse(FOG_PRESET[k].fog).success, k).toBe(true);
      expect(fogPresetOf(FOG_PRESET[k].fog)).toBe(k);
    }
    expect(fogPresetOf({ ...FOG_PRESET.mist.fog, far: 40 })).toBeNull();
    expect(fogPresetOf(undefined)).toBeNull();
    expect(Fog.safeParse({ near: 0, far: 1, thickness: 0.5 }).success).toBe(false);
  });
  it('the game clock runs the sky at the map’s day length; 0 stops time', () => {
    expect(skyElapsed(60, undefined)).toBe(60);
    expect(skyElapsed(60, DEFAULT_DAY_MINUTES)).toBe(60);
    expect(skyElapsed(60, 2)).toBe(600);
    expect(skyElapsed(60, 0)).toBe(0);
  });
  it('fog: none, the sky’s colour or its own, and ground fog only when it has a height', () => {
    expect(fogParams(undefined, sky as never)).toBeNull();
    const mist = fogParams({ near: 10, far: 60, thickness: 0.8 }, sky as never)!;
    expect(mist.color).toEqual([0.6, 0.7, 0.8]);
    expect(mist.ground).toBe(0);
    const ground = fogParams(FOG_PRESET.ground.fog, sky as never)!;
    expect(ground.height).toBe(2.5);
    expect(ground.ground).toBe(0.8);
    expect(ground.color[0]).toBeGreaterThan(0.5);
  });
  it('the shadows: the sky’s own, tinted toward a colour, scaled by the strength', () => {
    expect(ambientOf([0.4, 0.4, 0.4], undefined)).toEqual([0.4, 0.4, 0.4]);
    const green = ambientOf([0.4, 0.4, 0.4], { color: '#00ff00', strength: 1 });
    expect(green[1]).toBeGreaterThan(green[0]!);
    expect(green[1]).toBeGreaterThan(green[2]!);
    expect(ambientOf([0.4, 0.4, 0.4], { color: '#00ff00', strength: 0 })).toEqual([0, 0, 0]);
  });
  it('a map’s atmosphere: the hour moves with the clock, a preview picks an hour, thick fog hides the sky', () => {
    expect(atmosphere(map(), 0, cycle).sky.night).toBe(0);
    // a 2-minute day: half a day is a minute
    expect(atmosphere(map({ dayLength: 2 }), 61, cycle).sky.night).toBe(1);
    expect(atmosphere(map({ dayLength: 0 }), 5000, cycle).sky.night).toBe(0);
    expect(atmosphere(map(), 0, cycle, 700).sky.night).toBe(1);
    const thick = atmosphere(map({ fog: FOG_PRESET.thick.fog }), 0, cycle);
    expect(thick.fog?.far).toBe(24);
    expect(Math.abs(thick.sky.horizon[0]! - thick.fog!.color[0])).toBeLessThan(Math.abs(0.6 - thick.fog!.color[0]));
    expect(atmosphere(map(), 0, cycle).fog).toBeNull();
  });
  it('lights that shine only at night fade in as it gets dark', () => {
    const night = { ...LIGHT_PRESET.lamp.light, atNight: true };
    expect(presetOf(night)).toBeNull();
    const src = gatherLights({
      items: [{ id: 'ins_lampnight1', kind: 'light', name: 'Lamp', pos: [0, 2, 0], on: true, light: night } as never],
      assets: [],
      effectDef: () => null,
    });
    expect(pointLights(src, 0, 0)).toHaveLength(0);
    const half = pointLights(src, 0, 0.5)[0]!.color[0];
    const full = pointLights(src, 0, 1)[0]!.color[0];
    expect(half).toBeCloseTo(full / 2, 5);
    expect(BUILTIN_ASSETS.find((a) => a.name === 'Lamp post')!.light?.atNight).toBe(true);
  });
  it('the lit shader has distance fog and ground fog', () => {
    expect(FRAGMENT).toContain('uFogMax');
    expect(FRAGMENT).toContain('uFogH');
  });
});

describe('atmosphere in a game', () => {
  const game = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Misty', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const id = store.manifest.entry.map;
    const run = (cmds: unknown) => bus.execute(cmds as Parameters<typeof bus.execute>[0], { source: 'user' });
    const doc = () => store.get<MapDoc>(paths.map(id))!;
    return { store, id, run, doc };
  };
  it('fog, the shadows’ colour and the day length are set with commands and cleared with null', () => {
    const { id, run, doc } = game();
    expect(run({ type: 'map.setEnvironment', payload: { map: id, fog: FOG_PRESET.mist.fog } }).ok).toBe(true);
    expect(fogPresetOf(doc().fog)).toBe('mist');
    expect(run({ type: 'map.setEnvironment', payload: { map: id, fog: { near: 50, far: 20, thickness: 1 } } }).ok).toBe(
      false,
    );
    expect(
      run({ type: 'map.setEnvironment', payload: { map: id, ambient: { color: '#7a9cff', strength: 1.2 } } }).ok,
    ).toBe(true);
    expect(doc().ambient?.color).toBe('#7a9cff');
    expect(run({ type: 'map.setEnvironment', payload: { map: id, dayLength: 2 } }).ok).toBe(true);
    expect(doc().dayLength).toBe(2);
    expect(run({ type: 'map.setEnvironment', payload: { map: id, dayLength: 500 } }).ok).toBe(false);
    run({ type: 'map.setEnvironment', payload: { map: id, fog: null, ambient: null, dayLength: null } });
    expect('fog' in doc() || 'ambient' in doc() || 'dayLength' in doc()).toBe(false);
  });
  it('in Play: logic sets the time of day and the fog; a night start is night', () => {
    const { store, id, run } = game();
    run([{ type: 'map.setEnvironment', payload: { map: id, fog: FOG_PRESET.mist.fog, time: 'night' } }]);
    const p = new PlaySession(store.snapshot());
    expect(p.atmosphereNow().sky.night).toBeGreaterThan(0.5);
    expect(p.atmosphereNow().fog?.far).toBe(60);
    p.skyOp('time', 'noon');
    expect(p.atmosphereNow().sky.night).toBeLessThan(0.5);
    p.skyOp('fog', 'thick');
    expect(p.atmosphereNow().fog?.far).toBe(24);
    p.skyOp('fog', 'none');
    expect(p.atmosphereNow().fog).toBeNull();
    p.skyOp('fog', 'map');
    expect(p.atmosphereNow().fog?.far).toBe(60);
    expect(CATALOG.filter((n) => n.category === 'Sky').map((n) => n.type)).toEqual(['sky.time', 'sky.fog']);
  });
});
