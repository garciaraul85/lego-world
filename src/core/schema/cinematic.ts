import { z } from 'zod';
import { id, Vec3 } from './common';

/**
 * Cinematics (P6.1). What every item does is pinned down in docs/cinematic-tracks.md; the player
 * (src/engine/cinematic) and the Director (src/editor/workspaces/director) both follow it.
 */
const T = z.number().min(0);
const Color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const ActorItem = z.discriminatedUnion('do', [
  /** walk / run along the nav grid to a mark (or jump there); arrives, or is cut by the role's next move */
  z.strictObject({ t: T, do: z.literal('moveTo'), mark: z.string(), speed: z.enum(['walk', 'run', 'teleport']) }),
  /** turn to a role, a mark, or a yaw (radians, v68 heading) */
  z.strictObject({ t: T, do: z.literal('face'), target: z.string().optional(), yaw: z.number().optional() }),
  /** play a keyframe clip (loop: until the role's next play / emote / move) */
  z.strictObject({ t: T, do: z.literal('play'), clip: id('clip'), loop: z.boolean().optional() }),
  /** a line of dialogue in the dialogue box for dur seconds, with voice blips (a sound event) */
  z.strictObject({
    t: T,
    do: z.literal('say'),
    text: z.string().min(1).max(400),
    dur: z.number().positive(),
    voice: id('sound').optional(),
  }),
  /** a built-in gesture: wave, cheer, nod, bow, shrug, point */
  z.strictObject({ t: T, do: z.literal('emote'), kind: z.string() }),
  z.strictObject({ t: T, do: z.literal('equip'), item: z.string() }),
  z.strictObject({ t: T, do: z.literal('hide') }),
  z.strictObject({ t: T, do: z.literal('show') }),
]);
export type ActorItem = z.infer<typeof ActorItem>;

export const CameraItem = z.strictObject({
  t: T,
  /** shot name in the shot list ("Wide", "Close on Mia") */
  shot: z.string().min(1).max(60),
  /** eye position (world); ignored when following */
  pos: Vec3.optional(),
  /** look at a role or a mark */
  look: z.string().optional(),
  /** look at a point (Camera from view) */
  lookAt: Vec3.optional(),
  /** stay with a role: eye = role position + offset in the role's own frame (x right, y up, z ahead) */
  follow: z.string().optional(),
  offset: Vec3.optional(),
  /** vertical field of view, degrees */
  fov: z.number().min(10).max(120).optional(),
  /** 0 = cut; else ease from the previous shot over blend seconds */
  blend: z.number().min(0).optional(),
  /** shake strength (studs) */
  shake: z.number().min(0).max(3).optional(),
});
export type CameraItem = z.infer<typeof CameraItem>;

export const PostItem = z.union([
  z.strictObject({ t: T, fade: z.enum(['in', 'out']), dur: z.number().min(0), color: Color.optional() }),
  z.strictObject({ t: T, letterbox: z.boolean() }),
  z.strictObject({
    t: T,
    title: z.string().min(1).max(80),
    sub: z.string().max(120).optional(),
    dur: z.number().positive(),
  }),
  z.strictObject({ t: T, slowmo: z.number().min(0.1).max(1), dur: z.number().positive() }),
]);
export type PostItem = z.infer<typeof PostItem>;

export const EventItem = z.union([
  z.strictObject({ t: T, emit: z.string().min(1) }),
  z.strictObject({ t: T, setVar: z.string().min(1), value: z.union([z.number(), z.boolean(), z.string()]) }),
]);
export type EventItem = z.infer<typeof EventItem>;

export const MusicItem = z.strictObject({
  t: T,
  music: id('music').optional(),
  stop: z.boolean().optional(),
  fade: z.number().min(0),
});
export const SfxItem = z.strictObject({ t: T, event: id('sound'), role: z.string().optional(), pos: Vec3.optional() });

export const Track = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('actor'), role: z.string(), items: z.array(ActorItem) }),
  z.strictObject({ kind: z.literal('camera'), items: z.array(CameraItem) }),
  z.strictObject({ kind: z.literal('music'), items: z.array(MusicItem) }),
  z.strictObject({ kind: z.literal('sfx'), items: z.array(SfxItem) }),
  z.strictObject({ kind: z.literal('post'), items: z.array(PostItem) }),
  z.strictObject({ kind: z.literal('event'), items: z.array(EventItem) }),
]);
export type Track = z.infer<typeof Track>;

export const CastMember = z.strictObject({
  role: z.string().min(1).max(40),
  actor: z.union([z.literal('$hero'), id('character')]),
  /** where the actor stands at the start (a mark); default: where it already is (the hero, a neighbor) or the first mark */
  at: z.string().optional(),
});

/** cinematics/<cineId>.json */
export const Cinematic = z
  .strictObject({
    id: id('cinematic'),
    name: z.string().min(1).max(80),
    map: id('map'),
    length: z.number().positive().max(600),
    skippable: z.boolean(),
    letterbox: z.boolean(),
    hideHud: z.boolean(),
    cast: z.array(CastMember).max(16),
    marks: z.array(z.strictObject({ id: z.string().min(1).max(40), pos: Vec3, yaw: z.number() })).max(64),
    tracks: z.array(Track),
  })
  .superRefine((c, ctx) => {
    const roles = new Set(c.cast.map((m) => m.role));
    if (roles.size !== c.cast.length)
      ctx.addIssue({ code: 'custom', path: ['cast'], message: 'two cast members share a role' });
    c.tracks.forEach((t, i) => {
      if (t.kind === 'actor' && !roles.has(t.role))
        ctx.addIssue({ code: 'custom', path: ['tracks', i, 'role'], message: `no cast member plays ${t.role}` });
      for (const [k, it] of t.items.entries())
        if (it.t > c.length)
          ctx.addIssue({ code: 'custom', path: ['tracks', i, 'items', k, 't'], message: 'item starts after the end' });
    });
  });
export type Cinematic = z.infer<typeof Cinematic>;
