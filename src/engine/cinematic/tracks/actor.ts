import type { ActorItem, Clip } from '../../../core/schema';
import type { NavGrid, Vec3 } from '../nav';

export const WALK = 4;
export const RUN = 7.8;
/** v68 gait: phase += speed * dt * 1.85 */
const PHASE_PER_STUD = 1.85;

export type Mark = { id: string; pos: Vec3; yaw: number };
export type ActorStart = { pos: Vec3; yaw: number; held: string; visible: boolean };

export type ActorFrame = {
  pos: Vec3;
  yaw: number;
  /** studs per second while walking/running (drives v68's gait) */
  speed: number;
  running: boolean;
  phase: number;
  visible: boolean;
  held: string;
  clip: { clip: Clip; time: number } | null;
  say: { text: string; start: number; dur: number } | null;
};

type Seg = {
  t0: number;
  /** arrival time (or when the next move cuts it) */
  t1: number;
  end: number;
  path: Vec3[];
  cum: number[];
  speed: number;
  running: boolean;
  yaw: number;
  /** distance already walked before this segment (gait phase) */
  before: number;
};

export type ActorEnv = {
  nav: NavGrid;
  mark(id: string): Mark | undefined;
  clip(id: string): Clip | undefined;
  emote(kind: string): Clip | undefined;
};

const sorted = (items: readonly ActorItem[]) =>
  items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.t - b.it.t || a.i - b.i)
    .map((x) => x.it);

/**
 * One actor's track, precomputed into motion segments so any time t evaluates in isolation
 * (seek(t) == play to t). Moves path-find on the nav grid; a new move cuts the one in progress.
 */
export class ActorTrack {
  readonly items: ActorItem[];
  private segs: Seg[] = [];

  constructor(
    readonly role: string,
    items: readonly ActorItem[],
    readonly start: ActorStart,
    private readonly env: ActorEnv,
  ) {
    this.items = sorted(items);
    for (const it of this.items) {
      if (it.do !== 'moveTo') continue;
      const m = env.mark(it.mark);
      if (!m) continue;
      const from = this.positionAt(it.t);
      const prev = this.segs.at(-1);
      const walked = prev ? prev.before + this.distAt(prev, it.t) : 0;
      if (prev && prev.t1 > it.t) prev.t1 = it.t;
      const to: Vec3 = [m.pos[0], env.nav.heightAt(m.pos[0], m.pos[2]), m.pos[2]];
      if (it.speed === 'teleport') {
        this.segs.push({
          t0: it.t,
          t1: it.t,
          end: it.t,
          path: [to, to],
          cum: [0, 0],
          speed: 0,
          running: false,
          yaw: m.yaw,
          before: walked,
        });
        continue;
      }
      const path = env.nav.path(from, to);
      const cum = [0];
      for (let i = 1; i < path.length; i++)
        cum.push(cum[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![2] - path[i - 1]![2]));
      const speed = it.speed === 'run' ? RUN : WALK;
      const t1 = it.t + cum.at(-1)! / speed;
      this.segs.push({
        t0: it.t,
        t1,
        end: t1,
        path,
        cum,
        speed,
        running: it.speed === 'run',
        yaw: m.yaw,
        before: walked,
      });
    }
  }

  /** when the last move arrives (for the Director's length check) */
  get endTime(): number {
    return Math.max(0, ...this.segs.map((s) => s.t1), ...this.items.map((i) => i.t + ('dur' in i ? i.dur : 0)));
  }

  /** when the move that starts at t0 stops (arrives or is cut), or null */
  moveEndAt(t0: number): number | null {
    const s = this.segs.find((x) => x.t0 === t0);
    return s ? s.t1 : null;
  }

  private segAt(t: number): Seg | undefined {
    let s: Seg | undefined;
    for (const x of this.segs) if (x.t0 <= t) s = x;
    return s;
  }

  private distAt(s: Seg, t: number) {
    return Math.min(s.cum.at(-1)!, Math.max(0, (Math.min(t, s.t1) - s.t0) * s.speed));
  }

  private pointAt(s: Seg, d: number): { pos: Vec3; dir: number } {
    const { path, cum } = s;
    let i = 1;
    while (i < path.length - 1 && cum[i]! < d) i++;
    const a = path[i - 1]!;
    const b = path[i]!;
    const segLen = cum[i]! - cum[i - 1]! || 1;
    const k = Math.max(0, Math.min(1, (d - cum[i - 1]!) / segLen));
    return {
      pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
      dir: Math.atan2(b[0] - a[0], b[2] - a[2]),
    };
  }

  positionAt(t: number): Vec3 {
    const s = this.segAt(t);
    if (!s) return this.start.pos;
    return this.pointAt(s, this.distAt(s, t)).pos;
  }

  /** positions only (pass 1); yaws that face other roles need everyone's positions */
  frame(t: number, faceTarget: (target: string, t: number) => Vec3 | null): ActorFrame {
    const s = this.segAt(t);
    let pos = this.start.pos;
    let speed = 0;
    let running = false;
    let moving = false;
    let moveDir = this.start.yaw;
    let walked = 0;
    let lastStop = -1;
    let stopYaw = this.start.yaw;
    if (s) {
      const d = this.distAt(s, t);
      const p = this.pointAt(s, d);
      pos = p.pos;
      walked = s.before + d;
      moving = t < s.t1 && s.speed > 0;
      if (moving) {
        speed = s.speed;
        running = s.running;
        moveDir = p.dir;
      }
    }
    for (const x of this.segs)
      if (x.t1 <= t && x.t1 >= lastStop) {
        lastStop = x.t1;
        // arriving faces the mark's direction; a cut move keeps the walking direction
        stopYaw = x.t1 < x.end ? this.pointAt(x, this.distAt(x, x.t1)).dir : x.yaw;
      }
    let yaw = moving ? moveDir : stopYaw;
    let visible = this.start.visible;
    let held = this.start.held;
    let clip: ActorFrame['clip'] = null;
    let say: ActorFrame['say'] = null;
    for (const it of this.items) {
      if (it.t > t) break;
      switch (it.do) {
        case 'face':
          if (!moving && it.t >= lastStop) {
            const tp = it.target ? faceTarget(it.target, t) : null;
            if (tp) yaw = Math.atan2(tp[0] - pos[0], tp[2] - pos[2]);
            else if (it.yaw !== undefined) yaw = it.yaw;
          }
          break;
        case 'hide':
          visible = false;
          break;
        case 'show':
          visible = true;
          break;
        case 'equip':
          held = it.item;
          break;
        case 'say':
          if (t < it.t + it.dur) say = { text: it.text, start: it.t, dur: it.dur };
          break;
        case 'play':
        case 'emote': {
          const c = it.do === 'play' ? this.env.clip(it.clip) : this.env.emote(it.kind);
          if (!c) break;
          const loop = it.do === 'play' ? (it.loop ?? c.loop) : false;
          const local = t - it.t;
          clip = loop || local < c.length ? { clip: c, time: loop ? local % c.length : local } : null;
          break;
        }
        case 'moveTo':
          clip = null; // walking cancels a clip
          break;
      }
    }
    if (moving) clip = null;
    return { pos, yaw, speed, running, phase: walked * PHASE_PER_STUD, visible, held, clip, say };
  }
}
