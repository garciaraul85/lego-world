import type { DamageType } from '../../core/combat/damage';
import type { Asset } from '../../core/schema';
import type { PoseParams } from '../character/routine';
import type { HeroState } from '../legacy/runtime-modules';
import type { PhysicsWorld } from '../physics/physics';
import { boxOf } from './puzzles';
import { type ShotNpc, segToNpc } from './shots';

/**
 * Step 13b: things that pull and hold, from Zelda's hookshot, clawshot, grappling hook and Breath of the Wild's
 * Magnesis.
 *
 * - The hook line shoots a chain straight out. Its hook catches on wood and on hook targets: then the two ends pull
 *   together and the lighter one moves. The hero (6 units of mass) is pulled to a fixed target or a heavy thing; a
 *   light loose thing (a crate, a barrel) is pulled to the hero; a pickup comes back on the hook. On stone it clinks
 *   and comes back. Pulled along, the hero flies straight at the hook with gravity held off by the chain, and drops
 *   at the end.
 * - The grapple rope shoots the same way, but caught on something over the hero it holds the hero on a rope: a
 *   pendulum (gravity, the rope's pull, the air). The move keys swing it (pumping), with Run held forward and back
 *   climb the rope and let it out, Jump lets go and the hero flies on with the swing's speed.
 * - The magnet glove lifts a metal loose thing and holds it in the air ahead: a spring to a point in front of the
 *   hero (and a damper, so it does not bounce), the glove holding its weight. Forward and back move it out and in,
 *   left and right turn the hero with it. Let go and it falls (on a floor switch, it weighs on it).
 */
export type HookObject = {
  inst: { id: string; pos: [number, number, number]; rot: number; idBase: number };
  def: Asset;
  bricks: { x: number; y: number; z: number; type: string; rot?: number }[];
  state: string;
};

export type Gear = 'hook' | 'rope' | 'magnet';

export type Line = {
  gear: 'hook' | 'rope';
  phase: 'out' | 'back' | 'reel' | 'fetch' | 'hang';
  /** where it left from, the way it flies, how far out the hook is */
  dir: [number, number, number];
  tip: [number, number, number];
  out: number;
  /** what it caught: a point on something fixed (the hero is pulled there / hangs from it), or a loose thing */
  anchor?: [number, number, number];
  normal?: [number, number, number];
  thing?: string;
  carried?: { item: string; count: number; name: string; pieces: readonly unknown[]; origin: [number, number, number] };
  t: number;
};

export type HooksHost<T extends HookObject = HookObject> = {
  readonly heroState: HeroState;
  physics(): PhysicsWorld | null;
  /** the hand the line leaves from (and comes back to) */
  hand(): [number, number, number];
  near(x: number, z: number, r: number): readonly T[];
  byId(id: string): T | undefined;
  npcs(): readonly ShotNpc[];
  hitNpc(
    id: number,
    type: DamageType,
    power: number,
    opt: { knock: number; stun: number; from: [number, number] },
  ): void;
  hitObject(o: T, type: DamageType, power: number, at: [number, number, number]): boolean;
  /** the hero moved by this much through the world (bricks stop it); where it got to and what stopped it */
  moveHero(d: [number, number, number]): { blocked: [boolean, boolean, boolean]; grounded: boolean };
  /** pulled up to a hook: the hero climbs onto a floor beside or past it within reach, if there is one (true: it did) */
  pullUp(at: [number, number, number], way: [number, number, number]): boolean;
  fetch(o: T): Line['carried'] | null;
  deliver(c: NonNullable<Line['carried']>): void;
  lockPos(): [number, number, number] | null;
  sound(id: 'clink' | 'whoosh' | 'thunk' | 'catch' | 'clack' | 'hum', at: [number, number, number]): void;
  effect(kind: 'spark' | 'hit', at: [number, number, number]): void;
  solidAt(x: number, y: number, z: number): boolean;
  say(text: string, seconds?: number): void;
  log(text: string): void;
};

/** how far the hook line and the grapple rope reach, and how fast they shoot and reel (studs, studs a second) */
export const HOOK_RANGE = 16;
export const ROPE_RANGE = 18;
/**
 * Hanging from the rope by one hand, as one hangs from a clawshot (the other hand stays free): the right arm nearly
 * straight overhead, the torso rolled so that the fist is over the middle of the body (the body hangs under its grip),
 * the left arm loose at the side. Measured with Session.gripPoints: the fist 4.64 studs up, over the body's middle.
 */
const HANG_ARM: [number, number, number] = [-3.0, 0, -0.25];
const HANG_ROLL = 0.25;
/** the height the hanging body tips about (its hips, as measured: the fist swings on a 2.4-stud arm above them) */
const HANG_PIVOT = 2.24;
const FREE_ARM: [number, number, number] = [-0.15, 0, -0.3];
const HOOK_SPEED = 45;
const REEL_SPEED = 24;
const FETCH_SPEED = 18;
/** the hero's mass (as the physics engine's walker pushes with), against a loose thing's: the lighter one moves */
export const HERO_MASS = 6;
/** gravity on the hero (as it walks), and what pumping a swing and climbing the rope do */
const G = 22;
const PUMP = 9;
const CLIMB = 4;
const ROPE_MIN = 1.5;
/** air on a swinging hero (a = k·|v|·v) */
const SWING_DRAG = 0.012;
/** the magnet glove: how far it reaches, and the spring and damper that hold a thing at its point */
export const MAGNET_RANGE = 14;
const MAGNET_K = 30;
const MAGNET_C = 9;
const MAGNET_MIN = 2.5;
const MAGNET_MAX = 12;
/** aim help: within this angle of where the hero faces */
const ASSIST_CONE = 0.4;

const norm3 = (v: readonly number[]): [number, number, number] => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const dist3 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

export class Hooks<T extends HookObject = HookObject> {
  /** what is in the right hand: the hook line, the grapple rope or the magnet glove (null: none) */
  out: Gear | null = null;
  /** Attack held: aiming (the hook line or rope), or the glove reaching (no thing yet) */
  aiming = false;
  aimYaw = 0;
  aimPitch = 0;
  private turnYaw = 0;
  private turnPitch = 0;
  aimAt: [number, number, number] | null = null;
  /** where a line let go now would catch (and whether it would catch, or clink) */
  aimHit: { at: [number, number, number]; catches: boolean } | null = null;
  line: Line | null = null;
  /** the hero hanging on the rope: its speed (the rope's length is the line's out) */
  swing: { vel: [number, number, number] } | null = null;
  /** the hero pulled along the line to its hook */
  pulled = false;
  /** the magnet glove holding a thing: its key, and how far out */
  held: { key: string; dist: number; lift: number } | null = null;
  private act: { kind: 'shoot'; t: number } | null = null;

  constructor(private readonly h: HooksHost<T>) {}

  /** the hero is moved by the hooks now (pulled along a line, or swinging on the rope) */
  get movesHero(): boolean {
    return this.pulled || !!this.swing;
  }

  /** what a hook catches on: a hook target or ring, or wood (anything that burns), a ladder or vines */
  catches(o: T): boolean {
    return !!(o.def.hook || o.def.burn || o.def.climbable);
  }

  // ---------- aiming ----------

  /** Attack held with the hook line or rope out: aim (by itself at what it can catch in front); the glove reaches */
  press() {
    if (!this.out || this.line || this.swing || this.pulled) return;
    if (this.out === 'magnet') return this.grab();
    this.aiming = true;
    this.turnYaw = 0;
    this.turnPitch = 0;
    this.aimYaw = this.h.heroState.heading;
    this.aimPitch = 0;
    this.aimAt = this.pickTarget();
    this.aimNow();
  }

  /** Attack let go: the line shoots (the glove lets go) */
  release() {
    if (this.out === 'magnet') return this.drop();
    if (!this.aiming) return;
    this.aiming = false;
    this.aimNow();
    this.shoot();
  }

  /** while aiming: the move keys turn and tilt the aim; holding a thing with the glove, they move it */
  steer(x: number, z: number, dt: number) {
    if (this.held) {
      this.held.dist = Math.max(MAGNET_MIN, Math.min(MAGNET_MAX, this.held.dist + z * 4 * dt));
      this.h.heroState.heading -= x * 1.4 * dt;
      return;
    }
    if (!this.aiming || (!x && !z)) return;
    if (this.aimAt) {
      this.turnYaw -= x * 1.2 * dt;
      this.turnPitch += z * 0.7 * dt;
      if (Math.abs(this.turnYaw) > 0.5) this.aimAt = null;
      return;
    }
    this.aimYaw -= x * 1.2 * dt;
    this.aimPitch = Math.max(-0.8, Math.min(1.2, this.aimPitch + z * 0.7 * dt));
  }

  private range() {
    return this.out === 'rope' ? ROPE_RANGE : HOOK_RANGE;
  }

  /** the best thing to aim at in front: what is locked on to, else what the line catches on (or pulls), nearest the middle */
  private pickTarget(): [number, number, number] | null {
    const s = this.h.heroState;
    // what is locked on to, unless the rope is out and it is not over the hero (the rope only hangs from things above)
    const lock = this.h.lockPos();
    if (lock && (this.out !== 'rope' || lock[1] >= s.y + 4)) return lock;
    const from = this.h.hand();
    const R = this.range();
    let best: { p: [number, number, number]; score: number } | null = null;
    const ph = this.h.physics();
    for (const o of this.h.near(s.x, s.z, R + 4)) {
      const rope = this.out === 'rope';
      const ok = this.catches(o) || (!rope && (!!o.def.pickup || !!o.def.loose));
      if (!ok) continue;
      const b = boxOf(o.bricks as never);
      if (!b) continue;
      let p: [number, number, number] = [(b.x0 + b.x1) / 2, ((b.y0 + b.y1) / 2) * 0.4, (b.z0 + b.z1) / 2];
      // a loose thing is where the physics engine has it now
      if (o.def.loose) {
        const pose = ph?.objectPose(o.inst.id);
        if (pose) p = pose.pos;
      }
      // for the rope, only what is over the hero (it hangs from it): aimed at its underside's height, near its top
      if (rope) {
        if (b.y1 * 0.4 < s.y + 4) continue;
        p = [p[0], b.y1 * 0.4 - 0.7, p[2]];
      }
      const d = dist3(p, from);
      if (d > R || d < 1.2) continue;
      const a = Math.atan2(p[0] - s.x, p[2] - s.z) - s.heading;
      const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (off > ASSIST_CONE) continue;
      const hit = ph?.castSegment(from, p);
      if (hit && hit.t < d - 1.4 && !(hit.object && hit.object === o.inst.id)) continue;
      const score = off * 10 + d * 0.05;
      if (!best || score < best.score) best = { p, score };
    }
    return best?.p ?? null;
  }

  private aimNow() {
    const t = this.aimAt;
    const from = this.h.hand();
    if (t) {
      this.aimYaw = Math.atan2(t[0] - from[0], t[2] - from[2]) + this.turnYaw;
      this.aimPitch = Math.atan2(t[1] - from[1], Math.hypot(t[0] - from[0], t[2] - from[2])) + this.turnPitch;
    }
    // where it would go: a straight line (a chain is fast and taut: it barely falls)
    const d = this.dirOf();
    const ph = this.h.physics();
    const R = this.range();
    const end: [number, number, number] = [from[0] + d[0] * R, from[1] + d[1] * R, from[2] + d[2] * R];
    const hit = ph?.castSegment(from, end);
    if (!hit) {
      this.aimHit = null;
      return;
    }
    const o = this.thingAt(hit.point, hit.normal, hit.object);
    const catches = !!o && (this.catches(o) || (this.out === 'hook' && (!!o.def.loose || !!o.def.pickup)));
    this.aimHit = { at: hit.point, catches };
  }

  private dirOf(): [number, number, number] {
    const c = Math.cos(this.aimPitch);
    return [Math.sin(this.aimYaw) * c, Math.sin(this.aimPitch), Math.cos(this.aimYaw) * c];
  }

  /** the line shoots out from the hand the way it aims */
  shoot() {
    const from = this.h.hand();
    const dir = this.dirOf();
    this.h.heroState.heading = this.aimYaw;
    this.line = {
      gear: this.out === 'rope' ? 'rope' : 'hook',
      phase: 'out',
      dir,
      tip: [...from] as [number, number, number],
      out: 0,
      t: 0,
    };
    this.act = { kind: 'shoot', t: 0 };
    this.aimHit = null;
    this.h.sound('whoosh', from);
    this.h.log(`${this.out === 'rope' ? 'The grapple rope' : 'The hook line'} shot out`);
  }

  // ---------- the magnet glove ----------

  /** the glove reaches for the metal thing ahead (true: it has one) */
  private grab(): boolean {
    const s = this.h.heroState;
    const ph = this.h.physics();
    const from = this.h.hand();
    let best: { o: T; d: number; off: number } | null = null;
    for (const o of this.h.near(s.x, s.z, MAGNET_RANGE + 3)) {
      if (!o.def.metal || !o.def.loose) continue;
      const pose = ph?.objectPose(o.inst.id);
      if (!pose) continue;
      const d = dist3(pose.pos, from);
      if (d > MAGNET_RANGE) continue;
      const a = Math.atan2(pose.pos[0] - s.x, pose.pos[2] - s.z) - s.heading;
      const off = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (off > 0.6) continue;
      if (!best || off * 10 + d * 0.1 < best.off * 10 + best.d * 0.1) best = { o, d, off };
    }
    if (!best) {
      this.h.say('Nothing metal ahead for the magnet glove.', 1.5);
      return false;
    }
    const pose = ph!.objectPose(best.o.inst.id)!;
    this.held = {
      key: best.o.inst.id,
      dist: Math.max(MAGNET_MIN, Math.min(MAGNET_MAX, best.d)),
      lift: Math.max(0.6, pose.pos[1] - s.y + 0.5),
    };
    this.h.heroState.heading = Math.atan2(pose.pos[0] - s.x, pose.pos[2] - s.z);
    this.h.sound('hum', pose.pos);
    this.h.log(`The magnet glove took hold of ${best.o.def.name}`);
    return true;
  }

  private drop() {
    if (!this.held) return;
    const o = this.h.byId(this.held.key);
    this.held = null;
    this.h.log(`The magnet glove let go${o ? ` of ${o.def.name}` : ''}`);
  }

  /** the point the glove holds a thing at: ahead of the hero, at the hand's height and a little over */
  holdPoint(): [number, number, number] | null {
    if (!this.held) return null;
    const s = this.h.heroState;
    const hand = this.h.hand();
    return [
      s.x + Math.sin(s.heading) * this.held.dist,
      hand[1] + this.held.lift - 0.5,
      s.z + Math.cos(s.heading) * this.held.dist,
    ];
  }

  /** the glove's pull on the held thing: a spring to its point, a damper, its weight held up, its spin calmed */
  private stepMagnet(dt: number) {
    const held = this.held;
    if (!held) return;
    const ph = this.h.physics();
    const pose = ph?.objectPose(held.key);
    const v = ph?.objectVelocity(held.key);
    const at = this.holdPoint();
    if (!ph || !pose || !v || !at || !this.h.byId(held.key)) {
      this.held = null;
      return;
    }
    // too far (pulled away, or walked off from it): it falls
    if (dist3(pose.pos, [this.h.heroState.x, pose.pos[1], this.h.heroState.z]) > MAGNET_RANGE + 3) {
      this.drop();
      return;
    }
    const m = ph.objectMass(held.key);
    const a = [0, 1, 2].map((i) => MAGNET_K * (at[i]! - pose.pos[i]!) - MAGNET_C * v[i]!);
    a[1]! += 18;
    // no more than the glove can give (a heavy thing lags and sags)
    const most = 60;
    const k = Math.min(1, most / (Math.hypot(a[0]!, a[1]!, a[2]!) || 1));
    ph.pushObject(held.key, [a[0]! * k * m * dt, a[1]! * k * m * dt, a[2]! * k * m * dt], pose.pos);
    ph.dampObjectSpin(held.key, Math.min(1, dt * 4));
  }

  // ---------- each step ----------

  private thingAt(p: readonly number[], n: readonly number[], key: string | null): T | null {
    if (key) return this.h.byId(key) ?? null;
    const q = [p[0]! - n[0]! * 0.06, p[1]! - n[1]! * 0.06, p[2]! - n[2]! * 0.06];
    let best: T | null = null;
    let bestD = Infinity;
    for (const o of this.h.near(q[0]!, q[2]!, 6)) {
      const b = boxOf(o.bricks as never);
      if (!b) continue;
      const d = Math.hypot(
        Math.max(b.x0 - q[0]!, 0, q[0]! - b.x1),
        Math.max(b.y0 * 0.4 - q[1]!, 0, q[1]! - b.y1 * 0.4),
        Math.max(b.z0 - q[2]!, 0, q[2]! - b.z1),
      );
      if (d < 0.15 && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  step(dt: number) {
    if (this.aiming) this.aimNow();
    if (this.act) {
      this.act.t += dt;
      if (this.act.t > 0.3) this.act = null;
    }
    this.stepMagnet(dt);
    const l = this.line;
    if (!l) return;
    l.t += dt;
    const hand = this.h.hand();
    if (l.phase === 'out') this.stepOut(l, hand, dt);
    else if (l.phase === 'back') {
      l.out -= REEL_SPEED * 1.6 * dt;
      if (l.out <= 0) return this.done();
      for (let i = 0; i < 3; i++) l.tip[i] = hand[i]! + l.dir[i]! * l.out;
    } else if (l.phase === 'fetch') this.stepFetch(l, hand, dt);
  }

  /** the hook flies out: what it meets decides what happens */
  private stepOut(l: Line, hand: [number, number, number], dt: number) {
    const was: [number, number, number] = [...l.tip] as [number, number, number];
    l.out = Math.min(this.range(), l.out + HOOK_SPEED * dt);
    for (let i = 0; i < 3; i++) l.tip[i] = hand[i]! + l.dir[i]! * l.out;
    // a foe in the way is stunned, and the hook comes back
    for (const n of this.h.npcs())
      if (segToNpc(was, l.tip, n) <= n.radius + 0.2) {
        this.h.hitNpc(n.id, 'stun', 0, { knock: 0.8, stun: 2, from: [hand[0], hand[2]] });
        this.h.effect('hit', l.tip);
        l.phase = 'back';
        return;
      }
    const ph = this.h.physics();
    const hit = ph?.castSegment(was, l.tip, { pad: 0.15 });
    if (!hit) {
      // a pickup it passes is hooked and brought back
      if (l.gear === 'hook')
        for (const o of this.h.near(l.tip[0], l.tip[2], 3)) {
          if (!o.def.pickup) continue;
          const b = boxOf(o.bricks as never);
          if (!b) continue;
          const g = 0.6;
          if (l.tip[0] < b.x0 - g || l.tip[0] > b.x1 + g || l.tip[2] < b.z0 - g || l.tip[2] > b.z1 + g) continue;
          if (l.tip[1] < b.y0 * 0.4 - g || l.tip[1] > b.y1 * 0.4 + 1.6) continue;
          const c = this.h.fetch(o);
          if (c) {
            l.carried = c;
            l.phase = 'back';
            this.h.sound('catch', l.tip);
            this.h.log(`The hook line caught ${c.name}`);
            return;
          }
        }
      if (l.out >= this.range()) {
        l.phase = 'back';
        this.h.log('The line reached its end and came back');
      }
      return;
    }
    l.tip = [...hit.point] as [number, number, number];
    l.out = dist3(hand, l.tip);
    const o = this.thingAt(hit.point, hit.normal, hit.object);
    // a loose thing: the lighter end moves (a light crate comes to the hero; a heavy one pulls the hero to it)
    if (o && o.def.loose && hit.object && ph) {
      const m = ph.objectMass(hit.object);
      if (l.gear === 'hook' && m < HERO_MASS) {
        l.thing = hit.object;
        l.phase = 'fetch';
        this.h.sound('thunk', l.tip);
        this.h.log(
          `The hook line caught ${o.def.name} (${m.toFixed(1)} against the hero’s ${HERO_MASS}): it comes to you`,
        );
        return;
      }
      if (!this.catches(o)) {
        this.clink(l, hit.point, o);
        return;
      }
    } else if (!o || !this.catches(o)) {
      this.clink(l, hit.point, o);
      return;
    }
    // caught: a switch it strikes is hit too (a crystal), then the hero is pulled to it, or hangs from it
    if (o.def.switch?.by === 'hit') this.h.hitObject(o, 'blunt', 1, hit.point);
    l.anchor = [...hit.point] as [number, number, number];
    l.normal = hit.normal;
    this.h.sound('thunk', l.tip);
    if (l.gear === 'rope' && l.anchor[1] > this.h.heroState.y + 2.5) {
      l.phase = 'hang';
      this.swing = { vel: [0, 0, 0] };
      this.h.log(`The grapple rope caught ${o.def.name}: hanging from it (${l.out.toFixed(1)} studs of rope)`);
      return;
    }
    l.phase = 'reel';
    this.pulled = true;
    this.h.log(`The hook line caught ${o.def.name}: pulled to it`);
  }

  private clink(l: Line, at: [number, number, number], o: T | null) {
    if (o?.def.switch?.by === 'hit') this.h.hitObject(o, 'blunt', 1, at);
    this.h.effect('spark', at);
    this.h.sound('clink', at);
    l.phase = 'back';
    this.h.log(`The hook clinked off ${o ? o.def.name : 'the wall'}`);
  }

  /** a light loose thing comes along the line to the hero (pulled by the chain against its weight and the floor) */
  private stepFetch(l: Line, hand: [number, number, number], dt: number) {
    const ph = this.h.physics();
    const key = l.thing!;
    const pose = ph?.objectPose(key);
    if (!ph || !pose) return this.done();
    const to: [number, number, number] = [hand[0] - pose.pos[0], hand[1] - 0.6 - pose.pos[1], hand[2] - pose.pos[2]];
    const d = Math.hypot(...to);
    l.tip = [...pose.pos] as [number, number, number];
    l.out = dist3(hand, pose.pos);
    if (d < 2.2 || l.t > 4) {
      ph.setObjectVelocity(key, [0, 0, 0]);
      this.h.log(`${this.h.byId(key)?.def.name ?? 'It'} came to the hero on the line`);
      return this.done();
    }
    // the chain pulls it at the reel's speed (and a little up, so it is lifted over the floor's grip)
    const u = norm3(to);
    const v = ph.objectVelocity(key) ?? [0, 0, 0];
    const want: [number, number, number] = [u[0] * FETCH_SPEED, u[1] * FETCH_SPEED + 2, u[2] * FETCH_SPEED];
    const m = ph.objectMass(key);
    const k = Math.min(1, dt * 10);
    ph.pushObject(
      key,
      [(want[0] - v[0]) * m * k, (want[1] - v[1]) * m * k + 18 * m * dt, (want[2] - v[2]) * m * k],
      pose.pos,
    );
  }

  /**
   * the hero moved by the hooks this step (instead of walking): pulled along the line to the hook, or swinging on
   * the rope (the move keys pump and climb; jump lets go). True: it was.
   */
  stepHero(input: { x: number; z: number; jump: boolean; run?: boolean }, camYaw: number, dt: number): boolean {
    const l = this.line;
    const s = this.h.heroState;
    if (this.pulled && l?.anchor) {
      // flown straight at the hook; the chain holds the hero up (no gravity) until it gets there
      const hand = this.h.hand();
      const to = [l.anchor[0] - hand[0], l.anchor[1] - hand[1], l.anchor[2] - hand[2]];
      const d = Math.hypot(to[0]!, to[1]!, to[2]!);
      const step = Math.min(d, REEL_SPEED * dt);
      const u = norm3(to);
      const r = this.h.moveHero([u[0] * step, u[1] * step, u[2] * step]);
      s.vy = 0;
      s.heading = Math.atan2(u[0], u[2]);
      l.out = dist3(this.h.hand(), l.anchor);
      l.tip = [...l.anchor] as [number, number, number];
      const stuck = r.blocked[0] && r.blocked[2] && d > 1.2;
      if (d < 1.4 || stuck || l.t > 5) {
        this.pulled = false;
        // at the hook: up onto the ledge it is on, if one is in reach (else the hero drops)
        const up = this.h.pullUp(l.anchor, u);
        this.h.log(`Pulled to the hook${up ? ', and up onto the ledge' : stuck ? ' (something in the way)' : ''}`);
        this.done();
      }
      return true;
    }
    if (this.swing && l?.anchor) {
      const v = this.swing.vel;
      if (input.jump) {
        // let go: on with the swing's speed (and a hop up)
        s.vy = v[1] + 4;
        this.flung = [v[0], v[2]];
        this.swing = null;
        this.h.log(`Let go of the rope at ${Math.hypot(v[0], v[2]).toFixed(1)} studs a second`);
        this.done();
        return false;
      }
      // the move keys: forward and back pump the swing (a push along the way the camera looks), up the rope with
      // forward held while hanging still and nearly under the anchor; let out with back the same way
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      const ax = (fx * input.z + rx * input.x) * PUMP;
      const az = (fz * input.z + rz * input.x) * PUMP;
      const p = this.h.hand();
      const rel = [p[0] - l.anchor[0], p[1] - l.anchor[1], p[2] - l.anchor[2]];
      const len = Math.hypot(rel[0]!, rel[1]!, rel[2]!);
      // climbing: with Run held, forward and back go up and down the rope (else they pump the swing)
      if (input.run) {
        if (input.z) l.out = Math.max(ROPE_MIN, Math.min(this.range(), l.out - input.z * CLIMB * dt));
      } else {
        v[0] += ax * dt;
        v[2] += az * dt;
      }
      v[1] -= G * dt;
      const sp = Math.hypot(v[0], v[1], v[2]);
      for (let i = 0; i < 3; i++) v[i]! -= SWING_DRAG * sp * v[i]! * dt;
      // where it would be; the rope pulls it back onto its circle (and takes away the speed along the rope)
      let n = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
      const nr = [n[0]! - l.anchor[0], n[1]! - l.anchor[1], n[2]! - l.anchor[2]];
      const nl = Math.hypot(nr[0]!, nr[1]!, nr[2]!);
      if (nl > l.out) {
        const k = l.out / nl;
        n = [l.anchor[0] + nr[0]! * k, l.anchor[1] + nr[1]! * k, l.anchor[2] + nr[2]! * k];
        const u = norm3(nr);
        const along = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
        if (along > 0) for (let i = 0; i < 3; i++) v[i]! -= along * u[i]!;
      }
      const r = this.h.moveHero([n[0]! - p[0], n[1]! - p[1], n[2]! - p[2]]);
      for (let i = 0; i < 3; i++) if (r.blocked[i]) v[i] = 0;
      if (r.grounded && v[1] < 0) v[1] = 0;
      s.vy = v[1];
      // the hero turns, slowly, to face along the way it swings (forward or back, whichever is nearer the way it
      // faces: it does not spin round where the swing turns back)
      if (Math.hypot(v[0], v[2]) > 1.5) {
        let want = Math.atan2(v[0], v[2]);
        let d = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
        if (Math.abs(d) > Math.PI / 2) {
          want += Math.PI;
          d = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
        }
        s.heading += d * Math.min(1, 3 * dt);
      }
      l.tip = [...l.anchor] as [number, number, number];
      void len;
      return true;
    }
    return false;
  }

  /** a let-go swing's speed across the ground, for the hero's flight (the session carries it on, then clears it) */
  flung: [number, number] | null = null;

  /** the line is back in the hand (anything it carried is the hero's) */
  private done() {
    const l = this.line;
    this.line = null;
    this.pulled = false;
    this.swing = null;
    if (l?.carried) this.h.deliver(l.carried);
  }

  /** the gear is put away (or the hero is hurt): everything lets go */
  letGo() {
    this.aiming = false;
    this.aimHit = null;
    this.drop();
    if (this.line) this.done();
  }

  // ---------- the pose ----------

  /** the hero's arms: aiming (the right arm out at the aim), pulled along (both up the line), hanging (both up the rope, legs together, swinging) */
  pose(): PoseParams | null {
    const s = this.h.heroState;
    if (this.swing) {
      const v = this.swing.vel;
      const fwd = v[0] * Math.sin(s.heading) + v[2] * Math.cos(s.heading);
      // the body hangs along the rope: tipped (about the hips) as far as the rope is from straight down, in the way
      // it faces, so that the arm and the rope are one line (from the hips, not the hand: the hand is where the tip
      // puts it)
      const a = this.line?.anchor;
      const hip: [number, number, number] = [s.x, s.y + HANG_PIVOT, s.z];
      const ahead = a ? (hip[0] - a[0]) * Math.sin(s.heading) + (hip[2] - a[2]) * Math.cos(s.heading) : 0;
      const drop = a ? Math.max(0.5, a[1] - hip[1]) : 1;
      const tip = Math.max(-1.1, Math.min(1.1, Math.atan2(ahead, drop)));
      return {
        body: -tip,
        // the right hand on the rope overhead, the left loose (it swings a little the other way to the swing)
        ra: HANG_ARM,
        re: -0.05,
        roll: HANG_ROLL,
        la: [FREE_ARM[0] + Math.max(-0.25, Math.min(0.25, fwd * 0.03)), 0, FREE_ARM[2]],
        le: -0.35,
        ll: [-0.25 - Math.max(-0.3, Math.min(0.3, fwd * 0.04)), 0, -0.02],
        rl: [-0.05 - Math.max(-0.3, Math.min(0.3, fwd * 0.04)), 0, 0.02],
        lk: 0.5,
        rk: 0.35,
        lean: -0.05,
      };
    }
    if (this.pulled)
      return {
        la: [-2.0, 0, -0.1],
        ra: [-2.2, 0, 0.1],
        le: -0.1,
        re: -0.1,
        ll: [0.25, 0, 0],
        rl: [0.1, 0, 0],
        lk: 0.6,
        rk: 0.4,
        lean: 0.25,
      };
    if (this.held) return { ra: [-1.55, 0, 0.05], re: -0.05, la: [-0.4, 0, -0.2], le: -0.6, lean: 0.05, stance: 0.5 };
    if (this.aiming || this.line || this.act) {
      const tilt = Math.max(-0.7, Math.min(1.1, this.aimPitch));
      return {
        ra: [-1.57 - tilt, 0, 0.05],
        re: -0.05,
        la: [-1.2 - tilt * 0.5, 0, -0.35],
        le: -1.0,
        lean: 0.03,
        stance: 0.5,
      };
    }
    return null;
  }

  reset() {
    this.out = null;
    this.aiming = false;
    this.aimHit = null;
    this.line = null;
    this.swing = null;
    this.pulled = false;
    this.held = null;
    this.flung = null;
    this.act = null;
  }
}
