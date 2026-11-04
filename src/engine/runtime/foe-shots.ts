/**
 * Step 14a: what enemies shoot. A Pebblespout's rock and a Finspitter's fireball fly as balls in the physics engine
 * (gravity and drag; the arc is aimed to land on the hero). Each step the shot looks ahead along its path: the hero
 * is hit (through the guard: a shield held toward it blocks it) and a rock blocked by a shield bounces straight back
 * at whoever spat it, faster, and stuns or fells what it hits (Ocarina's Deku Scrubs). A fireball is not bounced: it
 * bursts on the shield, and sets alight what burns where it lands. Walls stop both (a rock breaks into dust).
 */
import type { DamageType } from '../../core/combat/damage';
import { type Ball, GRAVITY, type PhysicsWorld } from '../physics/physics';

export type FoeShotKind = 'rock' | 'fireball';
export type FoeShot = {
  kind: FoeShotKind;
  ball: Ball;
  /** the enemy that shot it (a bounced shot goes back at it) */
  owner: number;
  power: number;
  type: DamageType;
  t: number;
  /** bounced back off the hero's shield: now it hits enemies, not the hero */
  back: boolean;
  fx?: { stop(): void; move?(at: [number, number, number]): void } | null;
};

/** studs a second a rock and a fireball leave the mouth at */
export const SHOT_SPEED: Record<FoeShotKind, number> = { rock: 13, fireball: 15 };
const RADIUS: Record<FoeShotKind, number> = { rock: 0.22, fireball: 0.28 };
const DENSITY: Record<FoeShotKind, number> = { rock: 2.6, fireball: 0.6 };
/** quadratic drag k (a = k·v²): a fireball slows a little more */
const DRAG: Record<FoeShotKind, number> = { rock: 0.004, fireball: 0.01 };
const LIFE = 4;
/** a bounced rock comes back this much faster than it came */
const BACK_SPEED = 1.15;

type Who = { id: number; x: number; y: number; z: number; bottom: number; top: number; radius: number };

export type FoeShotHost = {
  readonly heroState: { x: number; y: number; z: number; heading: number };
  physics(): PhysicsWorld | null;
  /** v68's collision, when there is no physics engine */
  clear(x: number, y: number, z: number): boolean;
  /** the hero's body: its radius and height (studs) */
  heroSize(): { radius: number; height: number };
  /** the hero is struck: what the guard made of it (from: where the shot came from, across and deep) */
  hitHero(
    owner: number,
    power: number,
    type: DamageType,
    from: [number, number],
  ): 'hit' | 'block' | 'parry' | 'dodge' | 'break';
  enemies(): Who[];
  /** a bounced shot strikes an enemy */
  hitEnemy(id: number, power: number, type: DamageType, stun: number): void;
  /** what burns near a point catches (a fireball's landing) */
  flame(at: [number, number, number], r: number): void;
  effect(kind: 'dust' | 'fire' | 'sparks' | 'smoke', at: [number, number, number]): void;
  /** a fireball's flame that goes with it */
  trail(at: [number, number, number]): { stop(): void; move?(at: [number, number, number]): void } | null;
  sound(id: 'clack' | 'thud' | 'fizzle' | 'whoosh' | 'flash', at: [number, number, number]): void;
  log(text: string): void;
};

/**
 * The launch speed that lands a shot from `from` on `to`, at a given speed (the low arc); straight at it when it
 * is out of reach at that speed.
 */
export function aimAt(from: readonly number[], to: readonly number[], speed: number): [number, number, number] {
  const dx = to[0]! - from[0]!;
  const dz = to[2]! - from[2]!;
  const dy = to[1]! - from[1]!;
  const d = Math.hypot(dx, dz) || 0.001;
  const v2 = speed * speed;
  const g = GRAVITY;
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  const pitch = disc >= 0 ? Math.atan2(v2 - Math.sqrt(disc), g * d) : Math.PI / 4;
  const c = Math.cos(pitch);
  return [(dx / d) * speed * c, speed * Math.sin(pitch), (dz / d) * speed * c];
}

/** where a segment first comes within r of an upright cylinder (0…1 along it), or null */
export function segHitsCylinder(
  a: readonly number[],
  b: readonly number[],
  c: { x: number; z: number; r: number; y0: number; y1: number },
): number | null {
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const x = a[0]! + (b[0]! - a[0]!) * k;
    const y = a[1]! + (b[1]! - a[1]!) * k;
    const z = a[2]! + (b[2]! - a[2]!) * k;
    if (y < c.y0 || y > c.y1) continue;
    if (Math.hypot(x - c.x, z - c.z) <= c.r) return k;
  }
  return null;
}

export class FoeShots {
  readonly flying: FoeShot[] = [];

  constructor(private h: FoeShotHost) {}

  /** a shot leaves `from` aimed at a point (the low arc that lands on it) */
  fire(
    kind: FoeShotKind,
    owner: number,
    from: [number, number, number],
    at: readonly number[],
    power: number,
    type: DamageType,
  ) {
    const v = aimAt(from, at, SHOT_SPEED[kind]);
    const ball: Ball = { x: from[0], y: from[1], z: from[2], vx: v[0], vy: v[1], vz: v[2] };
    const s: FoeShot = { kind, ball, owner, power, type, t: 0, back: false, fx: null };
    this.h.physics()?.addShot(ball, RADIUS[kind], { density: DENSITY[kind], drag: DRAG[kind] });
    if (kind === 'fireball') s.fx = this.h.trail(from);
    this.flying.push(s);
    this.h.sound(kind === 'rock' ? 'whoosh' : 'whoosh', from);
    return s;
  }

  step(dt: number) {
    for (const s of [...this.flying]) this.stepShot(s, dt);
  }

  reset() {
    for (const s of [...this.flying]) this.remove(s);
  }

  private remove(s: FoeShot) {
    const i = this.flying.indexOf(s);
    if (i >= 0) this.flying.splice(i, 1);
    s.fx?.stop();
    this.h.physics()?.removeShot(s.ball);
  }

  private stepShot(s: FoeShot, dt: number) {
    s.t += dt;
    const ph = this.h.physics();
    const b = s.ball;
    if (!ph) {
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      const k = DRAG[s.kind];
      b.vx += -k * sp * b.vx * dt;
      b.vy += (-GRAVITY - k * sp * b.vy) * dt;
      b.vz += -k * sp * b.vz * dt;
    }
    s.fx?.move?.([b.x, b.y, b.z]);
    if (s.t > LIFE || b.y < -20) return this.remove(s);
    const from: [number, number, number] = [b.x, b.y, b.z];
    const to: [number, number, number] = [b.x + b.vx * dt, b.y + b.vy * dt, b.z + b.vz * dt];
    // the hero (not a bounced shot)
    if (!s.back) {
      const hs = this.h.heroState;
      const size = this.h.heroSize();
      const k = segHitsCylinder(from, to, {
        x: hs.x,
        z: hs.z,
        r: size.radius + RADIUS[s.kind],
        y0: hs.y,
        y1: hs.y + size.height,
      });
      if (k !== null) {
        const at: [number, number, number] = [
          from[0] + (to[0] - from[0]) * k,
          from[1] + (to[1] - from[1]) * k,
          from[2] + (to[2] - from[2]) * k,
        ];
        const how = this.h.hitHero(s.owner, s.power, s.type, [at[0] - b.vx, at[2] - b.vz]);
        if ((how === 'block' || how === 'parry') && s.kind === 'rock') return this.bounce(s, at);
        this.h.effect(s.kind === 'fireball' ? 'fire' : 'dust', at);
        if (how === 'block' || how === 'parry') this.h.sound('clack', at);
        return this.remove(s);
      }
    } else {
      // a bounced shot: the enemies it meets
      for (const e of this.h.enemies()) {
        const k = segHitsCylinder(from, to, {
          x: e.x,
          z: e.z,
          r: e.radius + RADIUS[s.kind],
          y0: e.y + e.bottom,
          y1: e.y + e.top,
        });
        if (k === null) continue;
        const at: [number, number, number] = [e.x, from[1], e.z];
        // back twice as hard as it came (one is enough for the one that spat it)
        this.h.hitEnemy(e.id, Math.max(1, s.power) * 2, s.type, 2);
        this.h.effect('dust', at);
        this.h.sound('thud', at);
        this.h.log(e.id === s.owner ? 'The rock went back at the one that spat it' : 'A bounced rock hit an enemy');
        return this.remove(s);
      }
    }
    // a wall or the ground
    const hit = ph
      ? ph.castSegment(from, to, { pad: RADIUS[s.kind] * 0.5, skipHero: true })
      : this.h.clear(to[0], to[1], to[2])
        ? null
        : { point: to, normal: [0, 1, 0] as [number, number, number], t: 1, object: null, fixed: true };
    if (hit) {
      if (s.kind === 'fireball') {
        this.h.flame(hit.point, 1.2);
        this.h.effect('fire', hit.point);
        this.h.sound('fizzle', hit.point);
      } else {
        this.h.effect('dust', hit.point);
        this.h.sound('thud', hit.point);
      }
      return this.remove(s);
    }
    if (!ph) {
      b.x = to[0];
      b.y = to[1];
      b.z = to[2];
    }
  }

  /** a rock off the shield: straight back at whoever spat it (or on along the shield's facing), faster */
  private bounce(s: FoeShot, at: [number, number, number]) {
    const b = s.ball;
    const owner = this.h.enemies().find((e) => e.id === s.owner);
    const sp = Math.hypot(b.vx, b.vy, b.vz) * BACK_SPEED;
    let v: [number, number, number];
    if (owner) {
      const tgt = [owner.x, owner.y + (owner.bottom + owner.top) / 2, owner.z];
      const d = Math.hypot(tgt[0]! - at[0], tgt[1]! - at[1], tgt[2]! - at[2]) || 1;
      // straight (aimed a little high: gravity pulls it down on the way)
      const tof = d / sp;
      v = [
        ((tgt[0]! - at[0]) / d) * sp,
        ((tgt[1]! - at[1]) / d) * sp + 0.5 * GRAVITY * tof,
        ((tgt[2]! - at[2]) / d) * sp,
      ];
    } else {
      const h = this.h.heroState;
      v = [Math.sin(h.heading) * sp, 2, Math.cos(h.heading) * sp];
    }
    b.x = at[0];
    b.y = at[1];
    b.z = at[2];
    b.vx = v[0];
    b.vy = v[1];
    b.vz = v[2];
    const ph = this.h.physics();
    if (ph) {
      ph.removeShot(b);
      ph.addShot(b, RADIUS[s.kind], { density: DENSITY[s.kind], drag: DRAG[s.kind] });
    }
    s.back = true;
    s.t = 0;
    this.h.sound('clack', at);
    this.h.effect('sparks', at);
    this.h.log('The shield bounced the rock back');
  }
}
