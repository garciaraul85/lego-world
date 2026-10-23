import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { BUILTIN_EFFECTS, FX } from '../../src/builtin/effects';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Effect } from '../../src/core/effects/schema';
import { flickerAt, LIGHT_PRESET, LIGHT_PRESETS, LightDef, lightRgb, presetOf } from '../../src/core/lighting/light';
import { CATALOG } from '../../src/core/logic/catalog';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { Asset, type Instances, type LightInstance, type MapDoc, paths } from '../../src/core/schema';
import { findLight, gatherLights, pointLights } from '../../src/engine/lighting/lights';
import { type PointLight, pickLights } from '../../src/engine/render/renderer';
import { FRAGMENT, V68_FRAGMENT } from '../../src/engine/render/shaders';
import { PlaySession } from '../../src/engine/runtime/session';

/** P27 part 1: lights, shadows and darkness. */
const torch = (id: string, name: string, on = true): LightInstance => ({
  id: id as LightInstance['id'],
  kind: 'light',
  name,
  pos: [2, 2.4, 2],
  on,
  light: { ...LIGHT_PRESET.torch.light },
});

describe('lights', () => {
  it('presets are valid lights, and a light knows its preset until it is changed', () => {
    for (const k of LIGHT_PRESETS) {
      expect(LightDef.safeParse(LIGHT_PRESET[k].light).success, k).toBe(true);
      expect(presetOf(LIGHT_PRESET[k].light)).toBe(k);
    }
    expect(presetOf({ ...LIGHT_PRESET.torch.light, color: '#00ff00' })).toBeNull();
    expect(LightDef.safeParse({ ...LIGHT_PRESET.lamp.light, range: 1 }).success).toBe(false);
  });
  it('a flame flickers between 1 − flicker and 1; a steady light stays at 1; brightness scales the colour', () => {
    const ks = Array.from({ length: 200 }, (_, i) => flickerAt(0.5, i * 0.05, 3));
    expect(Math.min(...ks)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(Math.max(...ks)).toBeLessThanOrEqual(1 + 1e-9);
    expect(new Set(ks.map((k) => k.toFixed(3))).size).toBeGreaterThan(20);
    expect(flickerAt(0, 5)).toBe(1);
    const [r, g, b] = lightRgb({ color: '#ffffff', brightness: 2 });
    expect([r, g, b]).toEqual([2, 2, 2]);
  });
  it('a map’s lights: placed ones, assets in the states they glow in (not smashed), effects that glow while they play', () => {
    const lamp = BUILTIN_ASSETS.find((a) => a.name === 'Lamp post')!;
    expect(Asset.safeParse(lamp).success).toBe(true);
    expect(lamp.light?.states).toEqual(['on']);
    const fire = BUILTIN_EFFECTS.find((e) => e.id === FX.fire)!;
    expect(Effect.safeParse(fire).success).toBe(true);
    const inst = { id: 'ins_lampaaaaa1', asset: lamp.id, pos: [10, 1, 10], rot: 0, name: 'Lamp A' } as never;
    const items = [
      torch('ins_torchaaaa1', 'Torch 1'),
      torch('ins_torchaaaa2', 'Torch 2', false),
      {
        id: 'ins_fireaaaaa1',
        kind: 'effect',
        name: 'Campfire',
        effect: FX.fire,
        pos: [0, 1, 0],
        scale: 2,
        interval: [2, 4],
        maxDistance: 40,
        playing: true,
      },
    ] as Instances['items'];
    const all = gatherLights({
      items,
      assets: [
        { inst, def: lamp, state: 'on' },
        { inst: { ...(inst as object), id: 'ins_lampaaaaa2', name: 'Lamp B' } as never, def: lamp, state: 'off' },
        { inst: { ...(inst as object), id: 'ins_lampaaaaa3' } as never, def: lamp, state: 'on', gone: true },
      ],
      effectDef: (id) => BUILTIN_EFFECTS.find((e) => e.id === id),
    });
    expect(all.map((l) => [l.name ?? l.key, l.kind, l.on])).toEqual([
      ['Torch 1', 'light', true],
      ['Torch 2', 'light', false],
      ['Campfire', 'effect', true],
      ['Lamp A', 'asset', true],
      ['Lamp B', 'asset', false],
    ]);
    // the lamp's light is up at its head, over its corner; a fire twice as big lights twice as far (to 40)
    expect(all[3]!.pos).toEqual([11, 6.4, 11]);
    expect(all[2]!.def.range).toBe(20);
    expect(pointLights(all, 0)).toHaveLength(3);
    expect(findLight(all, 'lamp a')?.key).toBe('ins_lampaaaaa1');
  });
  it('the renderer draws the brightest lights near the focus, and the one that casts shadows first', () => {
    const at = (x: number, shadow = false): PointLight => ({ pos: [x, 0, 0], color: [1, 1, 1], range: 10, shadow });
    const lights = [at(500), at(12, true), ...Array.from({ length: 7 }, (_, i) => at(i))];
    const picked = pickLights(lights, [0, 0, 0]);
    expect(picked).toHaveLength(8);
    expect(picked[0]!.shadow).toBe(true);
    expect(picked.some((l) => l.pos[0] === 500)).toBe(false);
    expect(pickLights(lights, [0, 0, 0], 8, false)[0]!.shadow).toBe(false);
  });
  it('the lit shader is v68’s with lights added (the character model’s own changes still find their place)', () => {
    expect(FRAGMENT).not.toBe(V68_FRAGMENT);
    expect(FRAGMENT).toContain('pointLights(n,vPosition)');
    expect(FRAGMENT).toContain('uniform samplerCube uShadow;');
    for (const anchor of ['void main(){', 'vec3 base=mix(vColor,']) expect(FRAGMENT).toContain(anchor);
  });
});

describe('lights in a game', () => {
  const game = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Dark', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const map = store.manifest.entry.map;
    const run = (cmds: unknown) => {
      const r = bus.execute(cmds as Parameters<typeof bus.execute>[0], { source: 'user' });
      expect(r.ok, r.error).toBe(true);
    };
    return { store, bus, map, run };
  };
  it('a map is made dark and lights are placed with commands (one undo each); a mood-less map stays as it was', () => {
    const { store, bus, map, run } = game();
    run({ type: 'map.setEnvironment', payload: { map, darkness: 0.9 } });
    expect(store.get<MapDoc>(paths.map(map))!.darkness).toBe(0.9);
    run({ type: 'item.add', payload: { map, item: torch('ins_torchaaaa1', 'Torch 1') } });
    run({ type: 'item.update', payload: { map, id: 'ins_torchaaaa1', patch: { on: false } } });
    expect(
      (store.get<Instances>(paths.instances(map))!.items.find((i) => i.id === 'ins_torchaaaa1') as LightInstance).on,
    ).toBe(false);
    expect(bus.execute([{ type: 'map.setEnvironment', payload: { map, darkness: 2 } }], { source: 'user' }).ok).toBe(
      false,
    );
    run({ type: 'map.setEnvironment', payload: { map, darkness: 0 } });
    expect('darkness' in store.get<MapDoc>(paths.map(map))!).toBe(false);
  });
  it('in Play: logic switches lights on, off and over by name, and sets the darkness', () => {
    const { store, map, run } = game();
    run([
      { type: 'map.setEnvironment', payload: { map, darkness: 0.8 } },
      { type: 'item.add', payload: { map, item: torch('ins_torchaaaa1', 'Torch 1', false) } },
    ]);
    const p = new PlaySession(store.snapshot());
    expect(p.darkness).toBe(0.8);
    expect(p.pointLightsNow()).toHaveLength(0);
    p.lightOp('on', 'Torch 1');
    expect(p.pointLightsNow()).toHaveLength(1);
    p.lightOp('toggle', 'torch 1');
    expect(p.pointLightsNow()).toHaveLength(0);
    p.lightOp('darkness', '', undefined, 0.3);
    expect(p.darkness).toBe(0.3);
    // the action and the logic node reach the same place
    p.actions.run([{ do: 'lightOn', name: 'Torch 1', on: 'on' }], p.clock);
    expect(p.lightSources().find((l) => l.name === 'Torch 1')?.on).toBe(true);
    expect(CATALOG.filter((n) => n.category === 'Lights').map((n) => n.type)).toEqual([
      'light.on',
      'light.off',
      'light.toggle',
      'light.darkness',
    ]);
  });
});
