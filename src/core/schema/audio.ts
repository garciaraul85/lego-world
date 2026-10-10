import { z } from 'zod';
import { MediaRef } from './common';

const Db = z.number().min(-60).max(12);

/** audio/events.json */
export const SoundEvents = z.strictObject({
  events: z.record(
    z.string(),
    z.strictObject({
      /** display name in the Audio workspace (optional; the id is the key) */
      name: z.string().min(1).max(60).optional(),
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
      name: z.string().min(1).max(60).optional(),
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

/** media/index.json: what each imported blob is (blobs themselves are stored by hash, outside the JSON files). */
export const MediaIndex = z.strictObject({
  items: z.record(
    MediaRef,
    z.strictObject({
      name: z.string().min(1).max(120),
      kind: z.enum(['audio', 'image']),
      mime: z.string().min(1).max(60),
      bytes: z.number().int().min(0),
      duration: z.number().min(0).optional(),
      channels: z.number().int().min(1).max(8).optional(),
      sampleRate: z.number().int().positive().optional(),
    }),
  ),
});
export type MediaIndex = z.infer<typeof MediaIndex>;
export type SoundEvents = z.infer<typeof SoundEvents>;
export type SoundEvent = SoundEvents['events'][string];
export type Music = z.infer<typeof Music>;
export type MusicState = Music['states'][string];
export type Mixer = z.infer<typeof Mixer>;
export type BusName = keyof Mixer['buses'];
