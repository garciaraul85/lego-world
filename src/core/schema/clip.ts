import { z } from 'zod';
import { id } from './common';

export const Ease = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'step']);

/** clips/<clipId>.json — keys are [time s, value, ease to next] */
export const Clip = z.strictObject({
  id: id('clip'),
  length: z.number().positive(),
  loop: z.boolean(),
  tracks: z.array(
    z.strictObject({
      bone: z.string(),
      prop: z.string(),
      keys: z.array(z.tuple([z.number().min(0), z.number(), Ease])).min(1),
    }),
  ),
  events: z.array(
    z.union([
      z.strictObject({ t: z.number().min(0), emit: z.string() }),
      z.strictObject({ t: z.number().min(0), sound: id('sound') }),
    ]),
  ),
});
export type Clip = z.infer<typeof Clip>;
