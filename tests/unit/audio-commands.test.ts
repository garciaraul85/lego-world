import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENTS, DEFAULT_MIXER, MUS, SND } from '../../src/builtin/audio';
import { BUILTIN_SCREENS, SCR } from '../../src/builtin/screens';
import { usesOf } from '../../src/core/audio/usage';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { Instances, MapDoc, Mixer, SoundEvents } from '../../src/core/schema';

function setup() {
  const s = new ProjectStore(newProjectFiles({ name: 'A', random: () => 0.6 }));
  const bus = registerAll(new CommandBus(s));
  const run = (type: string, payload: unknown) => bus.execute({ type, payload }, { source: 'user' });
  return { s, bus, run, map: s.manifest.entry.map };
}

describe('Audio commands (P5.6)', () => {
  it('creates, edits and deletes a sound event; a used event cannot be deleted; undo restores', () => {
    const { s, bus, run, map } = setup();
    const ev = { ...DEFAULT_EVENTS.events[SND.door]!, name: 'Creak', volume: -4 };
    expect(run('audio.setEvent', { id: 'snd_creak00001', event: ev }).ok).toBe(true);
    expect(s.get<SoundEvents>('audio/events.json')!.events.snd_creak00001!.name).toBe('Creak');
    expect(run('audio.setEvent', { id: 'snd_bad', event: ev }).ok).toBe(false);
    expect(run('audio.setEvent', { id: 'snd_creak00001', event: { ...ev, maxVoices: 99 } }).ok).toBe(false);
    run('item.add', {
      map,
      item: {
        id: 'ins_creaky0001',
        kind: 'emitter',
        sound: 'snd_creak00001',
        pos: [0, 1, 0],
        mode: 'interval',
        interval: [2, 4],
        maxDistance: 12,
        volume: 0,
      },
    });
    expect(usesOf(s, 'snd_creak00001').map((u) => u.what)).toEqual(['emitter ins_creaky0001']);
    expect(run('audio.setEvent', { id: 'snd_creak00001', event: null }).error).toMatch(/Still used by emitter/);
    run('item.remove', { map, id: 'ins_creaky0001' });
    expect(run('audio.setEvent', { id: 'snd_creak00001', event: null }).ok).toBe(true);
    expect(s.has('audio/events.json')).toBe(false);
    bus.undo();
    expect(s.has('audio/events.json')).toBe(true);
  });

  it('mixer faders start from the defaults; map music and ambience; project entry screen', () => {
    const { s, run, map } = setup();
    expect(run('audio.setMixer', { base: DEFAULT_MIXER, buses: { music: -12 } }).ok).toBe(true);
    const mx = s.get<Mixer>('audio/mixer.json')!;
    expect(mx.buses.music).toBe(-12);
    expect(mx.buses.sfx).toBe(DEFAULT_MIXER.buses.sfx);
    expect(run('audio.setMixer', { base: DEFAULT_MIXER, buses: { music: 40 } }).ok).toBe(false);
    expect(s.get<MapDoc>(`maps/${map}/map.json`)!.music).toBe(MUS.explore);
    run('map.setAudio', { map, music: MUS.night, ambience: SND.wind });
    expect(s.get<MapDoc>(`maps/${map}/map.json`)).toMatchObject({ music: MUS.night, ambience: SND.wind });
    expect(usesOf(s, SND.wind)[0]!.what).toBe('Map 1 · map ambience');
    expect(s.manifest.entry.screen).toBe(SCR.splash);
    run('project.update', { entryScreen: SCR.title });
    expect(s.manifest.entry.screen).toBe(SCR.title);
  });

  it('screens: editing a built-in saves an override; reset brings the built-in back; custom screens', () => {
    const { s, run } = setup();
    const hud = BUILTIN_SCREENS.find((x) => x.id === SCR.hud)!;
    expect(run('screen.put', { screen: { ...hud, name: 'My HUD' } }).ok).toBe(true);
    expect(s.has(`screens/${SCR.hud}.json`)).toBe(true);
    expect(run('screen.delete', { id: SCR.hud, builtin: true }).ok).toBe(true);
    const shop = { ...hud, id: 'scr_shop000001', kind: 'custom', name: 'Shop', pausesGame: true };
    run('screen.put', { screen: shop });
    run('map.addZone', {
      map: s.manifest.entry.map,
      zone: {
        id: 'zn_shop000001',
        min: [0, 0, 0],
        max: [2, 2, 2],
        tags: ['Shop'],
        onEnter: [{ do: 'showScreen', screen: 'scr_shop000001' }],
      },
    });
    expect(run('screen.delete', { id: 'scr_shop000001' }).error).toMatch(/Still used/);
    expect(run('screen.put', { screen: { ...shop, root: { type: 'nope' } } }).ok).toBe(false);
  });

  it('world UI items validate and update in place', () => {
    const { s, run, map } = setup();
    const sign = {
      id: 'ins_sign000001',
      kind: 'ui',
      widget: 'sign',
      pos: [2, 3, 2],
      text: 'Coins: {inventory.coin}',
      maxDistance: 20,
    };
    expect(run('item.add', { map, item: sign }).ok).toBe(true);
    expect(run('item.add', { map, item: sign }).ok).toBe(false);
    expect(run('item.update', { map, id: 'ins_sign000001', patch: { text: 'Welcome' } }).ok).toBe(true);
    const items = s.get<Instances>(`maps/${map}/instances.json`)!.items;
    expect(items.find((i) => i.id === 'ins_sign000001')).toMatchObject({ kind: 'ui', text: 'Welcome' });
    expect(run('item.update', { map, id: 'ins_sign000001', patch: { maxDistance: 0 } }).ok).toBe(false);
  });
});
