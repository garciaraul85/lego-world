import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { AIR_DENSITY, dragAccel, windAt } from '../../src/engine/physics/physics';
import { PlaySession } from '../../src/engine/runtime/session';
import { waterMode } from '../../src/core/water/swim';

/** Step 12c-2: wind (fans, the Gust leaf, pinwheels), water currents, putting fire out, things thrown at switches. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

function game(
  things: [string, [number, number, number], string, number?][],
  opts: { movement?: 'physics'; water?: { pos: [number, number, number]; size: [number, number, number]; current: [number, number] } } = {},
) {
  const store = new ProjectStore(newProjectFiles({ name: 'Wind', random: () => 0.3, noNeighbours: true }));
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
  run({ type: 'asset.place', payload: { map, asset: tuft.id, pos: [44, 0, 44], rot: 0, id: 'ins_corner0002' } });
  if (opts.movement) run({ type: 'project.update', payload: { movement: opts.movement } });
  const p = new PlaySession(store.snapshot());
  (p.world.npcs as unknown[]).splice(0);
  (p.world.controller as unknown as { setActors(a: unknown[]): void }).setActors([]);
  if (opts.water)
    (p.world as unknown as { water: unknown[] }).water = [...p.world.water, {
      id: 'ins_water00001',
      kind: 'water',
      pos: opts.water.pos,
      size: opts.water.size,
      body: 'river',
      current: opts.water.current,
    }];
  const get = (id: string) => p.world.instances.find((i) => i.inst.id === id);
  return { store, p, get };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};

describe('wind, water and throwing parts', () => {
  it('are valid and say nothing is wrong; what is wrong is said', () => {
    for (const n of ['Fan', 'Switch fan', 'Gale fan', 'Pinwheel', 'Rock', 'Gust leaf', 'Clay pot']) {
      const a = piece(n);
      expect(a, n).toBeTruthy();
      expect(validateFile(paths.asset(a.id), a), n).toEqual([]);
      expect(puzzleProblems(a), n).toEqual([]);
    }
    expect(puzzleProblems({ ...piece('Switch fan'), wind: { at: [0, 0, 0], when: 'blowing' } })[0]).toMatch(
      /not one of its states/,
    );
    expect(puzzleProblems({ ...piece('Rock'), push: {} })[0]).toMatch(/not a push block/);
  });

  it('drag is quadratic in the air’s speed against a thing, and a wind field falls off along it', () => {
    const [ax] = dragAccel([10, 0], [0, 0], 1);
    const [ax2] = dragAccel([20, 0], [0, 0], 1);
    expect(ax).toBeCloseTo(0.5 * AIR_DENSITY * 100, 6);
    expect(ax2 / ax).toBeCloseTo(4, 6);
    // moving with the wind, nothing pushes
    expect(dragAccel([10, 0], [10, 0], 1)[0]).toBe(0);
    const f = { from: [0, 0, 0] as [number, number, number], dir: [0, 1] as [number, number], reach: 10, half: 1, height: 3, speed: 10 };
    expect(windAt([f], 0, 1, 1)[1]).toBeGreaterThan(windAt([f], 0, 1, 9)[1]);
    expect(windAt([f], 0, 1, 12)[1]).toBe(0);
    expect(windAt([f], 5, 1, 2)[1]).toBe(0);
  });
});

describe('fans', () => {
  it('a fan slows the hero walking into it; a gale fan blows the hero back, bracing; out of it the feet hold', () => {
    const { p } = game([
      ['Fan', [10, 0, 10], 'ins_fan0000001'],
      ['Gale fan', [30, 0, 10], 'ins_galefan001'],
    ]);
    // walk toward the fan (it blows +z from z 12): from z 20 heading -z
    p.placeAt([12, 0, 22], Math.PI);
    steps(p, 0.2);
    p.camYaw = 0;
    p.input.keys.add('forward');
    const z0 = p.heroState.z;
    steps(p, 1);
    const into = z0 - p.heroState.z;
    p.input.keys.delete('forward');
    // the same walk with no fan
    p.placeAt([20, 0, 22], Math.PI);
    steps(p, 0.2);
    p.input.keys.add('forward');
    const z1 = p.heroState.z;
    steps(p, 1);
    const free = z1 - p.heroState.z;
    p.input.keys.delete('forward');
    expect(into).toBeGreaterThan(0.3);
    expect(into).toBeLessThan(free * 0.7);
    // in front of the gale fan, standing: blown back
    p.placeAt([33, 0, 15], Math.PI);
    steps(p, 0.1);
    const zb = p.heroState.z;
    steps(p, 1);
    expect(p.heroState.z).toBeGreaterThan(zb + 0.5);
    expect(['Blown back', 'Brace']).toContain((p as unknown as { heroAnim: { clip?: { name: string } } }).heroAnim.clip?.name);
  });

  it('the wind spins a pinwheel (on while it blows); a switch fan blows only while on; a lit torch in it goes out', () => {
    const { p, get } = game([
      ['Switch fan', [10, 0, 10], 'ins_swfan00001'],
      ['Pinwheel', [12, 0, 16], 'ins_pinwheel01'],
      ['Torch stand', [14, 0, 20], 'ins_torch00001'],
      ['Burning torch', [11, 0, 18], 'ins_burning001'],
    ]);
    p.placeAt([30, 0, 30], 0);
    steps(p, 0.3);
    expect(get('ins_pinwheel01')!.state).toBe('still');
    expect(get('ins_burning001')!.state).toBe('lit');
    p.setInstanceState('ins_swfan00001', 'on', true);
    steps(p, 0.5);
    expect(get('ins_pinwheel01')!.state).toBe('turning');
    expect(get('ins_burning001')!.state).toBe('out');
    expect(p.events.some((e) => /blew it out/.test(e.msg))).toBe(true);
    p.setInstanceState('ins_swfan00001', 'off', true);
    steps(p, 0.5);
    expect(get('ins_pinwheel01')!.state).toBe('still');
  });

  it('the physics engine pushes a loose crate in a gale and an ice block slides off in one', () => {
    const crate = piece('Ice block');
    expect(crate.ice?.slides).toBe(true);
    const { p, get } = game(
      [
        ['Gale fan', [10, 0, 10], 'ins_galefan001'],
        ['Ice block', [12, 0, 14], 'ins_iceblock01'],
      ],
      { movement: 'physics' },
    );
    p.placeAt([30, 0, 30], 0);
    steps(p, 2);
    expect(Number(get('ins_iceblock01')!.inst.pos[2])).toBeGreaterThan(15);
    expect(p.events.some((e) => /the wind pushed it/.test(e.msg))).toBe(true);
  });
});

describe('the physics engine in the wind', () => {
  it('a loose barrel is blown along by a gale (drag over its mass beats its friction); a pinwheel’s sails spin up', () => {
    const barrel = { ...piece('Barrel'), id: 'ast_loosebar01', name: 'Loose barrel', loose: true };
    const store = new ProjectStore(newProjectFiles({ name: 'Wind', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(store));
    const map = store.manifest.entry.map;
    const run = (c: unknown) => expect(bus.execute(c as never, { source: 'user' }).ok).toBe(true);
    for (const d of [barrel, piece('Gale fan'), piece('Pinwheel'), piece('Grass tuft')])
      run({ type: 'asset.create', payload: { asset: d } });
    run({ type: 'asset.place', payload: { map, asset: piece('Gale fan').id, pos: [10, 0, 10], rot: 0, id: 'ins_galefan001' } });
    run({ type: 'asset.place', payload: { map, asset: barrel.id, pos: [12, 0, 15], rot: 0, id: 'ins_barrel0001' } });
    run({ type: 'asset.place', payload: { map, asset: piece('Pinwheel').id, pos: [11, 0, 20], rot: 0, id: 'ins_pinwheel01' } });
    run({ type: 'asset.place', payload: { map, asset: piece('Grass tuft').id, pos: [-4, 0, -4], rot: 0, id: 'ins_corner0001' } });
    run({ type: 'asset.place', payload: { map, asset: piece('Grass tuft').id, pos: [44, 0, 44], rot: 0, id: 'ins_corner0002' } });
    run({ type: 'project.update', payload: { movement: 'physics' } });
    const p = new PlaySession(store.snapshot());
    (p.world.npcs as unknown[]).splice(0);
    p.placeAt([30, 0, 30], 0);
    const ph = p.world.physics!;
    expect(ph).toBeTruthy();
    const z0 = ph.objectPose('ins_barrel0001')!.pos[2];
    steps(p, 2);
    expect(ph.objectPose('ins_barrel0001')!.pos[2]).toBeGreaterThan(z0 + 1);
    const sp = p.wind.spins.get('ins_pinwheel01')!;
    expect(sp.omega).toBeGreaterThan(1);
  });
});

describe('the Gust leaf', () => {
  it('taken, it is in the hand; a swing blows a gust that spins a pinwheel and blows a torch out', () => {
    const { p, get } = game([
      ['Pinwheel', [10, 0, 16], 'ins_pinwheel01'],
      ['Burning torch', [14, 0, 16], 'ins_burning001'],
    ]);
    (p as unknown as { give(i: string, n: number): void }).give('Gust leaf', 1);
    (p as unknown as { useTool(i: string): boolean }).useTool('Gust leaf');
    expect(p.leafOut).toBe(true);
    expect(p.hero.heldLook).toBe('Leaf');
    p.placeAt([10.5, 0, 12.5], 0);
    steps(p, 0.1);
    p.leafGust();
    steps(p, 0.2);
    expect(get('ins_pinwheel01')!.state).toBe('turning');
    p.placeAt([14.5, 0, 13], 0);
    steps(p, 0.1);
    p.leafGust();
    steps(p, 0.3);
    expect(get('ins_burning001')!.state).toBe('out');
  });
});

describe('things to throw', () => {
  it('a rock is lifted, thrown at a crystal switch (it turns), and weighs on a floor switch where it lands', () => {
    const { p, get } = game([
      ['Rock', [10, 0, 10], 'ins_rock000001'],
      ['Crystal switch', [10, 0, 14], 'ins_crystal001'],
      ['Floor switch', [20, 0, 13], 'ins_floor00001'],
      ['Rock', [20, 0, 9], 'ins_rock000002'],
    ]);
    const fl = p.fireLight;
    p.placeAt([11, 0, 8.6], 0);
    steps(p, 0.1);
    expect(fl.thingAhead()?.inst.id).toBe('ins_rock000001');
    (p as unknown as { pickUpBomb(): boolean }).pickUpBomb();
    steps(p, 0.6);
    expect(fl.held?.thing?.name).toBe('Rock');
    expect(get('ins_rock000001')).toBeUndefined();
    fl.throwHeld();
    steps(p, 1.2);
    expect(get('ins_crystal001')!.state).toBe('on');
    // the other rock, put down on the floor switch
    p.placeAt([21, 0, 8.6], 0);
    steps(p, 0.1);
    (p as unknown as { pickUpBomb(): boolean }).pickUpBomb();
    steps(p, 0.6);
    p.placeAt([21, 0, 12.6], 0);
    steps(p, 0.05);
    fl.dropHeld();
    steps(p, 0.6);
    // the hero walks off: the rock alone holds it down
    p.placeAt([30, 0, 30], 0);
    steps(p, 0.6);
    expect(get('ins_floor00001')!.state).toBe('down');
  });

  it('a pot thrown breaks where it lands', () => {
    const { p } = game([['Clay pot', [10, 0, 10], 'ins_pot0000001']]);
    const fl = p.fireLight;
    p.placeAt([11, 0, 8.6], 0);
    steps(p, 0.1);
    (p as unknown as { pickUpBomb(): boolean }).pickUpBomb();
    steps(p, 0.6);
    expect(fl.held?.thing?.breaks).toBe(true);
    fl.throwHeld();
    steps(p, 1.5);
    expect(fl.bombs.length).toBe(0);
    expect(p.events.some((e) => /Clay pot broke/.test(e.msg))).toBe(true);
  });
});

describe('fire put out', () => {
  it('a burning stick goes out in a strong wind and in water', () => {
    const { p } = game([['Gale fan', [10, 0, 10], 'ins_galefan001']], {
      water: { pos: [30, 0, 6], size: [10, 1.6, 10], current: [0, 0] },
    });
    const give = (p as unknown as { give(i: string, n: number): void }).give.bind(p);
    give('Branch', 2);
    p.placeAt([30, 0, 30], 0);
    steps(p, 0.6);
    expect(p.stickOut).toBe(true);
    p.fireLight.lightBranch();
    // into the gale
    p.placeAt([13, 0, 16], Math.PI);
    steps(p, 0.3);
    expect(p.fireLight.litBranch).toBeNull();
    expect(p.events.some((e) => /blew the stick’s fire out/.test(e.msg))).toBe(true);
    // lit again, and the hero wades into the water: its end dipped in
    p.placeAt([34, 0, 3], 0);
    steps(p, 0.2);
    p.fireLight.lightBranch();
    const tip = p.fireLight.branchTip();
    (p.world as unknown as { water: unknown[] }).water = [
      { id: 'ins_water00002', kind: 'water', pos: [tip[0] - 2, 0, tip[2] - 2], size: [4, tip[1] + 0.5, 4], body: 'pool' },
    ];
    steps(p, 0.1);
    expect(p.fireLight.litBranch).toBeNull();
    expect(p.events.some((e) => /went out in the water/.test(e.msg))).toBe(true);
  });
});

describe('water', () => {
  it('the hero swims only where it can float (head out, feet off the floor); shallower it wades', () => {
    const box = (y1: number) => ({ x0: 0, x1: 10, y0: 0, y1, z0: 0, z1: 10, current: [0, 0] as [number, number] });
    // chest-deep: wading, not swimming on the floor
    expect(waterMode(box(2.4), 0, 4.02, true)).toBe('wade');
    expect(waterMode(box(3.0), 0, 4.02, true)).toBe('swim');
    expect(waterMode(box(4.4), 0, 4.02, true)).toBe('swim');
    // once swimming it keeps on into a little shallower water (no flicker at the edge)
    expect(waterMode(box(2.4), 0, 4.02, true, true)).toBe('swim');
  });

  it('a current wading pushes the hero downstream; a bomb that falls in goes out; a lit stick dipped in goes out', () => {
    const { p } = game([], { water: { pos: [6, 0, 6], size: [20, 1.6, 20], current: [8, 0] } });
    p.placeAt([10, 0, 15], 0);
    steps(p, 0.2);
    const x0 = p.heroState.x;
    steps(p, 1);
    expect(p.heroState.x).toBeGreaterThan(x0 + 0.3);
    const fl = p.fireLight;
    const b = fl.drop(14, 0, 14);
    steps(p, 0.2);
    expect(fl.bombs.includes(b)).toBe(false);
    expect(p.events.some((e) => /fuse went out in the water/.test(e.msg))).toBe(true);
  });
});
