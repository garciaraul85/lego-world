import type { Asset } from '../../core/schema';
import type { HeroState } from '../legacy/runtime-modules';
import { boxOf } from './puzzles';

/**
 * Step 12c: moving platforms. An asset with Moves travels from where it was placed to `by` studs away and back,
 * easing in and out, waiting `pause` seconds at each end (with "only when on", only in its second state). Its bricks
 * move in whole studs (and plates, going up and down), so the hero and the world collide with them as they are; it is
 * drawn where it really is (view). The hero standing on it rides along: carried with it, and held on its top.
 */
export type PlatformObject = {
  inst: { id: string; pos: [number, number, number]; idBase: number };
  def: Asset;
  bricks: { x: number; y: number; z: number; type: string; rot?: number }[];
  state: string;
};

export type PlatformHost<T extends PlatformObject = PlatformObject> = {
  /** the placed things that move (every one on the map) */
  movers(): T[];
  readonly heroState: HeroState;
  /** its bricks put at a new place (x, z studs, y plates) */
  moveTo(o: T, pos: [number, number, number]): void;
};

type Run = {
  o: T0;
  /** where it was placed (x, z studs; y plates) */
  origin: [number, number, number];
  /** seconds into its round trip */
  t: number;
  /** where it is now from where it was placed (studs; y in studs) */
  at: [number, number, number];
  /** where its bricks are from where it was placed (studs; y in plates) */
  put: [number, number, number];
};
type T0 = PlatformObject;

const PLATE = 0.4;

export class Platforms<T extends PlatformObject = PlatformObject> {
  private runs = new Map<string, Run & { o: T }>();
  /** what the hero rode this step: how far it moved it (studs), and the top it stands on now */
  ride: { id: string; dx: number; dy: number; dz: number; top: number } | null = null;

  constructor(private readonly h: PlatformHost<T>) {}

  /** a new play: every platform back where it was placed (the map is built afresh) */
  reset() {
    this.runs.clear();
    this.ride = null;
  }

  private runOf(o: T): Run & { o: T } {
    let r = this.runs.get(o.inst.id);
    if (!r || r.o !== o) {
      const p = o.inst.pos;
      r = { o, origin: [Number(p[0]), Number(p[1]), Number(p[2])], t: 0, at: [0, 0, 0], put: [0, 0, 0] };
      // after a reload the bricks may already be off where it was placed: start from there
      this.runs.set(o.inst.id, r);
    }
    return r;
  }

  /** the box of its bricks where it really is (studs) */
  private boxAt(r: Run & { o: T }) {
    const b = boxOf(r.o.bricks as never);
    if (!b) return null;
    const ox = r.at[0] - r.put[0];
    const oy = r.at[1] - r.put[1] * PLATE;
    const oz = r.at[2] - r.put[2];
    return { x0: b.x0 + ox, x1: b.x1 + ox, z0: b.z0 + oz, z1: b.z1 + oz, top: b.y1 * PLATE + oy };
  }

  /** the hero stands on it (its real place), not jumping off */
  private carries(r: Run & { o: T }): boolean {
    const s = this.h.heroState;
    if (s.vy > 0.5) return false;
    const b = this.boxAt(r);
    if (!b) return false;
    const m = 0.25;
    return s.x > b.x0 - m && s.x < b.x1 + m && s.z > b.z0 - m && s.z < b.z1 + m && Math.abs(s.y - b.top) < 0.45;
  }

  step(dt: number) {
    this.ride = null;
    for (const o of this.h.movers()) {
      const mv = o.def.moves;
      if (!mv) continue;
      const r = this.runOf(o);
      const rode = this.carries(r);
      const on = !mv.whenOn || (o.def.states.length > 1 && o.state === o.def.states[1]);
      const T = mv.seconds ?? 3;
      const P = mv.pause ?? 1;
      if (on) r.t = (r.t + dt) % (2 * T + 2 * P);
      const u = r.t < P ? 0 : r.t < P + T ? (r.t - P) / T : r.t < 2 * P + T ? 1 : 1 - (r.t - 2 * P - T) / T;
      const k = u * u * (3 - 2 * u);
      const before = [...r.at] as [number, number, number];
      r.at = [mv.by[0] * k, mv.by[1] * k, mv.by[2] * k];
      // the bricks: whole studs across, whole plates up (never above where it really is, so the hero is not inside)
      const put: [number, number, number] = [
        Math.round(r.at[0]),
        Math.floor(r.at[1] / PLATE + 1e-6),
        Math.round(r.at[2]),
      ];
      if (put[0] !== r.put[0] || put[1] !== r.put[1] || put[2] !== r.put[2]) {
        r.put = put;
        this.h.moveTo(o, [r.origin[0] + put[0], r.origin[1] + put[1], r.origin[2] + put[2]]);
      }
      if (rode) {
        const b = this.boxAt(r);
        if (b)
          this.ride = {
            id: o.inst.id,
            dx: r.at[0] - before[0],
            dy: r.at[1] - before[1],
            dz: r.at[2] - before[2],
            top: b.top,
          };
      }
    }
  }

  /** where each platform is drawn from where its bricks are (studs), for the renderer */
  views(): { id: string; dx: number; dy: number; dz: number }[] {
    const out: { id: string; dx: number; dy: number; dz: number }[] = [];
    for (const r of this.runs.values()) {
      const dx = r.at[0] - r.put[0];
      const dy = r.at[1] - r.put[1] * PLATE;
      const dz = r.at[2] - r.put[2];
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-4) out.push({ id: r.o.inst.id, dx, dy, dz });
    }
    return out;
  }

  /** something is moving now (the renderer keeps redrawing) */
  get moving(): boolean {
    for (const r of this.runs.values()) {
      const mv = r.o.def.moves;
      if (mv && (!mv.whenOn || r.o.state === r.o.def.states[1])) return true;
    }
    return false;
  }
}
