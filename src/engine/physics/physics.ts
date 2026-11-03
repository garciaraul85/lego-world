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

/** step 12b: a ball the physics engine moves (a bomb): its bottom and its speed, written back after each step */
export type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number };

/** a body of water: a box whose top is the surface, and how it flows (studs a second, across and deep) */
export type WaterBox = Box & { current: [number, number] };

/** how strongly water lifts a loose thing, against its weight (above 1: it floats, partly under) */
export const BUOYANCY = 1.7;

/** half sizes of the debris brick (v68's 1 × 1 brick drawn at d.scale: 0.975 wide, 1.2 high) */
const DEBRIS_HALF = { x: 0.4875, y: 0.6, z: 0.4875 };
export const GRAVITY = 18;
/**
 * step 12c: friction on ice (the coefficient, as a = μg). Wet ice under a boot or a crate is about 0.02 to 0.1; the
 * engine uses this for icy tops (loose things slide on them) and the hero's slide uses it too.
 */
export const ICE_FRICTION = 0.05;
/** the most a foot can push off ice before it slips (static friction of a boot on ice) */
export const ICE_GRIP = 0.1;
/** an ice block sliding on ice, and on anything else (stone, wood, the ground) */
export const ICE_ON_ICE = 0.02;
export const ICE_ON_GROUND = 0.25;

/**
 * step 12c-2: wind. Moving air pushes on what it meets with quadratic drag, F = ½·ρ·Cd·A·|v|·v, where v is the air's
 * speed against the thing, A the side it shows the wind and Cd its shape (a box about 1.05, a ball 0.5, a person
 * about 1). How far that moves it is F / m against its friction on the ground (μ m g): light things blow away, heavy
 * ones stay put, anything on ice or in the air drifts. The air here is denser than real air (0.05 in the game's
 * units, where water is 1): a fan in a dungeon pushes as Zelda's fans do, which real air at the same speed would not.
 */
export const AIR_DENSITY = 0.05;
/** a body of water's pull on what is in it uses the same drag, with water's density */
export const WATER_DENSITY = 1;

/** a wind field: air moving one way through a box (a fan's blast, a gust), its speed falling off along it */
export type WindField = {
  /** where it leaves the fan: the middle of its outlet, at the bottom (world units) */
  from: [number, number, number];
  /** which way it blows (a unit vector across the ground) */
  dir: [number, number];
  /** how far it reaches (studs, already cut short by a wall), how wide (half, studs) and how tall */
  reach: number;
  half: number;
  height: number;
  /** the air's speed at the outlet (studs a second); it falls to FAR_SPEED of that at the far end */
  speed: number;
};
/** at the far end of its reach a wind blows at this much of its speed (it spreads and slows) */
export const FAR_SPEED = 0.35;

/** the wind there (studs a second, across and deep) from every field; zero outside them */
export function windAt(fields: readonly WindField[], x: number, y: number, z: number): [number, number] {
  let vx = 0;
  let vz = 0;
  for (const f of fields) {
    const rx = x - f.from[0];
    const rz = z - f.from[2];
    const along = rx * f.dir[0] + rz * f.dir[1];
    if (along < -0.3 || along > f.reach) continue;
    // it spreads up a little as it goes, too
    if (y < f.from[1] - 0.2 || y > f.from[1] + f.height + Math.max(0, along) * 0.08) continue;
    const side = Math.abs(rx * f.dir[1] - rz * f.dir[0]);
    // it spreads a little as it goes
    const half = f.half + along * 0.08;
    if (side > half) continue;
    const k = 1 - (1 - FAR_SPEED) * Math.max(0, along) / Math.max(1, f.reach);
    // softer at its edges
    const edge = Math.min(1, (half - side) / 0.6 + 0.3);
    const v = f.speed * k * edge;
    vx += f.dir[0] * v;
    vz += f.dir[1] * v;
  }
  return [vx, vz];
}

/** the acceleration drag gives a thing (per second², across and deep): ½ρ·CdA/m · |v−u|·(v−u) */
export function dragAccel(
  wind: [number, number],
  vel: [number, number],
  cdAOverM: number,
  density = AIR_DENSITY,
): [number, number] {
  const rx = wind[0] - vel[0];
  const rz = wind[1] - vel[1];
  const r = Math.hypot(rx, rz);
  const k = 0.5 * density * cdAOverM * r;
  return [k * rx, k * rz];
}
/** the ground under every map: tiles this many studs across, out to this far each way */
const GROUND_TILE = 64;
/** the character controller keeps this gap to what it touches; the hero's feet are this far below its body */
const SKIN = 0.02;

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private chunks = new Map<string, RAPIER.Collider[]>();
  private loose = new Map<LooseBrick, RAPIER.RigidBody>();
  /** step 12b: balls (a thrown or put-down bomb): they roll, bounce off walls and come to rest; y is their bottom */
  private balls = new Map<Ball, { body: RAPIER.RigidBody; r: number }>();
  private hero: RAPIER.RigidBody | null = null;
  private heroCollider: RAPIER.Collider | null = null;
  /** colliders came or went since the last step: rays must wait for the engine to see them */
  private queriesStale = true;
  private water: WaterBox[] = [];
  /** loose objects (whole assets) by their key, and how tall they are (for how deep they sit in water) */
  private objects = new Map<string, { body: RAPIER.RigidBody; half: number }>();

  private solids = new Map<string, RAPIER.Collider>();

  /** step 12c-2: the wind blowing now (fans, gusts): it pushes the loose things before each step */
  wind: readonly WindField[] = [];
  /** loose objects' size against the wind: Cd·A, by key */
  private windShape = new Map<string, number>();

  /** step 12c-2: drag of the wind on everything loose (bricks, objects, balls) in it, as impulses (before a step) */
  private applyWind(dt: number) {
    if (!this.wind.length) return;
    const push = (body: RAPIER.RigidBody, cdAOverM: number, upTo: number) => {
      const t = body.translation();
      const w = windAt(this.wind, t.x, t.y, t.z);
      if (!w[0] && !w[1]) return;
      const v = body.linvel();
      const [ax, az] = dragAccel(w, [v.x, v.z], cdAOverM);
      const m = body.mass();
      body.applyImpulse({ x: ax * m * dt, y: 0, z: az * m * dt }, true);
      // a thing standing tall in the wind also tips a little (the push is above its middle)
      if (upTo > 0) body.applyTorqueImpulse({ x: az * m * dt * upTo * 0.15, y: 0, z: -ax * m * dt * upTo * 0.15 }, true);
    };
    for (const [d, body] of this.loose) {
      const hx = DEBRIS_HALF.x * d.scale;
      const hy = DEBRIS_HALF.y * d.scale;
      // a brick: the side it shows (about 2hx × 2hy), as a box (Cd 1.05), its mass from the engine
      push(body, (1.05 * (2 * hx) * (2 * hy)) / Math.max(1e-3, body.mass()), hy);
    }
    for (const [key, o] of this.objects)
      push(o.body, (this.windShape.get(key) ?? 0) / Math.max(1e-3, o.body.mass()), o.half);
    for (const o of this.balls.values()) push(o.body, (0.5 * Math.PI * o.r * o.r) / Math.max(1e-3, o.body.mass()), 0);
  }
  /** step 12c: the slippery tops of icy floors, by key (with what they were made from, to see a change) */
  private ice = new Map<string, { c: RAPIER.Collider; sig: string }>();

  /**
   * step 12c: icy floors: a thin top of low friction (ICE_FRICTION, the lower of two surfaces' counts) on each, so
   * loose things (a crate, debris) slide on ice as they would. The list is all of them: others are dropped.
   */
  setIce(tops: readonly { key: string; x0: number; x1: number; z0: number; z1: number; y: number }[]) {
    const keep = new Set<string>();
    for (const t of tops) {
      const sig = `${t.x0},${t.x1},${t.z0},${t.z1},${t.y}`;
      keep.add(t.key);
      const was = this.ice.get(t.key);
      if (was?.sig === sig) continue;
      if (was) this.world.removeCollider(was.c, false);
      const c = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid((t.x1 - t.x0) / 2, 0.01, (t.z1 - t.z0) / 2)
          .setTranslation((t.x0 + t.x1) / 2, t.y, (t.z0 + t.z1) / 2)
          .setFriction(ICE_FRICTION)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(0.05),
      );
      this.ice.set(t.key, { c, sig });
      this.queriesStale = true;
    }
    for (const [k, v] of this.ice)
      if (!keep.has(k)) {
        this.world.removeCollider(v.c, false);
        this.ice.delete(k);
        this.queriesStale = true;
      }
  }

  /** the icy tops there are (keys) */
  iceKeys(): string[] {
    return [...this.ice.keys()];
  }

  constructor() {
    if (!ready) throw new Error('The physics engine is not loaded yet.');
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    // v68's ground: nothing falls below height 0 (the floor under every map)
    // (in tiles laid as things come near: one huge box lets a character sink slowly into it, from rounding)
    this.groundAt(0, 0);
  }

  private groundTiles = new Set<string>();
  private groundCentres = new Set<string>();

  /** v68's ground under a place and around it (tiles of 64 studs, laid once) */
  groundAt(x: number, z: number) {
    const tx = Math.floor(x / GROUND_TILE);
    const tz = Math.floor(z / GROUND_TILE);
    const centre = `${tx},${tz}`;
    if (this.groundCentres.has(centre)) return;
    this.groundCentres.add(centre);
    for (let i = tx - 1; i <= tx + 1; i++)
      for (let j = tz - 1; j <= tz + 1; j++) {
        const k = `${i},${j}`;
        if (this.groundTiles.has(k)) continue;
        this.groundTiles.add(k);
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(GROUND_TILE / 2, 1, GROUND_TILE / 2)
            .setTranslation((i + 0.5) * GROUND_TILE, -1, (j + 0.5) * GROUND_TILE)
            .setFriction(0.9)
            .setRestitution(0.1),
        );
        this.queriesStale = true;
      }
  }

  /** the chunks whose bricks are solid now */
  chunkKeys(): Set<string> {
    return new Set(this.chunks.keys());
  }

  /**
   * a chunk's bricks become solid (any it had before are replaced): one triangle mesh per chunk, the faces two
   * bricks share left out. (One box per brick made every step of the engine slow on big maps, where thousands of
   * bricks are near the hero.)
   */
  setChunk(key: string, pieces: readonly LegacyPiece[], bounds: (p: LegacyPiece) => Box) {
    this.dropChunk(key);
    if (pieces[0]) this.groundAt(pieces[0].x, pieces[0].z);
    const mesh = boxMesh(pieces.map(bounds));
    const list: RAPIER.Collider[] = [];
    if (mesh.indices.length)
      list.push(
        this.world.createCollider(
          RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
            .setFriction(0.9)
            .setRestitution(0.15),
        ),
      );
    this.chunks.set(key, list);
    this.queriesStale = true;
  }

  /**
   * Milestone 2b, 10c part 5: a placed model becomes solid: its triangles (world positions, three corners each) as
   * one triangle mesh, under its own key (apart from the chunks, which come and go with the hero)
   */
  setSolidMesh(key: string, triangles: Float32Array) {
    this.dropSolidMesh(key);
    const n = triangles.length / 3;
    if (n < 3) return;
    const indices = new Uint32Array(n - (n % 3));
    for (let i = 0; i < indices.length; i++) indices[i] = i;
    let mx = 0;
    let mz = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      mx += triangles[i]!;
      mz += triangles[i + 2]!;
    }
    this.groundAt(mx / n, mz / n);
    this.solids.set(
      key,
      this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(triangles, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
          .setFriction(0.9)
          .setRestitution(0.15),
      ),
    );
    this.queriesStale = true;
  }

  dropSolidMesh(key: string) {
    const c = this.solids.get(key);
    if (!c) return;
    this.world.removeCollider(c, false);
    this.solids.delete(key);
    this.queriesStale = true;
  }

  /** the placed models that are solid now (keys) */
  solidKeys(): string[] {
    return [...this.solids.keys()];
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
    this.groundAt(d.x, d.z);
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

  /** step 12b: a ball starts to roll and fly from where it is (y: its bottom), at its speed */
  addBall(b: Ball, r: number, density = 3) {
    if (this.balls.has(b)) return;
    this.groundAt(b.x, b.z);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(b.x, b.y + r, b.z)
        .setLinvel(b.vx, b.vy, b.vz)
        .setLinearDamping(0.5)
        .setAngularDamping(3)
        .setCcdEnabled(true),
    );
    // heavy and dull: it thuds against a wall and rolls only a little
    this.world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(density).setFriction(1).setRestitution(0.08), body);
    this.balls.set(b, { body, r });
    this.queriesStale = true;
  }

  removeBall(b: Ball) {
    const o = this.balls.get(b);
    if (!o) return;
    this.world.removeRigidBody(o.body);
    this.balls.delete(b);
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
    // a hero walked by the physics engine already is its own solid capsule
    if (this.walker) return;
    if (!this.hero) {
      this.hero = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
      this.heroCollider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(0.05, height / 2 - radius), radius).setTranslation(0, height / 2, 0),
        this.hero,
      );
    }
    this.hero.setNextKinematicTranslation({ x, y, z });
  }

  // ---- Milestone 2b, 10b part 3: the hero walked by the physics engine (a character controller) ----
  private kcc: RAPIER.KinematicCharacterController | null = null;
  private walker: { collider: RAPIER.Collider; radius: number; height: number } | null = null;
  private actorBodies = new Map<object, { collider: RAPIER.Collider; radius: number; height: number }>();
  /** what the hero stood on last step, when it moves (a floating crate): the hero rides along */
  private standingOn: RAPIER.RigidBody | null = null;

  /**
   * Moves the hero (feet at `from`) by `delta` through the world: bricks block it, it steps up a plate (0.45), it
   * stays on the ground walking down plates, it pushes loose things and rides what it stands on.
   */
  walk(
    from: { x: number; y: number; z: number },
    delta: { x: number; y: number; z: number },
    radius: number,
    height: number,
    /** step 11b: a swimmer is not pulled down onto the floor under it */
    opt: { noSnap?: boolean } = {},
  ): { x: number; y: number; z: number; grounded: boolean; blockedUp: boolean; riding: boolean } {
    if (!this.kcc) {
      const k = this.world.createCharacterController(SKIN);
      k.setUp({ x: 0, y: 1, z: 0 });
      k.enableAutostep(0.45, 0.15, true);
      k.enableSnapToGround(0.45);
      k.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
      k.setMinSlopeSlideAngle((60 * Math.PI) / 180);
      k.setApplyImpulsesToDynamicBodies(true);
      k.setCharacterMass(6);
      k.setSlideEnabled(true);
      this.kcc = k;
    }
    // the hero is one capsule (rebuilt when it grows or shrinks); the pushing body of classic movement goes
    if (this.hero) {
      this.world.removeRigidBody(this.hero);
      this.hero = null;
    }
    if (!this.walker || Math.abs(this.walker.radius - radius) > 1e-6 || Math.abs(this.walker.height - height) > 1e-6) {
      if (this.walker) this.world.removeCollider(this.walker.collider, false);
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(0.05, height / 2 - radius), radius)
          .setTranslation(from.x, from.y + SKIN + height / 2, from.z)
          .setFriction(0),
      );
      this.walker = { collider, radius, height };
      this.heroCollider = collider;
      this.queriesStale = true;
    }
    this.groundAt(from.x, from.z);
    this.refreshQueries();
    const c = this.walker.collider;
    // the game may have moved the hero (a teleport, a respawn): start from where the game says it is (the body a
    // skin above the feet, so it never starts inside what it stands on)
    c.setTranslation({ x: from.x, y: from.y + SKIN + height / 2, z: from.z });
    // standing on something that moves: carried along with it
    let d = delta;
    let riding = false;
    const on = this.standingOn;
    if (on?.isValid() && on.isDynamic()) {
      const v = on.linvel();
      const dt = this.world.timestep || 1 / 60;
      d = { x: d.x + v.x * dt, y: d.y + Math.max(0, v.y) * dt, z: d.z + v.z * dt };
      riding = Math.hypot(v.x, v.z) > 0.05;
    }
    if (opt.noSnap) this.kcc.disableSnapToGround();
    this.kcc.computeColliderMovement(c, d);
    if (opt.noSnap) this.kcc.enableSnapToGround(0.45);
    const m = this.kcc.computedMovement();
    const grounded = this.kcc.computedGrounded();
    // what is under the feet now
    this.standingOn = null;
    for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
      const hit = this.kcc.computedCollision(i);
      const body = hit?.collider?.parent();
      if (!hit || !body || !body.isDynamic()) continue;
      if (body.translation().y < from.y + 0.5) this.standingOn = body;
    }
    if (!grounded) this.standingOn = null;
    const x = from.x + m.x;
    const y = from.y + m.y;
    const z = from.z + m.z;
    c.setTranslation({ x, y: y + SKIN + height / 2, z });
    return { x, y, z, grounded, blockedUp: d.y > 1e-4 && m.y < d.y - 1e-3, riding };
  }

  /** other characters are solid capsules to the hero (feet positions; any not listed are gone) */
  setActors(list: readonly { key: object; x: number; y: number; z: number; radius: number; height: number }[]) {
    const keep = new Set<object>();
    for (const a of list) {
      keep.add(a.key);
      let e = this.actorBodies.get(a.key);
      if (e && (Math.abs(e.radius - a.radius) > 1e-6 || Math.abs(e.height - a.height) > 1e-6)) {
        this.world.removeCollider(e.collider, false);
        e = undefined;
      }
      if (!e) {
        e = {
          collider: this.world.createCollider(
            RAPIER.ColliderDesc.capsule(Math.max(0.05, a.height / 2 - a.radius), a.radius),
          ),
          radius: a.radius,
          height: a.height,
        };
        this.actorBodies.set(a.key, e);
        this.queriesStale = true;
      }
      e.collider.setTranslation({ x: a.x, y: a.y + a.height / 2, z: a.z });
    }
    for (const [k, e] of this.actorBodies)
      if (!keep.has(k)) {
        this.world.removeCollider(e.collider, false);
        this.actorBodies.delete(k);
      }
  }

  /** the hero stands on a loose thing (a crate, a raft) */
  get standingOnLoose() {
    return !!this.standingOn;
  }

  /** whether the hero is walked by the physics engine in this world */
  get walking() {
    return !!this.walker;
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
    this.groundAt(cx, cz);
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
    // the side it shows the wind (its bigger upright face) as a box: Cd·A
    this.windShape.set(key, 1.05 * Math.max(x1 - x0, z1 - z0) * (y1 - y0));
    return { origin: [cx, cy, cz] as [number, number, number] };
  }

  removeObject(key: string) {
    const o = this.objects.get(key);
    if (!o) return;
    this.world.removeRigidBody(o.body);
    this.objects.delete(key);
    this.windShape.delete(key);
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
    // the ground reaches wherever something is moving
    for (const b of this.loose.values()) if (!b.isSleeping()) this.groundAt(b.translation().x, b.translation().z);
    for (const o of this.objects.values())
      if (!o.body.isSleeping()) this.groundAt(o.body.translation().x, o.body.translation().z);
    for (const o of this.balls.values())
      if (!o.body.isSleeping()) this.groundAt(o.body.translation().x, o.body.translation().z);
    this.applyWater(Math.min(dt, 1 / 30));
    this.applyWind(Math.min(dt, 1 / 30));
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
    this.queriesStale = false;
    // balls: where they are now (their bottom), and how fast
    for (const [b, o] of this.balls) {
      const t = o.body.translation();
      const v = o.body.linvel();
      b.x = t.x;
      b.y = t.y - o.r;
      b.z = t.z;
      b.vx = v.x;
      b.vy = v.y;
      b.vz = v.z;
    }
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

  /**
   * step 12b: the first moving thing along a ray (a loose crate, a tumbling brick, a bomb), not the fixed bricks or
   * the hero: what stands in a beam of light
   */
  raycastMoving(from: [number, number, number], dir: [number, number, number], maxDistance: number): number | null {
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    this.refreshQueries();
    const ray = new RAPIER.Ray(
      { x: from[0], y: from[1], z: from[2] },
      { x: dir[0] / len, y: dir[1] / len, z: dir[2] / len },
    );
    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
      undefined,
      this.heroCollider ?? undefined,
    );
    return hit ? hit.timeOfImpact : null;
  }

  /** step 12c-2: the first fixed solid thing (bricks, the ground) along a ray: where a wind stops */
  raycastFixed(from: [number, number, number], dir: [number, number, number], maxDistance: number): number | null {
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    this.refreshQueries();
    const ray = new RAPIER.Ray(
      { x: from[0], y: from[1], z: from[2] },
      { x: dir[0] / len, y: dir[1] / len, z: dir[2] / len },
    );
    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
      undefined,
      this.heroCollider ?? undefined,
    );
    return hit ? hit.timeOfImpact : null;
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
    if (this.kcc) this.world.removeCharacterController(this.kcc);
    this.world.free();
    this.chunks.clear();
    this.loose.clear();
    this.objects.clear();
    this.balls.clear();
    this.hero = null;
    this.heroCollider = null;
    this.walker = null;
    this.kcc = null;
    this.actorBodies.clear();
    this.standingOn = null;
  }
}

/**
 * The outside of a set of boxes as triangles (facing out): a face that another box's face covers exactly (two
 * bricks stacked or side by side) is left out.
 */
export function boxMesh(boxes: readonly Box[]): { vertices: Float32Array; indices: Uint32Array } {
  const ok = boxes.filter((b) => b.x1 > b.x0 && b.y1 > b.y0 && b.z1 > b.z0);
  // a face by where it lies, whichever side it faces: two boxes sharing one cancel out
  const r = (v: number) => Math.round(v * 1000);
  const faceKey = (axis: number, at: number, a0: number, a1: number, b0: number, b1: number) =>
    `${axis}|${r(at)}|${r(a0)}|${r(a1)}|${r(b0)}|${r(b1)}`;
  const faces = (b: Box) =>
    [
      [0, b.x0, b.y0, b.y1, b.z0, b.z1, -1],
      [0, b.x1, b.y0, b.y1, b.z0, b.z1, 1],
      [1, b.y0, b.x0, b.x1, b.z0, b.z1, -1],
      [1, b.y1, b.x0, b.x1, b.z0, b.z1, 1],
      [2, b.z0, b.x0, b.x1, b.y0, b.y1, -1],
      [2, b.z1, b.x0, b.x1, b.y0, b.y1, 1],
    ] as const;
  const count = new Map<string, number>();
  for (const b of ok)
    for (const f of faces(b)) {
      const k = faceKey(f[0], f[1], f[2], f[3], f[4], f[5]);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  const v: number[] = [];
  const idx: number[] = [];
  for (const b of ok)
    for (const [axis, at, a0, a1, b0, b1, dir] of faces(b)) {
      if ((count.get(faceKey(axis, at, a0, a1, b0, b1)) ?? 0) > 1) continue;
      const base = v.length / 3;
      // the face's corners (a, b are the other two axes in order)
      const corner = (a: number, c: number): [number, number, number] =>
        axis === 0 ? [at, a, c] : axis === 1 ? [a, at, c] : [a, c, at];
      v.push(...corner(a0, b0), ...corner(a1, b0), ...corner(a1, b1), ...corner(a0, b1));
      // wound to face out (axis 1 has its two axes the other way round)
      const out = axis === 1 ? -dir : dir;
      if (out > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  return { vertices: new Float32Array(v), indices: new Uint32Array(idx) };
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
