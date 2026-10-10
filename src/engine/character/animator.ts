import type { Clip } from '../../core/schema';
import { type PoseParams, sampleParams } from './routine';

export type ClipEvent = { t: number; emit: string } | { t: number; sound: string };

const FADE = 0.15;

function blend(a: PoseParams, b: PoseParams, w: number): PoseParams {
  const out: PoseParams = {};
  for (const k of Object.keys(b)) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) && Array.isArray(bv) && av.length === bv.length)
      out[k] = av.map((v, i) => v + (bv[i]! - v) * w);
    else if (typeof av === 'number' && typeof bv === 'number') out[k] = av + (bv - av) * w;
    else out[k] = w < 0.5 ? (av ?? bv ?? null) : (bv ?? null);
  }
  return out;
}

/**
 * Plays keyframe clips on one character (P3.5): samples every track, crossfades 0.15 s between
 * clips, and reports clip events (emit / sound markers) as the playhead passes them.
 */
export class Animator {
  private cur: { clip: Clip; t: number } | null = null;
  private prev: { clip: Clip; t: number; fade: number } | null = null;
  /** seconds of fade left when stopping */
  private out = 0;
  private last: PoseParams | null = null;

  get clip(): Clip | null {
    return this.cur?.clip ?? null;
  }
  get time(): number {
    return this.cur?.t ?? 0;
  }
  get active(): boolean {
    return !!this.cur || this.out > 0;
  }

  play(clip: Clip, at = 0) {
    if (this.cur && this.cur.clip.id === clip.id) return;
    if (this.cur) this.prev = { ...this.cur, fade: FADE };
    this.cur = { clip, t: Math.min(at, clip.length) };
    this.out = 0;
  }

  stop() {
    if (!this.cur) return;
    this.last = this.params();
    this.cur = null;
    this.prev = null;
    this.out = FADE;
  }

  /** Puts the playhead at t (scrubbing); fires no events. */
  seek(t: number) {
    if (this.cur) this.cur.t = Math.max(0, Math.min(this.cur.clip.length, t));
  }

  /** Advances by dt and returns the events the playhead crossed. */
  step(dt: number): ClipEvent[] {
    const fired: ClipEvent[] = [];
    if (this.out > 0) this.out = Math.max(0, this.out - dt);
    if (this.prev) {
      this.prev.t = this.wrap(this.prev.clip, this.prev.t + dt);
      this.prev.fade -= dt;
      if (this.prev.fade <= 0) this.prev = null;
    }
    if (!this.cur) return fired;
    const { clip } = this.cur;
    const from = this.cur.t;
    let to = from + dt;
    const pass = (a: number, b: number) => {
      for (const e of clip.events) if (e.t > a && e.t <= b) fired.push(e as ClipEvent);
    };
    if (from === 0) for (const e of clip.events) if (e.t === 0) fired.push(e as ClipEvent);
    if (to >= clip.length) {
      pass(from, clip.length);
      if (clip.loop) {
        to -= clip.length;
        for (const e of clip.events) if (e.t === 0) fired.push(e as ClipEvent);
        pass(0, to);
      } else {
        this.cur.t = clip.length;
        this.stop();
        return fired;
      }
    } else pass(from, to);
    this.cur.t = to;
    return fired;
  }

  private wrap(clip: Clip, t: number) {
    return clip.loop ? t % clip.length : Math.min(t, clip.length);
  }

  /** Blended pose parameters now, or null when nothing plays. */
  params(): PoseParams | null {
    if (!this.cur) {
      if (this.out > 0 && this.last) return this.last;
      return null;
    }
    const p = sampleParams(this.cur.clip, this.cur.t);
    if (!this.prev) return p;
    return blend(sampleParams(this.prev.clip, this.prev.t), p, 1 - this.prev.fade / FADE);
  }
}

/** v68 rig input: a one-key routine holding the given parameters (StudioMotion.pose reads it). */
export function rigPose(params: PoseParams, clip: Pick<Clip, 'prop'> | null) {
  return {
    id: 'routine:data',
    kind: 'routine',
    duration: 1,
    keys: [
      [0, params],
      [1, params],
    ],
    prop: clip?.prop ?? null,
    held: 'None',
  };
}
