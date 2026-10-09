import { z } from 'zod';
import { ActionList } from './action';
import { id } from './common';

const End = z.strictObject({ map: id('map'), spawn: id('spawn') });

export const Gate = z.strictObject({
  id: id('gate'),
  from: End,
  to: End,
  twoWay: z.boolean(),
  onArrive: ActionList.optional(),
  legacyId: z.number().int().positive().optional(),
});

/** world/gates.json */
export const Gates = z.strictObject({
  gates: z.array(Gate).max(256),
  /** order maps appear in the World graph (legacy maps[] order) */
  mapOrder: z.array(id('map')),
});
export type Gates = z.infer<typeof Gates>;
