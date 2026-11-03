import type { DamageType } from '../../core/combat/damage';
import type { Asset } from '../../core/schema';
import type { PoseParams } from '../character/routine';
import type { HeroState } from '../legacy/runtime-modules';
import { type Ball, GRAVITY, type PhysicsWorld, type WindField } from '../physics/physics';
import { boxOf } from './puzzles';

/**
 * Step 13a: things shot and thrown. The bow (plain, fire and ice arrows), the slingshot (seeds), the stun nut and the
 * boomerang (and the whirl boomerang, which carries a little whirlwind).
 *
 * Arrows, seeds and nuts are real bodies in the physics engine: small balls with continuous collision, falling with
 * gravity, slowed by air drag against the wind (so a fan's wind carries them off), floating in water by their density.
 * An arrow flies nose first (its feathers keep it so), so it is drawn along its speed. Each step its path ahead is
 * cast: what it would hit is hit. Struck squarely and fast enough it sticks in (and gives a loose thing its push);
 * struck at a slant or slowly it glances off and the engine bounces it. A plain arrow shot through a flame catches
 * fire; a fire arrow lights what burns, lights torch stands and melts ice; water puts it out. An ice arrow freezes
 * water where it goes in (a floe of ice to stand on, melting after a while), puts small flames out and freezes foes.
 *
 * The boomerang is flown by hand (a spinning wing does not fly as a ball does): out on a curve to its mark and back to
 * the hand, stunning what it hits, turning back at a wall, and carrying back a pickup it touches.
 */
export type ShotKind = 'arrow' | 'seed' | 'nut';
export type ArrowElement = 'plain' | 'fire' | 'ice';
export type Weapon = 'bow' | 'sling';

export type ShotObject = {
  inst: { id: string; pos: [number, number, number]; rot: number; idBase: number };
  def: Asset;
  bricks: { x: number; y: number; z: number; type: string; rot?: number }[];
  state: string;
};

export type ShotNpc = { id: number; x: number; y: number; z: number; bottom: number; top: number; radius: number };

export type Shot = {
  kind: ShotKind;
  el: ArrowElement;
  ball: Ball;
  t: number;
  /** its nose: the way it points (drawn along it) */
  dir: [number, number, number];
  /** it has hit something already (a glance): no more harm, it tumbles to rest */
  spent?: boolean;
  /** seconds it has lain still */
  still?: number;
  /** its flame (a fire arrow), moved with it */
  fx?: { stop(): void; move?(at: [number, number, number]): void } | null;
  /** foes hit (each once) */
  hit?: Set<number>;
};

/** an arrow stuck in something: where its tip went in and which way it points; on a loose thing, where on it */
export type Stuck = {
  el: ArrowElement;
  pos: [number, number, number];
  dir: [number, number, number];
  t: number;
  /** the object it is in (gone with it), and for a loose one its place in the thing's own frame */
  on?: { id: string; loose: boolean; local?: [number, number, number]; localDir?: [number, number, number] };
};

export type Boomer = {
  whirl: boolean;
  phase: 'out' | 'back';
  t: number;
  pos: [number, number, number];
  /** where it set out from, its mark, and the curve's bulge (left of the way out) */
  from: [number, number, number];
  to: [number, number, number];
  bulge: [number, number, number];
  /** how far along the way out (0..1) */
  u: number;
  vel: [number, number, number];
  spin: number;
  hit: Set<string>;
  /** a pickup it touched, carried back: its item, count and what it looked like */
  carried?: { item: string; count: number; name: string; pieces: readonly unknown[]; origin: [number, number, number] };
};

/** a floe of ice an ice arrow froze on water, and when it started (it melts) */
export type Floe = { id: string; t: number };

export type ShotsHost<T extends ShotObject = ShotObject> = {
  readonly heroState: HeroState;
  readonly clock: number;
  physics(): PhysicsWorld | null;
  /** where shots leave the hero (the bow's grip, at the chest), and the hand a boomerang comes back to */
  launchPoint(): [number, number, number];
  near(x: number, z: number, r: number): readonly T[];
  byId(id: string): T | undefined;
  npcs(): readonly ShotNpc[];
  /** a foe hit by a shot (its damage type and power; how far it is knocked and how long stunned) */
  hitNpc(
    id: number,
    type: DamageType,
    power: number,
    opt: { knock: number; stun: number; from: [number, number] },
  ): void;
  /** a switch it strikes is hit, a thing with health hurt (true: it did something) */
  hitObject(o: T, type: DamageType, power: number, at: [number, number, number]): boolean;
  /** fire at a point: burnables catch, torch stands light, ice melts, foes burn */
  flame(at: [number, number, number], r: number): void;
  /** a fire arrow passing: unlit torch stands whose flame is this near light */
  lightTorches(at: [number, number, number], r: number): void;
  /** a fire there (a lit torch, something burning): an arrow through it catches */
  fireNear(at: [number, number, number], r: number): boolean;
  /** an ice arrow: small flames near a point go out (true: one did) */
  putOut(at: [number, number, number], r: number): boolean;
  /** the water a point is in, and its surface */
  waterAt(x: number, y: number, z: number): { y1: number; x0: number; x1: number; z0: number; z1: number } | null;
  /** an ice floe frozen on the water there (its top a little over the surface); its id */
  freeze(at: [number, number, number]): string | null;
  /** a floe melts away (it has lasted) */
  thaw(id: string): void;
  /** a pickup the boomerang touched is taken off the map (null: it can't be) */
  fetch(o: T): Boomer['carried'] | null;
  /** what the boomerang carried back is the hero's */
  deliver(c: NonNullable<Boomer['carried']>): void;
  /** a gust for a moment (the whirl boomerang's whirlwind) */
  gust(field: WindField, life: number): void;
  /** a flame effect that follows a fire arrow */
  flames(
    at: [number, number, number],
    scale: number,
  ): { stop(): void; move?(at: [number, number, number]): void } | null;
  effect(
    kind: 'hit' | 'splash' | 'flash' | 'frost' | 'spark' | 'whirl',
    at: [number, number, number],
    forward?: [number, number, number],
  ): void;
  sound(
    id: 'twang' | 'thunk' | 'clack' | 'splash' | 'flash' | 'whoosh' | 'catch' | 'ignite' | 'freeze',
    at: [number, number, number],
  ): void;
  /** the fixed thing a point is in, without the physics engine */
  solidAt(x: number, y: number, z: number): boolean;
  /** what the hero locks on to now (its middle), if anything */
  lockPos(): [number, number, number] | null;
  /** things worth aiming at (foes, switches, targets; for a throw, pickups to fetch too): where they are */
  aimTargets(throwing?: boolean): readonly [number, number, number][];
  say(text: string, seconds?: number): void;
  log(text: string): void;
};

// ---------- numbers ----------
/** a full draw of the bow, and of the slingshot (seconds) */
export const DRAW_TIME = 0.75;
export const SLING_DRAW = 0.4;
/** how fast an arrow leaves the bow, barely drawn and fully drawn (studs a second) */
export const ARROW_MIN = 16;
export const ARROW_MAX = 50;
export const SEED_MIN = 16;
export const SEED_MAX = 34;
export const NUT_SPEED = 15;
/** sizes (studs), densities (water 1) and drag (a = k·|v|·v) */
const ARROW_R = 0.08;
const SEED_R = 0.12;
const NUT_R = 0.18;
export const ARROW_DRAG = 0.004;
const SEED_DRAG = 0.01;
const NUT_DRAG = 0.012;
/** an arrow sticks in what it strikes faster than this, and more squarely than this (the cosine of its slant) */
export const STICK_SPEED = 9;
export const STICK_SQUARE = 0.35;
/** how long a stuck arrow stays, and one lying on the floor */
const STUCK_LIFE = 20;
const LYING_LIFE = 4;
/** an arrow in flight is gone after this (it flew off the map) */
const FLIGHT_LIFE = 8;
/** how long a floe of ice lasts before it melts */
export const FLOE_LIFE = 25;
/** a nut's flash stuns foes this near for this long */
export const NUT_RADIUS = 4.5;
export const NUT_STUN = 3;
/** an ice arrow freezes a foe this long */
const FREEZE_STUN = 3;
/** the boomerang: its speed, how far it goes, how long it stuns, the most it flies, how near the hand it is caught */
export const BOOM_SPEED = 20;
export const BOOM_RANGE = 15;
const BOOM_STUN = 2.5;
const BOOM_LIFE = 4;
const BOOM_CATCH = 1.3;
/** aiming: how fast the keys turn the aim (radians a second), and how far up and down it goes */
const AIM_TURN = 1.2;
const AIM_TILT = 0.6;
const PITCH_MIN = -0.7;
const PITCH_MAX = 0.9;
/** aim help: things within this angle of where the hero faces and this near are aimed at by themselves */
const ASSIST_CONE = 0.35;
const ASSIST_RANGE = 45;
/** the throw of a boomerang, and the moment the arrow is let go (seconds, for the pose) */
const THROW_TIME = 0.4;
const LOOSE_TIME = 0.25;

const len3 = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
const norm3 = (v: readonly number[]): [number, number, number] => {
  const l = len3(v) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};

/** the way a launch at yaw (as the hero's heading: 0 is +z) and pitch (up) points */
export function aimDir(yaw: number, pitch: number): [number, number, number] {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/**
 * the path of something launched (gravity, and drag k against still air), a point every 1/60 s up to `time` seconds;
 * the same equations the physics engine runs
 */
export function flightPath(
  from: readonly number[],
  v0: readonly number[],
  k: number,
  time: number,
  dt = 1 / 60,
): [number, number, number][] {
  const out: [number, number, number][] = [[from[0]!, from[1]!, from[2]!]];
  let [x, y, z] = [from[0]!, from[1]!, from[2]!];
  let [vx, vy, vz] = [v0[0]!, v0[1]!, v0[2]!];
  for (let t = 0; t < time; t += dt) {
    const s = Math.hypot(vx, vy, vz);
    vx += -k * s * vx * dt;
    vy += (-GRAVITY - k * s * vy) * dt;
    vz += -k * s * vz * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    out.push([x, y, z]);
  }
  return out;
}

/**
 * the launch angle (radians up) that brings a shot at this speed and drag to a target: the low arc, found by trying
 * angles (bisection). Out of reach: the angle that goes furthest.
 */
export function pitchToHit(from: readonly number[], to: readonly number[], speed: number, k: number): number {
  const D = Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!);
  const dy = to[1]! - from[1]!;
  if (D < 0.5) return Math.atan2(dy, Math.max(D, 0.01));
  /** how high the shot is (against the target) when it has gone D across; null: it never gets there */
  const heightAt = (p: number): number | null => {
    let x = 0;
    let y = 0;
    let vx = speed * Math.cos(p);
    let vy = speed * Math.sin(p);
    const dt = 1 / 120;
    for (let t = 0; t < 6; t += dt) {
      const s = Math.hypot(vx, vy);
      vx += -k * s * vx * dt;
      vy += (-GRAVITY - k * s * vy) * dt;
      const nx = x + vx * dt;
      const ny = y + vy * dt;
      if (nx >= D) return y + ((ny - y) * (D - x)) / Math.max(1e-6, nx - x) - dy;
      if (ny < dy - 40) return null;
      x = nx;
      y = ny;
    }
    return null;
  };
  let lo = Math.max(PITCH_MIN, Math.atan2(dy, D) - 0.05);
  let hi = 0.78;
  const top = heightAt(hi);
  if (top === null || top < 0) return hi;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const h = heightAt(mid);
    if (h === null || h < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** a quaternion turning a vector (x, y, z, w) */
function rotate(q: { x: number; y: number; z: number; w: number }, v: readonly number[]): [number, number, number] {
  const { x, y, z, w } = q;
  const [vx, vy, vz] = [v[0]!, v[1]!, v[2]!];
  // t = 2 q×v; v' = v + w t + q×t
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
const conj = (q: { x: number; y: number; z: number; w: number }) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export class Shots<T extends ShotObject = ShotObject> {
  /** what is in the hand: the bow or the slingshot (null: neither) */
  out: Weapon | null = null;
  /** the arrows the bow shoots now */
  arrow: ArrowElement = 'plain';
  /** seconds the bow (or slingshot) has been drawn (null: not drawing) */
  draw: number | null = null;
  /** where the hero aims: yaw (as a heading) and pitch (up); the keys' turn added to the aim help's */
  aimYaw = 0;
  aimPitch = 0;
  private turnYaw = 0;
  private turnPitch = 0;
  /** what the aim follows by itself (a target in front, or what is locked on to), if anything */
  aimAt: [number, number, number] | null = null;
  /** where a shot let go now would fly, and where it would come down */
  arc: [number, number, number][] = [];
  landing: [number, number, number] | null = null;
  readonly flying: Shot[] = [];
  readonly stuck: Stuck[] = [];
  boomer: Boomer | null = null;
  readonly floes: Floe[] = [];
  /** a moment of a move for the pose: the arrow let go, the boomerang thrown, the nut thrown */
  private act: { kind: 'loose' | 'throw'; t: number } | null = null;
  private arcClock = 0;

  constructor(private readonly h: ShotsHost<T>) {}

  // ---------- the bow and the slingshot ----------

  /** drawing now (the hero stands and aims; the move keys turn and tilt the aim) */
  get aiming(): boolean {
    return this.draw !== null;
  }

  /** how far drawn (0..1) */
  get drawn(): number {
    if (this.draw === null) return 0;
    const full = this.out === 'sling' ? SLING_DRAW : DRAW_TIME;
    const u = Math.min(1, this.draw / full);
    // the first of a pull is quick, the last slow (the bow's weight grows as it bends)
    return 1 - (1 - u) * (1 - u);
  }

  /** how fast a shot let go now leaves */
  launchSpeed(): number {
    const d = this.drawn;
    return this.out === 'sling' ? SEED_MIN + (SEED_MAX - SEED_MIN) * d : ARROW_MIN + (ARROW_MAX - ARROW_MIN) * d;
  }

  private dragOf(kind: ShotKind) {
    return kind === 'arrow' ? ARROW_DRAG : kind === 'seed' ? SEED_DRAG : NUT_DRAG;
  }

  /** Attack held with the bow or slingshot out: the draw begins (aimed by itself at a target in front, if any) */
  startDraw() {
    if (!this.out || this.draw !== null) return;
    this.draw = 0;
    this.turnYaw = 0;
    this.turnPitch = 0;
    this.aimYaw = this.h.heroState.heading;
    this.aimPitch = 0;
    this.aimAt = this.pickTarget();
    this.aimNow();
  }

  /** the draw is let go of: the shot flies (a moment of drawing only lowers the bow) */
  release(ammo: () => boolean): boolean {
    if (this.draw === null) return false;
    const was = this.draw;
    this.aimNow();
    const speed = this.launchSpeed();
    this.draw = null;
    this.arc = [];
    this.landing = null;
    if (was < 0.08) return false;
    if (!ammo()) return false;
    const kind: ShotKind = this.out === 'sling' ? 'seed' : 'arrow';
    this.launch(kind, kind === 'arrow' ? this.arrow : 'plain', aimDir(this.aimYaw, this.aimPitch), speed);
    this.act = { kind: 'loose', t: 0 };
    this.h.sound('twang', this.h.launchPoint());
    this.h.log(
      `${kind === 'arrow' ? `${this.arrow === 'plain' ? 'An' : this.arrow === 'fire' ? 'A fire' : 'An ice'} arrow` : 'A seed'} shot (${speed.toFixed(0)} studs a second, ${((this.aimPitch * 180) / Math.PI).toFixed(0)}° up)`,
    );
    return true;
  }

  /** the draw is dropped without shooting (the bow put away, the hero hit) */
  cancel() {
    this.draw = null;
    this.arc = [];
    this.landing = null;
  }

  /** a shot sent off from the hero's launch point */
  launch(kind: ShotKind, el: ArrowElement, dir: [number, number, number], speed: number, from = this.h.launchPoint()) {
    const ball: Ball = {
      x: from[0],
      y: from[1],
      z: from[2],
      vx: dir[0] * speed,
      vy: dir[1] * speed,
      vz: dir[2] * speed,
    };
    const s: Shot = { kind, el, ball, t: 0, dir: [...dir] as [number, number, number] };
    const ph = this.h.physics();
    if (ph) {
      const r = kind === 'arrow' ? ARROW_R : kind === 'seed' ? SEED_R : NUT_R;
      ph.addShot(ball, r, {
        density: kind === 'arrow' ? 0.6 : kind === 'seed' ? 1.2 : 0.8,
        drag: this.dragOf(kind),
        bounce: kind === 'seed' ? 0.45 : kind === 'nut' ? 0.3 : 0.2,
      });
    }
    if (el === 'fire') s.fx = this.h.flames(from, 0.35);
    this.flying.push(s);
    return s;
  }

  /** a stun nut thrown (in an arc, a little up from where the hero aims) */
  throwNut() {
    const h = this.h.heroState;
    const target = this.pickTarget();
    const from = this.h.launchPoint();
    let pitch = 0.3;
    let yaw = h.heading;
    if (target) {
      yaw = Math.atan2(target[0] - from[0], target[2] - from[2]);
      pitch = pitchToHit(from, target, NUT_SPEED, NUT_DRAG);
      h.heading = yaw;
    }
    this.launch('nut', 'plain', aimDir(yaw, pitch), NUT_SPEED);
    this.act = { kind: 'throw', t: 0 };
    this.h.sound('whoosh', from);
    this.h.log('A stun nut thrown');
  }

  /** the best thing to aim at: what is locked on to, else the target nearest the middle in front of the hero */
  private pickTarget(throwing = false): [number, number, number] | null {
    const lock = this.h.lockPos();
    if (lock) return lock;
    const h = this.h.heroState;
    const from = this.h.launchPoint();
    let best: { p: [number, number, number]; score: number } | null = null;
    for (const p of this.h.aimTargets(throwing)) {
      const d = Math.hypot(p[0] - h.x, p[2] - h.z);
      if (d > ASSIST_RANGE || d < 1) continue;
      const a = Math.atan2(p[0] - h.x, p[2] - h.z) - h.heading;
      const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (off > ASSIST_CONE) continue;
      // nothing in the way of the shot that would hit it (its arc for an arrow or a seed, a straight look for a throw)
      if (!this.clearTo(from, p, throwing)) continue;
      const score = off * 20 + d * 0.05;
      if (!best || score < best.score) best = { p, score };
    }
    return best?.p ?? null;
  }

  /** nothing solid in the way of a shot at a point (up to a little short of it: the thing itself) */
  private clearTo(from: readonly number[], to: readonly number[], straight: boolean): boolean {
    const ph = this.h.physics();
    if (!ph) return true;
    const d = Math.hypot(to[0]! - from[0]!, to[1]! - from[1]!, to[2]! - from[2]!);
    const f: [number, number, number] = [from[0]!, from[1]!, from[2]!];
    if (straight) {
      const hit = ph.castSegment(f, [to[0]!, to[1]!, to[2]!]);
      return !hit || hit.t >= d - 1.6;
    }
    const kind: ShotKind = this.out === 'sling' ? 'seed' : 'arrow';
    const speed = kind === 'seed' ? SEED_MAX : ARROW_MAX;
    const k = this.dragOf(kind);
    const yaw = Math.atan2(to[0]! - from[0]!, to[2]! - from[2]!);
    const v = aimDir(yaw, pitchToHit(from, to, speed, k)).map((c) => c * speed);
    const pts = flightPath(from, v, k, 3);
    const D = Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!);
    for (let i = 0; i + 4 < pts.length; i += 4) {
      const a = pts[i]!;
      const b = pts[i + 4]!;
      if (Math.hypot(b[0] - from[0]!, b[2] - from[2]!) > D - 1.2) return true;
      if (ph.castSegment(a, b)) return false;
    }
    return true;
  }

  /** the aim now: towards what the aim follows (the arc that hits it), plus the keys' turn and tilt */
  private aimNow() {
    // what is locked on to moves: the aim follows it
    const lock = this.aimAt ? this.h.lockPos() : null;
    if (lock) this.aimAt = lock;
    const t = this.aimAt;
    if (!t) return;
    const from = this.h.launchPoint();
    const yaw = Math.atan2(t[0] - from[0], t[2] - from[2]);
    const pitch = pitchToHit(from, t, this.launchSpeed(), this.dragOf(this.out === 'sling' ? 'seed' : 'arrow'));
    this.aimYaw = yaw + this.turnYaw;
    this.aimPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + this.turnPitch));
  }

  /**
   * while drawing: the move keys turn the aim (left, right) and tilt it (forward up, back down). Following a target,
   * they nudge the aim off it; turned well away, the aim lets go of it.
   */
  steer(x: number, z: number, dt: number) {
    if (this.draw === null || (!x && !z)) return;
    if (this.aimAt) {
      this.turnYaw -= x * AIM_TURN * dt;
      this.turnPitch += z * AIM_TILT * dt;
      if (Math.abs(this.turnYaw) > 0.5) this.aimAt = null;
      return;
    }
    this.aimYaw -= x * AIM_TURN * dt;
    this.aimPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.aimPitch + z * AIM_TILT * dt));
  }

  // ---------- the boomerang ----------

  /** the boomerang thrown at its mark: what is locked on to, a target in front, or as far as it goes ahead */
  throwBoomerang(whirl: boolean): boolean {
    if (this.boomer) return false;
    const h = this.h.heroState;
    const from = this.h.launchPoint();
    let to = this.pickTarget(true);
    if (!to) {
      const f = [Math.sin(h.heading), 0, Math.cos(h.heading)];
      to = [from[0] + f[0]! * BOOM_RANGE, from[1], from[2] + f[2]! * BOOM_RANGE];
    } else h.heading = Math.atan2(to[0] - from[0], to[2] - from[2]);
    const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (d > BOOM_RANGE) {
      const k = BOOM_RANGE / d;
      to = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
    }
    const dir = norm3([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
    // a right-handed throw curves to the left on its way out
    const left: [number, number, number] = norm3([dir[2], 0, -dir[0]]);
    const span = Math.min(d, BOOM_RANGE);
    this.boomer = {
      whirl,
      phase: 'out',
      t: 0,
      pos: [...from] as [number, number, number],
      from: [...from] as [number, number, number],
      to,
      bulge: [left[0] * span * 0.18, 0, left[2] * span * 0.18],
      u: 0,
      vel: [dir[0] * BOOM_SPEED, dir[1] * BOOM_SPEED, dir[2] * BOOM_SPEED],
      spin: 0,
      hit: new Set(),
    };
    this.act = { kind: 'throw', t: 0 };
    this.h.sound('whoosh', from);
    this.h.log(`${whirl ? 'The whirl boomerang' : 'The boomerang'} thrown (${span.toFixed(1)} studs out)`);
    return true;
  }

  private stepBoomer(dt: number) {
    const b = this.boomer;
    if (!b) return;
    b.t += dt;
    b.spin += dt * 24;
    const was: [number, number, number] = [...b.pos] as [number, number, number];
    if (b.phase === 'out') {
      // along a curve (a quadratic: from, to, and a bulge to the left between), at its speed
      const span = Math.max(1, len3([b.to[0] - b.from[0], b.to[1] - b.from[1], b.to[2] - b.from[2]]) * 1.1);
      b.u = Math.min(1, b.u + (BOOM_SPEED * dt) / span);
      const u = b.u;
      const mid = [
        (b.from[0] + b.to[0]) / 2 + b.bulge[0],
        (b.from[1] + b.to[1]) / 2,
        (b.from[2] + b.to[2]) / 2 + b.bulge[2],
      ];
      for (let i = 0; i < 3; i++)
        b.pos[i] = (1 - u) * (1 - u) * b.from[i]! + 2 * (1 - u) * u * mid[i]! + u * u * b.to[i]!;
      if (u >= 1) b.phase = 'back';
    } else {
      // homing on the hand: its way turns towards it (as a wing banks round), its speed kept
      const hand = this.h.launchPoint();
      const want = norm3([hand[0] - b.pos[0], hand[1] - b.pos[1], hand[2] - b.pos[2]]);
      const v = norm3(b.vel);
      const k = Math.min(1, dt * 7);
      const nv = norm3([v[0] + (want[0] - v[0]) * k, v[1] + (want[1] - v[1]) * k, v[2] + (want[2] - v[2]) * k]);
      const sp = BOOM_SPEED * 1.05;
      b.vel = [nv[0] * sp, nv[1] * sp, nv[2] * sp];
      for (let i = 0; i < 3; i++) b.pos[i]! += b.vel[i]! * dt;
      if (Math.hypot(hand[0] - b.pos[0], hand[1] - b.pos[1], hand[2] - b.pos[2]) <= BOOM_CATCH || b.t > BOOM_LIFE) {
        this.catchBoomer();
        return;
      }
    }
    if (b.phase === 'out') b.vel = [(b.pos[0] - was[0]) / dt, (b.pos[1] - was[1]) / dt, (b.pos[2] - was[2]) / dt];
    // what it meets on the way: a wall turns it back; foes are stunned; switches are hit; a pickup is carried
    const ph = this.h.physics();
    const wall = ph?.castSegment(was, b.pos, { pad: 0.25 });
    if (wall) {
      const o = this.thingAt(wall.point, wall.normal, wall.object);
      if (o && !b.hit.has(o.inst.id)) {
        b.hit.add(o.inst.id);
        this.h.hitObject(o, 'blunt', 1, wall.point);
      }
      if (b.phase === 'out') {
        b.phase = 'back';
        b.pos = [
          wall.point[0] + wall.normal[0] * 0.3,
          wall.point[1] + wall.normal[1] * 0.3,
          wall.point[2] + wall.normal[2] * 0.3,
        ];
        this.h.effect('spark', wall.point);
        this.h.sound('clack', wall.point);
        this.h.log(`The boomerang bounced off ${o ? o.def.name : 'a wall'}`);
      }
    } else if (!ph && this.h.solidAt(b.pos[0], b.pos[1], b.pos[2]) && b.phase === 'out') b.phase = 'back';
    for (const n of this.h.npcs()) {
      const key = `npc:${n.id}`;
      if (b.hit.has(key)) continue;
      if (segToNpc(was, b.pos, n) > n.radius + 0.5) continue;
      b.hit.add(key);
      this.h.hitNpc(n.id, 'stun', 0, { knock: 1.5, stun: BOOM_STUN, from: [was[0], was[2]] });
      this.h.effect('hit', b.pos);
      if (b.phase === 'out') b.phase = 'back';
    }
    for (const o of this.h.near(b.pos[0], b.pos[2], 4)) {
      if (b.hit.has(o.inst.id)) continue;
      const q = boxOf(o.bricks as never);
      if (!q) continue;
      const inside = (g: number) =>
        b.pos[0] > q.x0 - g &&
        b.pos[0] < q.x1 + g &&
        b.pos[2] > q.z0 - g &&
        b.pos[2] < q.z1 + g &&
        b.pos[1] > q.y0 * 0.4 - g &&
        b.pos[1] < q.y1 * 0.4 + g;
      const reach = (g: number) =>
        b.pos[0] > q.x0 - g &&
        b.pos[0] < q.x1 + g &&
        b.pos[2] > q.z0 - g &&
        b.pos[2] < q.z1 + g &&
        b.pos[1] > q.y0 * 0.4 - 0.5 &&
        b.pos[1] < q.y1 * 0.4 + 1.8;
      if (o.def.pickup && !b.carried && reach(0.9)) {
        const c = this.h.fetch(o);
        if (c) {
          b.carried = c;
          b.hit.add(o.inst.id);
          if (b.phase === 'out') b.phase = 'back';
          this.h.log(`The boomerang caught ${c.name}`);
        }
      } else if (o.def.switch?.by === 'hit' && inside(0.4)) {
        b.hit.add(o.inst.id);
        this.h.hitObject(o, 'blunt', 1, b.pos);
      }
    }
    // the whirl boomerang carries a little whirlwind along its way
    const hs = this.h.heroState;
    if (b.whirl && Math.hypot(b.pos[0] - hs.x, b.pos[2] - hs.z) > 3) {
      const v = norm3([b.vel[0], 0, b.vel[2]]);
      this.h.gust(
        {
          from: [b.pos[0] - v[0] * 1.2, b.pos[1] - 1.4, b.pos[2] - v[2] * 1.2],
          dir: [v[0], v[2]],
          reach: 2.6,
          half: 1.3,
          height: 2.8,
          speed: 16,
        },
        0.12,
      );
      if (Math.floor(b.t * 8) !== Math.floor((b.t - dt) * 8)) this.h.effect('whirl', b.pos, [v[0], 0, v[2]]);
    }
  }

  private catchBoomer() {
    const b = this.boomer;
    if (!b) return;
    this.boomer = null;
    this.h.sound('catch', this.h.launchPoint());
    if (b.carried) this.h.deliver(b.carried);
    this.h.log(
      `${b.whirl ? 'The whirl boomerang' : 'The boomerang'} caught${b.carried ? ` with ${b.carried.name}` : ''}`,
    );
  }

  // ---------- each step ----------

  step(dt: number) {
    if (this.draw !== null) {
      this.draw += dt;
      this.aimNow();
      this.arcClock -= dt;
      if (this.arcClock <= 0) {
        this.arcClock = 0.05;
        this.traceArc();
      }
    }
    if (this.act) {
      this.act.t += dt;
      if (this.act.t > (this.act.kind === 'throw' ? THROW_TIME : LOOSE_TIME)) this.act = null;
    }
    for (const s of [...this.flying]) this.stepShot(s, dt);
    for (const st of [...this.stuck]) {
      st.t += dt;
      const on = st.on;
      if (on) {
        const o = this.h.byId(on.id);
        if (!o) {
          this.unstick(st);
          continue;
        }
        if (on.loose && on.local) {
          const pose = this.h.physics()?.objectPose(on.id);
          if (pose) {
            const p = rotate(pose.rot, on.local);
            st.pos = [pose.pos[0] + p[0], pose.pos[1] + p[1], pose.pos[2] + p[2]];
            st.dir = rotate(pose.rot, on.localDir ?? st.dir);
          }
        }
      }
      if (st.t > STUCK_LIFE) this.unstick(st);
    }
    this.stepBoomer(dt);
    for (const f of [...this.floes]) {
      f.t += dt;
      if (f.t >= FLOE_LIFE) {
        this.floes.splice(this.floes.indexOf(f), 1);
        this.h.thaw(f.id);
      }
    }
  }

  private unstick(st: Stuck) {
    const i = this.stuck.indexOf(st);
    if (i >= 0) this.stuck.splice(i, 1);
  }

  private remove(s: Shot) {
    const i = this.flying.indexOf(s);
    if (i >= 0) this.flying.splice(i, 1);
    s.fx?.stop();
    this.h.physics()?.removeShot(s.ball);
  }

  /** the object a hit point is on (just inside the surface it struck), or a loose thing by its key */
  private thingAt(p: readonly number[], n: readonly number[], key: string | null): T | null {
    if (key) return this.h.byId(key) ?? null;
    const q = [p[0]! - n[0]! * 0.06, p[1]! - n[1]! * 0.06, p[2]! - n[2]! * 0.06];
    let best: T | null = null;
    let bestD = Infinity;
    for (const o of this.h.near(q[0]!, q[2]!, 6)) {
      const b = boxOf(o.bricks as never);
      if (!b) continue;
      const dx = Math.max(b.x0 - q[0]!, 0, q[0]! - b.x1);
      const dz = Math.max(b.z0 - q[2]!, 0, q[2]! - b.z1);
      const dy = Math.max(b.y0 * 0.4 - q[1]!, 0, q[1]! - b.y1 * 0.4);
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.12 && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  private stepShot(s: Shot, dt: number) {
    s.t += dt;
    const ph = this.h.physics();
    const b = s.ball;
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    if (!ph) {
      // no physics engine: the same equations by hand, and the bricks a point at a time
      const k = this.dragOf(s.kind);
      b.vx += -k * speed * b.vx * dt;
      b.vy += (-GRAVITY - k * speed * b.vy) * dt;
      b.vz += -k * speed * b.vz * dt;
    }
    if (speed > 1.5) s.dir = norm3([b.vx, b.vy, b.vz]);
    s.fx?.move?.([b.x, b.y, b.z]);
    if (s.t > FLIGHT_LIFE || b.y < -20) return this.remove(s);
    // a spent shot (it glanced off something) tumbles to rest and is gone a moment later
    if (s.spent) {
      s.still = speed < 0.6 ? (s.still ?? 0) + dt : 0;
      if ((s.still ?? 0) > LYING_LIFE || s.t > LYING_LIFE + 3) this.remove(s);
      return;
    }
    const from: [number, number, number] = [b.x, b.y, b.z];
    const to: [number, number, number] = [b.x + b.vx * dt, b.y + b.vy * dt, b.z + b.vz * dt];
    // along its way this step (its tip): a plain arrow through a flame catches fire; a fire arrow through an unlit
    // torch stand's flame lights it
    if (s.kind === 'arrow' && s.el !== 'ice')
      for (let i = 0; i <= 3; i++) {
        const k = i / 3;
        const p: [number, number, number] = [
          from[0] + (to[0] - from[0]) * k + s.dir[0] * 0.8,
          from[1] + (to[1] - from[1]) * k + s.dir[1] * 0.8,
          from[2] + (to[2] - from[2]) * k + s.dir[2] * 0.8,
        ];
        if (s.el === 'plain' && this.h.fireNear(p, 0.8)) {
          s.el = 'fire';
          s.fx = this.h.flames(p, 0.35);
          this.h.sound('ignite', p);
          this.h.log('The arrow caught fire');
        } else if (s.el === 'fire') this.h.lightTorches(p, 0.9);
      }
    // water first: where its path goes in under the surface
    const wet = this.h.waterAt(to[0], to[1], to[2]);
    if (wet && !this.h.waterAt(from[0], from[1] + 0.02, from[2])) {
      // in through the surface from above, or through the side of the water (shot from lower than its surface)
      const k = from[1] > wet.y1 ? Math.min(1, (from[1] - wet.y1) / Math.max(1e-6, from[1] - to[1])) : 1;
      const at: [number, number, number] = [from[0] + (to[0] - from[0]) * k, wet.y1, from[2] + (to[2] - from[2]) * k];
      if (this.intoWater(s, at)) return;
    }
    // what it would hit this step: a foe (its body), or a solid thing
    let foe: { n: ShotNpc; t: number } | null = null;
    for (const n of this.h.npcs()) {
      if (s.hit?.has(n.id)) continue;
      const d = segToNpc(from, to, n);
      if (d > n.radius + (s.kind === 'arrow' ? 0.1 : 0.2)) continue;
      const t = Math.hypot(n.x - from[0], n.z - from[2]);
      if (!foe || t < foe.t) foe = { n, t };
    }
    const hit = ph
      ? ph.castSegment(from, to, { pad: s.kind === 'arrow' ? 0.9 : s.kind === 'seed' ? SEED_R : NUT_R })
      : this.h.solidAt(to[0], to[1], to[2])
        ? { point: from, normal: norm3([-b.vx, -b.vy, -b.vz]), t: 0, object: null, fixed: true }
        : null;
    if (foe && (!hit || foe.t <= hit.t + 0.3)) return this.hitFoe(s, foe.n, speed);
    if (hit) return this.hitSolid(s, hit, speed);
    if (!ph) {
      b.x = to[0];
      b.y = to[1];
      b.z = to[2];
    }
  }

  /** a shot goes into water: an ice arrow freezes it, a fire arrow goes out; it floats on (true: it is gone) */
  private intoWater(s: Shot, at: [number, number, number]): boolean {
    this.h.effect('splash', at);
    this.h.sound('splash', at);
    if (s.kind === 'nut') {
      this.flash(s, at);
      return true;
    }
    if (s.kind === 'arrow' && s.el === 'ice') {
      const id = this.h.freeze(at);
      this.h.effect('frost', at);
      this.h.sound('freeze', at);
      this.remove(s);
      if (id) {
        this.floes.push({ id, t: 0 });
        this.h.log('The ice arrow froze the water: a floe of ice');
      }
      return true;
    }
    if (s.el === 'fire') {
      s.el = 'plain';
      s.fx?.stop();
      s.fx = null;
      this.h.log('The water put the fire arrow out');
    }
    s.spent = true;
    return false;
  }

  private hitFoe(s: Shot, n: ShotNpc, speed: number) {
    const b = s.ball;
    const at: [number, number, number] = [b.x, b.y, b.z];
    s.hit ??= new Set();
    s.hit.add(n.id);
    const from: [number, number] = [b.x - b.vx, b.z - b.vz];
    if (s.kind === 'nut') return this.flash(s, at);
    if (s.kind === 'seed') {
      this.h.hitNpc(n.id, 'blunt', 0.5, { knock: 1, stun: 0.6, from });
    } else {
      const power = 1 + speed / ARROW_MAX;
      this.h.hitNpc(n.id, 'pierce', power, { knock: 1.5 + speed * 0.04, stun: 0.3, from });
      if (s.el === 'fire') this.h.hitNpc(n.id, 'fire', 1, { knock: 0, stun: 0.3, from });
      if (s.el === 'ice') {
        this.h.hitNpc(n.id, 'ice', 1, { knock: 0, stun: FREEZE_STUN, from });
        this.h.effect('frost', at);
      }
    }
    this.h.effect('hit', at, s.dir);
    this.h.sound('thunk', at);
    this.remove(s);
  }

  private hitSolid(
    s: Shot,
    hit: { point: [number, number, number]; normal: [number, number, number]; object: string | null; fixed: boolean },
    speed: number,
  ) {
    const b = s.ball;
    const o = this.thingAt(hit.point, hit.normal, hit.object);
    const v = norm3([b.vx, b.vy, b.vz]);
    const square = -(v[0] * hit.normal[0] + v[1] * hit.normal[1] + v[2] * hit.normal[2]);
    if (s.kind === 'nut') return this.flash(s, hit.point);
    // what it strikes takes the hit: a switch turns, a thing with health is hurt
    const type: DamageType = s.kind === 'seed' ? 'blunt' : 'pierce';
    if (o) this.h.hitObject(o, type, s.kind === 'seed' ? 0.5 : 1 + speed / ARROW_MAX, hit.point);
    // its element: fire lights and burns, ice puts small flames out
    if (s.el === 'fire') this.h.flame(hit.point, 1.1);
    if (s.el === 'ice') {
      this.h.putOut(hit.point, 1.4);
      this.h.effect('frost', hit.point);
    }
    const ph = this.h.physics();
    const sticks = s.kind === 'arrow' && speed >= STICK_SPEED && square >= STICK_SQUARE;
    if (sticks) {
      // it goes in a little, nose first, and gives what it struck its push (a loose crate rocks)
      const tip: [number, number, number] = [
        hit.point[0] + v[0] * 0.25,
        hit.point[1] + v[1] * 0.25,
        hit.point[2] + v[2] * 0.25,
      ];
      const st: Stuck = { el: s.el === 'ice' ? 'ice' : 'plain', pos: tip, dir: v, t: 0 };
      if (hit.object && ph) {
        const m = ph.shotMass(b);
        ph.pushObject(hit.object, [b.vx * m, b.vy * m, b.vz * m], hit.point);
        const pose = ph.objectPose(hit.object);
        if (pose) {
          const inv = conj(pose.rot);
          st.on = {
            id: hit.object,
            loose: true,
            local: rotate(inv, [tip[0] - pose.pos[0], tip[1] - pose.pos[1], tip[2] - pose.pos[2]]),
            localDir: rotate(inv, v),
          };
        }
      } else if (o) st.on = { id: o.inst.id, loose: false };
      this.stuck.push(st);
      while (this.stuck.length > 40) this.stuck.shift();
      this.h.effect('hit', hit.point, v);
      this.h.sound('thunk', hit.point);
      this.h.log(`The arrow stuck in ${o ? o.def.name : 'the wall'} (${speed.toFixed(0)} studs a second)`);
      this.remove(s);
      return;
    }
    // a seed breaks on what it hits; an arrow at a slant (or slow) glances off and the engine bounces it
    this.h.effect(s.kind === 'seed' ? 'hit' : 'spark', hit.point, v);
    this.h.sound('clack', hit.point);
    if (s.kind === 'seed' || !ph) return this.remove(s);
    if (s.el === 'fire') {
      s.fx?.stop();
      s.fx = null;
    }
    s.spent = true;
    this.h.log(`The arrow glanced off ${o ? o.def.name : 'the wall'}`);
  }

  /** a stun nut bursts: a flash that stuns every foe near it that can see it */
  private flash(s: Shot, at: [number, number, number]) {
    this.h.effect('flash', at);
    this.h.sound('flash', at);
    let n = 0;
    const ph = this.h.physics();
    for (const f of this.h.npcs()) {
      const mid: [number, number, number] = [f.x, f.y + (f.bottom + f.top) / 2, f.z];
      if (Math.hypot(mid[0] - at[0], mid[1] - at[1], mid[2] - at[2]) > NUT_RADIUS) continue;
      const wall = ph?.castSegment(at, mid);
      if (wall && wall.t < Math.hypot(mid[0] - at[0], mid[1] - at[1], mid[2] - at[2]) - f.radius - 0.2) continue;
      this.h.hitNpc(f.id, 'stun', 0, { knock: 0, stun: NUT_STUN, from: [at[0], at[2]] });
      n++;
    }
    this.h.log(`The stun nut flashed${n ? ` (${n} stunned)` : ''}`);
    this.remove(s);
  }

  /** where a shot let go now would fly: the arc, up to the first thing it hits (or the water) */
  private traceArc() {
    const from = this.h.launchPoint();
    const kind: ShotKind = this.out === 'sling' ? 'seed' : 'arrow';
    const v = aimDir(this.aimYaw, this.aimPitch).map((c) => c * this.launchSpeed());
    const pts = flightPath(from, v, this.dragOf(kind), 2.5);
    const ph = this.h.physics();
    this.arc = [];
    this.landing = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      this.arc.push(a);
      const wet = this.h.waterAt(b[0], b[1], b[2]);
      if (wet) {
        this.landing = [b[0], wet.y1, b[2]];
        return;
      }
      if (i % 3 !== 0) continue;
      const end = pts[Math.min(pts.length - 1, i + 3)]!;
      const hit = ph ? ph.castSegment(a, end) : this.h.solidAt(end[0], end[1], end[2]) ? { point: end } : null;
      if (hit) {
        this.landing = hit.point;
        return;
      }
    }
  }

  // ---------- the pose ----------

  /**
   * the hero's arms as it draws and shoots (the bow or slingshot up in the left hand at the aim's height, the right
   * hand drawing back to the chin as far as it is drawn), throws a boomerang or a nut (a side-arm throw); null: none
   */
  pose(): PoseParams | null {
    const tilt = Math.max(-0.6, Math.min(0.8, this.aimPitch));
    if (this.draw !== null || this.act?.kind === 'loose') {
      // side-on, as an archer stands: the body turned so its left side faces the aim, the left arm out at the aim
      // (higher to shoot up), the right hand drawing the string back across the chest to the chin; let go, the
      // string springs forward and the right hand opens out back a little
      const d = this.draw !== null ? this.drawn : 0;
      const after = this.act?.kind === 'loose' ? 1 - this.act.t / LOOSE_TIME : 0;
      return {
        turn: 1.35,
        la: [0, 0, -1.6 - tilt],
        le: 0,
        ra: [-1.5 - tilt * 0.8, -1.05 - 0.3 * (1 - d) + 0.25 * after, 0],
        re: -0.15 - 0.25 * after,
        stance: 0.55,
        lean: -0.04,
        ll: [-0.05, 0, -0.08],
        rl: [0.05, 0, 0.08],
        lk: 0.08,
        rk: 0.08,
      };
    }
    if (this.act?.kind === 'throw') {
      const u = this.act.t / THROW_TIME;
      // a side-arm throw: back, across and out ahead, letting go at a third of the way
      const swing = u < 0.3 ? -u / 0.3 : -1 + (u - 0.3) / 0.7;
      const x = 0.9 + swing * 2.6;
      return {
        ra: [Math.max(-1.7, Math.min(0.9, x)), 0, 0.9 - 0.4 * u],
        re: -0.6 + 0.4 * u,
        la: [-0.2, 0, -0.25],
        le: -0.4,
        roll: 0.1 - 0.2 * u,
        hipTurn: 0.25 - 0.5 * u,
        lean: 0.1,
      };
    }
    return null;
  }

  /** a new play: nothing in the air, nothing stuck, no floes, nothing drawn */
  reset() {
    const ph = this.h.physics();
    for (const s of this.flying) {
      s.fx?.stop();
      ph?.removeShot(s.ball);
    }
    this.flying.splice(0);
    this.stuck.splice(0);
    this.floes.splice(0);
    this.boomer = null;
    this.draw = null;
    this.act = null;
    this.arc = [];
    this.landing = null;
    this.out = null;
  }
}

/** how near a straight run passes a character's body (an upright capsule round its middle line) */
export function segToNpc(a: readonly number[], b: readonly number[], n: ShotNpc): number {
  const y0 = n.y + n.bottom + n.radius * 0.5;
  const y1 = n.y + n.top - n.radius * 0.5;
  // the nearest points of the run and the body's middle line, by a few tries along the run
  let best = Infinity;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = a[0]! + (b[0]! - a[0]!) * t;
    const y = a[1]! + (b[1]! - a[1]!) * t;
    const z = a[2]! + (b[2]! - a[2]!) * t;
    const cy = Math.max(y0, Math.min(y1, y));
    best = Math.min(best, Math.hypot(x - n.x, y - cy, z - n.z));
  }
  return best;
}
