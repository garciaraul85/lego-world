import { z } from 'zod';
import { ActionList } from './action';
import { id, LegacyBlob, Vec3 } from './common';

export const BIOMES = [
  'forest',
  'city',
  'prairie',
  'mountains',
  'volcanoes',
  'desert',
  'beach',
  'highway',
  'castle_outside',
  'castle_inside',
  'rainforest',
] as const;
export const TIMES = ['day', 'noon', 'evening', 'night'] as const;

export const Spawn = z.strictObject({
  id: id('spawn'),
  name: z.string().min(1).max(60),
  pos: Vec3,
  /** radians, same convention as legacy `heading` */
  yaw: z.number(),
  legacyId: z.number().int().positive().optional(),
});
export type Spawn = z.infer<typeof Spawn>;

export const Zone = z.strictObject({
  id: id('zone'),
  shape: z.literal('box'),
  min: Vec3,
  max: Vec3,
  tags: z.array(z.string()),
  music: id('music').nullable().optional(),
  /** an ambience loop (sound event) while the hero is inside */
  ambience: id('sound').nullable().optional(),
  onEnter: ActionList.optional(),
  onExit: ActionList.optional(),
});

/** Generator inputs; null for a hand-built map with no procedural world. */
export const Generator = z.strictObject({
  environments: z.array(z.enum(BIOMES)).min(1),
  seed: z.number().int().min(0).max(99_999_999),
  size: z.union([z.literal(16), z.literal(24), z.literal(32)]),
  mountainShape: z.string().optional(),
  mountainScale: z.string().optional(),
  /** legacy world.layoutVersion; 2 = v68 generator */
  version: z.number().int().positive(),
  locked: z.boolean(),
});

export const MapDoc = z.strictObject({
  id: id('map'),
  name: z.string().min(1).max(60),
  /** extent of the generated world in studs (legacy world.width/depth); null without a generated world */
  size: z.strictObject({ w: z.number().int().positive(), d: z.number().int().positive() }).nullable(),
  sky: z.strictObject({ time: z.enum(TIMES) }),
  weather: z.strictObject({ rain: z.boolean(), snow: z.boolean(), snowing: z.boolean() }),
  generator: Generator.nullable(),
  music: id('music').nullable(),
  ambience: id('sound').nullable(),
  spawns: z.array(Spawn).max(32),
  zones: z.array(Zone),
  legacyId: z.number().int().positive().optional(),
  /** fields from legacy world.config that v5 does not model yet */
  legacy: LegacyBlob.optional(),
});
export type MapDoc = z.infer<typeof MapDoc>;
