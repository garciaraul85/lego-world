import { z } from 'zod';
import { DialogueLook } from '../dialogue/schema';
import { EffectHooks } from '../effects/schema';
import { ScreenHooks } from '../effects/screen';
import { Saving } from '../save/save';
import { IsoDate, id } from './common';

export const FileEntry = z.strictObject({ hash: z.string().regex(/^[0-9a-f]{16}$/), bytes: z.number().int().min(0) });

export const Project = z.strictObject({
  format: z.literal('brickworlds-project'),
  schema: z.literal(6),
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
  /** P18: what kind of game it is (src/builtin/genres): the editor shows what that genre uses; open = everything */
  genre: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  /** P26: how the player saves (unset: the genre's default) */
  saving: Saving.optional(),
  /** P22: how conversations look in this game (unset parts: the genre's, then the defaults) */
  dialogue: DialogueLook.partial().optional(),
  /** P22 part 2: playable heroes the player can switch between in Play (H); the hero is always one of them */
  party: z.array(id('character')).max(6).optional(),
  /** P23: which effect plays for hits (by damage type) and for things that happen (level up, healing…) */
  effects: EffectHooks.optional(),
  /** P23 part 2: which screen effect plays when things happen (hurt, a charged hit, level up…) */
  screenEffects: ScreenHooks.optional(),
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
