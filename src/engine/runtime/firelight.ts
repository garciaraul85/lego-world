import { localToWorld } from '../../core/assets/expand';
import type { Asset } from '../../core/schema';
import type { HeroState } from '../legacy/runtime-modules';
import { boxOf } from './puzzles';

/**
 * Step 12b: fire and light at play. Burnable things catch fire (a fire hit, a flame, a blast, a burning neighbour),
 * burn for a few seconds and are gone. Bombs are dropped, fizz and go off. Beams of light run straight from their
 * source, turn a quarter turn at each mirror and stop at the first solid thing; a light sensor they reach is lit.
 */
export type FireObject = {
  inst: { id: string; pos: [number, number, number]; rot: number; idBase: number };
  def: Asset;
  bricks: { x: number; y: number; z: number; type: string; rot?: number }[];
  state: string;
};

export type Bomb = {
  x: number;
  y: number;
  z: number;
  /** seconds since it was lit; fizz: since its last fizz */
  t: number;
  fizz: number;
  /** flying (thrown) */
  vx: number;
  vy: number;
  vz: number;
  /** the bomb plant it came from (it may grow another) */
  plant: FireObject | null;
};

type Piece = {
  id?: number | undefined;
  x: number;
  y: number;
  z: number;
  rows: number;
  cols: number;
  turn: number;
  kind: string;
};

export type FireHost<T extends FireObject = FireObject> = {
  readonly clock: number;
  readonly heroState: HeroState;
  near(x: number, z: number, r: number): readonly T[];
  pieces(): readonly Piece[];
  objectOfPiece(id: number | undefined): T | undefined;
  /** gone from the map (burnt away) */
  remove(o: T): void;
  /** a fire effect that keeps going until stopped (scale: how big, 1 as made) */
  flames(at: [number, number, number], scale?: number, effect?: string): { stop(): void } | null;
  sound(id: 'ignite' | 'fuse' | 'boom' | 'shine', at?: [number, number, number]): void;
  /** the blast of a bomb: what is around it is hurt, broken, flipped or set alight (how many things it hit) */
  blast(at: [number, number, number], radius: number): number;
  /** a solid piece at this point (a thrown bomb stops against it) */
  solidAt?(x: number, y: number, z: number): boolean;
  /** how tall the hero stands (world units): a bomb held up sits on top of its hands */
  heroHeight?(): number;
  /** the highest floor under a point, from y down (null: none) */
  floor(x: number, z: number, y: number): number | null;
  /** a bomb plant grows its bomb again (its state) */
  setState(o: T, state: string): void;
  /** a light sensor lit or no longer lit */
  lightSensor(o: T, lit: boolean): void;
  burned(o: T): void;
  log(text: string): void;
};

/** seconds a burnable burns at first; when it sets its neighbours alight */
const BURN_SECONDS = 2;
const SPREAD_AFTER = 0.6;
/** a bomb's fuse and its blast */
export const FUSE = 4;
export const BLAST_RADIUS = 3.2;
/** step 12b: picking a bomb up, throwing it, putting it down (seconds, as the clips); a throw's speed */
export const LIFT_TIME = 0.45;
const THROW_TIME = 0.35;
const DROP_TIME = 0.4;
const THROW_SPEED = 7.5;
const THROW_UP = 4.5;
const GRAVITY = 18;
/** a bomb plant grows a new bomb this long after its last one went off */
const REGROW_AFTER = 1.5;
/** how often beams are traced again (seconds) */
const BEAM_EVERY = 0.1;
const BEAM_RANGE = 32;
const MAX_BOUNCES = 16;
/** flames (an asset's Flame) play within this many studs of the hero; how often they are looked at again */
const FLAME_RANGE = 48;
const FLAME_EVERY = 0.25;

export type BeamSegment = { from: [number, number, number]; to: [number, number, number]; color: string };

const pieceBox = (p: Piece) => {
  const [w, d] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
  return { x0: p.x, x1: p.x + w, z0: p.z, z1: p.z + d, y0: p.y, y1: p.y + (p.kind === 'brick' ? 3 : 1) };
};

export class FireLight<T extends FireObject = FireObject> {
  readonly burning = new Map<string, { o: T; t: number; seconds: number; spread: boolean; fx: { stop(): void }[] }>();
  readonly bombs: Bomb[] = [];
  /** step 12b: the bomb the hero holds up (it is one of bombs), and what the hero is doing with it */
  held: Bomb | null = null;
  private carry: { phase: 'lift' | 'throw' | 'drop'; t: number } | null = null;
  /** bomb plants near the hero (drawn with their bomb while grown), and the ones growing a bomb again */
  plants: T[] = [];
  private regrow = new Map<string, { o: T; t: number }>();
  beams: BeamSegment[] = [];
  private lit = new Set<string>();
  private beamClock = 0;
  /** step 12b: the flames burning on things (their Flame, in its state): by object id */
  private flameFx = new Map<string, { o: T; fx: { stop(): void } | null }>();
  private flameClock = FLAME_EVERY;

  constructor(private readonly h: FireHost<T>) {}

  // ---------- fire ----------

  /** sets a burnable thing alight (true: it caught) */
  ignite(o: T, why = ''): boolean {
    const b = o.def.burn;
    if (!b || this.burning.has(o.inst.id)) return false;
    const c = centre(o);
    this.burning.set(o.inst.id, {
      o,
      t: 0,
      seconds: b.seconds ?? BURN_SECONDS,
      spread: b.spreads !== false,
      fx: this.burnFlames(o),
    });
    this.h.sound('ignite', c ?? undefined);
    this.h.log(`${o.def.name} caught fire${why ? ` (${why})` : ''}`);
    return true;
  }

  /** a flame (or fire hit) at a point: burnable things within r catch */
  flameAt(x: number, z: number, y: number, r: number, why: string): number {
    let n = 0;
    for (const o of this.h.near(x, z, r + 8)) {
      if (!o.def.burn) continue;
      const b = boxOf(o.bricks as never);
      if (!b) continue;
      const dx = Math.max(b.x0 - x, 0, x - b.x1);
      const dz = Math.max(b.z0 - z, 0, z - b.z1);
      const dy = Math.max(b.y0 * 0.4 - y, 0, y - b.y1 * 0.4);
      if (Math.hypot(dx, dz) <= r && dy <= 2) if (this.ignite(o, why)) n++;
    }
    return n;
  }

  private stepFire(dt: number) {
    for (const [id, f] of [...this.burning]) {
      const was = f.t;
      f.t += dt;
      // burnable things touching it catch too
      if (f.spread && was < SPREAD_AFTER && f.t >= SPREAD_AFTER) {
        const b = boxOf(f.o.bricks as never);
        if (b)
          for (const o of this.h.near((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 12)) {
            if (o === f.o || !o.def.burn) continue;
            const q = boxOf(o.bricks as never);
            if (!q) continue;
            const gap = Math.max(q.x0 - b.x1, b.x0 - q.x1, q.z0 - b.z1, b.z0 - q.z1);
            if (gap <= 0.6 && q.y0 < b.y1 + 1 && q.y1 > b.y0 - 1) this.ignite(o, 'spread');
          }
      }
      if (f.t < f.seconds) continue;
      this.burning.delete(id);
      for (const x of f.fx) x.stop();
      this.h.remove(f.o);
      this.h.burned(f.o);
      this.h.log(`${f.o.def.name} burned away`);
    }
  }

  /** flames along the top of a burning thing, one every stud or two (at most 6) */
  private burnFlames(o: T): { stop(): void }[] {
    const b = boxOf(o.bricks as never);
    if (!b) return [];
    const alongX = b.x1 - b.x0 >= b.z1 - b.z0;
    const len = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
    const n = Math.max(1, Math.min(6, Math.round(len / 1.5)));
    const top = b.y1 * 0.4;
    const out: { stop(): void }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = alongX ? b.x0 + t * len : (b.x0 + b.x1) / 2;
      const z = alongX ? (b.z0 + b.z1) / 2 : b.z0 + t * len;
      const fx = this.h.flames([x, top, z], 1.1);
      if (fx) out.push(fx);
    }
    return out;
  }

  /** an asset's Flame: a fire effect on it while it is in its state (a lit torch stand), started and stopped */
  private stepFlames(dt: number) {
    this.flameClock += dt;
    if (this.flameClock < FLAME_EVERY) return;
    this.flameClock = 0;
    const s = this.h.heroState;
    const want = new Map<string, T>();
    const near = this.h.near(s.x, s.z, FLAME_RANGE);
    this.plants = near.filter((o) => !!o.def.bombPlant);
    for (const o of near) {
      const f = o.def.flame;
      if (f && (!f.when || o.state === f.when) && !this.burning.has(o.inst.id)) want.set(o.inst.id, o);
    }
    for (const [id, f] of [...this.flameFx])
      if (want.get(id) !== f.o) {
        f.fx?.stop();
        this.flameFx.delete(id);
      }
    for (const [id, o] of want) {
      if (this.flameFx.has(id)) continue;
      const f = o.def.flame!;
      const at = localToWorld(o.def, o.inst, f.at);
      this.flameFx.set(id, { o, fx: this.h.flames(at, f.size ?? 1, f.effect) });
    }
  }

  // ---------- bombs ----------

  /** a lit bomb put down here (world units) */
  drop(x: number, y: number, z: number, plant?: T): Bomb {
    const b: Bomb = { x, y, z, t: 0, fizz: 0, vx: 0, vy: 0, vz: 0, plant: plant ?? null };
    this.bombs.push(b);
    this.h.sound('fuse', [x, y, z]);
    return b;
  }

  /** what the hero does with a bomb now, for the animation (lift, throw, put down, or holding it up) */
  get carryPose(): 'lift' | 'throw' | 'drop' | 'hold' | null {
    if (this.carry) return this.carry.phase;
    return this.held ? 'hold' : null;
  }

  /** the hero is busy with a bomb (lifting, throwing, putting it down): it stands still meanwhile */
  get busy(): boolean {
    return !!this.carry;
  }

  /** where a held bomb is: over the hero's head (rising while it is lifted) */
  private heldAt(): [number, number, number] {
    const s = this.h.heroState;
    const k = this.carry?.phase === 'lift' ? Math.min(1, this.carry.t / LIFT_TIME) : 1;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const reach = 0.9 * (1 - k);
    const top = (this.h.heroHeight?.() ?? 3.4) + 0.3;
    return [s.x + fx * reach, s.y + 0.1 + (top - 0.1) * k * k, s.z + fz * reach];
  }

  /** a lit bomb up over the hero's head: a new one (from the bag, or a plant), or one lying lit nearby */
  lift(b?: Bomb, plant?: T): boolean {
    if (this.held || this.carry) return false;
    const s = this.h.heroState;
    const bomb = b ?? this.drop(s.x, s.y, s.z, plant);
    bomb.vx = bomb.vy = bomb.vz = 0;
    this.held = bomb;
    this.carry = { phase: 'lift', t: 0 };
    this.h.log(b ? 'Picked up the bomb' : 'Lifted a bomb');
    return true;
  }

  /** a lit bomb lying within reach in front of the hero */
  bombAhead(): Bomb | null {
    const s = this.h.heroState;
    const ax = s.x + Math.sin(s.heading) * 0.9;
    const az = s.z + Math.cos(s.heading) * 0.9;
    return (
      this.bombs.find((b) => b !== this.held && Math.hypot(b.x - ax, b.z - az) < 1.1 && Math.abs(b.y - s.y) < 1.5) ??
      null
    );
  }

  /** a bomb plant with its bomb grown, within reach in front of the hero */
  plantAhead(): T | null {
    const s = this.h.heroState;
    const ax = s.x + Math.sin(s.heading) * 0.9;
    const az = s.z + Math.cos(s.heading) * 0.9;
    for (const o of this.plants) {
      if (o.state !== o.def.states[0]) continue;
      const b = boxOf(o.bricks as never);
      if (b && ax > b.x0 - 0.8 && ax < b.x1 + 0.8 && az > b.z0 - 0.8 && az < b.z1 + 0.8) return o;
    }
    return null;
  }

  /** takes the bomb off a plant (it grows another once that one has gone off, as its setting says) */
  pick(o: T): boolean {
    if (this.held || this.carry || !o.def.bombPlant) return false;
    this.h.setState(o, o.def.states[1] ?? o.def.states[0]!);
    return this.lift(undefined, o);
  }

  /** the held bomb flies off forward in an arc */
  throwHeld(): boolean {
    const b = this.held;
    if (!b || this.carry) return false;
    const s = this.h.heroState;
    b.vx = Math.sin(s.heading) * THROW_SPEED;
    b.vz = Math.cos(s.heading) * THROW_SPEED;
    b.vy = THROW_UP;
    this.held = null;
    this.carry = { phase: 'throw', t: 0 };
    this.h.log('Threw the bomb');
    return true;
  }

  /** the held bomb is put down in front of the hero */
  dropHeld(): boolean {
    const b = this.held;
    if (!b || this.carry) return false;
    const s = this.h.heroState;
    const x = s.x + Math.sin(s.heading) * 1.1;
    const z = s.z + Math.cos(s.heading) * 1.1;
    const f = this.h.floor(x, z, s.y + 0.5);
    Object.assign(b, { x, z, y: f ?? s.y, vx: 0, vy: 0, vz: 0 });
    this.held = null;
    this.carry = { phase: 'drop', t: 0 };
    this.h.log('Put the bomb down');
    return true;
  }

  /** a placed object's bricks fill this point (its whole box: a wall, a crate, a cracked wall) */
  private objectAt(x: number, y: number, z: number): boolean {
    for (const o of this.h.near(x, z, 8)) {
      if (o.def.pickup || o.def.bombPlant) continue;
      const q = boxOf(o.bricks as never);
      if (q && x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && y >= q.y0 * 0.4 && y < q.y1 * 0.4) return true;
    }
    return false;
  }

  /** a thrown bomb flies on (gravity), stops against a wall and lands on the floor */
  private fly(b: Bomb, dt: number) {
    if (!b.vx && !b.vy && !b.vz) return;
    b.vy -= GRAVITY * dt;
    const nx = b.x + b.vx * dt;
    const nz = b.z + b.vz * dt;
    // something higher than the bomb ahead: it stops there and drops
    const ahead = this.h.floor(nx, nz, b.y + 0.4);
    const wall = this.h.solidAt?.(nx, b.y + 0.45, nz) || this.objectAt(nx, b.y + 0.45, nz);
    if (wall || (ahead !== null && ahead > b.y + 0.45)) {
      b.vx = 0;
      b.vz = 0;
    } else {
      b.x = nx;
      b.z = nz;
    }
    const ny = b.y + b.vy * dt;
    const f = this.h.floor(b.x, b.z, b.y + 0.4);
    if (f !== null && ny <= f) {
      b.y = f;
      b.vx = b.vy = b.vz = 0;
    } else b.y = Math.max(ny, -20);
  }

  private stepBombs(dt: number) {
    if (this.carry) {
      this.carry.t += dt;
      const len = this.carry.phase === 'lift' ? LIFT_TIME : this.carry.phase === 'throw' ? THROW_TIME : DROP_TIME;
      if (this.carry.t >= len) this.carry = null;
    }
    if (this.held) Object.assign(this.held, Object.fromEntries(['x', 'y', 'z'].map((k, i) => [k, this.heldAt()[i]])));
    for (const b of [...this.bombs]) {
      b.t += dt;
      if (b !== this.held) this.fly(b, dt);
      b.fizz += dt;
      if (b.fizz >= 0.5 && b.t < FUSE) {
        b.fizz = 0;
        this.h.sound('fuse', [b.x, b.y, b.z]);
      }
      if (b.t < FUSE) continue;
      this.bombs.splice(this.bombs.indexOf(b), 1);
      // it went off in the hero's hands
      if (b === this.held) {
        this.held = null;
        this.carry = null;
        b.y = this.h.heroState.y + 1;
      }
      this.h.sound('boom', [b.x, b.y, b.z]);
      this.h.log('A bomb went off');
      this.flameAt(b.x, b.z, b.y, BLAST_RADIUS, 'a blast');
      const hit = this.h.blast([b.x, b.y, b.z], BLAST_RADIUS);
      // its plant grows another: always, or only when this one broke nothing (a miss), as the plant says
      const p = b.plant as T | null;
      const when = p?.def.bombPlant?.regrow ?? 'missed';
      if (p && (when === 'always' || (when === 'missed' && hit === 0))) this.regrow.set(p.inst.id, { o: p, t: 0 });
      else if (p) this.h.log(`${p.def.name}: no new bomb (the last one hit something)`);
    }
    for (const [id, r] of [...this.regrow]) {
      r.t += dt;
      if (r.t < REGROW_AFTER) continue;
      this.regrow.delete(id);
      this.h.setState(r.o, r.o.def.states[0]!);
      this.h.log(`${r.o.def.name} grew a new bomb`);
    }
  }

  // ---------- beams ----------

  /** traces every beam again: the segments to draw, and the sensors lit now */
  traceBeams() {
    const s = this.h.heroState;
    const segs: BeamSegment[] = [];
    const litNow = new Map<string, T>();
    const sources = this.h
      .near(s.x, s.z, 64)
      .filter((o) => o.def.beam && (!o.def.beam.when || o.state === o.def.beam.when));
    if (sources.length) {
      const pieces = this.h.pieces();
      for (const src of sources) this.traceOne(src, pieces, segs, litNow);
    }
    this.beams = segs;
    // sensors: lit now (newly), or no longer lit
    for (const [id, o] of litNow) if (!this.lit.has(id)) this.h.lightSensor(o, true);
    for (const id of this.lit)
      if (!litNow.has(id)) {
        const o = this.h.near(s.x, s.z, 96).find((x) => x.inst.id === id);
        if (o) this.h.lightSensor(o, false);
      }
    this.lit = new Set(litNow.keys());
  }

  private traceOne(src: T, pieces: readonly Piece[], segs: BeamSegment[], lit: Map<string, T>) {
    const beam = src.def.beam!;
    const color = beam.color ?? '#fff3a0';
    const p0 = localToWorld(src.def, src.inst, beam.at);
    const p1 = localToWorld(src.def, src.inst, [beam.at[0], beam.at[1], beam.at[2] + 1]);
    let dx = Math.round(p1[0] - p0[0]);
    let dz = Math.round(p1[2] - p0[2]);
    if (Math.abs(dx) + Math.abs(dz) !== 1) return;
    const y = p0[1];
    const hy = y / 0.4;
    // the pieces at the beam's height
    const level = pieces.filter((p) => {
      const q = pieceBox(p);
      return q.y0 <= hy && q.y1 > hy;
    });
    let x = p0[0];
    let z = p0[2];
    let left = beam.range ?? BEAM_RANGE;
    let skip = src;
    for (let bounce = 0; bounce <= MAX_BOUNCES && left > 0; bounce++) {
      // the nearest piece ahead, not of the thing it leaves
      let best = left;
      let hitPiece: Piece | null = null;
      const lo = skip.inst.idBase;
      const hi = lo + skip.def.bricks.length;
      for (const p of level) {
        if (p.id !== undefined && p.id >= lo && p.id < hi) continue;
        const q = pieceBox(p);
        let t: number;
        if (dx) {
          if (z <= q.z0 || z >= q.z1) continue;
          t = dx > 0 ? q.x0 - x : x - q.x1;
        } else {
          if (x <= q.x0 || x >= q.x1) continue;
          t = dz > 0 ? q.z0 - z : z - q.z1;
        }
        if (t < -0.01 || t >= best) continue;
        best = Math.max(0, t);
        hitPiece = p;
      }
      const ex = x + dx * best;
      const ez = z + dz * best;
      segs.push({ from: [x, y, z], to: [ex, y, ez], color });
      left -= best;
      if (!hitPiece) return;
      const o = this.h.objectOfPiece(hitPiece.id);
      if (o?.def.switch?.by === 'light') {
        lit.set(o.inst.id, o);
        return;
      }
      if (!o?.def.mirror) return;
      // a mirror: on to its middle, then a quarter turn, the way it leans
      const b = boxOf(o.bricks as never);
      if (!b) return;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const along = dx ? Math.abs(cx - ex) : Math.abs(cz - ez);
      segs.push({ from: [ex, y, ez], to: [dx ? cx : ex, y, dz ? cz : ez], color });
      left -= along;
      x = dx ? cx : ex;
      z = dz ? cz : ez;
      const lean = (Math.max(0, o.def.states.indexOf(o.state)) + o.inst.rot) % 2;
      [dx, dz] = lean === 0 ? [-dz, -dx] : [dz, dx];
      skip = o;
    }
  }

  /** the sensors lit now (ids) */
  get litSensors(): ReadonlySet<string> {
    return this.lit;
  }

  // ---------- each step ----------

  step(dt: number) {
    this.stepFire(dt);
    this.stepFlames(dt);
    this.stepBombs(dt);
    this.beamClock += dt;
    if (this.beamClock >= BEAM_EVERY) {
      this.beamClock = 0;
      this.traceBeams();
    }
  }

  /** a new play (or a load): nothing burning, no bombs, beams traced again */
  reset() {
    for (const f of this.burning.values()) for (const x of f.fx) x.stop();
    this.burning.clear();
    for (const f of this.flameFx.values()) f.fx?.stop();
    this.flameFx.clear();
    this.flameClock = FLAME_EVERY;
    this.bombs.length = 0;
    this.held = null;
    this.carry = null;
    this.plants = [];
    this.regrow.clear();
    this.beams = [];
    this.lit.clear();
  }
}

function centre(o: FireObject): [number, number, number] | null {
  const b = boxOf(o.bricks as never);
  return b ? [(b.x0 + b.x1) / 2, ((b.y0 + b.y1) / 2) * 0.4, (b.z0 + b.z1) / 2] : null;
}
