import { z } from 'zod';
import { MediaRef } from './common';

const Db = z.number().min(-60).max(12);

/** audio/events.json */
export const SoundEvents = z.strictObject({
  events: z.record(
    z.string(),
    z.strictObject({
      clips: z.array(MediaRef).min(1),
      pick: z.enum(['random', 'sequence', 'shuffle']),
      volume: Db,
      pitch: z.tuple([z.number().positive(), z.number().positive()]),
      bus: z.enum(['sfx', 'voice', 'ui', 'ambience']),
      spatial: z.boolean(),
      maxVoices: z.number().int().min(1).max(32),
      cooldown: z.number().min(0),
    }),
  ),
});

/** audio/music.json */
export const Music = z.strictObject({
  states: z.record(
    z.string(),
    z.strictObject({
      layers: z.array(z.strictObject({ media: MediaRef, volume: Db })).min(1),
      loop: z.boolean(),
      bpm: z.number().positive().optional(),
    }),
  ),
  crossfade: z.number().min(0),
  stingers: z.record(z.string(), MediaRef),
});

/** audio/mixer.json */
export const Mixer = z.strictObject({
  buses: z.strictObject({ master: Db, music: Db, sfx: Db, voice: Db, ui: Db, ambience: Db }),
  duck: z.array(
    z.strictObject({
      when: z.string(),
      target: z.string(),
      amount: Db,
      attack: z.number().min(0),
      release: z.number().min(0),
    }),
  ),
});
