import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import type { LegacyPiece } from '../../src/core/legacy/types';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { HeroState } from '../../src/engine/legacy/runtime-modules';
import { walkHero } from '../../src/engine/physics/hero';
import { type Box, PhysicsWorld } from '../../src/engine/physics/physics';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 2b, 10b part 3: the hero walked by the physics engine, against v68's own movement. */
const piece = (id: number, x: number, y: number, z: number, cols = 4, rows = 4, kind = 'brick'): LegacyPiece =>
  ({ id, x, y, z, rows, cols, turn: 0, kind, color: 1 }) as LegacyPiece;
const bounds = (p: LegacyPiece): Box => ({
  x0: p.x,
  x1: p.x + p.cols,
  z0: p.z,
  z1: p.z + p.rows,
  y0: p.y * 0.4,
  y1: p.y * 0.4 + (p.kind === 'plate' ? 0.4 : 1.2),
});
const hero = (x = 0, y = 0, z = 0): HeroState =>
  ({
    x,
    y,
    z,
    vy: 0,
    heading: Math.PI,
    grounded: true,
    speed: 0,
    running: false,
    attack: 0,
    building: false,
    phase: 0,
  }) as HeroState;
const still = { x: 0, z: 0, run: false, jump: false, vertical: 0 };
// yaw 0: forward (input z = 1) is −z
const run = (ph: PhysicsWorld, s: HeroState, input: typeof still, seconds: number, onEach?: () => void) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    walkHero(ph, s, input, 1 / 60, 0, { scale: 1 });
    ph.step(1 / 60);
    onEach?.();
  }
};

describe('the hero walked by the physics engine', () => {
  it('walks and runs at v68’s speeds and jumps v68’s height', () => {
    const ph = new PhysicsWorld();
    const s = hero();
    run(ph, s, still, 0.2);
    expect(s.grounded).toBe(true);
    expect(s.y).toBeCloseTo(0, 1);
    run(ph, s, { ...still, z: 1 }, 2);
    // 4 studs a second walking, toward −z
    expect(-s.z).toBeGreaterThan(7.5);
    expect(-s.z).toBeLessThan(8.5);
    const z0 = s.z;
    run(ph, s, { ...still, z: 1, run: true }, 1);
    expect(z0 - s.z).toBeGreaterThan(7.3);
    expect(z0 - s.z).toBeLessThan(8.3);
    // a jump: 9.5 up against gravity 22 tops out near 2.05
    let top = 0;
    walkHero(ph, s, { ...still, jump: true }, 1 / 60, 0, { scale: 1 });
    run(ph, s, still, 1.2, () => {
      top = Math.max(top, s.y);
    });
    expect(top).toBeGreaterThan(1.85);
    expect(top).toBeLessThan(2.2);
    expect(s.grounded).toBe(true);
    ph.free();
  });

  it('steps up plates, is stopped by a brick, and jumps onto it', () => {
    const ph = new PhysicsWorld();
    // stairs of plates going −z, then a wall of bricks one brick high on top of them
    const pieces = [
      piece(1, -4, 0, -6, 8, 2, 'plate'),
      piece(2, -4, 1, -8, 8, 2, 'plate'),
      piece(3, -4, 2, -10, 8, 2, 'plate'),
      piece(4, -4, 3, -16, 8, 6),
    ];
    ph.setChunk('0_0', pieces, bounds);
    const s = hero(0, 0, 0);
    run(ph, s, { ...still, z: 1 }, 3);
    // up the three plates (top 1.2) and stopped by the brick (front at z −10)
    expect(s.y).toBeCloseTo(1.2, 1);
    expect(s.z).toBeGreaterThan(-10);
    expect(s.z).toBeLessThan(-9);
    // a running jump puts it on top (1.2 + 1.2)
    walkHero(ph, s, { ...still, z: 1, jump: true }, 1 / 60, 0, { scale: 1 });
    run(ph, s, { ...still, z: 1 }, 1);
    expect(s.y).toBeCloseTo(2.4, 1);
    ph.free();
  });

  it('pushes a loose crate, stands on it and rides it down a river', () => {
    const ph = new PhysicsWorld();
    const s = hero(0, 0, 0);
    ph.addObject('crate', [{ x0: -1.5, x1: 1.5, y0: 0, y1: 1.2, z0: -6, z1: -3 }]);
    run(ph, s, still, 0.3);
    run(ph, s, { ...still, z: 1 }, 2);
    // pushed toward −z, not walked through
    expect(ph.objectPose('crate')!.pos[2]).toBeLessThan(-4.6);
    expect(s.z).toBeGreaterThan(ph.objectPose('crate')!.pos[2]);
    ph.free();

    // a raft in a river: the hero stands on it and is carried
    const ph2 = new PhysicsWorld();
    ph2.setWater([{ x0: -40, x1: 80, y0: 0, y1: 3, z0: -10, z1: 10, current: [3, 0] }]);
    ph2.addObject('raft', [{ x0: -3, x1: 3, y0: 2, y1: 3.2, z0: -3, z1: 3 }]);
    for (let i = 0; i < 120; i++) ph2.step(1 / 60);
    const raft = ph2.objectPose('raft')!.pos;
    const s2 = hero(raft[0], raft[1] + 1, raft[2]);
    run(ph2, s2, still, 3);
    const after = ph2.objectPose('raft')!.pos;
    expect(after[0] - raft[0]).toBeGreaterThan(2);
    // still on it: where the raft went, standing on its top
    expect(Math.abs(s2.x - after[0])).toBeLessThan(3);
    expect(s2.grounded).toBe(true);
    ph2.free();
  });
});

describe('Project › Movement in play', () => {
  const play = (movement: 'classic' | 'physics') => {
    const store = new ProjectStore(newProjectFiles({ name: 'Walk', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    bus.execute({ type: 'project.update', payload: { movement } }, { source: 'user' });
    const p = new PlaySession(store.snapshot());
    return p;
  };

  it('is classic unless the project picks physics; both walk the same way on the same map', () => {
    const results: Record<string, { dist: number; y: number }> = {};
    for (const m of ['classic', 'physics'] as const) {
      const p = play(m);
      expect(p.movementChoice).toBe(m);
      expect(p.physicsMovement).toBe(m === 'physics');
      const s = p.heroState;
      for (let i = 0; i < 30; i++) p.runtime.stepOnce();
      const x0 = s.x;
      const z0 = s.z;
      const y0 = s.y;
      p.input.keys.add('w');
      for (let i = 0; i < 60; i++) p.runtime.stepOnce();
      p.input.keys.delete('w');
      results[m] = { dist: Math.hypot(s.x - x0, s.z - z0), y: s.y - y0 };
      p.dispose();
    }
    // a second of walking: about 4 studs both ways (the generated start is open ground)
    expect(results.classic!.dist).toBeGreaterThan(3);
    expect(Math.abs(results.physics!.dist - results.classic!.dist)).toBeLessThan(0.8);
    expect(Math.abs(results.physics!.y - results.classic!.y)).toBeLessThan(0.5);
  });

  it('with physics, the hero walks into a loose crate and pushes it', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Push', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const crate = { ...BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!, loose: true };
    const map = store.manifest.entry.map;
    bus.execute({ type: 'project.update', payload: { movement: 'physics' } }, { source: 'user' });
    bus.execute({ type: 'asset.create', payload: { asset: crate } }, { source: 'user' });
    const r = bus.execute(
      { type: 'asset.place', payload: { map, asset: crate.id, pos: [8, 0, 6], id: 'ins_pushcrate1' } },
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(store.snapshot());
    const w = p.world;
    const lo = w.looseObjects[0]!;
    const start = w.physics!.objectPose('ins_pushcrate1')!.pos;
    // the hero beside the crate (the empty map is 16 studs across), walking at it: forward is +x at this yaw
    p.placeAt([start[0] - 4, 0, start[2]], Math.PI / 2);
    p.camYaw = -Math.PI / 2;
    for (let i = 0; i < 20; i++) p.runtime.stepOnce();
    p.input.keys.add('w');
    for (let i = 0; i < 150; i++) p.runtime.stepOnce();
    const end = w.physics!.objectPose('ins_pushcrate1')!.pos;
    expect(end[0] - start[0]).toBeGreaterThan(0.5);
    expect(lo.inst.inst.id).toBe('ins_pushcrate1');
    p.dispose();
  });
});

describe('physics movement against v68 on real maps', () => {
  // the same keys for both: walk, run, turn, jump over things, for 12 seconds
  const script: { t: number; keys: string[]; jump?: boolean; yaw?: number }[] = [
    { t: 0, keys: ['w'] },
    { t: 2, keys: ['w', 'shift'] },
    { t: 4, keys: ['w', 'd'], jump: true },
    { t: 5, keys: ['d'] },
    { t: 6, keys: ['s', 'shift'], yaw: 1 },
    { t: 8, keys: ['a'], jump: true },
    { t: 9, keys: ['w'], jump: true },
    { t: 10.5, keys: [] },
  ];
  const trace = (generate: boolean | 'yard', movement: 'classic' | 'physics') => {
    const store = new ProjectStore(
      newProjectFiles({
        name: 'Compare',
        random: () => 0.3,
        ...(generate === true
          ? { generate: { environments: ['forest', 'city', 'mountains'], size: 24, seed: 73521 } }
          : {}),
      }),
    );
    const bus = registerAll(new CommandBus(store));
    bus.execute({ type: 'project.update', payload: { movement } }, { source: 'user' });
    if (generate === 'yard') {
      const y = trainingYard();
      expect(bus.execute(y.commands, { source: 'user' }).ok).toBe(true);
      bus.execute({ type: 'project.update', payload: { entryMap: y.map } }, { source: 'user' });
    }
    const p = new PlaySession(store.snapshot());
    const s = p.heroState;
    const out: { x: number; y: number; z: number; floor: number | null; depth: number }[] = [];
    let path = 0;
    let last = { x: s.x, z: s.z };
    let k = 0;
    for (let i = 0; i < 12 * 60; i++) {
      const t = i / 60;
      while (k < script.length && script[k]!.t <= t) {
        const e = script[k++]!;
        p.input.keys.clear();
        for (const key of e.keys) p.input.keys.add(key);
        if (e.jump) p.input.jump = true;
        if (e.yaw !== undefined) p.camYaw = e.yaw;
      }
      p.runtime.stepOnce();
      path += Math.hypot(s.x - last.x, s.z - last.z);
      last = { x: s.x, z: s.z };
      if (i % 30 === 0) {
        const c = p.world.controller as unknown as {
          sceneryContacts(x: number, y: number, z: number): { p: { depth: number } }[];
        };
        const depth = Math.max(0, ...c.sceneryContacts(s.x, s.y, s.z).map((q) => q.p.depth));
        out.push({ x: s.x, y: s.y, z: s.z, floor: p.world.controller.floor(s.x, s.z, s.y + 0.5), depth });
      }
    }
    p.dispose();
    return { out, path };
  };

  for (const generate of [false, true, 'yard'] as const)
    it(`walks ${generate === 'yard' ? 'the Training yard' : generate ? 'a generated forest, city and mountains map' : 'a new empty map'} like v68`, () => {
      const a = trace(generate, 'classic');
      const b = trace(generate, 'physics');
      // never inside the ground: the feet are on or above what v68 calls the floor there, and never inside bricks
      // (v68's own test of the body against bricks)
      for (const q of b.out) {
        if (q.floor !== null) expect(q.y).toBeGreaterThan(q.floor - 0.15);
        expect(q.depth).toBeLessThan(0.2);
      }
      if (!generate) {
        // open ground: the same walk, step for step
        expect(b.path).toBeGreaterThan(a.path * 0.9);
        expect(b.path).toBeLessThan(a.path * 1.1);
        const ea = a.out.at(-1)!;
        const eb = b.out.at(-1)!;
        expect(Math.hypot(ea.x - eb.x, ea.z - eb.z)).toBeLessThan(1.5);
      } else {
        // among bricks it slides along edges where v68 snags on them, so it gets at least as far
        expect(b.path).toBeGreaterThan(a.path * 0.9);
        expect(b.path).toBeLessThan(a.path * 1.8);
      }
    });
});
