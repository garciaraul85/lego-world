import { z } from 'zod';

/** step 13c: the game's magic (Project › Movement › Magic) */
export const Magic = z.strictObject({
  /** the game has magic (off: items that use it work without it, and no meter shows) */
  can: z.boolean(),
  /** how much a full meter holds (Ocarina's first meter holds 48) */
  max: z.number().int().min(4).max(200),
});
export type Magic = z.infer<typeof Magic>;
export const MAGIC_DEFAULTS: Magic = { can: true, max: 48 };
