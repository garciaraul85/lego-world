import { z } from 'zod';
import { LightDef } from '../lighting/light';
import { MAX_BRICK_ID } from './chunk';
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
  idBase: z.number().int().min(1).max(MAX_BRICK_ID),
  /** free rotation in degrees about X, Y, Z on top of rot (P31); a tilted asset is a free object, see core/assets/tilt */
  tilt: z
    .tuple([z.number().min(-180).max(180), z.number().min(-180).max(180), z.number().min(-180).max(180)])
    .optional(),
  /** free size per axis (1 = normal), growing from the middle of the base (P31) */
  scale: z.tuple([z.number().min(0.1).max(10), z.number().min(0.1).max(10), z.number().min(0.1).max(10)]).optional(),
  /** P9c: this copy's own name (“Gate switch”), so logic and wiring can name it; unique on its map */
  name: z.string().min(1).max(40).optional(),
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

/** P23: an effect placed in a map: a stream that keeps going (fire on a torch), or a burst every few seconds. */
export const EffectInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('effect'),
  name: z.string().min(1).max(60).optional(),
  effect: id('effect'),
  pos: Vec3,
  /** how big it is (1: as made) */
  scale: z.number().min(0.1).max(5),
  /** its colours tinted toward this one (none: as made) */
  tint: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  /** a burst effect: seconds between bursts [min, max] */
  interval: z.tuple([z.number().min(0.1).max(120), z.number().min(0.1).max(120)]),
  /** it plays only when the hero is this close (studs) */
  maxDistance: z.number().min(4).max(200),
  /** off: it waits for logic (Play effect) or an action to start it */
  playing: z.boolean(),
});
export type EffectInstance = z.infer<typeof EffectInstance>;

/** P27: a light placed on a map (a torch on a wall, a lamp over a table); logic can switch it on and off */
export const LightInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('light'),
  name: z.string().min(1).max(60).optional(),
  pos: Vec3,
  light: LightDef,
  /** off: dark until logic or an action switches it on */
  on: z.boolean(),
});
export type LightInstance = z.infer<typeof LightInstance>;

/** Milestone 2b: the kinds of water (they look and behave the same; a river has a current, the sea waves) */
export const WATER_KINDS = ['pool', 'river', 'lake', 'sea'] as const;

/**
 * Milestone 2b: a body of water on a map: a box from `pos` (its lower corner: studs across, world height, studs
 * deep) `size` big (studs, world units high, studs). Its surface is the top. Loose things float in it and a
 * current carries them; P13 adds swimming.
 */
export const WaterInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('water'),
  name: z.string().min(1).max(60).optional(),
  pos: Vec3,
  size: z.tuple([z.number().min(1).max(2048), z.number().min(0.4).max(120), z.number().min(1).max(2048)]),
  body: z.enum(WATER_KINDS),
  /** which way and how fast it flows (studs a second, across and deep) */
  current: z.tuple([z.number().min(-20).max(20), z.number().min(-20).max(20)]).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export type WaterInstance = z.infer<typeof WaterInstance>;

/**
 * Milestone 2b, 10c part 5: a 3D model placed on a map — a built-in one (`builtin:<id>`) or one imported into the
 * project (its media ref, a .glb or .gltf file). It stands on `pos` (the middle of its base), turned about its
 * upright axis and sized; solid ones stop the hero in Play.
 */
export const MODEL_REF = /^(builtin:[a-z0-9-]{1,40}|sha256:[0-9a-f]{64})$/;
export const ModelInstance = z.strictObject({
  id: id('instance'),
  kind: z.literal('model'),
  name: z.string().min(1).max(60).optional(),
  model: z.string().regex(MODEL_REF, 'expected builtin:<id> or sha256:<hex>'),
  pos: Vec3,
  /** degrees about the upright axis */
  turn: z.number().min(-180).max(180).optional(),
  /** how big: 1 is the size it was made at (studs) */
  size: z.number().min(0.05).max(50).optional(),
  /** false: the hero and loose things go through it (decoration) */
  solid: z.boolean().optional(),
});
export type ModelInstance = z.infer<typeof ModelInstance>;

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
  /** P22: a sign the hero can read (E): this conversation plays, in the Sign style unless it picks its own */
  conversation: id('dialogue').optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export type UiInstance = z.infer<typeof UiInstance>;

/** maps/<mapId>/instances.json: everything placed on the map that is not a plain brick. */
/** one thing placed on a map */
export const InstanceItem = z.discriminatedUnion('kind', [
  NpcInstance,
  AssetInstance,
  EmitterInstance,
  UiInstance,
  EffectInstance,
  LightInstance,
  WaterInstance,
  ModelInstance,
]);

export const Instances = z.strictObject({
  /** false when the legacy save had no `npcs` key (v68 then spawns default neighbors on load) */
  npcsSaved: z.boolean(),
  items: z.array(InstanceItem),
});
export type Instances = z.infer<typeof Instances>;
