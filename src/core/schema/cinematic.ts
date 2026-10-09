import { z } from 'zod';
import { id, Vec3 } from './common';

const T = z.number().min(0);
const ActorItem = z.discriminatedUnion('do', [
  z.strictObject({ t: T, do: z.literal('moveTo'), mark: z.string(), speed: z.enum(['walk', 'run', 'teleport']) }),
  z.strictObject({ t: T, do: z.literal('face'), target: z.string().optional(), yaw: z.number().optional() }),
  z.strictObject({ t: T, do: z.literal('play'), clip: id('clip'), loop: z.boolean().optional() }),
  z.strictObject({
    t: T,
    do: z.literal('say'),
    text: z.string(),
    dur: z.number().positive(),
    voice: z.string().optional(),
  }),
  z.strictObject({ t: T, do: z.literal('emote'), kind: z.string() }),
  z.strictObject({ t: T, do: z.literal('equip'), item: z.string() }),
  z.strictObject({ t: T, do: z.literal('hide') }),
  z.strictObject({ t: T, do: z.literal('show') }),
]);
const CameraItem = z.strictObject({
  t: T,
  shot: z.string(),
  pos: Vec3.optional(),
  look: z.string().optional(),
  follow: z.string().optional(),
  offset: Vec3.optional(),
  fov: z.number().min(10).max(120).optional(),
  blend: z.number().min(0).optional(),
  shake: z.number().min(0).optional(),
});

export const Track = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('actor'), role: z.string(), items: z.array(ActorItem) }),
  z.strictObject({ kind: z.literal('camera'), items: z.array(CameraItem) }),
  z.strictObject({
    kind: z.literal('music'),
    items: z.array(
      z.strictObject({ t: T, music: id('music').optional(), stop: z.boolean().optional(), fade: z.number().min(0) }),
    ),
  }),
  z.strictObject({
    kind: z.literal('sfx'),
    items: z.array(z.strictObject({ t: T, event: id('sound'), role: z.string().optional() })),
  }),
  z.strictObject({ kind: z.literal('post'), items: z.array(z.record(z.string(), z.unknown())) }),
  z.strictObject({ kind: z.literal('event'), items: z.array(z.strictObject({ t: T, emit: z.string() })) }),
]);

/** cinematics/<cineId>.json */
export const Cinematic = z.strictObject({
  id: id('cinematic'),
  name: z.string().min(1).max(80),
  map: id('map'),
  length: z.number().positive(),
  skippable: z.boolean(),
  letterbox: z.boolean(),
  hideHud: z.boolean(),
  cast: z.array(z.strictObject({ role: z.string(), actor: z.union([z.literal('$hero'), id('character')]) })),
  marks: z.array(z.strictObject({ id: z.string(), pos: Vec3, yaw: z.number() })),
  tracks: z.array(Track),
});
export type Cinematic = z.infer<typeof Cinematic>;
