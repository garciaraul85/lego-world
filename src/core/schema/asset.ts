import { z } from 'zod';
import { ActionList } from './action';
import { BrickType } from './chunk';
import { Color, id, Vec2, Vec3 } from './common';
import { BIOMES } from './map';

/** Asset bricks are local: [type, x, y, z, rot, color, flags] relative to the asset origin. */
export const AssetBrick = z.tuple([
  z.number().int().min(0),
  z.number().int(),
  z.number().int().min(0),
  z.number().int(),
  z.number().int().min(0).max(3),
  z.number().int().min(0),
  z.number().int().min(0).max(15),
]);

export const Socket = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['interact', 'sound', 'npc', 'sign', 'spawn']),
  pos: Vec3,
  prompt: z.string().max(40).optional(),
});

/** assets/<assetId>.json */
export const Asset = z.strictObject({
  id: id('asset'),
  name: z.string().min(1).max(60),
  category: z.enum(['building', 'prop', 'nature', 'vehicle', 'decoration', 'structure']),
  bricks: z.array(AssetBrick).min(1),
  palette: z.strictObject({ types: z.array(BrickType), colors: z.array(Color) }),
  pivot: Vec3,
  footprint: Vec2,
  sockets: z.array(Socket),
  states: z.array(z.string()).min(1),
  initialState: z.string(),
  interactions: z.array(
    z.strictObject({
      socket: z.string(),
      when: z.strictObject({ state: z.string() }).optional(),
      do: ActionList,
    }),
  ),
  smash: z.strictObject({
    enabled: z.boolean(),
    rebuild: z.boolean(),
    sound: id('sound').nullable(),
    studs: z.number().int().min(0),
  }),
  generator: z
    .strictObject({ environments: z.array(z.enum(BIOMES)), weight: z.number().min(0).max(1), placeOn: z.string() })
    .nullable(),
});
export type Asset = z.infer<typeof Asset>;
