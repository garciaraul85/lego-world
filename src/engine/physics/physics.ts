import RAPIER from '@dimforge/rapier3d-compat';
import type { LegacyPiece } from '../../core/legacy/types';

/**
 * Milestone 2b, the physics core (10b): Rapier, a physics engine shipped as WebAssembly. One PhysicsWorld per
 * loaded map: its bricks near the hero are solid boxes (chunk by chunk, as the game's window moves), loose
 * things are rigid bodies that tumble, stack and come to rest, the hero pushes them, and rays can be cast.
 *
 * Units are the game's: 1 = a stud across, a plate is 0.4 high; gravity is v68's (18 per second squared).
 */
let ready = false;
let loading: Promise<void> | null = null;

/** loads the physics engine once (WebAssembly is compiled asynchronously); the game falls back to v68's until it is */
export function initPhysics(): Promise<void> {
  loading ??= RAPIER.init().then(() => {
    ready = true;
  });
  return loading;
}

export const physicsReady = () => ready;

export type Box = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };

/** a loose brick (debris): where it is and how it is turned, read back after each step */
export type LooseBrick = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  sleeping?: boolean;
};

/** a body of water: a box whose top is the surface, and how it flows (studs a second, across and deep) */
export type WaterBox = Box & { current: [number, number] };

/** how strongly water lifts a loose thing, against its weight (above 1: it floats, partly under) */
export const BUOYANCY = 1.7;

/** half sizes of the debris brick (v68's 1 × 1 brick drawn at d.scale: 0.975 wide, 1.2 high) */
const DEBRIS_HALF = { x: 0.4875, y: 0.6, z: 0.4875 };
export const GRAVITY = 18;

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private chunks = new Map<string, RAPIER.Collider[]>();
  private loose = new Map<LooseBrick, RAPIER.RigidBody>();
  private hero: RAPIER.RigidBody | null = null;
  private heroCollider: RAPIER.Collider | null = null;
  /** colliders came or went since the last step: rays must wait for the engine to see them */
  private queriesStale = true;
  private water: WaterBox[] = [];
  /** loose objects (whole assets) by their key, and how tall they are (for how deep they sit in water) */
  private objects = new Map<string, { body: RAPIER.RigidBody; half: number }>();

  constructor() {
    if (!ready) throw new Error('The physics engine is not loaded yet.');
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    // v68's ground: nothing falls below height 0 (the floor under every map)
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4096, 1, 4096).setTranslation(0, -1, 0).setFriction(0.9).setRestitution(0.1),
    );
  }

  /** the chunks whose bricks are solid now */
  chunkKeys(): Set<string> {
    return new Set(this.chunks.keys());
  }

  /** a chunk's bricks become solid boxes (any it had before are replaced) */
  setChunk(key: string, pieces: readonly LegacyPiece[], bounds: (p: LegacyPiece) => Box) {
    this.dropChunk(key);
    const list: RAPIER.Collider[] = [];
    for (const p of pieces) {
      const b = bounds(p);
      const hx = (b.x1 - b.x0) / 2;
      const hy = (b.y1 - b.y0) / 2;
      const hz = (b.z1 - b.z0) / 2;
      if (hx <= 0 || hy <= 0 || hz <= 0) continue;
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(b.x0 + hx, b.y0 + hy, b.z0 + hz)
        .setFriction(0.9)
        .setRestitution(0.15);
      list.push(this.world.createCollider(desc));
    }
    this.chunks.set(key, list);
    this.queriesStale = true;
  }

  dropChunk(key: string) {
    const list = this.chunks.get(key);
    if (!list) return;
    for (const c of list) this.world.removeCollider(c, false);
    this.chunks.delete(key);
    this.queriesStale = true;
  }

  /** a loose brick starts to fall and tumble from where it is, at its speed */
  addLoose(d: LooseBrick) {
    if (this.loose.has(d)) return;
    const q = quatFromYXZ(d.ry, d.rx, d.rz);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(d.x, d.y, d.z)
        .setRotation(q)
        .setLinvel(d.vx, d.vy, d.vz)
        .setAngvel({ x: d.vz * 0.8, y: (d.vx - d.vz) * 0.3, z: -d.vx * 0.8 })
        .setLinearDamping(0.05)
        .setAngularDamping(0.4)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(DEBRIS_HALF.x * d.scale, DEBRIS_HALF.y * d.scale, DEBRIS_HALF.z * d.scale)
        .setDensity(1)
        .setFriction(0.8)
        .setRestitution(0.2),
      body,
    );
    this.loose.set(d, body);
  }

  removeLoose(d: LooseBrick) {
    const body = this.loose.get(d);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.loose.delete(d);
  }

  /** keeps the loose bricks to exactly this list (bricks gone from it lose their body, new ones get one) */
  syncLoose(list: readonly LooseBrick[], skip?: (d: LooseBrick) => boolean) {
    const want = new Set(list);
    for (const d of [...this.loose.keys()]) if (!want.has(d) || skip?.(d)) this.removeLoose(d);
    for (const d of list) if (!skip?.(d)) this.addLoose(d);
  }

  get looseCount() {
    return this.loose.size;
  }

  /** the hero as a solid capsule that pushes loose things (moved to where the game put it) */
  moveHero(x: number, y: number, z: number, radius: number, height: number) {
    if (!this.hero) {
      this.hero = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
      this.heroCollider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(0.05, height / 2 - radius), radius).setTranslation(0, height / 2, 0),
        this.hero,
      );
    }
    this.hero.setNextKinematicTranslation({ x, y, z });
  }

  /** the map's water (loose things float in it, and its current carries them) */
  setWater(list: readonly WaterBox[]) {
    this.water = [...list];
  }

  /** a whole asset as one rigid body: its bricks (world boxes) are its shape; returns its key */
  addObject(key: string, boxes: readonly Box[]) {
    this.removeObject(key);
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (const b of boxes) {
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      z0 = Math.min(z0, b.z0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
      z1 = Math.max(z1, b.z1);
    }
    // the body's origin is the middle of its bricks; each brick is a box around it
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(cx, cy, cz)
        .setLinearDamping(0.1)
        .setAngularDamping(0.6)
        .setCcdEnabled(true),
    );
    for (const b of boxes) {
      const hx = (b.x1 - b.x0) / 2;
      const hy = (b.y1 - b.y0) / 2;
      const hz = (b.z1 - b.z0) / 2;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx * 0.98, hy * 0.98, hz * 0.98)
          .setTranslation(b.x0 + hx - cx, b.y0 + hy - cy, b.z0 + hz - cz)
          .setDensity(0.6)
          .setFriction(0.8)
          .setRestitution(0.15),
        body,
      );
    }
    this.objects.set(key, { body, half: (y1 - y0) / 2 });
    return { origin: [cx, cy, cz] as [number, number, number] };
  }

  removeObject(key: string) {
    const o = this.objects.get(key);
    if (!o) return;
    this.world.removeRigidBody(o.body);
    this.objects.delete(key);
  }

  /** where a loose object is and how it is turned (null: no such object) */
  objectPose(
    key: string,
  ): { pos: [number, number, number]; rot: { x: number; y: number; z: number; w: number } } | null {
    const o = this.objects.get(key);
    if (!o) return null;
    const t = o.body.translation();
    return { pos: [t.x, t.y, t.z], rot: o.body.rotation() };
  }

  get objectCount() {
    return this.objects.size;
  }

  /** buoyancy, drag and current on everything loose that is in water (before each step) */
  private applyWater(dt: number) {
    if (!this.water.length) return;
    const each = (body: RAPIER.RigidBody, half: number) => {
      const t = body.translation();
      for (const w of this.water) {
        if (t.x < w.x0 || t.x > w.x1 || t.z < w.z0 || t.z > w.z1 || t.y - half > w.y1 || t.y + half < w.y0) continue;
        // how much of it is under the surface (0 to 1)
        const under = Math.max(0, Math.min(1, (w.y1 - (t.y - half)) / (2 * half)));
        if (under <= 0) continue;
        const m = body.mass();
        const v = body.linvel();
        const lift = m * GRAVITY * BUOYANCY * under * dt;
        // water slows it, and the current pulls it along
        const k = Math.min(1, 2.5 * under * dt);
        body.applyImpulse(
          { x: m * (w.current[0] - v.x) * k, y: lift - m * v.y * k, z: m * (w.current[1] - v.z) * k },
          true,
        );
        const a = body.angvel();
        body.setAngvel({ x: a.x * (1 - k), y: a.y * (1 - k), z: a.z * (1 - k) }, true);
        break;
      }
    };
    for (const [d, body] of this.loose) each(body, DEBRIS_HALF.y * d.scale);
    for (const o of this.objects.values()) each(o.body, o.half);
  }

  /** one step of the simulation */
  step(dt: number) {
    if (dt <= 0) return;
    this.applyWater(Math.min(dt, 1 / 30));
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
    this.queriesStale = false;
  }

  /** brings the engine's picture of what is where up to date without moving anything (for rays) */
  private refreshQueries() {
    if (!this.queriesStale) return;
    const dt = this.world.timestep;
    this.world.timestep = 0;
    this.world.step();
    this.world.timestep = dt;
    this.queriesStale = false;
  }

  /** writes the bodies' places and turns back into the loose bricks */
  readLoose() {
    for (const [d, body] of this.loose) {
      const t = body.translation();
      const v = body.linvel();
      d.x = t.x;
      d.y = t.y;
      d.z = t.z;
      d.vx = v.x;
      d.vy = v.y;
      d.vz = v.z;
      const e = yxzFromQuat(body.rotation());
      d.ry = e.y;
      d.rx = e.x;
      d.rz = e.z;
      d.sleeping = body.isSleeping();
    }
  }

  /** puts a loose brick somewhere (kept inside the map), keeping how it moves */
  place(d: LooseBrick, x: number, y: number, z: number, vx: number, vz: number) {
    const body = this.loose.get(d);
    if (!body) return;
    body.setTranslation({ x, y, z }, true);
    const v = body.linvel();
    body.setLinvel({ x: vx, y: v.y, z: vz }, true);
  }

  /** the first solid thing along a ray (null: nothing within maxDistance) */
  raycast(
    from: [number, number, number],
    dir: [number, number, number],
    maxDistance: number,
  ): { distance: number; point: [number, number, number] } | null {
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const d = { x: dir[0] / len, y: dir[1] / len, z: dir[2] / len };
    this.refreshQueries();
    const ray = new RAPIER.Ray({ x: from[0], y: from[1], z: from[2] }, d);
    const hit = this.world.castRay(ray, maxDistance, true, undefined, undefined, this.heroCollider ?? undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return { distance: t, point: [from[0] + d.x * t, from[1] + d.y * t, from[2] + d.z * t] };
  }

  /** nothing solid between two points (eyes to eyes: who can see whom) */
  lineOfSight(a: [number, number, number], b: [number, number, number]): boolean {
    const dir: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...dir);
    if (len < 1e-6) return true;
    const hit = this.raycast(a, dir, len);
    return !hit || hit.distance >= len - 1e-3;
  }

  free() {
    this.world.free();
    this.chunks.clear();
    this.loose.clear();
    this.objects.clear();
    this.hero = null;
    this.heroCollider = null;
  }
}

/** v68 turns bricks Y, then X, then Z (its matrix(…, ry, rx, rz)); these convert to and from quaternions */
export function quatFromYXZ(y: number, x: number, z: number): { x: number; y: number; z: number; w: number } {
  const c1 = Math.cos(y / 2);
  const s1 = Math.sin(y / 2);
  const c2 = Math.cos(x / 2);
  const s2 = Math.sin(x / 2);
  const c3 = Math.cos(z / 2);
  const s3 = Math.sin(z / 2);
  // q = qy * qx * qz
  return {
    x: c1 * s2 * c3 + s1 * c2 * s3,
    y: s1 * c2 * c3 - c1 * s2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };
}

export function yxzFromQuat(q: { x: number; y: number; z: number; w: number }): { x: number; y: number; z: number } {
  const { x, y, z, w } = q;
  // rotation matrix entries (row, column)
  const m02 = 2 * (x * z + w * y);
  const m12 = 2 * (y * z - w * x);
  const m22 = 1 - 2 * (x * x + y * y);
  const m10 = 2 * (x * y + w * z);
  const m11 = 1 - 2 * (x * x + z * z);
  const m00 = 1 - 2 * (y * y + z * z);
  const m20 = 2 * (x * z - w * y);
  const ex = Math.asin(Math.max(-1, Math.min(1, -m12)));
  if (Math.abs(m12) < 0.9999999) return { x: ex, y: Math.atan2(m02, m22), z: Math.atan2(m10, m11) };
  return { x: ex, y: Math.atan2(-m20, m00), z: 0 };
}
