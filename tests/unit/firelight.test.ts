import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { BRANCH_SECONDS, FUSE } from '../../src/engine/runtime/firelight';
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
      ['Vines', [16, 0, 12], 'ins_vines00002'],
      ['Vines', [36, 0, 12], 'ins_vines00003'],
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
    steps(p, 3);
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
    // walking into the upright hand torch picks it up
    const w = game([['Hand torch', [20, 0, 20], 'ins_handtorch2']]);
    w.p.placeAt([20.5, 0.4, 16.5], 0);
    w.p.camYaw = Math.PI;
    w.p.input.keys.add('forward');
    for (let t = 0; t < 2 && !w.p.inventory.get('Torch'); t += 1 / 60) w.p.runtime.stepOnce();
    w.p.input.keys.delete('forward');
    expect(w.p.inventory.get('Torch')).toBe(1);
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

const heroState = (p: PlaySession) => (p as unknown as { heroStates: { state: string } }).heroStates.state;
const offers = (p: PlaySession) =>
  (p as unknown as { offersNow(): { kind: string; label: string }[] }).offersNow().map((o) => o.kind);
const broken = (p: PlaySession, id: string) =>
  !p.world.instances.some((i) => i.inst.id === id) ||
  (p as unknown as { smashedIds(): Set<string> }).smashedIds().has(id);

describe('bombs', () => {
  it('the Bomb bag’s bombs go into an item button; the button lifts one, lit, held up; Action while walking throws it at the wall', () => {
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
    // 4 studs from the wall, facing it
    p.placeAt([21.5, 0.4, 6], 0);
    const before = hearts();
    p.useItem('Bomb', slot);
    expect(p.inventory.get('Bomb')).toBe(4);
    expect(p.fireLight.held).toBeTruthy();
    expect(p.fireLight.carryPose).toBe('lift');
    steps(p, 0.1);
    expect(heroState(p)).toBe('lift');
    steps(p, 0.5);
    expect(p.fireLight.carryPose).toBe('hold');
    expect(heroState(p)).toBe('hold');
    // held up in front of the face; standing still the Action button says Put down, walking it says Throw
    expect(p.fireLight.held!.y).toBeGreaterThan(2.5);
    const label = () =>
      (p as unknown as { offersNow(): { kind: string; label: string }[] }).offersNow().find((o) => o.kind === 'drop')
        ?.label;
    expect(label()).toBe('Put down');
    // Attack does nothing with a bomb held up
    expect(p.buttonViews().find((b) => b.id === 'attack')!.label).toBe('Attack');
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    expect(label()).toBe('Throw');
    // Action while walking: thrown, it flies to the wall and lands at its foot
    (p as unknown as { releaseBomb(): void }).releaseBomb();
    p.input.keys.delete('forward');
    expect(p.fireLight.held).toBeNull();
    steps(p, 0.1);
    expect(heroState(p)).toBe('throw');
    steps(p, 1.0);
    // it hit the wall (rolling back a little off it: the physics engine moves it) and lies near its foot
    const b = p.fireLight.bombs[0]!;
    expect(b.z).toBeGreaterThan(7.5);
    expect(b.z).toBeLessThan(10.2);
    expect(b.y).toBeLessThan(1);
    p.placeAt([21.5, 0.4, 2], 0);
    steps(p, FUSE - 1.6);
    expect(p.fireLight.bombs).toHaveLength(0);
    expect(broken(p, 'ins_wall000001')).toBe(true);
    expect(get('ins_crystal001')!.state).toBe('on');
    expect(hearts()).toBe(before);
    expect(p.events.some((e) => /Cracked wall defeated/.test(e.msg))).toBe(true);
  });

  it('put down with Action, and picked up again; one held too long goes off in the hands', () => {
    const { p } = game([['Bomb bag', [30, 0, 30], 'ins_bombbag001']]);
    give(p, 'Bomb', 2);
    p.placeAt([10, 0.4, 10], 0);
    p.useItem('Bomb', 1);
    steps(p, 0.6);
    expect(p.fireLight.dropHeld()).toBe(true);
    steps(p, 0.1);
    expect(heroState(p)).toBe('drop');
    steps(p, 0.4);
    const b = p.fireLight.bombs[0]!;
    expect(b.z).toBeCloseTo(11.1, 1);
    expect(b.y).toBeLessThan(1);
    // Action again: the lit bomb is up over the head again (same fuse)
    expect(offers(p)).toContain('lift');
    expect(p.fireLight.lift(p.fireLight.bombAhead()!)).toBe(true);
    const hearts = () => Number(p.logic.vars.get('hp') ?? 0);
    const before = hearts();
    steps(p, FUSE);
    expect(p.fireLight.held).toBeNull();
    expect(hearts()).toBeLessThan(before);
  });

  it('a Bomb flower: Action picks its bomb; after a miss it grows another, after a hit it does not', () => {
    const { p, get } = game([
      ['Bomb flower', [10, 0, 10], 'ins_flower0001'],
      ['Cracked wall', [30, 0, 30], 'ins_wall000001'],
    ]);
    const flower = () => get('ins_flower0001')!;
    p.placeAt([11, 0.4, 8.4], 0);
    steps(p, 0.4);
    expect(flower().state).toBe('grown');
    expect(offers(p)).toContain('lift');
    expect(p.fireLight.pick(flower())).toBe(true);
    expect(flower().state).toBe('picked');
    steps(p, 0.6);
    // put down out in the open: the blast hits nothing
    p.placeAt([11, 0.4, 2], Math.PI);
    steps(p, 0.1);
    p.fireLight.dropHeld();
    p.placeAt([11, 0.4, 8.4], 0);
    steps(p, FUSE + 0.2);
    expect(p.fireLight.bombs).toHaveLength(0);
    expect(flower().state).toBe('picked');
    steps(p, 1.6);
    expect(flower().state).toBe('grown');
    // this time at the wall: it breaks, and no new bomb grows
    p.fireLight.pick(flower());
    steps(p, 0.6);
    p.placeAt([31.5, 0.4, 28.6], 0);
    p.fireLight.dropHeld();
    p.placeAt([31.5, 0.4, 24], 0);
    steps(p, FUSE + 2);
    expect(broken(p, 'ins_wall000001')).toBe(true);
    expect(flower().state).toBe('picked');
  });
});

describe('a burning branch', () => {
  it('picked up, held to the Burning torch it catches; it burns the vines; after its seconds it is used up and its flame gone', () => {
    const { p, get } = game([
      ['Branch', [10, 0, 6], 'ins_branch0001'],
      ['Burning torch', [10, 0, 14], 'ins_burntorch1'],
      ['Vines', [20, 0, 14], 'ins_vines00001'],
    ]);
    expect(piece('Burning torch').initialState).toBe('lit');
    p.placeAt([11, 0.4, 7.4], 0);
    steps(p, 0.5);
    expect(p.inventory.get('Branch')).toBe(1);
    const slot = () => p.buttons.slots.indexOf('Branch') + 1;
    expect(slot()).toBeGreaterThan(0);
    // away from any fire: nothing
    p.useItem('Branch', slot());
    expect(p.fireLight.litBranch).toBeNull();
    // at the burning torch: it catches
    p.placeAt([10.5, 0.4, 12.6], 0);
    steps(p, 0.5);
    p.useItem('Branch', slot());
    expect(p.fireLight.litBranch).toBeTruthy();
    // at the vines: they catch
    p.placeAt([22.5, 0.4, 12.4], 0);
    p.useItem('Branch', slot());
    expect(p.fireLight.burning.has('ins_vines00001')).toBe(true);
    steps(p, 4);
    expect(get('ins_vines00001')).toBeUndefined();
    // the vines' flames are gone with them
    expect(p.fireLight.burning.size).toBe(0);
    // it burns up: no branch, no flame
    steps(p, BRANCH_SECONDS);
    expect(p.fireLight.litBranch).toBeNull();
    expect(p.inventory.get('Branch') ?? 0).toBe(0);
  });
});

describe('climbing a ladder or vines', () => {
  it('walking into a ladder holds on; forward climbs up with the Ladder animation; at the top the hero climbs over', () => {
    const { p } = game([
      ['Ladder', [10, 0, 10], 'ins_ladder0001'],
      ['Dungeon wall', [9, 0, 11], 'ins_dwall00001'],
    ]);
    expect(piece('Ladder').climbable).toBe(true);
    expect(piece('Vines').climbable).toBe(true);
    p.placeAt([11.5, 0.4, 8.6], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    let on = false;
    let maxY = 0;
    for (let t = 0; t < 6; t += 1 / 60) {
      p.runtime.stepOnce();
      if (p.puzzles.ladder) on = true;
      maxY = Math.max(maxY, p.heroState.y);
      if (on && !p.puzzles.ladder && !p.puzzles.climbing) break;
    }
    expect(on).toBe(true);
    expect(maxY).toBeGreaterThan(4);
    p.input.keys.delete('forward');
    steps(p, 0.5);
    // over the top of the ladder, onto the wall behind it
    expect(p.heroState.y).toBeGreaterThan(4);
    expect(p.puzzles.ladder).toBeNull();
  });

  it('the vines are tall and wide; on them the hands and feet move only while climbing', () => {
    const v = piece('Vines');
    expect(v.footprint[0]).toBeGreaterThanOrEqual(6);
    expect(Math.max(...v.bricks.map((b) => b[2]))).toBeGreaterThanOrEqual(19);
    const { p } = game([['Vines', [10, 0, 10], 'ins_vines00001']]);
    p.placeAt([12.5, 0.4, 8.6], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    for (let t = 0; t < 1.5 && p.heroState.y < 2; t += 1 / 60) p.runtime.stepOnce();
    expect(p.puzzles.ladder).toBeTruthy();
    const sm = (p as unknown as { heroStates: { state: string; rate: number } }).heroStates;
    expect(sm.state).toBe('ladder');
    expect(sm.rate).toBeGreaterThan(0);
    p.input.keys.delete('forward');
    steps(p, 0.5);
    expect(p.puzzles.ladder).toBeTruthy();
    expect(sm.state).toBe('ladder');
    expect(sm.rate).toBe(0);
  });

  it('on the ladder: the Ladder state; back climbs down and off at the bottom', () => {
    const { p } = game([['Ladder', [10, 0, 10], 'ins_ladder0001']]);
    p.placeAt([11.5, 0.4, 8.6], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    for (let t = 0; t < 1.5 && p.heroState.y < 2; t += 1 / 60) p.runtime.stepOnce();
    expect(p.puzzles.ladder).toBeTruthy();
    expect(heroState(p)).toBe('ladder');
    p.input.keys.delete('forward');
    p.input.keys.add('back');
    for (let t = 0; t < 3 && p.puzzles.ladder; t += 1 / 60) p.runtime.stepOnce();
    expect(p.puzzles.ladder).toBeNull();
    expect(p.heroState.y).toBeLessThan(1);
    p.input.keys.delete('back');
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
    // the hero shoves it round (the Push animation), and tugs it back the next time (Pull)
    expect(p.puzzles.pose).toBe('push');
    steps(p, 0.1);
    expect(heroState(p)).toBe('push');
    steps(p, 0.3);
    expect(get('ins_sensor0001')!.state).toBe('dark');
    const last = p.fireLight.beams.at(-1)!;
    expect(last.to[0]).toBeGreaterThan(12);
  });
});
