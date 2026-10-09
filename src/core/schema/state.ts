import { z } from 'zod';

/** A brick in the legacy object shape; used where v68 stores whole pieces (smash originals). */
export const LegacyPiece = z.strictObject({
  id: z.number().int().min(1),
  rows: z.number().int(),
  cols: z.number().int(),
  kind: z.enum(['brick', 'plate', 'tile']),
  color: z.number().int().min(0),
  turn: z.number().int().min(0).max(3),
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
  group: z.string().max(100).optional(),
});
export type LegacyPiece = z.infer<typeof LegacyPiece>;

/** maps/<mapId>/state.json: the state a map starts play in (smashed objects, saved player). */
export const MapState = z.strictObject({
  broken: z.array(
    z.strictObject({
      id: z.number().int().min(1),
      originals: z.array(LegacyPiece).min(1),
      /** rebuild progress 0..1; v68 stores it only for maps that are not active */
      progress: z.number().min(0).max(1).optional(),
    }),
  ),
  /** legacy player controller state, kept verbatim; null when none saved */
  player: z.record(z.string(), z.unknown()).nullable(),
});
export type MapState = z.infer<typeof MapState>;
