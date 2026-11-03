import { localToWorld } from '../../core/assets/expand';
import type { Asset } from '../../core/schema';
import type { HeroState } from '../legacy/runtime-modules';
import { type WindField, windAt } from '../physics/physics';
import { boxOf } from './puzzles';

/**
 * Step 12c-2: wind at play. Fans (assets with Wind) blow air straight ahead while they are on; a gust (the Gust leaf
 * swung) blows for a moment in front of the hero. Each blast is a box of moving air, cut short by the first wall in
 * its way, its speed falling off along it (windAt). What the air does to things is drag (physics.ts): the physics
 * engine pushes the loose things, the session pushes the hero and the others. Here: the fields, pinwheels (wind
 * switches) turned while the wind reaches them, and small flames (a lit torch stand) blown out.
 */
export type WindObject = {
  inst: { id: string; pos: [number, number, number]; rot: number; idBase: number };
  def: Asset;
  bricks: { x: number; y: number; z: number; type: string; rot?: number }[];
  state: string;
};

export type WindHost<T extends WindObject = WindObject> = {
  readonly heroState: HeroState;
  near(x: number, z: number, r: number): readonly T[];
  /** how far along a ray the first fixed solid thing is (a wall stops the wind), or null */
  wallAlong(from: [number, number, number], dir: [number, number], max: number): number | null;
  /** a pinwheel (a wind switch) the wind reaches now (true) or no longer reaches */
  blow(o: T, on: boolean): void;
  /** a lit torch stand's flame is blown out */
  blowOut(o: T): void;
  log(text: string): void;
};

/** at first: a fan's speed, reach and blast (studs a second; studs) */
export const FAN_SPEED = 16;
export const FAN_REACH = 16;
export const FAN_SIZE = 3;
/** a pinwheel turns in wind this fast; a small flame (a torch, a stick's) goes out in wind this fast */
export const PINWHEEL_SPEED = 3;
export const FLAME_OUT_SPEED = 7;
/** a pinwheel's sails turn this many radians a second for each stud a second of wind (tips 1.5 studs out, about half
 * the air's speed) */
const SPIN_TIP = 0.5 / 1.5;
/** fans are looked at again this often (seconds), and only this near the hero (studs) */
const FAN_EVERY = 0.1;
const FAN_RANGE = 64;

export type Gust = { field: WindField; t: number; life: number };

export class Wind<T extends WindObject = WindObject> {
  /** the wind blowing now: every fan that is on, and every gust */
  fields: WindField[] = [];
  /** the fans blowing now, with their field (for the renderer and the effects) */
  fans: { o: T; field: WindField }[] = [];
  private gusts: Gust[] = [];
  private clock = FAN_EVERY;
  private turning = new Set<string>();
  /** pinwheels spinning: how far round (radians) and how fast (radians a second), by id */
  readonly spins = new Map<string, { angle: number; omega: number }>();

  constructor(private readonly h: WindHost<T>) {}

  /** the wind there (studs a second, across and deep) */
  at(x: number, y: number, z: number): [number, number] {
    return windAt(this.fields, x, y, z);
  }

  /** how fast the wind blows there (studs a second) */
  speedAt(x: number, y: number, z: number): number {
    const [vx, vz] = this.at(x, y, z);
    return Math.hypot(vx, vz);
  }

  /** a gust for a moment (seconds): a swing of the Gust leaf */
  gust(field: WindField, life: number) {
    const reach = this.reachOf(field.from, field.dir, field.half, field.height, field.reach);
    this.gusts.push({ field: { ...field, reach }, t: 0, life });
    this.fields = [...this.fans.map((f) => f.field), ...this.gusts.map((g) => g.field)];
  }

  /** a fan's blast (null: it is not blowing now) */
  fieldOf(o: T): WindField | null {
    const w = o.def.wind;
    if (!w || (w.when && o.state !== w.when)) return null;
    const p0 = localToWorld(o.def, o.inst, w.at);
    const p1 = localToWorld(o.def, o.inst, [w.at[0], w.at[1], w.at[2] + 1]);
    const dx = Math.round(p1[0] - p0[0]);
    const dz = Math.round(p1[2] - p0[2]);
    if (Math.abs(dx) + Math.abs(dz) !== 1) return null;
    const height = w.height ?? FAN_SIZE;
    const max = w.reach ?? FAN_REACH;
    const half = (w.width ?? FAN_SIZE) / 2;
    return {
      from: [p0[0], p0[1], p0[2]],
      dir: [dx, dz],
      reach: this.reachOf([p0[0] + dx * 0.2, p0[1], p0[2] + dz * 0.2], [dx, dz], half, height, max) + 0.2,
      half,
      height,
      speed: w.speed ?? FAN_SPEED,
    };
  }

  /**
   * how far a blast gets before a wall stops it: rays along its middle and near both edges, at mid height; it goes
   * round a post (a ray past it gets on), and stops at a wall across it (every ray stops)
   */
  private reachOf(from: [number, number, number], dir: [number, number], half: number, height: number, max: number) {
    const side: [number, number] = [-dir[1], dir[0]];
    let best = 0;
    for (const k of [0, -0.8, 0.8]) {
      const o: [number, number, number] = [from[0] + side[0] * half * k, from[1] + height / 2, from[2] + side[1] * half * k];
      const d = this.h.wallAlong(o, dir, max);
      best = Math.max(best, d === null ? max : d);
    }
    return Math.max(0.5, best);
  }

  step(dt: number) {
    for (const g of this.gusts) g.t += dt;
    this.gusts = this.gusts.filter((g) => g.t < g.life);
    this.clock += dt;
    if (this.clock >= FAN_EVERY) {
      this.clock = 0;
      const s = this.h.heroState;
      const was = new Set(this.fans.map((f) => f.o.inst.id));
      this.fans = [];
      for (const o of this.h.near(s.x, s.z, FAN_RANGE)) {
        const field = this.fieldOf(o);
        if (field) this.fans.push({ o, field });
      }
      for (const f of this.fans) if (!was.has(f.o.inst.id)) this.h.log(`${f.o.def.name} is blowing`);
    }
    this.fields = [...this.fans.map((f) => f.field), ...this.gusts.map((g) => g.field)];
    this.stepWhatItTurns(dt);
  }

  /** pinwheels the wind reaches turn (on while it does, as their switch says); small flames in it go out */
  private stepWhatItTurns(dt: number) {
    const s = this.h.heroState;
    const near = this.fields.length ? this.h.near(s.x, s.z, FAN_RANGE) : [];
    const now = new Set<string>();
    const winded = new Set<string>();
    for (const o of near) {
      const b = boxOf(o.bricks as never);
      if (!b) continue;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const cy = ((b.y0 + b.y1) / 2) * 0.4;
      if (o.def.switch?.by === 'wind') {
        // anywhere on it the wind reaches (its sails)
        let v = 0;
        for (const y of [cy, b.y1 * 0.4 - 0.4, b.y0 * 0.4 + 0.4]) v = Math.max(v, this.speedAt(cx, y, cz));
        if (v >= PINWHEEL_SPEED) now.add(o.inst.id);
        if (v >= PINWHEEL_SPEED && !this.turning.has(o.inst.id)) this.h.blow(o, true);
        // its sails spin with the wind: their tips about half as fast as the air (a drag rotor), speeding up and
        // slowing down with their weight
        const sp = this.spins.get(o.inst.id) ?? { angle: 0, omega: 0 };
        sp.omega += (v * SPIN_TIP - sp.omega) * Math.min(1, dt * 1.5);
        this.spins.set(o.inst.id, sp);
        winded.add(o.inst.id);
      }
      // a small flame (a lit torch stand's) in the wind goes out
      const fl = o.def.flame;
      if (fl && (!fl.when || o.state === fl.when) && o.def.switch) {
        const at = localToWorld(o.def, o.inst, fl.at);
        // the wind at the flame, or at its base on the wick
        const v = Math.max(this.speedAt(at[0], at[1], at[2]), this.speedAt(at[0], at[1] - 0.4, at[2]));
        if (v >= FLAME_OUT_SPEED) this.h.blowOut(o);
      }
    }
    // out of the wind, a pinwheel's sails run down
    for (const [id, sp] of this.spins) {
      if (!winded.has(id)) sp.omega *= Math.max(0, 1 - dt * 1.2);
      sp.angle = (sp.angle + sp.omega * dt) % (Math.PI * 2);
      if (!winded.has(id) && Math.abs(sp.omega) < 0.02) sp.omega = 0;
    }
    for (const id of this.turning)
      if (!now.has(id)) {
        const o = near.find((x) => x.inst.id === id) ?? this.h.near(s.x, s.z, FAN_RANGE).find((x) => x.inst.id === id);
        if (o) this.h.blow(o, false);
      }
    this.turning = now;
  }

  /** a new play: no gusts, nothing turning */
  reset() {
    this.gusts = [];
    this.fans = [];
    this.fields = [];
    this.turning.clear();
    this.spins.clear();
    this.clock = FAN_EVERY;
  }
}
