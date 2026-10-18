import { combatClip } from '../../builtin/clips/combat';
import { type AttackHit, type DamageType, damageOf, heldAttack } from '../../core/combat/damage';
import { Animator } from '../character/animator';
import type { PoseParams } from '../character/routine';
import type { HeroState, Npc } from '../legacy/runtime-modules';

/**
 * P9b: the hero's fighting — kinds of attack, guarding with a shield (stamina, parry, shield bash), the
 * moves (dodge roll, side hop, back flip, jump attack, plunge) and Zelda-style lock-on. Everything here is
 * for this play only.
 */

/** How each kind of attack hits, on top of what the held item does. */
export const ATTACKS = {
  light: { mult: 1, knock: 0.6, stun: 0, around: false },
  heavy: { mult: 1.75, knock: 2.2, stun: 0.5, around: false },
  charged: { mult: 2, knock: 2.6, stun: 0.6, around: false },
  spin: { mult: 1.5, knock: 2.4, stun: 0.5, around: true },
  jump: { mult: 1.5, knock: 1.6, stun: 0.4, around: false },
  plunge: { mult: 2, knock: 2, stun: 0.8, around: true },
  bash: { mult: 0.5, knock: 2.5, stun: 1.0, around: false },
} as const;
export type AttackKind = keyof typeof ATTACKS;

/** Holding F this long makes a charged attack, and this long a spin attack. */
export const CHARGE_TIME = 0.6;
export const SPIN_TIME = 1.2;
/** Guarding this soon before a hit parries it. */
export const PARRY_WINDOW = 0.25;
export const MAX_STAMINA = 100;
/** Lock-on: what is within this many studs (and in front of the camera) can be locked on to… */
export const LOCK_RANGE = 14;
/** …and a lock lets go beyond this */
export const LOCK_RELEASE = 16;

export type Move = {
  kind: 'roll' | 'hop' | 'flip' | 'jump' | 'plunge' | 'bash' | 'spin';
  t: number;
  dur: number;
  /** direction in camera space (x right, z forward) */
  dir: [number, number];
  heading: number;
  struck?: boolean;
};

export type LockTarget = { kind: 'inst'; id: string } | { kind: 'npc'; id: number };

/** What has the hero's shield: a character whose off hand holds one. */
export const hasShield = (profile: Record<string, unknown>) => profile.offHand === 'Shield';

/** What combat needs of the play session (PlaySession; kept structural so the two files don't import each other). */
type HostInstance = { def: { name: string; health?: unknown; lockOn?: boolean }; inst: { id: string } };
export interface CombatHost {
  readonly heroState: HeroState;
  readonly over: boolean;
  readonly input: { keys: Set<string>; touch: Set<string> };
  readonly hero: Record<string, unknown>;
  readonly clock: number;
  camYaw: number;
  readonly world: { npcs: Npc[]; instances: HostInstance[] };
  readonly health: { peek(key: string): { hp: number } | undefined };
  strike(kind: AttackKind): void;
  inputVector(): { x: number; z: number; run: boolean; jump: boolean; vertical: number };
  say(msg: string, seconds?: number): void;
  canHarm(n: Npc): boolean;
  /** the hero locked on to something (logic's On locked on) */
  lockedOn(t: LockTarget): void;
  instanceCenter(i: HostInstance): [number, number, number] | null;
  instanceTop(i: HostInstance): number | null;
}

export class Combat {
  /** seconds F has been held (null: not charging) */
  charge: number | null = null;
  guard = false;
  guardSince = -10;
  stamina = MAX_STAMINA;
  private staminaWait = 0;
  /** the hero can't act (guard broken, hit while charging) */
  stagger = 0;
  /** the hero can't be hurt (start of a dodge roll) */
  iframes = 0;
  move: Move | null = null;
  target: LockTarget | null = null;
  /** what Z would lock on to now (a marker shows over it), when nothing is locked */
  hint: LockTarget | null = null;
  /** neighbours that are stunned (can't move) until this clock time */
  readonly stunned = new Map<number, number>();
  /** clips of the moves (guard, roll…) — drawn over everything else */
  readonly anim = new Animator();
  /** walking phase of the legs under a fight clip */
  private gait = 0;

  constructor(private readonly s: CombatHost) {}

  // ---------- attacks ----------

  /** F pressed: a shield bash while guarding, a jump attack rising, a plunge falling, else start charging */
  press() {
    const h = this.s.heroState;
    if (this.stagger > 0 || this.move || this.s.over) return;
    if (this.guard) return this.startMove('bash', 0.35);
    if (!h.grounded) return h.vy > 0 ? this.startMove('jump', 0.5) : this.startMove('plunge', 0.6);
    this.charge = 0;
  }

  /** F released: what the hold became (light, heavy with Shift, charged, spin) */
  release() {
    const held = this.charge;
    this.charge = null;
    if (held === null || this.stagger > 0) return;
    if (held >= SPIN_TIME) return this.startMove('spin', 0.5);
    if (held >= CHARGE_TIME) return this.s.strike('charged');
    const run = this.s.input.keys.has('shift') || this.s.input.touch.has('run');
    this.s.strike(run ? 'heavy' : 'light');
  }

  /** the hit an attack of this kind does with what the hero holds */
  hitOf(kind: AttackKind): AttackHit {
    const base = heldAttack(this.s.hero.held);
    return { power: base.power * ATTACKS[kind].mult, type: kind === 'bash' ? 'blunt' : base.type };
  }

  // ---------- moves ----------

  /** dodge roll (C): always the way the hero faces */
  roll() {
    const h = this.s.heroState;
    if (!h.grounded || this.move || this.stagger > 0 || this.guard) return;
    this.startMove('roll', 0.45, this.facing());
    this.iframes = 0.3;
  }

  /** Space while locked on: a side hop (left / right) or a back flip (back) instead of a jump */
  lockedJump(x: number, z: number): boolean {
    if (!this.target || this.move || !this.s.heroState.grounded) return false;
    if (z < 0 && Math.abs(x) <= Math.abs(z)) {
      this.startMove('flip', 0.6, [0, -1]);
      return true;
    }
    if (x !== 0) {
      this.startMove('hop', 0.4, [Math.sign(x), 0]);
      return true;
    }
    return false;
  }

  /** where the hero faces, as controller input (camera space: x right, z forward) */
  facing(): [number, number] {
    const a = this.s.heroState.heading - this.s.camYaw;
    return [Math.sin(a), -Math.cos(a)];
  }

  private startMove(kind: Move['kind'], dur: number, dir?: [number, number]) {
    const v = this.s.inputVector();
    const d: [number, number] = dir ?? (v.x || v.z ? [v.x, v.z] : [0, 1]);
    const len = Math.hypot(d[0], d[1]) || 1;
    this.move = { kind, t: 0, dur, dir: [d[0] / len, d[1] / len], heading: this.s.heroState.heading };
    this.charge = null;
    const name = {
      roll: 'Dodge roll',
      hop: 'Side hop',
      flip: 'Back flip',
      jump: 'Jump attack',
      plunge: 'Plunge',
      bash: 'Shield bash',
      spin: 'Spin attack',
    }[kind];
    this.anim.play(combatClip(name));
    if (kind === 'plunge') this.s.heroState.vy = Math.min(this.s.heroState.vy, -16);
  }

  /** the controller input for this frame while a move runs (null: no move, normal walking) */
  moveInput(): {
    x: number;
    z: number;
    run: boolean;
    jump: boolean;
    vertical: number;
    speedScale: number;
    jumpSpeed?: number;
  } | null {
    const m = this.move;
    if (!m) return null;
    const first = m.t === 0;
    switch (m.kind) {
      case 'roll':
        return { x: m.dir[0], z: m.dir[1], run: false, jump: false, vertical: 0, speedScale: 2.4 };
      case 'hop':
        return { x: m.dir[0], z: 0, run: false, jump: first, vertical: 0, speedScale: 2.2, jumpSpeed: 6 };
      case 'flip':
        return { x: 0, z: -1, run: false, jump: first, vertical: 0, speedScale: 1.6, jumpSpeed: 8.5 };
      case 'jump':
        return { x: m.dir[0], z: m.dir[1], run: false, jump: false, vertical: 0, speedScale: 1.6 };
      case 'spin': {
        // the hero can keep walking through a spin attack (the legs walk: see pose())
        const v = this.s.inputVector();
        return { x: v.x, z: v.z, run: false, jump: false, vertical: 0, speedScale: 0.6 };
      }
      default:
        return { x: 0, z: 0, run: false, jump: false, vertical: 0, speedScale: 1 };
    }
  }

  /** advances the move; strikes at the right moment; true while the hero faces the move's way */
  stepMove(dt: number) {
    const m = this.move;
    if (!m) return;
    m.t += dt;
    const h = this.s.heroState;
    // sideways and backwards moves keep facing forward
    if (m.kind === 'hop' || m.kind === 'flip' || m.kind === 'bash' || m.kind === 'spin') h.heading = m.heading;
    if (!m.struck) {
      if (m.kind === 'jump' && m.t >= 0.32) this.strikeOnce(m, 'jump');
      if (m.kind === 'bash' && m.t >= 0.12) this.strikeOnce(m, 'bash');
      if (m.kind === 'spin' && m.t >= 0.25) this.strikeOnce(m, 'spin');
      if (m.kind === 'plunge' && h.grounded) this.strikeOnce(m, 'plunge');
    }
    const done = m.kind === 'plunge' ? h.grounded && m.t > 0.1 : m.t >= m.dur;
    if (done) {
      this.move = null;
      if (this.anim.clip && !this.guard) this.anim.stop();
    }
  }

  private strikeOnce(m: Move, kind: AttackKind) {
    m.struck = true;
    this.s.strike(kind);
  }

  // ---------- guarding ----------

  /** Q held: guard (with a shield) or defend (without one); the hero walks slowly while guarding */
  stepGuard(dt: number, held: boolean) {
    const h = this.s.heroState;
    const want = held && h.grounded && !this.move && this.stagger <= 0 && !this.s.over;
    if (want && !this.guard) {
      this.guard = true;
      this.guardSince = this.s.clock;
      this.charge = null;
      this.anim.play(combatClip(hasShield(this.s.hero) ? 'Guard' : 'Defend'));
    } else if (!want && this.guard) {
      this.guard = false;
      if (!this.move) this.anim.stop();
    }
    this.staminaWait = Math.max(0, this.staminaWait - dt);
    if (!this.guard && this.staminaWait <= 0) this.stamina = Math.min(MAX_STAMINA, this.stamina + 30 * dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (this.charge !== null) {
      this.charge += dt;
      if (this.charge >= 0.15 && this.anim.clip?.name !== 'Charge' && !this.move) this.anim.play(combatClip('Charge'));
    } else if (this.anim.clip?.name === 'Charge') this.anim.stop();
    this.anim.step(dt);
    const h2 = this.s.heroState;
    this.gait = h2.grounded && h2.speed > 0.3 ? this.gait + dt * (3 + h2.speed * 1.1) : 0;
  }

  /**
   * The pose of the fight clip playing now (null: none). While the hero walks during a spin attack, guarding
   * or charging, the legs walk instead of standing still.
   */
  pose(): PoseParams | null {
    const p = this.anim.params();
    if (!p) return null;
    const h = this.s.heroState;
    const kind = this.move?.kind;
    if (!h.grounded || h.speed < 0.3 || (kind && kind !== 'spin')) return p;
    const sw = Math.sin(this.gait);
    const amp = Math.min(1, h.speed / 3.5) * 0.6;
    return {
      ...p,
      ll: [sw * amp, 0, 0],
      rl: [-sw * amp, 0, 0],
      lk: 0.05 + Math.max(0, -sw) * amp * 1.3,
      rk: 0.05 + Math.max(0, sw) * amp * 1.3,
    };
  }

  /**
   * A hit coming at the hero from a point: blocked by the guard (from the front), parried just after raising
   * it, or it gets through. Returns the damage that reaches the hero's hearts.
   */
  defend(
    hit: AttackHit,
    from: [number, number] | null,
  ): { taken: number; how: 'hit' | 'block' | 'parry' | 'dodge' | 'break' } {
    if (this.iframes > 0) return { taken: 0, how: 'dodge' };
    const full = damageOf(hit, {});
    if (!this.guard || !from) return { taken: full, how: 'hit' };
    const h = this.s.heroState;
    const off = Math.abs(angleDiff(Math.atan2(from[0] - h.x, from[1] - h.z), h.heading));
    if (off > 1.2) return { taken: full, how: 'hit' };
    if (this.s.clock - this.guardSince <= PARRY_WINDOW) return { taken: 0, how: 'parry' };
    const shield = hasShield(this.s.hero);
    this.stamina -= (shield ? 15 : 25) * hit.power;
    this.staminaWait = 0.8;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.guard = false;
      this.stagger = 0.8;
      this.anim.stop();
      return { taken: 0, how: 'break' };
    }
    return { taken: shield ? 0 : Math.floor(full / 2), how: 'block' };
  }

  // ---------- lock-on ----------

  /** the targets in range when Z was first pressed, in order: Z walks through them, then lets go */
  private cycle: LockTarget[] = [];

  /**
   * Z: nothing locked → lock on to the first (nearest, most central) target. Locked → the next target in range;
   * after the last one, let go of everything (the next Z starts again from the first).
   */
  toggleLock() {
    if (!this.target) {
      this.cycle = this.candidates();
      this.target = this.cycle[0] ?? null;
      if (!this.target) this.s.say('Nothing to lock on to here.', 1.2);
      else {
        this.hint = null;
        this.s.lockedOn(this.target);
      }
      return;
    }
    // the next one in the list that is still there and in range
    const i = this.cycle.findIndex((c) => sameTarget(c, this.target));
    // (by distance only: the camera has turned to the current target, so the others may be off to the side)
    const h = this.s.heroState;
    const near = (c: LockTarget) => {
      const p = this.targetPos(c);
      return !!p && Math.hypot(p[0] - h.x, p[2] - h.z) <= LOCK_RANGE;
    };
    const next = this.cycle.slice(i + 1).find(near);
    if (!next) {
      this.target = null;
      this.cycle = [];
      return;
    }
    this.target = next;
    this.s.lockedOn(next);
  }

  /** Tab while locked: the same as Z (the next target; after the last, let go) */
  cycleLock() {
    this.toggleLock();
  }

  /** neighbours (foes to fight, people to talk to), objects with health and assets that can be locked on, in range and in front of the camera */
  candidates(): LockTarget[] {
    const h = this.s.heroState;
    const camDir = this.s.camYaw + Math.PI;
    const out: { t: LockTarget; score: number }[] = [];
    const consider = (t: LockTarget, x: number, z: number) => {
      const d = Math.hypot(x - h.x, z - h.z);
      if (d > LOCK_RANGE || d < 0.3) return;
      const off = Math.abs(angleDiff(Math.atan2(x - h.x, z - h.z), camDir));
      if (off > 1.3) return;
      out.push({ t, score: d + off * 4 });
    };
    for (const n of this.s.world.npcs) consider({ kind: 'npc', id: n.id }, n.state.x, n.state.z);
    for (const i of this.s.world.instances) {
      if (!i.def.health && !i.def.lockOn) continue;
      const c = this.s.instanceCenter(i);
      if (c) consider({ kind: 'inst', id: i.inst.id }, c[0], c[2]);
    }
    return out.sort((a, b) => a.score - b.score).map((o) => o.t);
  }

  /** where the target is now (null: it is gone: defeated, broken or out of reach) */
  targetPos(t: LockTarget | null = this.target): [number, number, number] | null {
    if (!t) return null;
    if (t.kind === 'npc') {
      const n = this.s.world.npcs.find((x) => x.id === t.id);
      return n ? [n.state.x, n.state.y + 1.2, n.state.z] : null;
    }
    const i = this.s.world.instances.find((x) => x.inst.id === t.id);
    if (!i || (this.s.health.peek(`i:${i.inst.id}`)?.hp ?? 1) <= 0) return null;
    return this.s.instanceCenter(i);
  }

  /** where the lock-on arrow's tip goes: just over the target's head, or over the top of an object */
  markerPos(t: LockTarget | null): [number, number, number] | null {
    if (!t) return null;
    const p = this.targetPos(t);
    if (!p) return null;
    if (t.kind === 'npc') {
      const n = this.s.world.npcs.find((x) => x.id === t.id);
      return n ? [n.state.x, n.state.y + 4.6, n.state.z] : null;
    }
    const i = this.s.world.instances.find((x) => x.inst.id === t.id);
    const top = i ? this.s.instanceTop(i) : null;
    return [p[0], (top ?? p[1]) + 0.5, p[2]];
  }

  /** keeps the hero facing the target and the camera behind them; lets go when it is gone or far */
  stepLock() {
    const p = this.targetPos();
    if (!p) {
      this.target = null;
      return;
    }
    const h = this.s.heroState;
    const d = Math.hypot(p[0] - h.x, p[2] - h.z);
    if (d > LOCK_RELEASE) {
      this.target = null;
      return;
    }
    const face = Math.atan2(p[0] - h.x, p[2] - h.z);
    if (!this.move || this.move.kind === 'hop' || this.move.kind === 'flip') h.heading = face;
    // the camera turns (smoothly) to look past the hero at the target
    const want = face + Math.PI;
    this.s.camYaw += angleDiff(want, this.s.camYaw) * 0.15;
  }

  /** each frame while nothing is locked: the best thing to lock on to, for the marker that says Z will work */
  stepHint() {
    if (this.target || this.s.over) {
      this.hint = null;
      return;
    }
    const best = this.candidates()[0] ?? null;
    // the arrow stays on what it shows while that is still near and roughly in front (no flicker at the edge)
    this.hint = best ?? (this.hint && this.stillInView(this.hint) ? this.hint : null);
  }

  /** a target still within range and not behind the camera */
  private stillInView(t: LockTarget): boolean {
    const p = this.targetPos(t);
    if (!p) return false;
    const h = this.s.heroState;
    if (Math.hypot(p[0] - h.x, p[2] - h.z) > LOCK_RANGE) return false;
    return Math.abs(angleDiff(Math.atan2(p[0] - h.x, p[2] - h.z), this.s.camYaw + Math.PI)) <= 1.8;
  }

  /** the neighbour locked on to (T talks to them), if any */
  lockedNpc(): Npc | null {
    const t = this.target;
    return t?.kind === 'npc' ? (this.s.world.npcs.find((n) => n.id === t.id) ?? null) : null;
  }

  stunNpc(n: Npc, seconds: number) {
    if (seconds > 0) this.stunned.set(n.id, Math.max(this.stunned.get(n.id) ?? 0, this.s.clock + seconds));
  }

  isStunned(n: Npc) {
    return (this.stunned.get(n.id) ?? 0) > this.s.clock;
  }
}

export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const sameTarget = (a: LockTarget, b: LockTarget | null) => !!b && a.kind === b.kind && a.id === b.id;

export type { DamageType };
