import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { HERO_MASS } from '../../src/engine/runtime/hooks';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 13b: the hook line, the grapple rope and the magnet glove. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

type Thing = [string, [number, number, number], string, number?];
function game(
  things: Thing[],
  opts: { water?: { pos: [number, number, number]; size: [number, number, number] } } = {},
) {
  const store = new ProjectStore(newProjectFiles({ name: 'Hooks', random: () => 0.3, noNeighbours: true }));
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
  run({ type: 'asset.place', payload: { map, asset: tuft.id, pos: [60, 0, 60], rot: 0, id: 'ins_corner0002' } });
  const p = new PlaySession(store.snapshot());
  (p.world.npcs as unknown[]).splice(0);
  (p.world.controller as unknown as { setActors(a: unknown[]): void }).setActors([]);
  if (opts.water)
    (p.world as unknown as { water: unknown[] }).water = [
      ...p.world.water,
      {
        id: 'ins_water00001',
        kind: 'water',
        pos: opts.water.pos,
        size: opts.water.size,
        body: 'lake',
        current: [0, 0],
      },
    ];
  const get = (id: string) => p.world.instances.find((i) => i.inst.id === id);
  const host = (p as unknown as { buttonHost(): { attack(down: boolean): void } }).buttonHost();
  const give = (i: string, n: number) => (p as unknown as { give(i: string, n: number): void }).give(i, n);
  const use = (i: string) => (p as unknown as { useTool(i: string): boolean }).useTool(i);
  return { store, p, get, host, give, use };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};

describe('hook and magnet parts', () => {
  it('are valid and say nothing is wrong', () => {
    for (const n of [
      'Hook line',
      'Grapple rope',
      'Magnet glove',
      'Hook target',
      'Swing beam',
      'Light crate',
      'Iron crate',
    ]) {
      const a = piece(n);
      expect(a, n).toBeTruthy();
      expect(validateFile(paths.asset(a.id), a), n).toEqual([]);
      expect(puzzleProblems(a), n).toEqual([]);
    }
  });
});

describe('the hook line', () => {
  it('shot at a hook target up on a wall, it pulls the hero there and up onto the wall', () => {
    const { p, host, give, use } = game([
      ['Smooth wall', [8, 0, 20], 'ins_wall000001'],
      ['Hook target', [10, 24, 20], 'ins_target0001'],
    ]);
    give('Hook line', 1);
    use('Hook line');
    expect(p.hooks.out).toBe('hook');
    expect(p.hero.heldLook).toBe('Hook line');
    p.placeAt([11, 0, 10], 0);
    steps(p, 0.2);
    host.attack(true);
    steps(p, 0.3);
    expect(p.hooks.aimAt).not.toBeNull();
    expect(p.hooks.aimHit?.catches).toBe(true);
    host.attack(false);
    steps(p, 2);
    expect(p.events.some((e) => /Pulled to the hook, and up onto the ledge/.test(e.msg))).toBe(true);
    expect(p.heroState.y).toBeGreaterThan(9);
  });

  it('on stone it clinks and comes back; the hero stays', () => {
    const { p, host, give, use } = game([['Dungeon wall', [8, 0, 20], 'ins_wall000001']]);
    give('Hook line', 1);
    use('Hook line');
    p.placeAt([11, 0, 12], 0);
    steps(p, 0.2);
    host.attack(true);
    steps(p, 0.2);
    host.attack(false);
    steps(p, 1.5);
    expect(p.events.some((e) => /clinked off/.test(e.msg))).toBe(true);
    expect(p.heroState.z).toBeLessThan(13);
    expect(p.hooks.line).toBeNull();
  });

  it('a light wooden crate comes to the hero (the lighter end moves)', () => {
    const { p, host, give, use } = game([['Light crate', [10, 0, 22], 'ins_crate00001']]);
    const ph = p.world.physics!;
    expect(ph.objectMass('ins_crate00001')).toBeLessThan(HERO_MASS);
    give('Hook line', 1);
    use('Hook line');
    p.placeAt([11, 0, 10], 0);
    steps(p, 0.3);
    host.attack(true);
    steps(p, 0.2);
    host.attack(false);
    steps(p, 2.5);
    expect(p.events.some((e) => /came to the hero/.test(e.msg))).toBe(true);
    expect(ph.objectPose('ins_crate00001')!.pos[2]).toBeLessThan(16);
  });
});

describe('the grapple rope', () => {
  it('caught on a beam overhead, the hero hangs, climbs, swings (a pendulum) and flies on when it lets go', () => {
    const { p, host, give, use } = game([['Swing beam', [6, 0, 16], 'ins_beam000001']]);
    give('Grapple rope', 1);
    use('Grapple rope');
    p.placeAt([10, 0, 13], 0);
    steps(p, 0.2);
    host.attack(true);
    steps(p, 0.2);
    host.attack(false);
    steps(p, 0.8);
    expect(p.hooks.swing).not.toBeNull();
    const len0 = p.hooks.line!.out;
    // Shift and forward: up the rope, off the floor
    p.input.keys.add('shift');
    p.input.keys.add('forward');
    steps(p, 1);
    p.input.keys.delete('forward');
    p.input.keys.delete('shift');
    expect(p.hooks.line!.out).toBeLessThan(len0 - 1);
    expect(p.heroState.y).toBeGreaterThan(0.5);
    // a push, then the pendulum: it swings back through under the beam
    p.hooks.swing!.vel[2] = 8;
    const zs: number[] = [];
    for (let i = 0; i < 120; i++) {
      steps(p, 1 / 60);
      zs.push(p.heroState.z);
    }
    expect(Math.max(...zs)).toBeGreaterThan(17.5);
    expect(Math.min(...zs.slice(30))).toBeLessThan(16);
    // let go mid-swing: on with the swing's speed
    p.input.jump = true;
    steps(p, 1 / 60);
    expect(p.hooks.swing).toBeNull();
    expect(p.events.some((e) => /Let go of the rope/.test(e.msg))).toBe(true);
  });
});

describe('the magnet glove', () => {
  it('lifts an iron crate, carries it and drops it on a floor switch', () => {
    const { p, get, host, give, use } = game([
      ['Iron crate', [10, 0, 16], 'ins_iron000001'],
      ['Floor switch', [16, 0, 16], 'ins_floor00001'],
    ]);
    const ph = p.world.physics!;
    expect(ph.objectMass('ins_iron000001')).toBeGreaterThan(HERO_MASS);
    give('Magnet glove', 1);
    use('Magnet glove');
    p.placeAt([11, 0, 11], 0);
    steps(p, 0.3);
    host.attack(true);
    expect(p.hooks.held?.key).toBe('ins_iron000001');
    steps(p, 1.2);
    // it floats up ahead of the hero
    expect(ph.objectPose('ins_iron000001')!.pos[1]).toBeGreaterThan(2);
    // turn toward the switch (right) and let go over it
    p.placeAt([17, 0, 11], 0);
    steps(p, 1.5);
    host.attack(false);
    steps(p, 1.5);
    expect(get('ins_floor00001')!.state).toBe('down');
  });

  it('wood is not metal: nothing to lift', () => {
    const { p, host, give, use } = game([['Light crate', [10, 0, 16], 'ins_crate00001']]);
    give('Magnet glove', 1);
    use('Magnet glove');
    p.placeAt([11, 0, 11], 0);
    steps(p, 0.2);
    host.attack(true);
    expect(p.hooks.held).toBeNull();
  });
});
