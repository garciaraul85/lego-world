import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { WaterInstance } from '../../src/core/schema';
import { PhysicsWorld } from '../../src/engine/physics/physics';
import { poseMatrix } from '../../src/engine/runtime/play-renderer';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 2b, 10b part 2: water volumes (buoyancy, currents) and loose objects. */
const crate = [{ x0: 0, x1: 2, y0: 6, y1: 7.2, z0: 0, z1: 2 }];

describe('water in the physics core', () => {
  it('a loose crate dropped into a pool floats at its surface', () => {
    const ph = new PhysicsWorld();
    ph.setWater([{ x0: -10, x1: 10, y0: 0, y1: 3, z0: -10, z1: 10, current: [0, 0] }]);
    ph.addObject('c', crate);
    for (let i = 0; i < 60 * 8; i++) ph.step(1 / 60);
    const p = ph.objectPose('c')!;
    // floating: its middle near the surface (y 3), not on the bottom (y 0)
    expect(p.pos[1]).toBeGreaterThan(2.2);
    expect(p.pos[1]).toBeLessThan(3.8);
    // stays where it fell (still water)
    expect(Math.abs(p.pos[0] - 1)).toBeLessThan(1);
    ph.free();
  });

  it('a river carries it along its current; out of the water it falls', () => {
    const ph = new PhysicsWorld();
    ph.setWater([{ x0: -10, x1: 60, y0: 0, y1: 3, z0: -10, z1: 10, current: [4, 0] }]);
    ph.addObject('c', crate);
    for (let i = 0; i < 60 * 6; i++) ph.step(1 / 60);
    const p = ph.objectPose('c')!;
    expect(p.pos[0]).toBeGreaterThan(8);
    expect(Math.abs(p.pos[2] - 1)).toBeLessThan(2);
    ph.setWater([]);
    for (let i = 0; i < 60 * 3; i++) ph.step(1 / 60);
    // no water: down to the ground (top at y 0)
    expect(ph.objectPose('c')!.pos[1]).toBeLessThan(1.2);
    ph.free();
  });

  it('draws a loose object where its body is: placed bricks map onto the pose', () => {
    const origin = [1, 6.6, 1] as const;
    // no turn: moved by pos − origin
    const m = poseMatrix({ pos: [5, 2, 1], rot: { x: 0, y: 0, z: 0, w: 1 } }, origin);
    expect([m[12], m[13], m[14]].map((v) => Math.round(v! * 1000) / 1000)).toEqual([4, -4.6, 0]);
    // a quarter turn about Y: the origin still lands on pos
    const s = Math.SQRT1_2;
    const q = poseMatrix({ pos: [5, 2, 1], rot: { x: 0, y: s, z: 0, w: s } }, origin);
    const at = (v: readonly number[]) => [0, 1, 2].map((i) => q[i]! * v[0]! + q[4 + i]! * v[1]! + q[8 + i]! * v[2]! + q[12 + i]!);
    expect(at(origin).map((v) => Math.round(v * 1000) / 1000)).toEqual([5, 2, 1]);
  });
});

describe('water and loose objects in play', () => {
  it('a loose crate standing in a pool rises and floats; its bricks are not solid map bricks', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Pool', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const crateDef = { ...BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!, loose: true };
    const map = store.manifest.entry.map;
    const water: WaterInstance = {
      id: 'ins_pool000001',
      kind: 'water',
      name: 'Pool 1',
      pos: [12, -1, 12],
      size: [16, 6, 16],
      body: 'pool',
    };
    const r = bus.execute(
      [
        { type: 'asset.create', payload: { asset: crateDef } },
        { type: 'asset.place', payload: { map, asset: crateDef.id, pos: [20, 0, 20], id: 'ins_floatcrate' } },
        { type: 'item.add', payload: { map, item: water } },
      ],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(store.snapshot());
    const w = p.world;
    expect(w.water).toHaveLength(1);
    expect(w.looseObjects).toHaveLength(1);
    const lo = w.looseObjects[0]!;
    expect(lo.pieces.length).toBeGreaterThan(0);
    const ids = new Set(lo.pieces.map((q) => q.id));
    expect(w.pieces.some((q) => q.id !== undefined && ids.has(q.id))).toBe(false);
    p.placeAt([0, 0.4, 0], 0);
    const start = w.physics!.objectPose('ins_floatcrate')!.pos[1];
    for (let i = 0; i < 60 * 8; i++) p.runtime.stepOnce();
    const y = w.physics!.objectPose('ins_floatcrate')!.pos[1];
    // it stood on the ground under the water: it rises and floats at the surface (y 5)
    expect(y).toBeGreaterThan(start + 1);
    expect(y).toBeGreaterThan(3.8);
    expect(y).toBeLessThan(6.5);
    p.dispose();
  });
});
