import type { BodyMove } from '../../core/character/moves';
import type { DamageType } from '../../core/combat/damage';
import type { Enemy, EnemyStyle } from '../../core/combat/enemy';
import type { AttackAs } from '../character/attack-poses';
import type { HeroState, Npc } from '../legacy/runtime-modules';
import type { FoeShotKind } from './foe-shots';

/**
 * P9c: neighbours that fight the hero (a character with `enemy`). Out of sight they wander like any neighbour;
 * in sight they walk over, telegraph a swing (arm up, a red “!” over the head) and hit through the hero's guard
 * rules (block, parry, dodge). Everything here is for this play only.
 *
 * Step 14a: the built-in brains, one for each kind of fighter (its style):
 * - melee: walks over and swings; one that breathes fire (a fire melee: Cinderjaw) charges from afar and, close,
 *   breathes a cone of flame that burns what it reaches (a shield held to it blocks it).
 * - knight (Rattlebones): circles at the edge of its reach, its shield to you; your swing at its front is blocked
 *   and answered at once (a counter); it steps in to strike and back out after.
 * - popup (Pebblespout; Finspitter in water): hidden underground (or under the water), it comes up facing you,
 *   spits a rock (a fireball) on an arc that lands where you are, and ducks back down; close by it stays down. It
 *   can only be hit while up, and a rock bounced back off your shield fells it.
 * - turret (Watcher Eye): stays put, sweeps its gaze; seeing you it charges and fires a beam that walls and a held
 *   shield stop, tracking you slowly.
 * - swarm and flyer (Flitterwings): fly, flitter about, circle over you and swoop down to bite; a fire bat's bite
 *   sets you alight, an ice bat's freezes you a moment.
 * - ambusher (Threadback): hangs high on a thread; passing under it, it drops on you, bites, turns slowly on the
 *   ground (its front is armoured: get behind it) and climbs back up.
 * - ghost (Lanternwisp): fades out, drifts round behind you and fades in to strike; faded, it cannot be hit or
 *   locked on to, except through the Lens of Truth.
 * - pack (Howler): howls to call the others, and the pack circles you, one striking at a time; it jumps back
 *   from a swing that comes at it from the front.
 * - shooter: keeps its distance and shoots (a rock, or a fireball for fire).
 * - boss: walks over and swings (its phases come in step 14a-2).
 */
export type EnemyHost = {
  readonly heroState: HeroState;
  readonly clock: number;
  /** the hero cannot be fought now (game over, a cinematic, talking…) */
  calm(): boolean;
  enemyOf(n: Npc): Enemy | null;
  isStunned(n: Npc): boolean;
  /** the swing lands: hurts the hero (through guard, parry, dodge) */
  hitHero(n: Npc, power: number, type: DamageType, attack?: string): void;
  /** step 11, 4a: how far its body reaches out sideways (a big spider strikes from further away) */
  radiusOf(n: Npc): number;
  /** step 11, 4a: the hero is making noise (running, fighting): heard within an enemy's hearing */
  heroLoud(): boolean;
  /**
   * step 14a: where its mouth (or eye) is: how far in front of its middle its front is, and how high its head is
   * (a long tail is not its reach)
   */
  mouthOf?(n: Npc): { front: number; height: number };
  /** step 14a: the hero is shoved along the ground (out from under a spider that dropped on it) */
  pushHero?(dx: number, dz: number): void;
  /** step 14a: the hero is swinging now (a knight blocks and counters it, a pack hunter jumps back from it) */
  heroAttacking?(): boolean;
  /** step 14a: something burns or freezes the hero, or a beam or breath hits it: what the guard made of it */
  harmHero?(
    n: Npc,
    power: number,
    type: DamageType,
    from: [number, number],
    then?: 'burn' | 'freeze',
    attack?: string,
  ): 'hit' | 'block' | 'parry' | 'dodge' | 'break';
  /** step 14a: v68's collision at a point (flight, a drop) */
  clear?(x: number, y: number, z: number): boolean;
  /** step 14a: the surface of the water at a point, if there is water there */
  waterTop?(x: number, z: number): number | null;
  /** step 14a: where a beam from `from` toward `to` first meets a wall (0…1 along it), 1 when it does not */
  sightLine?(from: [number, number, number], to: [number, number, number]): number;
  /** step 14a: the Lens of Truth is up */
  lensOn?(): boolean;
  /** step 14a: a shot leaves `from` for `at` */
  shoot?(n: Npc, kind: FoeShotKind, from: [number, number, number], at: [number, number, number], power?: number): void;
  /** step 14a: one of a body's moves (roar, charge, flap…) */
  move?(n: Npc, kind: BodyMove): void;
  /** step 14a: things burn where a breath of fire reaches */
  flame?(at: [number, number, number], r: number): void;
  effect?(kind: 'fire' | 'dust' | 'splash' | 'sparks' | 'frost' | 'vanish', at: [number, number, number]): void;
  sound?(id: 'roar' | 'whoosh' | 'splash' | 'zap' | 'fire' | 'flap' | 'hiss', at: [number, number, number]): void;
  log?(text: string): void;
  /**
   * Milestone 3b (B5a): a hook answered by a behaviour on this enemy (its brain's decision: canSee, canAttack,
   * attackPower, shouldFlee, nextState, and its template's), or base
   */
  ask?<V>(n: Npc, hook: string, payload: Record<string, unknown>, base: V): V;
  /** Milestone 3b (B5a): its brain went from one state to another (On state change) */
  onState?(n: Npc, from: string, to: string): void;
};

/** Milestone 3b (B5a): the states a brain can be in (what nextState may answer) */
export const BRAIN_STATES = [
  'idle',
  'chase',
  'windup',
  'back',
  'hidden',
  'rise',
  'up',
  'spit',
  'duck',
  'circle',
  'swoop',
  'climb',
  'hang',
  'drop',
  'ground',
  'fadeout',
  'faded',
  'fadein',
  'charge',
  'beam',
  'breathe',
  'rush',
  'counter',
  'hop',
  'flee',
] as const;
const SHOT_KINDS = ['rock', 'fireball'] as const;
/** the ones that stay put (they do not run): a turret, a pop-up, a hanging spider */
const STAYS = new Set<EnemyStyle>(['turret', 'popup', 'ambusher']);

type Phase =
  | 'idle'
  | 'chase'
  | 'windup'
  | 'back'
  | 'hidden'
  | 'rise'
  | 'up'
  | 'spit'
  | 'duck'
  | 'circle'
  | 'swoop'
  | 'climb'
  | 'hang'
  | 'drop'
  | 'ground'
  | 'fadeout'
  | 'faded'
  | 'fadein'
  | 'charge'
  | 'beam'
  | 'breathe'
  | 'rush'
  | 'counter'
  | 'hop'
  | 'flee';

type Brain = {
  phase: Phase;
  t: number;
  cooldown: number;
  /** where it was put (a turret's facing, a thread's anchor, a bat's home) */
  home?: { x: number; y: number; z: number; heading: number };
  /** a pack hunter's place round the hero (radians), a bat's circling angle */
  angle?: number;
  /** a flyer's vertical speed, a dropping spider's fall speed */
  vy?: number;
  /** the strike already landed this time (a breath, a beam, a swoop) */
  landed?: boolean;
  /** shots left in this pop-up */
  shots?: number;
  /** it saw the hero (and howled, or called the others) */
  seen?: boolean;
  /** Milestone 3b (B5a): the attack it is making now (canAttack, attackPower) */
  attack?: string;
};

/** how an enemy shows now (drawn and hit by): sunk underground or under water, faded out, a beam, a breath */
export type Look = {
  /** 0 up … 1 down out of sight (a pop-up under the ground, a Finspitter under the water) */
  sink: number;
  /** 1 seen … 0 not seen (a ghost faded out) */
  fade: number;
  /** a beam from its eye (a turret): from, to, and 0…1 charged (1: firing) */
  beam: { from: [number, number, number]; to: [number, number, number]; power: number } | null;
  /** a breath of fire: where from, which way, how far, 0…1 how strong */
  breath: { from: [number, number, number]; dir: [number, number, number]; reach: number; k: number } | null;
  /** the thread it hangs from (a ceiling spider): its top */
  thread: [number, number, number] | null;
};

const still = { x: 0, z: 0, run: false, jump: false, vertical: 0 };
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// the brains' numbers (studs, seconds)
const POP_RISE = 0.45;
const POP_DUCK = 0.35;
/** a pop-up stays down while the hero is this close (it waits for you to back off) */
const POP_SHY = 3.2;
const BEAM_CHARGE = 0.8;
const BEAM_FIRE = 0.7;
const BEAM_REACH = 16;
/** a turret's gaze turns this fast while it charges and fires (radians a second): it can be outrun */
const BEAM_TRACK = 0.9;
const BREATH_REACH = 5;
const BREATH_CONE = 0.45;
const BREATH_TIME = 1.1;
const FLY_HEIGHT = 2.6;
const SWOOP_TIME = 0.55;
const THREAD_HEIGHT = 5;
const DROP_G = 30;
const GROUND_TIME = 2.6;
const CLIMB_SPEED = 3;
const GHOST_SEEN = 2.4;
const GHOST_HIDDEN = 2.6;
const GHOST_FADE = 0.5;
const PACK_RING = 4.6;
const KNIGHT_RING = 0.9;

export class Enemies {
  private brains = new Map<number, Brain>();
  private looks = new Map<number, Look>();
  /** a pack's turn: which hunter may strike now (the others circle) */
  private packTurn: { id: number; until: number } | null = null;

  constructor(private readonly host: EnemyHost) {}

  /** true while this neighbour is fighting (it is moved here, not by the wandering of v68 neighbours) */
  engaged(n: Npc): boolean {
    const b = this.brains.get(n.id);
    if (!b) return false;
    // these are always moved here: flying, hanging, hidden or fading (v68 would walk them on the ground)
    const st = this.host.enemyOf(n)?.style;
    if (st === 'swarm' || st === 'flyer' || st === 'ambusher' || st === 'popup' || st === 'ghost' || st === 'turret')
      return true;
    return b.phase !== 'idle';
  }

  /** the swing is coming: the tell to guard or dodge */
  windingUp(n: Npc): boolean {
    const p = this.brains.get(n.id)?.phase;
    return p === 'windup' || p === 'spit' || p === 'charge' || p === 'counter';
  }

  /** step 14a: how it shows now (null: as ever) */
  look(n: Npc): Look | null {
    return this.looks.get(n.id) ?? null;
  }

  /** step 14a: the beams and breaths to draw */
  effects(): Look[] {
    return [...this.looks.values()].filter((l) => l.beam || l.breath || l.thread);
  }

  /**
   * step 14a: it can be hit and locked on to now: not sunk out of sight, not faded out (unless the Lens of Truth
   * is up)
   */
  hittable(n: Npc): boolean {
    const l = this.looks.get(n.id);
    if (!l) return true;
    if (l.sink > 0.6) return false;
    if (l.fade < 0.5 && !this.host.lensOn?.()) return false;
    return true;
  }

  reset() {
    this.brains.clear();
    this.looks.clear();
    this.packTurn = null;
  }

  private lookOf(n: Npc): Look {
    let l = this.looks.get(n.id);
    if (!l) {
      l = { sink: 0, fade: 1, beam: null, breath: null, thread: null };
      this.looks.set(n.id, l);
    }
    return l;
  }

  step(npcs: readonly Npc[], dt: number) {
    const h = this.host.heroState;
    const calm = this.host.calm();
    for (const n of npcs) {
      const e = this.host.enemyOf(n);
      if (!e) continue;
      let b = this.brains.get(n.id);
      const s = n.state;
      if (!b) {
        b = { phase: 'idle', t: 0, cooldown: 0, home: { x: s.x, y: s.y, z: s.z, heading: s.heading } };
        this.brains.set(n.id, b);
        this.born(n, e, b);
      }
      b.cooldown = Math.max(0, b.cooldown - dt);
      // the swing animation runs down (v68 only does this for the hero)
      const st = s as unknown as { attack?: number };
      if (st.attack) st.attack = Math.max(0, st.attack - dt);
      const style = this.styleOf(e);
      const dx = h.x - s.x;
      const dz = h.z - s.z;
      const d = Math.hypot(dx, dz);
      const face = Math.atan2(dx, dz);
      const away = calm || d > e.sight * 1.3 || Math.abs(h.y - s.y) > (style === 'ambusher' ? 9 : 6);
      // stunned: it stops where it is (a flyer drops a little, a pop-up stays up: hit it now)
      if (this.host.isStunned(n) && !away) {
        if (style === 'swarm' || style === 'flyer') this.flyTo(n, s.x, s.z, this.groundY(n) + 0.8, 0, dt);
        else if (style !== 'ambusher' || b.phase === 'ground') n.controller.step(still, dt, 0);
        continue;
      }
      const was = b.phase;
      // Milestone 3b (B5a): its behaviour may send it running (EnemyBrain.shouldFlee): not the ones that stay put
      if (!away && !STAYS.has(style) && this.ask(n, 'shouldFlee', { distance: d }, false))
        this.flee(n, e, b, style, d, dt);
      else {
        if (b.phase === 'flee')
          b.phase = style === 'knight' || style === 'flyer' || style === 'swarm' ? 'circle' : 'chase';
        this.think(n, e, b, style, d, face, dt, away, npcs);
      }
      // Milestone 3b (B5a): a change of state: its behaviour may choose another (Brain.nextState), and hears of it
      if (b.phase !== was) {
        const to = this.ask(n, 'nextState', { from: was, to: b.phase }, b.phase as string);
        if (to !== b.phase && (BRAIN_STATES as readonly string[]).includes(to)) b.phase = to as Phase;
        if (b.phase !== was) this.host.onState?.(n, was, b.phase);
      }
    }
    // a pack's turn passes on when it runs out
    if (this.packTurn && this.packTurn.until < this.host.clock) this.packTurn = null;
  }

  /** Milestone 3b (B5a): one step of its template's brain (the style's own code) */
  private think(
    n: Npc,
    e: Enemy,
    b: Brain,
    style: EnemyStyle,
    d: number,
    face: number,
    dt: number,
    away: boolean,
    npcs: readonly Npc[],
  ) {
    switch (style) {
      case 'popup':
        this.popup(n, e, b, d, face, dt, away);
        break;
      case 'turret':
        this.turret(n, e, b, d, face, dt, away);
        break;
      case 'swarm':
      case 'flyer':
        this.flyer(n, e, b, d, face, dt, away);
        break;
      case 'ambusher':
        this.ambusher(n, e, b, d, face, dt, away);
        break;
      case 'ghost':
        this.ghost(n, e, b, d, face, dt, away);
        break;
      default:
        if (away) {
          if (b.phase !== 'idle') this.lookOf(n).breath = null;
          b.phase = 'idle';
          return;
        }
        if (style === 'knight') this.knight(n, e, b, d, face, dt, npcs);
        else if (style === 'pack') this.pack(n, e, b, d, face, dt, npcs);
        else if (style === 'shooter') this.shooter(n, e, b, d, face, dt, npcs);
        else if (style === 'melee' && e.type === 'fire') this.firebreather(n, e, b, d, face, dt, npcs);
        else this.melee(n, e, b, d, face, dt, npcs);
    }
  }

  /** Milestone 3b (B5a): running from the hero (its behaviour said so) */
  private flee(n: Npc, e: Enemy, b: Brain, style: EnemyStyle, d: number, dt: number) {
    const s = n.state;
    const h = this.host.heroState;
    b.phase = 'flee';
    this.lookOf(n).breath = null;
    const away = Math.atan2(s.x - h.x, s.z - h.z);
    if (style === 'swarm' || style === 'flyer')
      this.flyTo(n, s.x + Math.sin(away) * 3, s.z + Math.cos(away) * 3, h.y + FLY_HEIGHT + 1.5, 4.2 * e.speed, dt);
    else this.walk(n, s.x - h.x, s.z - h.z, 0.6 * e.speed, dt);
    s.heading = away;
    void d;
  }

  /** Milestone 3b (B5a): a decision its behaviour may make (a hook), or the engine's own */
  private ask<V>(n: Npc, hook: string, payload: Record<string, unknown>, base: V): V {
    return this.host.ask ? this.host.ask(n, hook, payload, base) : base;
  }

  /** Milestone 3b (B5a): it may start this attack now (EnemyBrain.canAttack) */
  private may(n: Npc, attack: string, d: number): boolean {
    return this.ask(n, 'canAttack', { attack, distance: d }, true);
  }

  /** Milestone 3b (B5a): how hard this attack lands (EnemyBrain.attackPower) */
  private pow(n: Npc, attack: string, power: number): number {
    return Math.max(0, this.ask(n, 'attackPower', { attack, power }, power));
  }

  /** Milestone 3b (B5a): what it shoots (PopUp, Shooter: shotKind) */
  private shotOf(n: Npc, e: Enemy): FoeShotKind {
    const base = e.type === 'fire' ? 'fireball' : 'rock';
    const k = this.ask(n, 'shotKind', {}, base as string);
    return ((SHOT_KINDS as readonly string[]).includes(k) ? k : base) as FoeShotKind;
  }

  /** which brain it runs */
  private styleOf(e: Enemy): EnemyStyle {
    return e.style ?? 'melee';
  }

  /** its first moment: a hanging spider goes up its thread, a pop-up starts hidden */
  private born(n: Npc, e: Enemy, b: Brain) {
    const style = this.styleOf(e);
    const l = this.lookOf(n);
    if (style === 'ambusher') {
      b.phase = 'hang';
      n.state.y = b.home!.y + THREAD_HEIGHT;
      l.thread = [n.state.x, b.home!.y + THREAD_HEIGHT + 3, n.state.z];
    } else if (style === 'popup') {
      b.phase = 'hidden';
      l.sink = 1;
      b.t = 0.5;
    } else if (style === 'swarm' || style === 'flyer') {
      b.angle = (n.id * 2.39996) % (Math.PI * 2);
      b.vy = 0;
    }
  }

  // ---------- the plain brain: walk over, wind up, swing (and the others' shared parts) ----------

  private melee(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, npcs: readonly Npc[]) {
    const s = n.state;
    const dx = this.host.heroState.x - s.x;
    const dz = this.host.heroState.z - s.z;
    if (b.phase === 'idle') {
      if (!this.notices(n, e, d, face)) return;
      b.phase = 'chase';
      // a pack hunter calls the others near it
      if (e.wits === 'pack' && this.ask(n, 'callsPack', {}, true)) this.callPack(npcs, n);
    }
    const reach = this.reachOf(n, e);
    if (b.phase === 'back') {
      // a smart fighter steps back after its swing, out of reach for a moment
      b.t -= dt;
      this.walk(n, -dx, -dz, 0.35 * e.speed, dt);
      s.heading = face;
      if (b.t <= 0) b.phase = 'chase';
      return;
    }
    if (b.phase === 'windup') return this.windup(n, e, b, d, face, dt, reach);
    // chasing: walk to the hero, then wind up a swing
    if (d <= reach) {
      n.controller.step(still, dt, 0);
      s.heading = face;
      if (b.cooldown <= 0) this.startSwing(n, e, b, e.windup);
      return;
    }
    this.walk(n, dx, dz, 0.42 * e.speed, dt);
    s.heading = face;
  }

  private reachOf(n: Npc, e: Enemy) {
    return e.reach + Math.max(0, this.frontOf(n) - 0.6);
  }

  /** how far its front is from its middle (its reach starts there) */
  private frontOf(n: Npc) {
    return this.host.mouthOf?.(n).front ?? this.host.radiusOf(n);
  }

  /** its mouth (or eye), in the world, a little out in front */
  private mouth(n: Npc, out = 0.3): [number, number, number] {
    const s = n.state;
    const m = this.host.mouthOf?.(n) ?? { front: this.host.radiusOf(n), height: this.host.radiusOf(n) + 1.4 };
    return [s.x + Math.sin(s.heading) * (m.front + out), s.y + m.height, s.z + Math.cos(s.heading) * (m.front + out)];
  }

  /** the swing begins: the arm goes up (a body's strike) for `windup` seconds */
  private startSwing(n: Npc, e: Enemy, b: Brain, windup: number, attack = 'swing'): boolean {
    // Milestone 3b (B5a): its behaviour may hold the attack back (EnemyBrain.canAttack)
    const d = Math.hypot(this.host.heroState.x - n.state.x, this.host.heroState.z - n.state.z);
    if (!this.may(n, attack, d)) {
      b.cooldown = Math.max(b.cooldown, 0.4);
      return false;
    }
    b.attack = attack;
    b.phase = 'windup';
    b.t = windup;
    const held = String(n.profile.held ?? 'None');
    // a beast of the pack pounces; one with a weapon swings it; the rest claw
    const as: AttackAs = this.styleOf(e) === 'pack' ? 'pounce' : held !== 'None' ? 'swing' : 'claw';
    tell(n, windup, 0.3, as, held);
    return true;
  }

  /** winding up: it turns to the hero; then the swing lands if the hero is still in reach and in front */
  private windup(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, reach: number, tick = true) {
    const s = n.state;
    if (tick) b.t -= dt;
    s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 4);
    n.controller.step(still, dt, 0);
    if (b.t > 0) return;
    if (d <= reach + 0.6 && Math.abs(angleDiff(face, s.heading)) < 1.2)
      this.host.hitHero(n, this.pow(n, b.attack ?? 'swing', e.power), e.type, b.attack ?? 'swing');
    b.phase = e.wits === 'smart' || this.styleOf(e) === 'knight' ? 'back' : 'chase';
    b.t = 0.7;
    b.cooldown = e.cooldown;
  }

  /** a step along the ground toward (x, z) (world), at a pace (v68's controller: collision and gravity) */
  private walk(n: Npc, x: number, z: number, k: number, dt: number) {
    const l = Math.hypot(x, z);
    if (l < 1e-4) {
      n.controller.step(still, dt, 0);
      return;
    }
    n.controller.step({ x: (x / l) * k, z: -(z / l) * k, run: false, jump: false, vertical: 0 }, dt, 0);
  }

  // ---------- knight: circles with its shield up, blocks and counters ----------

  private knight(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, npcs: readonly Npc[]) {
    const s = n.state;
    const h = this.host.heroState;
    if (b.phase === 'idle') {
      if (!this.notices(n, e, d, face)) return;
      b.phase = 'circle';
      b.angle = Math.random() < 0.5 ? 1 : -1;
      if (e.wits === 'pack' && this.ask(n, 'callsPack', {}, true)) this.callPack(npcs, n);
    }
    const reach = this.reachOf(n, e);
    if (b.phase === 'windup' || b.phase === 'counter') return this.windup(n, e, b, d, face, dt, reach);
    if (b.phase === 'back') {
      b.t -= dt;
      this.walk(n, s.x - h.x, s.z - h.z, 0.5 * e.speed, dt);
      s.heading = face;
      if (b.t <= 0) b.phase = 'circle';
      return;
    }
    // the hero swings at its front while close: blocked (its shield takes it: its sides say so), then a quick
    // counter
    const front = Math.abs(angleDiff(Math.atan2(h.x - s.x, h.z - s.z), s.heading)) < 0.9;
    if (
      this.host.heroAttacking?.() &&
      d <= reach + 1.2 &&
      front &&
      b.cooldown <= e.cooldown * 0.5 &&
      // Milestone 3b (B5a): Knight.shouldCounter
      this.ask(n, 'shouldCounter', { distance: d }, true) &&
      this.startSwing(n, e, b, 0.28, 'counter')
    ) {
      b.phase = 'counter';
      this.host.log?.(`${n.profile.name} blocks and counters`);
      return;
    }
    // at the edge of its reach, it circles (shield toward you); now and then it steps in and strikes
    s.heading = face;
    const ring = reach + KNIGHT_RING;
    const side = b.angle ?? 1;
    const tx = -(h.z - s.z) * side;
    const tz = (h.x - s.x) * side;
    const radial = d - ring;
    if (b.cooldown <= 0 && d <= reach + 0.3) return this.startSwing(n, e, b, e.windup);
    if (b.cooldown <= 0) {
      // step in to strike
      this.walk(n, h.x - s.x, h.z - s.z, 0.5 * e.speed, dt);
      return;
    }
    const dl = d || 1;
    const rx = ((h.x - s.x) / dl) * radial * 1.2;
    const rz = ((h.z - s.z) / dl) * radial * 1.2;
    this.walk(n, tx / dl + rx, tz / dl + rz, 0.32 * e.speed, dt);
    // now and then it turns the other way round
    if (Math.random() < dt * 0.25) b.angle = -side;
  }

  // ---------- pop-up: hides, comes up to spit, ducks ----------

  private popup(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, away: boolean) {
    const s = n.state;
    const l = this.lookOf(n);
    const water = this.host.waterTop?.(s.x, s.z) ?? null;
    if (water === null) n.controller.step(still, dt, 0);
    const h = this.host.heroState;
    b.t -= dt;
    switch (b.phase) {
      case 'hidden':
      case 'idle': {
        l.sink = 1;
        b.phase = 'hidden';
        // it waits under until the hero is in sight, but not right on top of it
        if (b.t > 0 || away || d < POP_SHY || !this.notices(n, e, d, face)) return;
        b.phase = 'rise';
        b.t = POP_RISE;
        // Milestone 3b (B5a): PopUp.spits: how many shots this time up
        b.shots = Math.max(1, Math.min(10, Math.round(this.ask(n, 'spits', {}, 1 + (Math.random() < 0.5 ? 1 : 0)))));
        s.heading = face;
        this.host.effect?.(water !== null ? 'splash' : 'dust', [s.x, water ?? s.y, s.z]);
        if (water !== null) this.host.sound?.('splash', [s.x, water, s.z]);
        return;
      }
      case 'rise':
        l.sink = Math.max(0, b.t / POP_RISE);
        s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 6);
        if (b.t <= 0) {
          l.sink = 0;
          b.phase = 'up';
          b.t = 0.35;
        }
        return;
      case 'up':
        s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 6);
        if (d < POP_SHY * 0.8) return this.duck(n, b, water);
        if (b.t > 0) return;
        if (!this.may(n, 'spit', d)) {
          b.t = 0.4;
          return;
        }
        // a puff of its cheeks (the tell), then the spit
        b.phase = 'spit';
        b.t = e.windup;
        this.host.move?.(n, 'roar');
        tell(n, e.windup, 0.2, 'spit');
        return;
      case 'spit': {
        s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 6);
        if (b.t > 0) return;
        const mouth = this.mouth(n);
        this.host.shoot?.(n, this.shotOf(n, e), mouth, [h.x, h.y + 1.6, h.z], this.pow(n, 'spit', e.power));
        b.shots = (b.shots ?? 1) - 1;
        b.phase = 'up';
        b.t = 0.9;
        if ((b.shots ?? 0) <= 0) {
          b.t = 0.6;
          b.phase = 'duck';
          b.landed = false;
        }
        return;
      }
      case 'duck':
        // a moment up after its last shot (the time to hit it), then down
        if (!b.landed) {
          if (b.t > 0) return;
          b.landed = true;
          b.t = POP_DUCK;
          this.host.effect?.(water !== null ? 'splash' : 'dust', [s.x, water ?? s.y, s.z]);
          return;
        }
        l.sink = Math.min(1, 1 - b.t / POP_DUCK);
        if (b.t <= 0) {
          l.sink = 1;
          b.phase = 'hidden';
          b.t = 1.4 + Math.random() * 1.4;
        }
        return;
      default:
        b.phase = 'hidden';
    }
  }

  /** too close: straight down (it waits there for you to back off) */
  private duck(n: Npc, b: Brain, water: number | null) {
    b.phase = 'duck';
    b.landed = true;
    b.t = POP_DUCK;
    this.host.effect?.(water !== null ? 'splash' : 'dust', [n.state.x, water ?? n.state.y, n.state.z]);
  }

  // ---------- turret: watches, charges, fires a beam ----------

  private turret(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, away: boolean) {
    const s = n.state;
    const l = this.lookOf(n);
    const h = this.host.heroState;
    n.controller.step(still, dt, 0);
    const home = b.home!;
    const eye = this.mouth(n, 0.05);
    const chest: [number, number, number] = [h.x, h.y + 1.6, h.z];
    const seen = !away && this.notices(n, e, d, face) && (this.host.sightLine?.(eye, chest) ?? 1) > 0.97;
    b.t -= dt;
    if (b.phase === 'idle' || b.phase === 'chase') {
      l.beam = null;
      // its gaze sweeps from side to side about the way it was put
      s.heading = home.heading + Math.sin(this.host.clock * 0.6 + n.id) * 0.9;
      if (seen && b.cooldown <= 0 && this.may(n, 'beam', d)) {
        b.phase = 'charge';
        b.t = BEAM_CHARGE;
        b.landed = false;
        this.host.sound?.('zap', eye);
      }
      return;
    }
    // charging and firing: it turns toward the hero, slowly (you can outrun its gaze)
    // Milestone 3b (B5a): Turret.trackSpeed: how fast its gaze follows (radians a second)
    const track = Math.max(0, this.ask(n, 'trackSpeed', {}, BEAM_TRACK));
    const turn = Math.max(-track * dt, Math.min(track * dt, angleDiff(face, s.heading)));
    s.heading += turn;
    const dir: [number, number, number] = [
      Math.sin(s.heading),
      (chest[1] - eye[1]) / Math.max(1, d),
      Math.cos(s.heading),
    ];
    const far: [number, number, number] = [
      eye[0] + dir[0] * BEAM_REACH,
      eye[1] + dir[1] * BEAM_REACH,
      eye[2] + dir[2] * BEAM_REACH,
    ];
    const k = this.host.sightLine?.(eye, far) ?? 1;
    const end: [number, number, number] = [
      eye[0] + (far[0] - eye[0]) * k,
      eye[1] + (far[1] - eye[1]) * k,
      eye[2] + (far[2] - eye[2]) * k,
    ];
    if (b.phase === 'charge') {
      l.beam = { from: eye, to: end, power: 1 - Math.max(0, b.t) / BEAM_CHARGE };
      if (b.t <= 0) {
        b.phase = 'beam';
        b.t = BEAM_FIRE;
        this.host.sound?.('zap', eye);
      }
      return;
    }
    // firing: the beam hits the hero if it crosses the hero before a wall (once a beam)
    l.beam = { from: eye, to: end, power: 1 };
    if (!b.landed) {
      const along = (h.x - eye[0]) * dir[0] + (h.z - eye[2]) * dir[2];
      const reachK = along / BEAM_REACH;
      const px = eye[0] + dir[0] * along;
      const pz = eye[2] + dir[2] * along;
      const py = eye[1] + dir[1] * along;
      if (along > 0 && reachK <= k && Math.hypot(px - h.x, pz - h.z) < 0.7 && py > h.y - 0.2 && py < h.y + 3.4) {
        b.landed = true;
        const how =
          this.host.harmHero?.(n, this.pow(n, 'beam', e.power), e.type, [eye[0], eye[2]], undefined, 'beam') ?? 'hit';
        if (how === 'block' || how === 'parry') this.host.log?.('The shield blocked the beam');
      }
    }
    if (b.t <= 0) {
      b.phase = 'idle';
      b.cooldown = e.cooldown;
      l.beam = null;
    }
  }

  // ---------- fire melee: charges, breathes fire ----------

  private firebreather(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, npcs: readonly Npc[]) {
    const s = n.state;
    const l = this.lookOf(n);
    const h = this.host.heroState;
    // a tall beast's breath reaches further (down from its head to you)
    const R = BREATH_REACH + Math.max(0, (this.host.mouthOf?.(n).height ?? 2) - 2.5);
    if (b.phase === 'idle') {
      if (!this.notices(n, e, d, face)) return;
      b.phase = 'chase';
      this.host.move?.(n, 'roar');
      this.host.sound?.('roar', [s.x, s.y + 1, s.z]);
    }
    b.t -= dt;
    if (b.phase === 'breathe') {
      n.controller.step(still, dt, 0);
      // the head sweeps a little as it breathes
      s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 1.2);
      const mouth = this.mouth(n, 0.4);
      // aimed down from its head at the hero's chest (a tall beast breathes down on you)
      const dm = Math.max(1.5, Math.hypot(h.x - mouth[0], h.z - mouth[2]));
      const pitch = Math.max(-1.1, Math.min(0.2, Math.atan2(h.y + 1.4 - mouth[1], dm)));
      const dir: [number, number, number] = [
        Math.sin(s.heading) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(s.heading) * Math.cos(pitch),
      ];
      const u = 1 - b.t / BREATH_TIME;
      l.breath = { from: mouth, dir, reach: R * Math.min(1, u * 3), k: Math.min(1, u * 4, b.t * 4) };
      const off = Math.abs(angleDiff(Math.atan2(h.x - mouth[0], h.z - mouth[2]), s.heading));
      const dh = Math.hypot(h.x - mouth[0], h.y + 1.4 - mouth[1], h.z - mouth[2]);
      if (!b.landed && dh <= l.breath.reach + 0.4 && off < BREATH_CONE) {
        b.landed = true;
        const how =
          this.host.harmHero?.(n, this.pow(n, 'breath', e.power), 'fire', [mouth[0], mouth[2]], 'burn', 'breath') ??
          'hit';
        if (how === 'block' || how === 'parry') this.host.log?.('The shield held off the fire');
      }
      // flames along the breath (the particles), and what burns in front of it catches
      if (Math.random() < dt * 16) {
        const u = Math.random() * l.breath.reach;
        this.host.effect?.('fire', [mouth[0] + dir[0] * u, mouth[1] + dir[1] * u, mouth[2] + dir[2] * u]);
      }
      if (Math.random() < dt * 6)
        this.host.flame?.(
          [
            mouth[0] + dir[0] * l.breath.reach * 0.8,
            mouth[1] + dir[1] * l.breath.reach * 0.8,
            mouth[2] + dir[2] * l.breath.reach * 0.8,
          ],
          1.4,
        );
      if (b.t <= 0) {
        l.breath = null;
        b.phase = 'chase';
        b.cooldown = e.cooldown;
      }
      return;
    }
    if (b.phase === 'rush') {
      // a charge: fast and straight (it cannot turn much), a bite at its end
      this.walk(n, Math.sin(s.heading), Math.cos(s.heading), 1.3 * e.speed, dt);
      if (d <= this.reachOf(n, e) + 0.3 && !b.landed) {
        b.landed = true;
        if (Math.abs(angleDiff(face, s.heading)) < 0.9)
          this.host.hitHero(n, this.pow(n, 'charge', e.power), 'blunt', 'charge');
      }
      if (b.t <= 0) {
        b.phase = 'chase';
        b.cooldown = e.cooldown * 0.6;
      }
      return;
    }
    if (b.phase === 'windup') {
      // the breath's tell: a roar with the mouth open
      n.controller.step(still, dt, 0);
      s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 3);
      if (b.t <= 0) {
        b.phase = 'breathe';
        b.t = BREATH_TIME;
        b.landed = false;
        this.host.sound?.('fire', [s.x, s.y + 1, s.z]);
      }
      return;
    }
    s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 3);
    // how far the hero is from its mouth (a big lizard's mouth is well in front of its middle)
    const dm = d - this.frontOf(n);
    if (b.cooldown <= 0 && dm <= R - 0.5 && Math.abs(angleDiff(face, s.heading)) < 0.5 && this.may(n, 'breath', d)) {
      b.phase = 'windup';
      b.t = e.windup;
      this.host.move?.(n, 'roar');
      return;
    }
    if (
      b.cooldown <= 0 &&
      // Milestone 3b (B5a): Charger.shouldCharge (the engine: far enough for a run, near enough, facing the hero)
      this.ask(
        n,
        'shouldCharge',
        { distance: d },
        dm > R + 1 && dm < 10 && Math.abs(angleDiff(face, s.heading)) < 0.25,
      ) &&
      this.may(n, 'charge', d)
    ) {
      b.phase = 'rush';
      b.t = 1.1;
      b.landed = false;
      this.host.move?.(n, 'charge');
      return;
    }
    if (dm > 1) this.walk(n, h.x - s.x, h.z - s.z, 0.42 * e.speed, dt);
    else n.controller.step(still, dt, 0);
    void npcs;
  }

  // ---------- flyer: flitters, circles over the hero, swoops ----------

  private groundY(n: Npc): number {
    const c = this.host.clear;
    const s = n.state;
    if (!c) return s.y;
    let y = s.y;
    // down to what is under it (no lower than the map's floor)
    for (let i = 0; i < 40 && y > 0.4 && c(s.x, y - 0.2, s.z); i++) y -= 0.2;
    return Math.max(0.4, y);
  }

  /** a flyer moves itself (no gravity), stopping at walls */
  private flyTo(n: Npc, x: number, z: number, y: number, speed: number, dt: number) {
    const s = n.state;
    const c = this.host.clear;
    const dx = x - s.x;
    const dz = z - s.z;
    const dy = y - s.y;
    const dl = Math.hypot(dx, dz, dy);
    const step = speed > 0 ? Math.min(dl, speed * dt) : dl * Math.min(1, dt * 2);
    if (dl < 1e-3) return;
    const nx = s.x + (dx / dl) * step;
    const ny = s.y + (dy / dl) * step;
    const nz = s.z + (dz / dl) * step;
    if (!c || c(nx, s.y, s.z)) s.x = nx;
    if (!c || c(s.x, s.y, nz)) s.z = nz;
    if (!c || c(s.x, ny, s.z)) s.y = ny;
  }

  private flyer(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, away: boolean) {
    const s = n.state;
    const h = this.host.heroState;
    const home = b.home!;
    const sp = 4.2 * e.speed;
    b.t -= dt;
    b.angle = (b.angle ?? 0) + dt * (1.6 + 0.3 * Math.sin(this.host.clock * 1.7 + n.id));
    const flutter = Math.sin(this.host.clock * 7 + n.id) * 0.35;
    if (away || b.phase === 'idle') {
      // it flitters about where it lives
      if (!away && this.notices(n, e, d, face)) {
        b.phase = 'circle';
        // Milestone 3b (B5a): Flyer / Swarm.circleTime: how long it circles before it swoops
        b.t = Math.max(0, this.ask(n, 'circleTime', {}, 1 + Math.random()));
        this.host.sound?.('flap', [s.x, s.y + 1, s.z]);
      } else b.phase = 'idle';
      const r = 2.2;
      this.flyTo(
        n,
        home.x + Math.cos(b.angle) * r,
        home.z + Math.sin(b.angle) * r,
        home.y + FLY_HEIGHT + flutter,
        sp * 0.6,
        dt,
      );
      s.heading = Math.atan2(-Math.sin(b.angle), Math.cos(b.angle));
      return;
    }
    if (b.phase === 'circle') {
      // over the hero, round and round, erratic
      const r = 3 + Math.sin(this.host.clock * 2.3 + n.id) * 0.8;
      this.flyTo(n, h.x + Math.cos(b.angle) * r, h.z + Math.sin(b.angle) * r, h.y + FLY_HEIGHT + 0.6 + flutter, sp, dt);
      s.heading = face;
      if (b.t <= 0 && b.cooldown <= 0 && this.may(n, 'swoop', d)) {
        b.phase = 'swoop';
        b.t = SWOOP_TIME;
        b.landed = false;
        this.host.move?.(n, 'flap');
        this.host.sound?.('flap', [s.x, s.y + 1, s.z]);
        // the tell: a shriek and a beat of the wings before it drops
        // wings up through the dive (the tell); the blow is shown when it reaches the hero (below)
        tell(n, SWOOP_TIME, 0.3, 'swoop');
      }
      return;
    }
    if (b.phase === 'swoop') {
      // down at the hero's chest, fast
      this.flyTo(n, h.x, h.z, h.y + 1.6, sp * 2.4, dt);
      s.heading = face;
      const dy = Math.abs(s.y - (h.y + 1.6));
      if (!b.landed && d < 1.1 + this.frontOf(n) * 0.5 && dy < 1.4) {
        b.landed = true;
        // the wings sweep down and the claws strike as it reaches the hero
        tell(n, 0, 0.35, 'swoop');
        const then = e.type === 'fire' ? 'burn' : e.type === 'ice' ? 'freeze' : undefined;
        const p = this.pow(n, 'swoop', e.power);
        if (this.host.harmHero) this.host.harmHero(n, p, e.type, [s.x, s.z], then, 'swoop');
        else this.host.hitHero(n, p, e.type, 'swoop');
      }
      if (b.t <= 0 || b.landed) {
        b.phase = 'climb';
        b.t = 0.8;
      }
      return;
    }
    // back up after a swoop, away a little
    this.flyTo(n, s.x - Math.sin(face) * 2, s.z - Math.cos(face) * 2, h.y + FLY_HEIGHT + 1, sp * 1.2, dt);
    if (b.t <= 0) {
      b.phase = 'circle';
      b.t = Math.max(0, this.ask(n, 'circleTime', {}, 1.2 + Math.random() * 1.5));
      b.cooldown = e.cooldown;
    }
  }

  // ---------- ambusher: hangs on a thread, drops, bites, climbs back ----------

  private ambusher(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, away: boolean) {
    const s = n.state;
    const l = this.lookOf(n);
    const home = b.home!;
    const h = this.host.heroState;
    const top = home.y + THREAD_HEIGHT;
    l.thread = [home.x, top + 3, home.z];
    b.t -= dt;
    switch (b.phase) {
      case 'hang':
      case 'idle':
        b.phase = 'hang';
        s.x = home.x;
        s.z = home.z;
        s.y = top + Math.sin(this.host.clock * 1.3 + n.id) * 0.15;
        // it turns slowly as it hangs, and drops when the hero comes under it
        s.heading += dt * 0.4;
        if (
          !away &&
          // Milestone 3b (B5a): Ambusher.shouldDrop (the engine: the hero is under it)
          this.ask(
            n,
            'shouldDrop',
            { distance: Math.hypot(h.x - home.x, h.z - home.z) },
            Math.hypot(h.x - home.x, h.z - home.z) < 2.4 + this.frontOf(n) * 0.5 && h.y < top,
          ) &&
          this.may(n, 'drop', d)
        ) {
          b.phase = 'drop';
          b.vy = 0;
          s.heading = face;
          this.host.sound?.('hiss', [s.x, s.y, s.z]);
        }
        return;
      case 'drop': {
        b.vy = (b.vy ?? 0) - DROP_G * dt;
        const ny = s.y + b.vy * dt;
        const floor = home.y;
        s.y = Math.max(floor, ny);
        if (s.y <= floor + 0.01) {
          s.y = floor;
          this.host.effect?.('dust', [s.x, s.y, s.z]);
          // it landed on the hero: a bite, and the hero is knocked out from under its body
          const f = this.frontOf(n);
          const hd = Math.hypot(h.x - s.x, h.z - s.z);
          if (hd < f + 0.6) {
            const ux = hd > 0.05 ? (h.x - s.x) / hd : Math.sin(h.heading + Math.PI);
            const uz = hd > 0.05 ? (h.z - s.z) / hd : Math.cos(h.heading + Math.PI);
            this.host.pushHero?.(ux * (f + 0.9 - hd), uz * (f + 0.9 - hd));
            s.heading = Math.atan2(ux, uz);
            const p = this.pow(n, 'drop', e.power);
            if (this.host.harmHero) this.host.harmHero(n, p, e.type, [s.x, s.z], undefined, 'drop');
            else this.host.hitHero(n, p, e.type, 'drop');
            b.phase = 'ground';
            b.t = GROUND_TIME;
            b.cooldown = e.cooldown;
            return;
          }
          // a bite as it lands, if the hero is there
          if (!(d <= this.reachOf(n, e) + 0.4 && this.startSwing(n, e, b, 0.35, 'bite'))) b.phase = 'ground';
          if (b.phase === 'ground') b.t = GROUND_TIME;
        }
        return;
      }
      case 'windup':
        // (its clock already ran down above)
        this.windup(n, e, b, d, face, dt, this.reachOf(n, e), false);
        if (b.phase !== 'windup') {
          b.phase = 'ground';
          b.t = GROUND_TIME;
        }
        return;
      case 'ground':
        // on the ground it turns toward the hero slowly (its front is armoured: get round behind it)
        n.controller.step(still, dt, 0);
        s.heading = s.heading + Math.max(-1.1 * dt, Math.min(1.1 * dt, angleDiff(face, s.heading)));
        if (b.cooldown <= 0 && d <= this.reachOf(n, e) && Math.abs(angleDiff(face, s.heading)) < 0.6)
          return this.startSwing(n, e, b, e.windup);
        if (b.t <= 0) {
          b.phase = 'climb';
          this.host.sound?.('hiss', [s.x, s.y, s.z]);
        }
        return;
      case 'climb':
        s.x += (home.x - s.x) * Math.min(1, dt * 4);
        s.z += (home.z - s.z) * Math.min(1, dt * 4);
        s.y = Math.min(top, s.y + CLIMB_SPEED * dt);
        if (s.y >= top) {
          b.phase = 'hang';
          b.cooldown = e.cooldown;
        }
        return;
      default:
        b.phase = 'hang';
    }
  }

  // ---------- ghost: fades out, drifts behind, fades in to strike ----------

  private ghost(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, away: boolean) {
    const s = n.state;
    const l = this.lookOf(n);
    const h = this.host.heroState;
    b.t -= dt;
    // it floats (a lantern on the air): the controller only holds it to the ground
    if (away) {
      l.fade = Math.min(1, l.fade + dt);
      if (b.phase !== 'idle' && b.phase !== 'chase') b.phase = 'idle';
      n.controller.step(still, dt, 0);
      return;
    }
    switch (b.phase) {
      case 'idle':
        if (!this.notices(n, e, d, face)) {
          n.controller.step(still, dt, 0);
          return;
        }
        b.phase = 'chase';
        b.t = GHOST_SEEN;
        return;
      case 'chase': {
        l.fade = Math.min(1, l.fade + dt * 2);
        const reach = this.reachOf(n, e);
        s.heading = face;
        if (d <= reach && b.cooldown <= 0) return this.startSwing(n, e, b, e.windup);
        if (d > reach) this.walk(n, h.x - s.x, h.z - s.z, 0.42 * e.speed, dt);
        else n.controller.step(still, dt, 0);
        if (b.t <= 0) {
          b.phase = 'fadeout';
          b.t = GHOST_FADE;
          this.host.effect?.('vanish', [s.x, s.y + 1.5, s.z]);
        }
        return;
      }
      case 'windup':
        l.fade = 1;
        this.windup(n, e, b, d, face, dt, this.reachOf(n, e), false);
        if (b.phase !== 'windup') {
          b.phase = 'fadeout';
          b.t = GHOST_FADE;
        }
        return;
      case 'fadeout':
        n.controller.step(still, dt, 0);
        l.fade = Math.max(0.06, b.t / GHOST_FADE);
        if (b.t <= 0) {
          b.phase = 'faded';
          // Milestone 3b (B5a): Ghost.hiddenFor: how long it stays unseen
          b.t = Math.max(0.2, this.ask(n, 'hiddenFor', {}, GHOST_HIDDEN));
          b.angle = h.heading + Math.PI + (Math.random() - 0.5) * 1.2;
        }
        return;
      case 'faded': {
        // unseen, it drifts round to behind the hero
        l.fade = 0.06;
        const tx = h.x + Math.sin(b.angle ?? 0) * 2.6;
        const tz = h.z + Math.cos(b.angle ?? 0) * 2.6;
        if (Math.hypot(tx - s.x, tz - s.z) > 0.4) this.walk(n, tx - s.x, tz - s.z, 0.6 * e.speed, dt);
        else n.controller.step(still, dt, 0);
        s.heading = face;
        if (b.t <= 0) {
          b.phase = 'fadein';
          b.t = GHOST_FADE;
          this.host.effect?.('vanish', [s.x, s.y + 1.5, s.z]);
        }
        return;
      }
      case 'fadein':
        n.controller.step(still, dt, 0);
        s.heading = face;
        l.fade = Math.min(1, 1 - b.t / GHOST_FADE);
        if (b.t <= 0) {
          l.fade = 1;
          b.phase = 'chase';
          b.t = GHOST_SEEN;
          b.cooldown = 0;
        }
        return;
      default:
        b.phase = 'idle';
    }
  }

  // ---------- pack: howls, circles, takes turns, jumps back ----------

  private pack(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, npcs: readonly Npc[]) {
    const s = n.state;
    const h = this.host.heroState;
    if (b.phase === 'idle') {
      if (!this.notices(n, e, d, face)) return;
      b.phase = 'chase';
      if (!b.seen) {
        b.seen = true;
        // a howl: the others near it come
        this.host.move?.(n, 'roar');
        this.host.sound?.('roar', [s.x, s.y + 2, s.z]);
        this.host.log?.(`${n.profile.name} howls`);
        tell(n, 0.3, 0.9, 'howl');
      }
      if (this.ask(n, 'callsPack', {}, true)) this.callPack(npcs, n);
    }
    const reach = this.reachOf(n, e);
    if (b.phase === 'windup') return this.windup(n, e, b, d, face, dt, reach);
    if (b.phase === 'hop') {
      // a jump back from the hero's swing
      b.t -= dt;
      this.walk(n, s.x - h.x, s.z - h.z, 1.4 * e.speed, dt);
      s.heading = face;
      if (b.t <= 0) b.phase = 'chase';
      return;
    }
    if (b.phase === 'back') {
      b.t -= dt;
      this.walk(n, s.x - h.x, s.z - h.z, 0.6 * e.speed, dt);
      s.heading = face;
      if (b.t <= 0) b.phase = 'chase';
      return;
    }
    // a swing coming at it from the front, close: it jumps back (half the time)
    const front = Math.abs(angleDiff(Math.atan2(s.x - h.x, s.z - h.z), h.heading)) < 0.7;
    if (this.host.heroAttacking?.() && d <= reach + 1.4 && front && Math.random() < dt * 30) {
      b.phase = 'hop';
      b.t = 0.35;
      return;
    }
    // whose turn: one at a time strikes; the others hold a place on a ring round the hero
    const pack = npcs.filter((o) => this.host.enemyOf(o)?.style === 'pack' && this.brains.get(o.id)?.phase !== 'idle');
    if (!this.packTurn && b.cooldown <= 0) this.packTurn = { id: n.id, until: this.host.clock + 3 };
    const mine = this.packTurn?.id === n.id;
    if (mine) {
      s.heading = face;
      if (d <= reach) {
        n.controller.step(still, dt, 0);
        if (b.cooldown <= 0) {
          if (this.startSwing(n, e, b, e.windup, 'pounce'))
            this.packTurn = { id: n.id, until: this.host.clock + e.windup + 0.6 };
        }
        return;
      }
      this.walk(n, h.x - s.x, h.z - s.z, 0.5 * e.speed, dt);
      return;
    }
    // its place on the ring: spread round by the order of the pack, turning slowly
    const i = Math.max(0, pack.indexOf(n));
    const ang = (i / Math.max(1, pack.length)) * Math.PI * 2 + this.host.clock * 0.35;
    const tx = h.x + Math.sin(ang) * PACK_RING;
    const tz = h.z + Math.cos(ang) * PACK_RING;
    const dl = Math.hypot(tx - s.x, tz - s.z);
    if (dl > 0.5) this.walk(n, tx - s.x, tz - s.z, (dl > 3 ? 0.5 : 0.3) * e.speed, dt);
    else n.controller.step(still, dt, 0);
    s.heading = face;
  }

  // ---------- shooter: keeps its distance and shoots ----------

  private shooter(n: Npc, e: Enemy, b: Brain, d: number, face: number, dt: number, npcs: readonly Npc[]) {
    const s = n.state;
    const h = this.host.heroState;
    if (b.phase === 'idle') {
      if (!this.notices(n, e, d, face)) return;
      b.phase = 'chase';
      if (e.wits === 'pack' && this.ask(n, 'callsPack', {}, true)) this.callPack(npcs, n);
    }
    s.heading = face;
    b.t -= dt;
    if (b.phase === 'spit') {
      n.controller.step(still, dt, 0);
      if (b.t > 0) return;
      this.host.shoot?.(n, this.shotOf(n, e), this.mouth(n), [h.x, h.y + 1.6, h.z], this.pow(n, 'shot', e.power));
      b.phase = 'chase';
      b.cooldown = e.cooldown;
      return;
    }
    // Milestone 3b (B5a): Shooter.keepAway: how far from the hero it stays
    const want = Math.max(1, this.ask(n, 'keepAway', {}, Math.min(e.sight * 0.6, 8)));
    if (d < want - 1.5) this.walk(n, s.x - h.x, s.z - h.z, 0.4 * e.speed, dt);
    else if (d > want + 1.5) this.walk(n, h.x - s.x, h.z - s.z, 0.4 * e.speed, dt);
    else n.controller.step(still, dt, 0);
    if (b.cooldown <= 0 && d <= e.sight && this.may(n, 'shot', d)) {
      b.phase = 'spit';
      b.t = e.windup;
      tell(n, e.windup, 0.2, 'spit');
    }
  }

  /**
   * step 11, 4a: it sees the hero (within sight and its cone of view, which is all round unless set) or hears it
   * (running or fighting within its hearing)
   */
  private notices(n: Npc, e: Enemy, d: number, face: number): boolean {
    const cone = e.cone ?? 360;
    const base =
      !!(e.hearing && d <= e.hearing && this.host.heroLoud()) ||
      (d <= e.sight && (cone >= 360 || Math.abs(angleDiff(face, n.state.heading)) <= ((cone / 2) * Math.PI) / 180));
    // Milestone 3b (B5a): its behaviour may see more or less (EnemyBrain.canSee)
    return this.ask(n, 'canSee', { distance: d }, base);
  }

  /** step 11, 4a: the enemies within 12 studs of a pack hunter that saw the hero join the fight */
  private callPack(npcs: readonly Npc[], caller: Npc) {
    for (const o of npcs) {
      if (o === caller || !this.host.enemyOf(o)) continue;
      if (Math.hypot(o.state.x - caller.state.x, o.state.z - caller.state.z) > 12) continue;
      const b = this.brains.get(o.id) ?? { phase: 'idle' as const, t: 0, cooldown: 0, home: { ...o.state } };
      if (b.phase === 'idle') {
        b.phase = 'chase';
        b.seen = true;
      }
      this.brains.set(o.id, b);
    }
  }
}

/**
 * The tell and the blow: `windup` seconds of the tell (the arm drawn back, the body crouched), the blow lands at its
 * end, then `follow` seconds back to standing. The renderer times the body's move by these.
 */
function tell(n: Npc, windup: number, follow: number, as: AttackAs, weapon = 'None') {
  const dur = windup + follow;
  Object.assign(n.state, { attack: dur, attackDuration: dur, attackWeapon: weapon, attackHit: windup, attackAs: as });
}
