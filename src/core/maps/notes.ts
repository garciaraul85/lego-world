/** Milestone 3b (B7a-1): what the maps remember in a save: where the hero has been, pins, bosses beaten. */
import { z } from 'zod';

/** the stamps a player can put down on the pause map */
export const STAMPS = ['star', 'heart', 'flag', 'cross', 'skull', 'chest', 'eye', 'leaf'] as const;
export type Stamp = (typeof STAMPS)[number];

export const MapPin = z.strictObject({
  x: z.number(),
  z: z.number(),
  y: z.number().optional(),
  stamp: z.enum(STAMPS),
  label: z.string().max(40).optional(),
});
export type MapPin = z.infer<typeof MapPin>;

/** a map's notes in a save */
export const MapNotes = z.strictObject({
  seen: z.array(z.string()).max(40000).optional(),
  pins: z.array(MapPin).max(60).optional(),
  beaten: z
    .array(z.strictObject({ name: z.string().max(80), x: z.number(), z: z.number(), y: z.number() }))
    .max(20)
    .optional(),
  revealed: z.boolean().optional(),
});
export type MapNotes = z.infer<typeof MapNotes>;
