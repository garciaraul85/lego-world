import { z } from 'zod';
import { id } from './common';

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
});

/** maps/<mapId>/instances.json: everything placed on the map that is not a plain brick. */
export const Instances = z.strictObject({
  /** false when the legacy save had no `npcs` key (v68 then spawns default neighbors on load) */
  npcsSaved: z.boolean(),
  items: z.array(z.discriminatedUnion('kind', [NpcInstance, AssetInstance])),
});
export type Instances = z.infer<typeof Instances>;
