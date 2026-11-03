import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { ICE_FRICTION, ICE_GRIP } from '../../src/engine/physics/physics';
import { mantleHands } from '../../src/engine/runtime/puzzles';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 12c: ice (a slippery floor, a sliding block, ice that melts), moving platforms and lifts, climbing anything. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

function game(
  things: [string, [number, number, number], string, number?][],
  climbing?: 'anything',
  movement?: 'physics',
) {
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
  if (movement) run({ type: 'project.update', payload: { movement } });
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

  it('walked by the physics engine too (new projects), the hero slides on after letting go', () => {
    const { p } = game([['Icy floor', [10, 0, 10], 'ins_icefloor01']], undefined, 'physics');
    expect(p.physicsMovement).toBe(true);
    p.placeAt([12, 0.4, 10.5], 0);
    steps(p, 0.3);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    steps(p, 1.5);
    p.input.keys.delete('forward');
    const off = p.heroState.z;
    steps(p, 0.6);
    expect(p.heroState.z - off).toBeGreaterThan(1.2);
  });

  it('on ice the hero moves by friction: the feet push off no harder than they grip, and letting go it glides, slowing at μg', () => {
    const { p } = game([['Icy floor', [10, 0, 0], 'ins_icefloor01']]);
    p.placeAt([12, 0.4, 2], 0);
    steps(p, 0.3);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    let last = 0;
    for (let i = 0; i < 30; i++) {
      p.runtime.stepOnce();
      const v = Math.hypot(p.iceVel!.x, p.iceVel!.z);
      // never faster than the grip allows (a = μ g, g the hero's 22)
      expect(v - last).toBeLessThan(ICE_GRIP * 22 * (1 / 60) + 1e-6);
      last = v;
    }
    expect(p.iceSlip).toBe(false);
    steps(p, 1.2);
    p.input.keys.delete('forward');
    p.runtime.stepOnce();
    const v0 = Math.hypot(p.iceVel!.x, p.iceVel!.z);
    steps(p, 0.5);
    const v1 = Math.hypot(p.iceVel!.x, p.iceVel!.z);
    // gliding: sliding friction takes μ g a second, and the hero slides (it does not walk)
    expect(v0 - v1).toBeGreaterThan(ICE_FRICTION * 22 * 0.45);
    expect(v0 - v1).toBeLessThan(ICE_FRICTION * 22 * 0.55);
    expect(p.iceSlip).toBe(true);
    expect((p as unknown as { heroAnim: { clip?: { name: string } } }).heroAnim.clip?.name).toBe('Slide');
  });

  it('the icy floor’s top is slippery in the physics engine (low friction), and goes when the ice does', () => {
    const { p } = game([['Icy floor', [10, 0, 0], 'ins_icefloor01']], undefined, 'physics');
    p.placeAt([12, 0.4, 2], 0);
    steps(p, 0.1);
    const ph = p.world.physics!;
    expect(ph.iceKeys()).toEqual(['ins_icefloor01']);
    p.despawn('ins_icefloor01', true);
    steps(p, 0.1);
    expect(ph.iceKeys()).toEqual([]);
  });

  it('an ice block slows by friction: on the ground it stops after v² / 2μg', () => {
    const { p, get } = game([['Ice block', [10, 0, 2], 'ins_iceblock01']]);
    p.placeAt([9.4, 0.4, 3], Math.PI / 2);
    steps(p, 0.05);
    p.puzzles.setGrab(true);
    p.camYaw = -Math.PI / 2;
    p.input.keys.add('forward');
    steps(p, 0.4);
    p.input.keys.delete('forward');
    p.puzzles.setGrab(false);
    steps(p, 4);
    // shoved at 9 studs a second, μ 0.25 on the ground: 81 / 9 = 9 studs (on to rest on a whole one)
    const went = Number(get('ins_iceblock01')!.inst.pos[0]) - 10;
    expect(went).toBeGreaterThanOrEqual(8);
    expect(went).toBeLessThanOrEqual(10);
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

  it('on the wall, right moves the hero to its right and left to its left (as it faces the wall)', () => {
    const { p } = game([['Rock face', [30, 0, 26], 'ins_rock000001']], 'anything');
    p.placeAt([33, 0.4, 24.9], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    steps(p, 0.6);
    p.input.keys.delete('forward');
    expect(p.puzzles.wall).toBeTruthy();
    // facing +z (heading 0), the camera behind: its right is -x
    const x0 = p.heroState.x;
    p.input.keys.add('right');
    steps(p, 0.5);
    p.input.keys.delete('right');
    expect(p.heroState.x).toBeLessThan(x0 - 0.4);
    const x1 = p.heroState.x;
    p.input.keys.add('left');
    steps(p, 0.5);
    p.input.keys.delete('left');
    expect(p.heroState.x).toBeGreaterThan(x1 + 0.4);
    expect(p.puzzles.wall).toBeTruthy();
  });

  it('pulling up over the top, the hands stay on the edge (no floating) until the hero is up on it', () => {
    const { p, get } = game([['Rock face', [30, 0, 26], 'ins_rock000001']], 'anything');
    const top = Math.max(...get('ins_rock000001')!.bricks.map((b) => (b.y + 3) * 0.4));
    p.placeAt([33, 0.4, 24.9], 0);
    p.camYaw = Math.PI;
    p.input.keys.add('forward');
    let seen = 0;
    let started = false;
    for (let i = 0; i < 60 * 9 && !(started && !p.puzzles.climbing); i++) {
      p.runtime.stepOnce();
      const c = p.puzzles.climbing;
      if (!c?.mantle) continue;
      if (!started) {
        // it starts when the hands reach the top, not when the body is past it
        expect(p.heroState.y + 4.17).toBeGreaterThan(top - 0.4);
        expect(p.heroState.y).toBeLessThan(top - 3);
      }
      started = true;
      if (c.t < 0.16 || c.t > 0.78) continue;
      const [hz, hy] = mantleHands(c.t);
      // the hands on the edge: at the top's height, at the face or just in past it (the face is at z 26)
      expect(Math.abs(p.heroState.y + hy - top), `t ${c.t}`).toBeLessThan(0.08);
      expect(p.heroState.z + hz, `t ${c.t}`).toBeGreaterThan(26 - 0.02);
      expect(p.heroState.z + hz, `t ${c.t}`).toBeLessThan(26 + 0.8);
      // and the body below the top, against the wall (not in the air beside it)
      expect(p.heroState.y).toBeLessThan(top - 1.2);
      expect(p.heroState.z).toBeLessThan(26);
      seen++;
    }
    p.input.keys.delete('forward');
    expect(seen).toBeGreaterThan(20);
    expect(p.heroState.y).toBeCloseTo(top, 1);
    expect(p.heroState.z).toBeGreaterThan(26.2);
    expect(p.heroState.grounded).toBe(true);
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
