import { z } from 'zod';
import { id, Vec3 } from './common';

export const NpcInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('npc'),
  character: id('character'),
  legacyId: z.number().int().min(1),
  biome: z.string(),
  role: z.string(),
  /** legacy NPC state {x,y,z,heading,...}, kept verbatim */
  state: z.record(z.string(), z.unknown()),
});

export const AssetInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('asset'),
  asset: id('asset'),
  pos: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  rot: z.number().int().min(0).max(3),
  state: z.string().optional(),
  /** brick i of the asset gets map brick id idBase + i (ids stay stable for smash state and v68) */
  idBase: z.number().int().min(1).max(1_000_000),
  /** smash group name of the expanded bricks (v68 generator name such as "house-3"); default from the asset name */
  group: z.string().min(1).max(100).optional(),
});
export type AssetInstance = z.infer<typeof AssetInstance>;

/** A sound emitter placed in a map (P5.5): a loop, or a sound every few seconds, heard within maxDistance. */
export const EmitterInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('emitter'),
  name: z.string().min(1).max(60).optional(),
  sound: id('sound'),
  pos: Vec3,
  mode: z.enum(['loop', 'interval']),
  /** seconds between plays for interval emitters: [min, max] */
  interval: z.tuple([z.number().min(0.1), z.number().min(0.1)]),
  maxDistance: z.number().min(1).max(200),
  volume: z.number().min(-60).max(12),
});
export type EmitterInstance = z.infer<typeof EmitterInstance>;

/** World UI placed in a map (P5.9): a sign, a label or a bar drawn over the 3D view at pos. */
export const UiInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('ui'),
  widget: z.enum(['sign', 'label', 'bar']),
  pos: Vec3,
  /** text with {var} bindings; for a bar: "value var / max var" via bind */
  text: z.string().max(200),
  bind: z.array(z.string()).optional(),
  maxDistance: z.number().min(1).max(200),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export type UiInstance = z.infer<typeof UiInstance>;

/** maps/<mapId>/instances.json: everything placed on the map that is not a plain brick. */
export const Instances = z.strictObject({
  /** false when the legacy save had no `npcs` key (v68 then spawns default neighbors on load) */
  npcsSaved: z.boolean(),
  items: z.array(z.discriminatedUnion('kind', [NpcInstance, AssetInstance, EmitterInstance, UiInstance])),
});
export type Instances = z.infer<typeof Instances>;
