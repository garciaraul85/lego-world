import { z } from 'zod';
import { IsoDate, id } from './common';

export const FileEntry = z.strictObject({ hash: z.string().regex(/^[0-9a-f]{16}$/), bytes: z.number().int().min(0) });

export const Project = z.strictObject({
  format: z.literal('brickworlds-project'),
  schema: z.literal(5),
  id: id('project'),
  name: z.string().min(1).max(120),
  created: IsoDate,
  modified: IsoDate,
  entry: z.strictObject({
    map: id('map'),
    spawn: id('spawn').nullable(),
    screen: id('screen').nullable(),
  }),
  hero: id('character').nullable(),
  /** Every non-.editor file except project.json itself, with xxhash64 (16 hex) and byte size. */
  files: z.record(z.string(), FileEntry),
});
export type Project = z.infer<typeof Project>;

export const Settings = z.strictObject({
  quality: z.enum(['auto', 'low', 'medium', 'high']),
  /** legacy activeCharacterId etc. that has no v5 home yet */
  legacy: z.record(z.string(), z.unknown()).optional(),
});
export type Settings = z.infer<typeof Settings>;
