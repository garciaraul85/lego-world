import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 12c: ice (a slippery floor, a sliding block, ice that melts), moving platforms and lifts, climbing anything. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

function game(things: [string, [number, number, number], string, number?][], climbing?: 'anything') {
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
  if (climbing) run({ type: 'project.update', payload: { climbing } });
  const p = new PlaySession(store.snapshot());
  // the new project's neighbours live where the tests are: not in these tests
  (p.world.npcs as unknown[]).splice(0);
  (p.world.controller as unknown as { setActors(a: unknown[]): void }).setActors([]);
  const get = (id: string) => p.world.instances.find((i) => i.inst.id === id);
  return { store, p, get };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};
const give = (p: PlaySession, item: string, n: number) =>
  (p as unknown as { give(i: string, n: number): void }).give(item, n);

const heroState = (p: PlaySession) => (p as unknown as { heroStates: { state: string } }).heroStates.state;

describe('ice, platform and climbing parts', () => {
  it('are valid and say nothing is wrong; what is wrong is said', () => {
    for (const n of [
      'Icy floor',
      'Ice block',
      'Ice wall',
      'Moving platform',
      'Lift',
      'Switch lift',
      'Rock face',
      'Smooth wall',
    ]) {
      const a = piece(n);
      expect(a, n).toBeTruthy();
      expect(validateFile(paths.asset(a.id), a), n).toEqual([]);
      expect(puzzleProblems(a), n).toEqual([]);
    }
    expect(puzzleProblems({ ...piece('Ice block'), push: undefined })[0]).toMatch(/must be a push block/);
    expect(puzzleProblems({ ...piece('Switch lift'), states: ['one'] })[0]).toMatch(/needs two/);
    expect(puzzleProblems({ ...piece('Lift'), moves: { by: [0, 0, 0] } })[0]).toMatch(/somewhere to go/);
  });
});

describe('ice', () => {
  it('on an icy floor the hero speeds up slowly and slides on after letting go', () => {
    const { p } = game([['Icy floor', [10, 0, 10], 'ins_icefloor01']]);
    // on grass: it stops dead
    p.placeAt([4, 0.4, 4], 0);
    steps(p, 0.3);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    steps(p, 0.5);
    p.input.keys.delete('forward');
    const z0 = p.heroState.z;
    steps(p, 0.4);
    expect(p.heroState.z - z0).toBeLessThan(0.1);
    // on the ice: it takes a while to get going, and slides on
    p.placeAt([12, 0.4, 10.5], 0);
    steps(p, 0.3);
    const start = p.heroState.z;
    p.input.keys.add('forward');
    steps(p, 0.25);
    const early = p.heroState.z - start;
    expect(early).toBeLessThan(0.25 * 4 * 0.7);
    steps(p, 0.6);
    p.input.keys.delete('forward');
    const off = p.heroState.z;
    steps(p, 0.5);
    expect(p.heroState.z - off).toBeGreaterThan(0.5);
    expect(p.iceVel).toBeTruthy();
  });

  it('an ice block, held and pushed, slides on by itself until a wall stops it; the hero stays', () => {
    const { p, get } = game([
      ['Ice block', [10, 0, 10], 'ins_iceblock01'],
      ['Dungeon wall', [20, 0, 8], 'ins_wall000001', 1],
    ]);
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    steps(p, 0.05);
    expect(p.puzzles.canGrab()).toBe(true);
    p.puzzles.setGrab(true);
    p.camYaw = -Math.PI / 2;
    p.input.keys.add('forward');
    steps(p, 0.4);
    p.input.keys.delete('forward');
    p.puzzles.setGrab(false);
    steps(p, 1.5);
    // the wall is at x 20: it slid right up to it (x 18), many studs in one push
    expect(get('ins_iceblock01')!.inst.pos[0]).toBe(18);
    expect(p.heroState.x).toBeLessThan(10);
  });

  it('an ice wall: a swing does nothing; fire melts it (steaming), and so does a beam of light', () => {
    const { p, get } = game([
      ['Ice wall', [10, 0, 14], 'ins_icewall001'],
      ['Ice wall', [30, 0, 20], 'ins_icewall002'],
      ['Sun crest', [30, 0, 10], 'ins_crest00001'],
    ]);
    p.placeAt([11.5, 0.4, 12.6], 0);
    steps(p, 0.3);
    p.smash();
    steps(p, 1);
    expect(get('ins_icewall001')!.bricks.length).toBe(piece('Ice wall').bricks.length);
    expect(p.fireLight.melting.has('ins_icewall001')).toBe(false);
    // the Torch's flame
    give(p, 'Torch', 1);
    p.useItem('Torch', p.buttons.slots.indexOf('Torch') + 1);
    expect(p.fireLight.melting.has('ins_icewall001')).toBe(true);
    steps(p, 2.5);
    expect(get('ins_icewall001')).toBeUndefined();
    // the sun crest's beam reached the other wall: it melted with light
    steps(p, 2.5);
    expect(get('ins_icewall002')).toBeUndefined();
    expect(p.events.some((e) => /Ice wall is melting \(a beam of light\)/.test(e.msg))).toBe(true);
  });
});

describe('moving platforms', () => {
  it('a moving platform goes there and back, its bricks a stud at a time, drawn where it is; the hero rides it', () => {
    const { p, get } = game([['Moving platform', [30, 0, 20], 'ins_platform01']]);
    const plat = () => get('ins_platform01')!;
    p.placeAt([32, 0.8, 22], 0);
    steps(p, 0.2);
    expect(p.platforms.ride?.id).toBe('ins_platform01');
    const x0 = p.heroState.x;
    const z0 = p.heroState.z;
    // it waits a second, then goes 8 studs in 3 seconds
    steps(p, 2.5);
    expect(Number(plat().inst.pos[2])).toBeGreaterThan(22);
    const v = p.platforms.views();
    expect(v.length).toBeLessThanOrEqual(1);
    steps(p, 2);
    expect(Number(plat().inst.pos[2])).toBe(28);
    // the hero came with it, still standing on it
    expect(p.heroState.z - z0).toBeGreaterThan(7);
    expect(Math.abs(p.heroState.x - x0)).toBeLessThan(0.3);
    expect(p.heroState.y).toBeGreaterThan(0.6);
    // and back
    steps(p, 4.5);
    expect(Number(plat().inst.pos[2])).toBe(20);
  });

  it('a lift carries the hero up; the Switch lift waits until it is on', () => {
    const { p, get } = game([
      ['Lift', [30, 0, 20], 'ins_lift000001'],
      ['Switch lift', [40, 0, 20], 'ins_slift00001'],
    ]);
    p.placeAt([32, 0.8, 22], 0);
    steps(p, 0.2);
    steps(p, 4.2);
    expect(p.heroState.y).toBeGreaterThan(6);
    expect(p.heroState.grounded).toBe(true);
    // the switch lift: off, it stays
    steps(p, 3);
    expect(Number(get('ins_slift00001')!.inst.pos[1])).toBe(0);
    p.setInstanceState('ins_slift00001', 'on', true);
    steps(p, 4);
    expect(Number(get('ins_slift00001')!.inst.pos[1])).toBeGreaterThan(10);
  });
});

describe('climbing anything', () => {
  it('with Climbing: Anything the hero climbs a rock face, using stamina, and pulls up over the top', () => {
    const { p } = game([['Rock face', [30, 0, 26], 'ins_rock000001']], 'anything');
    p.placeAt([32, 0.4, 24.9], 0);
    steps(p, 0.1);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    steps(p, 0.6);
    expect(p.puzzles.wall).toBeTruthy();
    expect(heroState(p)).toBe('ladder');
    const st0 = p.combat.stamina;
    steps(p, 1);
    expect(p.heroState.y).toBeGreaterThan(1.5);
    expect(p.combat.stamina).toBeLessThan(st0 - 5);
    // up and over: the face is 8 bricks (9.6 studs) tall
    for (let t = 0; t < 8 && (p.puzzles.wall || p.puzzles.climbing); t += 0.1) steps(p, 0.1);
    p.input.keys.delete('forward');
    steps(p, 0.5);
    expect(p.puzzles.wall).toBeNull();
    expect(p.heroState.y).toBeGreaterThan(9);
  });

  it('a climb jump costs a quarter of the wheel; out of stamina the hero lets go; a smooth wall cannot be climbed; ladders only by default', () => {
    const { p } = game(
      [
        ['Rock face', [30, 0, 26], 'ins_rock000001'],
        ['Smooth wall', [40, 0, 26], 'ins_smooth0001'],
      ],
      'anything',
    );
    p.placeAt([32, 0.4, 24.9], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    steps(p, 0.6);
    expect(p.puzzles.wall).toBeTruthy();
    const y0 = p.heroState.y;
    const st = p.combat.stamina;
    p.input.jump = true;
    steps(p, 0.4);
    expect(p.heroState.y - y0).toBeGreaterThan(2);
    expect(st - p.combat.stamina).toBeGreaterThan(24);
    p.combat.stamina = 1;
    steps(p, 0.5);
    expect(p.puzzles.wall).toBeNull();
    p.input.keys.delete('forward');
    steps(p, 2);
    expect(p.heroState.y).toBeLessThan(0.5);
    // the smooth wall
    p.combat.stamina = 100;
    p.placeAt([42, 0.4, 24.9], 0);
    p.input.keys.add('forward');
    steps(p, 1);
    expect(p.puzzles.wall).toBeNull();
    expect(p.message).toMatch(/Too smooth/);
  });

  it('with Climbing: Ladders (the default) a rock face is not climbed', () => {
    const { p } = game([['Rock face', [30, 0, 26], 'ins_rock000001']]);
    p.placeAt([32, 0.4, 24.9], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    steps(p, 1);
    expect(p.puzzles.wall).toBeNull();
    expect(p.heroState.y).toBeLessThan(0.6);
  });
});
