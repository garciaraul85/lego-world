import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import type { LegacyPiece } from '../../src/core/legacy/types';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Box, PhysicsWorld, quatFromYXZ, yxzFromQuat } from '../../src/engine/physics/physics';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 2b, 10b: the physics core (Rapier) — solid bricks, loose bricks that tumble and rest, rays. */
const piece = (id: number, x: number, y: number, z: number, cols = 4, rows = 4): LegacyPiece =>
  ({ id, x, y, z, rows, cols, turn: 0, kind: 'brick', color: 1 }) as LegacyPiece;
// a brick: `cols` × `rows` studs, 1.2 high (y in plates of 0.4)
const bounds = (p: LegacyPiece): Box => ({
  x0: p.x,
  x1: p.x + p.cols,
  z0: p.z,
  z1: p.z + p.rows,
  y0: p.y * 0.4,
  y1: p.y * 0.4 + 1.2,
});

describe('physics core', () => {
  it('turns v68’s brick turns into the physics engine’s and back', () => {
    for (const [y, x, z] of [
      [0.3, 0.2, 0.1],
      [2, -0.7, 1.4],
      [-1.2, 0.5, -2.5],
    ] as const) {
      const e = yxzFromQuat(quatFromYXZ(y, x, z));
      const back = quatFromYXZ(e.y, e.x, e.z);
      const q = quatFromYXZ(y, x, z);
      // the same turn (a quaternion and its negative are the same turn)
      const dot = Math.abs(back.x * q.x + back.y * q.y + back.z * q.z + back.w * q.w);
      expect(dot).toBeCloseTo(1, 6);
    }
  });

  it('a loose brick falls onto solid bricks and comes to rest on top, not through them', () => {
    const ph = new PhysicsWorld();
    // a floor of bricks, its top at y = 1.2
    const floor: LegacyPiece[] = [];
    for (let x = -8; x < 8; x += 4) for (let z = -8; z < 8; z += 4) floor.push(piece(floor.length + 1, x, 0, z));
    ph.setChunk('0_0', floor, bounds);
    const d = { x: 0, y: 6, z: 0, vx: 1, vy: 0, vz: 0.5, rx: 0.4, ry: 1, rz: 0, scale: 0.6 };
    ph.syncLoose([d]);
    for (let i = 0; i < 240; i++) {
      ph.step(1 / 60);
      ph.readLoose();
    }
    // resting on the floor: its lowest point at the top of the bricks (half sizes 0.29 × 0.36 × 0.29)
    expect(d.y).toBeGreaterThan(1.2 + 0.25);
    expect(d.y).toBeLessThan(1.2 + 0.6);
    expect(Math.hypot(d.vx, d.vy, d.vz)).toBeLessThan(0.05);
    // the floor's chunk goes: the brick falls on
    ph.dropChunk('0_0');
    for (let i = 0; i < 30; i++) ph.step(1 / 60);
    ph.readLoose();
    expect(d.y).toBeLessThan(1.2);
    ph.free();
  });

  it('casts rays and tells whether one place sees another', () => {
    const ph = new PhysicsWorld();
    // a wall 4 studs wide at x 0..4, z 10..11, 3 bricks high
    ph.setChunk('0_0', [piece(1, 0, 0, 10, 4, 1), piece(2, 0, 3, 10, 4, 1), piece(3, 0, 6, 10, 4, 1)], bounds);
    const hit = ph.raycast([2, 1, 0], [0, 0, 1], 50);
    expect(hit?.distance).toBeCloseTo(10, 3);
    expect(ph.lineOfSight([2, 1, 0], [2, 1, 20])).toBe(false);
    expect(ph.lineOfSight([2, 1, 0], [2, 1, 9])).toBe(true);
    expect(ph.lineOfSight([2, 5, 0], [2, 5, 20])).toBe(true); // over the wall
    ph.free();
  });
});

describe('physics in play', () => {
  it('smashed bricks tumble onto the ground and come to rest; the map’s bricks are solid there', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Smash', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
    const map = store.manifest.entry.map;
    bus.execute({ type: 'asset.create', payload: { asset: crate } }, { source: 'user' });
    const r = bus.execute(
      { type: 'asset.place', payload: { map, asset: crate.id, pos: [20, 0, 20], id: 'ins_physcrate1' } },
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(store.snapshot());
    const w = p.world;
    expect(w.physics).not.toBeNull();
    expect(w.physics!.chunkKeys().size).toBeGreaterThan(0);
    const inst = w.instances.find((i) => i.inst.id === 'ins_physcrate1')!;
    const ground = Math.min(...inst.bricks.map((b) => b.y)) * 0.4;
    p.placeAt([0, 0.4, 0], 0);
    const piece0 = p.pieceById(w, inst.inst.idBase)!;
    expect(p.breakHit(piece0, undefined, true)).toBeGreaterThan(0);
    expect(w.debris.length).toBeGreaterThan(5);
    for (let i = 0; i < 60 * 4; i++) p.runtime.stepOnce();
    expect(w.physics!.looseCount).toBe(w.debris.length);
    // every loose brick lies on what is under it (never below the ground the crate stood on)
    for (const d of w.debris) expect(d.y).toBeGreaterThan(ground - 0.1);
    // most have come to rest
    expect(w.debris.filter((d) => d.sleeping || Math.hypot(d.vx, d.vy, d.vz) < 0.2).length).toBeGreaterThan(
      w.debris.length * 0.7,
    );
    p.dispose();
    expect(w.physics).toBeNull();
  });
});
