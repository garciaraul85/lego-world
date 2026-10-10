import type { Cinematic, Clip } from '../../core/schema';
import type { CameraFrame } from '../render/camera';
import { rigFrame } from './CameraRig';
import type { NavGrid, Vec3 } from './nav';
import { type ActorFrame, type ActorStart, ActorTrack } from './tracks/actor';
import { cameraAt } from './tracks/camera';
import { type Cue, cuesOf } from './tracks/cues';
import { type PostFrame, postAt } from './tracks/post';

export type { Cue } from './tracks/cues';

export type CinematicEnv = {
  nav: NavGrid;
  /** where a cast member is when the scene starts (the hero, a neighbour, or the cast's `at` mark) */
  start(member: Cinematic['cast'][number]): ActorStart;
  clip(id: string): Clip | undefined;
  emote(kind: string): Clip | undefined;
};

export type CinematicFrame = {
  t: number;
  actors: Map<string, ActorFrame>;
  camera: (CameraFrame & { target: Vec3 }) | null;
  shot: string | null;
  post: PostFrame;
  /** the line being spoken (dialogue box) */
  say: { role: string; text: string } | null;
};

/**
 * Plays one cinematic deterministically (P6.2). Everything visible is a pure function of t
 * (frame(t)); one-shot cues fire as advance() passes them. seek(t) moves without firing, so
 * scrubbing in the Director and playing to t show the same frame.
 */
export class CinematicPlayer {
  t = 0;
  private started = false;
  readonly tracks = new Map<string, ActorTrack>();
  readonly cues: Cue[];

  constructor(
    readonly cin: Cinematic,
    readonly env: CinematicEnv,
  ) {
    const marks = new Map(cin.marks.map((m) => [m.id, { id: m.id, pos: m.pos as Vec3, yaw: m.yaw }]));
    const actorEnv = { nav: env.nav, mark: (id: string) => marks.get(id), clip: env.clip, emote: env.emote };
    for (const member of cin.cast) {
      const items = cin.tracks.flatMap((t) => (t.kind === 'actor' && t.role === member.role ? t.items : []));
      this.tracks.set(member.role, new ActorTrack(member.role, items, env.start(member), actorEnv));
    }
    this.cues = cuesOf(cin);
  }

  get done() {
    return this.t >= this.cin.length;
  }

  frame(t = this.t): CinematicFrame {
    const pos = new Map<string, Vec3>();
    for (const [role, tr] of this.tracks) pos.set(role, tr.positionAt(t));
    const markOf = (id: string) => this.cin.marks.find((m) => m.id === id);
    const target = (name: string) => pos.get(name) ?? (markOf(name)?.pos as Vec3 | undefined) ?? null;
    const actors = new Map<string, ActorFrame>();
    let say: { role: string; text: string; start: number } | null = null;
    for (const [role, tr] of this.tracks) {
      const f = tr.frame(t, target);
      actors.set(role, f);
      // the most recent line wins when two overlap
      if (f.say && (!say || f.say.start >= say.start)) say = { role, text: f.say.text, start: f.say.start };
    }
    const camItems = this.cin.tracks.flatMap((x) => (x.kind === 'camera' ? x.items : []));
    const shot = cameraAt(camItems, t);
    const camera = rigFrame(
      shot,
      {
        role: (n) => {
          const a = actors.get(n);
          return a ? { pos: a.pos, yaw: a.yaw } : null;
        },
        mark: (id) => {
          const m = markOf(id);
          return m ? { pos: m.pos as Vec3, yaw: m.yaw } : null;
        },
      },
      t,
    );
    const post = postAt(
      this.cin.tracks.flatMap((x) => (x.kind === 'post' ? x.items : [])),
      t,
      this.cin.letterbox,
    );
    return {
      t,
      actors,
      camera,
      shot: shot?.cur.shot ?? null,
      post,
      say: say ? { role: say.role, text: say.text } : null,
    };
  }

  /** Advance by dt; returns the cues passed (cues at t = 0 fire on the first call). */
  advance(dt: number): Cue[] {
    const from = this.t;
    const to = Math.min(this.cin.length, from + Math.max(0, dt));
    const first = !this.started;
    this.started = true;
    this.t = to;
    return this.cues.filter((c) => (first ? c.t >= from : c.t > from) && c.t <= to);
  }

  /** Move the playhead without firing cues (Director scrub). */
  seek(t: number) {
    this.t = Math.max(0, Math.min(this.cin.length, t));
    this.started = true;
  }

  /** Skip to the end: returns the cues that would still have fired (state cues: music, logic events). */
  skip(): Cue[] {
    const from = this.t;
    const first = !this.started;
    this.started = true;
    this.t = this.cin.length;
    return this.cues.filter((c) => (first ? c.t >= from : c.t > from) && c.kind !== 'sfx' && c.kind !== 'voice');
  }
}
