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
  /** a fire effect that keeps going until stopped */
  flames(at: [number, number, number]): { stop(): void } | null;
  sound(id: 'ignite' | 'fuse' | 'boom' | 'shine', at?: [number, number, number]): void;
  /** the blast of a bomb: what is around it is hurt, broken, flipped or set alight */
  blast(at: [number, number, number], radius: number): void;
  /** a light sensor lit or no longer lit */
  lightSensor(o: T, lit: boolean): void;
  burned(o: T): void;
  log(text: string): void;
};

/** seconds a burnable burns at first; when it sets its neighbours alight */
const BURN_SECONDS = 2;
const SPREAD_AFTER = 0.6;
/** a bomb's fuse and its blast */
export const FUSE = 2.5;
export const BLAST_RADIUS = 3.2;
/** how often beams are traced again (seconds) */
const BEAM_EVERY = 0.1;
const BEAM_RANGE = 32;
const MAX_BOUNCES = 16;

export type BeamSegment = { from: [number, number, number]; to: [number, number, number]; color: string };

const pieceBox = (p: Piece) => {
  const [w, d] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
  return { x0: p.x, x1: p.x + w, z0: p.z, z1: p.z + d, y0: p.y, y1: p.y + (p.kind === 'brick' ? 3 : 1) };
};

export class FireLight<T extends FireObject = FireObject> {
  readonly burning = new Map<
    string,
    { o: T; t: number; seconds: number; spread: boolean; fx: { stop(): void } | null }
  >();
  readonly bombs: { x: number; y: number; z: number; t: number; fizz: number }[] = [];
  beams: BeamSegment[] = [];
  private lit = new Set<string>();
  private beamClock = 0;

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
      fx: c ? this.h.flames(c) : null,
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
      f.fx?.stop();
      this.h.remove(f.o);
      this.h.burned(f.o);
      this.h.log(`${f.o.def.name} burned away`);
    }
  }

  // ---------- bombs ----------

  /** a lit bomb put down here (world units) */
  drop(x: number, y: number, z: number) {
    this.bombs.push({ x, y, z, t: 0, fizz: 0 });
    this.h.sound('fuse', [x, y, z]);
  }

  private stepBombs(dt: number) {
    for (const b of [...this.bombs]) {
      b.t += dt;
      b.fizz += dt;
      if (b.fizz >= 0.5 && b.t < FUSE) {
        b.fizz = 0;
        this.h.sound('fuse', [b.x, b.y, b.z]);
      }
      if (b.t < FUSE) continue;
      this.bombs.splice(this.bombs.indexOf(b), 1);
      this.h.sound('boom', [b.x, b.y, b.z]);
      this.h.log('A bomb went off');
      this.flameAt(b.x, b.z, b.y, BLAST_RADIUS, 'a blast');
      this.h.blast([b.x, b.y, b.z], BLAST_RADIUS);
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
    this.stepBombs(dt);
    this.beamClock += dt;
    if (this.beamClock >= BEAM_EVERY) {
      this.beamClock = 0;
      this.traceBeams();
    }
  }

  /** a new play (or a load): nothing burning, no bombs, beams traced again */
  reset() {
    for (const f of this.burning.values()) f.fx?.stop();
    this.burning.clear();
    this.bombs.length = 0;
    this.beams = [];
    this.lit.clear();
  }
}

function centre(o: FireObject): [number, number, number] | null {
  const b = boxOf(o.bricks as never);
  return b ? [(b.x0 + b.x1) / 2, ((b.y0 + b.y1) / 2) * 0.4, (b.z0 + b.z1) / 2] : null;
}
