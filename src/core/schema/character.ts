import { z } from 'zod';
import { id } from './common';

/**
 * characters/<charId>.json.
 * `profile` is the v68 CharacterCatalog profile (about 57 fields) kept verbatim until P3.5 turns looks into data;
 * CharacterCatalog.validate() remains its validator.
 */
export const Character = z.strictObject({
  id: id('character'),
  name: z.string().max(60),
  role: z.enum(['hero', 'npc']),
  profile: z.record(z.string(), z.unknown()),
  legacyId: z.number().int().min(1).optional(),
  /** clips this character can play on its own (hero: keys 1-4 in play) */
  emotes: z.array(id('clip')).max(8).optional(),
});
export type Character = z.infer<typeof Character>;
