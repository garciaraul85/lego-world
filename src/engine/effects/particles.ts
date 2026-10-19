import type { Effect } from '../../core/effects/schema';

/**
 * P23 part 1: particles. One pool for the whole game (a fixed cap, lowered by the quality setting); bursts
 * and streams spawn into it, and each fixed step moves, slows, drops, bounces and ages every particle. What
 * is drawn comes out as batches by shape and size: tiny bricks, plates, tiles and studs, drawn instanced.
 */
export type Vec3 = [number, number, number];
export type PlayOptions = {
  /** how big (1: as made) */
  scale?: number;
  /** which way “forward” is (a unit vector; default: +z) */
  forward?: Vec3;
  /** its colours pulled toward this one */
  tint?: string;
};
/** a stream that keeps going until stopped (or its duration runs out); where it is can move */
export type StreamHandle = { id: number };

/** is a point inside a solid brick? (bouncing) */
export type SolidTest = (x: number, y: number, z: number) => boolean;

const SHAPES = ['brick', 'plate', 'tile', 'stud'] as const;
type Shape = (typeof SHAPES)[number];
/** sizes are drawn in a few steps (each step is one mesh) */
export const SIZE_STEPS = [0.06, 0.1, 0.15, 0.22, 0.32, 0.45, 0.65, 0.9, 1.3, 1.9, 2.8];
export function sizeStep(s: number): number {
  let best = 0;
  for (let i = 1; i < SIZE_STEPS.length; i++)
    if (Math.abs(SIZE_STEPS[i]! - s) < Math.abs(SIZE_STEPS[best]! - s)) best = i;
  return best;
}

export type Batch = { shape: Shape; size: number; data: Float32Array; count: number };

type Stream = {
  id: number;
  def: Effect;
  at: Vec3;
  opts: PlayOptions;
  /** particles owed (fractions carry over) */
  owed: number;
  /** seconds left (Infinity: until stopped) */
  left: number;
};

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    // the renderer's colour space: sRGB to pow 1.5 (as bricks)
    c = [1, 3, 5].map((i) => (Number.parseInt(hex.slice(i, i + 2), 16) / 255) ** 1.5) as [number, number, number];
    rgbCache.set(hex, c);
  }
  return c;
}

export class ParticleSystem {
  /** per particle: x y z vx vy vz age life s0 s1 gravity drag bounce shape colours… */
  private readonly n: number;
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private bounce: Float32Array;
  private shape: Uint8Array;
  /** up to 4 colours (rgb) per particle, and how many */
  private col: Float32Array;
  private ncol: Uint8Array;
  private alive = 0;
  private streams = new Map<number, Stream>();
  private nextStream = 1;
  /** particles allowed now (the quality setting can lower it) */
  cap: number;
  /** spawned and dropped for lack of room (the profiler shows it) */
  dropped = 0;

  constructor(
    max = 2000,
    private readonly random: () => number = Math.random,
  ) {
    this.n = max;
    this.cap = max;
    const f = () => new Float32Array(max);
    this.x = f();
    this.y = f();
    this.z = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.age = f();
    this.life = f();
    this.s0 = f();
    this.s1 = f();
    this.grav = f();
    this.drag = f();
    this.bounce = f();
    this.shape = new Uint8Array(max);
    this.col = new Float32Array(max * 12);
    this.ncol = new Uint8Array(max);
  }

  get count() {
    return this.alive;
  }
  get streamCount() {
    return this.streams.size;
  }

  /** A burst now (a stream effect starts streaming instead; its handle is returned). */
  play(def: Effect, at: Vec3, opts: PlayOptions = {}): StreamHandle | null {
    if (def.mode === 'stream') return this.start(def, at, opts);
    this.emit(def, at, opts, def.count);
    return null;
  }

  /** A stream that keeps making particles until stop() (or for its duration). */
  start(def: Effect, at: Vec3, opts: PlayOptions = {}): StreamHandle {
    const id = this.nextStream++;
    this.streams.set(id, { id, def, at: [...at], opts, owed: 0, left: def.duration > 0 ? def.duration : Infinity });
    return { id };
  }
  move(h: StreamHandle, at: Vec3, forward?: Vec3) {
    const s = this.streams.get(h.id);
    if (!s) return;
    s.at = [...at];
    if (forward) s.opts = { ...s.opts, forward };
  }
  stop(h: StreamHandle | null | undefined) {
    if (h) this.streams.delete(h.id);
  }
  running(h: StreamHandle | null | undefined) {
    return !!h && this.streams.has(h.id);
  }
  /** everything gone (map change, Stop) */
  clear() {
    this.alive = 0;
    this.streams.clear();
  }

  private emit(def: Effect, at: Vec3, opts: PlayOptions, count: number) {
    const k = opts.scale ?? 1;
    const fwd = opts.forward ?? [0, 0, 1];
    const tint = opts.tint ? rgb(opts.tint) : null;
    const shape = SHAPES.indexOf(def.shape);
    const cols = def.colors.map((c) => {
      const v = rgb(c);
      return tint ? ([0, 1, 2].map((i) => v[i]! * 0.4 + tint[i]! * 0.6) as [number, number, number]) : v;
    });
    const r = this.random;
    for (let i = 0; i < count; i++) {
      if (this.alive >= Math.min(this.cap, this.n)) {
        this.dropped += count - i;
        return;
      }
      const p = this.alive++;
      // where it starts
      let ox = 0;
      let oy = 0;
      let oz = 0;
      const rad = def.radius * k;
      if (def.spawn === 'sphere' || def.spawn === 'ring') {
        const a = r() * Math.PI * 2;
        const e = def.spawn === 'ring' ? 0 : Math.acos(2 * r() - 1) - Math.PI / 2;
        const d = def.spawn === 'ring' ? rad : rad * Math.cbrt(r());
        ox = Math.cos(a) * Math.cos(e) * d;
        oy = Math.sin(e) * d;
        oz = Math.sin(a) * Math.cos(e) * d;
      } else if (def.spawn === 'box') {
        ox = (r() * 2 - 1) * rad;
        oy = r() * rad * 0.5;
        oz = (r() * 2 - 1) * rad;
      } else if (def.spawn === 'line') {
        const t = r() * 2 - 1;
        ox = fwd[0] * t * rad;
        oy = fwd[1] * t * rad;
        oz = fwd[2] * t * rad;
      }
      this.x[p] = at[0] + ox;
      this.y[p] = at[1] + oy;
      this.z[p] = at[2] + oz;
      // which way it flies
      let dir: Vec3;
      if (def.direction === 'out') {
        const l = Math.hypot(ox, oy, oz);
        dir = l > 1e-4 && def.spread < 180 ? [ox / l, oy / l, oz / l] : randomUnit(r);
        if (def.spread >= 180) dir = randomUnit(r);
      } else dir = def.direction === 'up' ? [0, 1, 0] : def.direction === 'down' ? [0, -1, 0] : fwd;
      if (def.spread > 0 && !(def.direction === 'out' && def.spread >= 180)) dir = coneAround(dir, def.spread, r);
      const sp = (def.speed[0] + (def.speed[1] - def.speed[0]) * r()) * k;
      this.vx[p] = dir[0] * sp;
      this.vy[p] = dir[1] * sp;
      this.vz[p] = dir[2] * sp;
      this.age[p] = 0;
      this.life[p] = def.life[0] + (def.life[1] - def.life[0]) * r();
      this.s0[p] = def.size[0] * k;
      this.s1[p] = def.size[1] * k;
      this.grav[p] = def.gravity * k;
      this.drag[p] = def.drag;
      this.bounce[p] = def.bounce;
      this.shape[p] = shape;
      this.ncol[p] = cols.length;
      for (let c = 0; c < cols.length; c++) this.col.set(cols[c]!, p * 12 + c * 3);
    }
  }

  /** One step: streams make particles, particles move and age; the dead are taken out. */
  step(dt: number, solid?: SolidTest) {
    for (const s of this.streams.values()) {
      s.owed += s.def.rate * dt;
      const n = Math.floor(s.owed);
      s.owed -= n;
      if (n > 0) this.emit(s.def, s.at, s.opts, n);
      s.left -= dt;
      if (s.left <= 0) this.streams.delete(s.id);
    }
    let i = 0;
    while (i < this.alive) {
      this.age[i]! += dt;
      if (this.age[i]! >= this.life[i]!) {
        this.kill(i);
        continue;
      }
      const d = this.drag[i]!;
      if (d > 0) {
        const k = Math.max(0, 1 - d * dt);
        this.vx[i]! *= k;
        this.vy[i]! *= k;
        this.vz[i]! *= k;
      }
      this.vy[i]! -= this.grav[i]! * dt;
      const nx = this.x[i]! + this.vx[i]! * dt;
      const ny = this.y[i]! + this.vy[i]! * dt;
      const nz = this.z[i]! + this.vz[i]! * dt;
      if (solid && this.bounce[i]! > 0 && solid(nx, ny, nz)) {
        // bounce: off the floor if coming down onto it, else off a wall
        const b = this.bounce[i]!;
        if (!solid(this.x[i]!, ny, this.z[i]!)) {
          this.vx[i] = -this.vx[i]! * b;
          this.vz[i] = -this.vz[i]! * b;
        } else {
          this.vy[i] = -this.vy[i]! * b;
          this.vx[i]! *= 0.8;
          this.vz[i]! *= 0.8;
        }
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
        this.z[i] = nz;
      }
      i++;
    }
  }

  private kill(i: number) {
    const last = --this.alive;
    if (i === last) return;
    for (const a of [
      this.x,
      this.y,
      this.z,
      this.vx,
      this.vy,
      this.vz,
      this.age,
      this.life,
      this.s0,
      this.s1,
      this.grav,
      this.drag,
      this.bounce,
    ])
      a[i] = a[last]!;
    this.shape[i] = this.shape[last]!;
    this.ncol[i] = this.ncol[last]!;
    this.col.copyWithin(i * 12, last * 12, last * 12 + 12);
  }

  /** What to draw now: per shape and size step, each particle's centre and colour (6 floats). */
  batches(): Batch[] {
    const groups = new Map<number, { shape: Shape; size: number; v: number[] }>();
    for (let i = 0; i < this.alive; i++) {
      const t = this.age[i]! / this.life[i]!;
      const s = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
      const step = sizeStep(s);
      const key = this.shape[i]! * 64 + step;
      let g = groups.get(key);
      if (!g) {
        g = { shape: SHAPES[this.shape[i]!]!, size: SIZE_STEPS[step]!, v: [] };
        groups.set(key, g);
      }
      // colour over life: between the two colours around t
      const n = this.ncol[i]!;
      const f = n > 1 ? t * (n - 1) : 0;
      const a = Math.min(n - 1, Math.floor(f));
      const b = Math.min(n - 1, a + 1);
      const w = f - a;
      const o = i * 12;
      g.v.push(
        this.x[i]!,
        this.y[i]!,
        this.z[i]!,
        this.col[o + a * 3]! * (1 - w) + this.col[o + b * 3]! * w,
        this.col[o + a * 3 + 1]! * (1 - w) + this.col[o + b * 3 + 1]! * w,
        this.col[o + a * 3 + 2]! * (1 - w) + this.col[o + b * 3 + 2]! * w,
      );
    }
    return [...groups.values()].map((g) => ({
      shape: g.shape,
      size: g.size,
      data: new Float32Array(g.v),
      count: g.v.length / 6,
    }));
  }

  /** for tests: each particle's position, age and size now */
  snapshot() {
    const out: { pos: Vec3; age: number; life: number; size: number; vel: Vec3 }[] = [];
    for (let i = 0; i < this.alive; i++) {
      const t = this.age[i]! / this.life[i]!;
      out.push({
        pos: [this.x[i]!, this.y[i]!, this.z[i]!],
        vel: [this.vx[i]!, this.vy[i]!, this.vz[i]!],
        age: this.age[i]!,
        life: this.life[i]!,
        size: this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t,
      });
    }
    return out;
  }
}

function randomUnit(r: () => number): Vec3 {
  const z = 2 * r() - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), z, s * Math.sin(a)];
}

/** a direction within `spread` degrees of d */
function coneAround(d: Vec3, spread: number, r: () => number): Vec3 {
  const max = (Math.min(180, spread) * Math.PI) / 180;
  const cosT = 1 - r() * (1 - Math.cos(max));
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = r() * Math.PI * 2;
  // a frame around d
  const up: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(up, d));
  const v = cross(d, u);
  return [
    d[0] * cosT + (u[0] * Math.cos(phi) + v[0] * Math.sin(phi)) * sinT,
    d[1] * cosT + (u[1] * Math.cos(phi) + v[1] * Math.sin(phi)) * sinT,
    d[2] * cosT + (u[2] * Math.cos(phi) + v[2] * Math.sin(phi)) * sinT,
  ];
}
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
