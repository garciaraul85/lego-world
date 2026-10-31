import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { FUSE } from '../../src/engine/runtime/firelight';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 12b: fire (burnable things, torch stands, the Torch), bombs, and beams of light with mirrors and sensors. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

function game(things: [string, [number, number, number], string, number?][]) {
  const store = new ProjectStore(newProjectFiles({ name: 'Fire', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const run = (c: unknown) => {
    const r = bus.execute(c as Parameters<typeof bus.execute>[0], { source: 'user' });
    expect(r.ok, r.error).toBe(true);
  };
  for (const [name, pos, id, rot] of things) {
    const def = piece(name);
    if (!store.has(paths.asset(def.id))) run({ type: 'asset.create', payload: { asset: def } });
    run({ type: 'asset.place', payload: { map, asset: def.id, pos, rot: rot ?? 0, id } });
  }
  const tuft = piece('Grass tuft');
  run({ type: 'asset.create', payload: { asset: tuft } });
  run({ type: 'asset.place', payload: { map, asset: tuft.id, pos: [-4, 0, -4], rot: 0, id: 'ins_corner0001' } });
  run({ type: 'asset.place', payload: { map, asset: tuft.id, pos: [44, 0, 36], rot: 0, id: 'ins_corner0002' } });
  const p = new PlaySession(store.snapshot());
  const get = (id: string) => p.world.instances.find((i) => i.inst.id === id);
  return { store, p, get };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};
const give = (p: PlaySession, item: string, n: number) =>
  (p as unknown as { give(i: string, n: number): void }).give(item, n);

describe('fire and light parts', () => {
  it('the new pieces are valid and say nothing is wrong', () => {
    for (const n of [
      'Vines',
      'Wooden barricade',
      'Spider web',
      'Torch stand',
      'Timed torch',
      'Bomb bag',
      'Hand torch',
      'Sun crest',
      'Mirror',
      'Light sensor',
    ]) {
      const a = piece(n);
      expect(a, n).toBeTruthy();
      expect(validateFile(paths.asset(a.id), a), n).toEqual([]);
      expect(puzzleProblems(a), n).toEqual([]);
    }
    expect(piece('Torch stand').switch).toMatchObject({ by: 'hit', hitBy: ['fire'] });
    expect(piece('Light sensor').switch).toMatchObject({ by: 'light', stays: 'held' });
    expect(puzzleProblems({ ...piece('Mirror'), states: ['one'] })[0]).toMatch(/mirror but has one state/);
  });
});

describe('fire', () => {
  it('the Torch’s flame sets vines alight; they burn away, set the vines touching them alight, and logic hears it', () => {
    const { p, get } = game([
      ['Vines', [10, 0, 12], 'ins_vines00001'],
      ['Vines', [14, 0, 12], 'ins_vines00002'],
      ['Vines', [30, 0, 12], 'ins_vines00003'],
    ]);
    const heard: unknown[] = [];
    const fire = p.logic.fire.bind(p.logic);
    p.logic.fire = (e: Parameters<typeof fire>[0], ...rest: unknown[]) => {
      if (e.type === 'event.onBurned') heard.push(e.payload);
      return (fire as (...a: unknown[]) => unknown)(e, ...rest) as never;
    };
    give(p, 'Torch', 1);
    p.placeAt([12, 0.4, 10.6], 0);
    p.useItem('Torch', 1);
    expect(p.fireLight.burning.has('ins_vines00001')).toBe(true);
    steps(p, 1);
    // the vines touching them caught too; the far ones did not
    expect(p.fireLight.burning.has('ins_vines00002')).toBe(true);
    expect(p.fireLight.burning.has('ins_vines00003')).toBe(false);
    steps(p, 2.5);
    expect(get('ins_vines00001')).toBeUndefined();
    expect(get('ins_vines00002')).toBeUndefined();
    expect(get('ins_vines00003')).toBeTruthy();
    expect(heard).toEqual([{ target: 'ins_vines00001' }, { target: 'ins_vines00002' }]);
    // burnt away for good: a save remembers
    expect(p.world.goneIds?.length).toBeGreaterThan(0);
  });

  it('a sword does not burn them; a torch stand lights only with fire, and a timed one goes out', () => {
    const { p, get } = game([
      ['Torch stand', [10, 0, 12], 'ins_torch00001'],
      ['Timed torch', [20, 0, 12], 'ins_torch00002'],
    ]);
    expect(get('ins_torch00001')!.state).toBe('out');
    p.puzzles.hit(get('ins_torch00001')!, 'slash');
    expect(get('ins_torch00001')!.state).toBe('out');
    give(p, 'Torch', 1);
    p.placeAt([11, 0.4, 10.4], 0);
    p.useItem('Torch', 1);
    expect(get('ins_torch00001')!.state).toBe('lit');
    p.placeAt([21, 0.4, 10.4], 0);
    p.useItem('Torch', 1);
    expect(get('ins_torch00002')!.state).toBe('lit');
    steps(p, 12.5);
    expect(get('ins_torch00002')!.state).toBe('out');
    expect(get('ins_torch00001')!.state).toBe('lit');
  });

  it('a torch stand’s flame is a fire effect while lit, not bricks; a hand torch always has one', () => {
    const def = piece('Torch stand');
    expect(def.flame).toMatchObject({ when: 'lit' });
    expect(def.onlyIn).toBeUndefined();
    expect(piece('Hand torch').flame).toBeTruthy();
    const { p, get } = game([['Torch stand', [10, 0, 12], 'ins_torch00001']]);
    const flames = () => (p.fireLight as unknown as { flameFx: Map<string, unknown> }).flameFx;
    p.placeAt([11, 0.4, 10.4], 0);
    steps(p, 0.5);
    expect(flames().has('ins_torch00001')).toBe(false);
    give(p, 'Torch', 1);
    p.useItem('Torch', 1);
    expect(get('ins_torch00001')!.state).toBe('lit');
    steps(p, 0.5);
    expect(flames().has('ins_torch00001')).toBe(true);
    p.setInstanceState('ins_torch00001', 'out', true);
    steps(p, 0.5);
    expect(flames().has('ins_torch00001')).toBe(false);
    expect(puzzleProblems({ ...def, flame: { at: [0, 0, 0], when: 'nope' } })[0]).toMatch(/flame burns in “nope”/);
    // a hand torch's flame goes when it is picked up
    const g = game([['Hand torch', [20, 0, 20], 'ins_handtorch1']]);
    const f2 = () => (g.p.fireLight as unknown as { flameFx: Map<string, unknown> }).flameFx;
    g.p.placeAt([26, 0.4, 26], 0);
    steps(g.p, 0.5);
    expect(f2().has('ins_handtorch1')).toBe(true);
    g.p.placeAt([21.5, 0.4, 20.5], 0);
    steps(g.p, 0.6);
    expect(g.p.inventory.get('Torch')).toBe(1);
    expect(f2().has('ins_handtorch1')).toBe(false);
  });
});

describe('bombs', () => {
  it('a Bomb bag’s bombs go into an item button; one put down goes off: the cracked wall breaks, a crystal flips, the hero too close is hurt', () => {
    const { p, get } = game([
      ['Cracked wall', [20, 0, 10], 'ins_wall000001'],
      ['Crystal switch', [17, 0, 8], 'ins_crystal001'],
      ['Bomb bag', [30, 0, 30], 'ins_bombbag001'],
    ]);
    p.placeAt([29.1, 0.4, 31], Math.PI / 2);
    steps(p, 0.2);
    expect(p.inventory.get('Bomb')).toBe(5);
    expect(p.buttons.slots).toContain('Bomb');
    const slot = p.buttons.slots.indexOf('Bomb') + 1;
    const hearts = () => Number(p.logic.vars.get('hp') ?? 0);
    p.placeAt([21, 0.4, 8.4], 0);
    const before = hearts();
    p.useItem('Bomb', slot);
    expect(p.inventory.get('Bomb')).toBe(4);
    expect(p.fireLight.bombs).toHaveLength(1);
    steps(p, FUSE - 0.3);
    expect(p.fireLight.bombs).toHaveLength(1);
    steps(p, 0.5);
    expect(p.fireLight.bombs).toHaveLength(0);
    // the wall, only breakable by explosions, is broken; the crystal (any hit) flipped
    const w = get('ins_wall000001');
    expect(!w || (p as unknown as { smashedIds(): Set<string> }).smashedIds().has('ins_wall000001')).toBe(true);
    expect(get('ins_crystal001')!.state).toBe('on');
    expect(hearts()).toBeLessThan(before);
    expect(p.events.some((e) => /Too close to the blast|A bomb went off/.test(e.msg))).toBe(true);
  });
});

describe('beams of light', () => {
  it('a sun crest’s beam lights a sensor ahead; a block in the way puts it out', () => {
    const { p, get } = game([
      ['Sun crest', [10, 0, 10], 'ins_crest00001'],
      ['Light sensor', [10, 0, 18], 'ins_sensor0001'],
    ]);
    p.placeAt([4, 0.4, 4], 0);
    steps(p, 0.3);
    expect(p.fireLight.beams.length).toBeGreaterThan(0);
    expect(get('ins_sensor0001')!.state).toBe('lit');
    const seg = p.fireLight.beams[0]!;
    expect(seg.from[0]).toBeCloseTo(10.5);
    expect(seg.to[2]).toBeCloseTo(18);
    // the crest goes dark (logic's Set state): no beam, the sensor goes dark
    p.setInstanceState('ins_crest00001', 'dark', true);
    steps(p, 0.3);
    expect(p.fireLight.beams).toHaveLength(0);
    expect(get('ins_sensor0001')!.state).toBe('dark');
  });

  it('a mirror turns the beam a quarter turn onto a sensor; turned with Action, it sends it the other way', () => {
    const { p, get } = game([
      ['Sun crest', [10, 0, 10], 'ins_crest00001'],
      ['Mirror', [9, 0, 14], 'ins_mirror0001'],
      ['Light sensor', [3, 0, 15], 'ins_sensor0001'],
    ]);
    p.placeAt([30, 0.4, 30], 0);
    steps(p, 0.3);
    expect(p.fireLight.beams.length).toBeGreaterThanOrEqual(2);
    expect(get('ins_sensor0001')!.state).toBe('lit');
    // Action at the mirror: it leans the other way
    expect(p.puzzles.press(get('ins_mirror0001')!)).toBe(true);
    expect(get('ins_mirror0001')!.state).toBe('right');
    steps(p, 0.3);
    expect(get('ins_sensor0001')!.state).toBe('dark');
    const last = p.fireLight.beams.at(-1)!;
    expect(last.to[0]).toBeGreaterThan(12);
  });
});
