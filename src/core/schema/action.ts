import { z } from 'zod';
import { id } from './common';

/**
 * The one Action union shared by assets, zones, screens, cinematics and logic.
 * The runtime executes every list of actions through runActions(actions, ctx).
 */
export const Action = z.discriminatedUnion('do', [
  z.strictObject({ do: z.literal('emit'), event: z.string().min(1) }),
  z.strictObject({ do: z.literal('sound'), event: id('sound') }),
  z.strictObject({ do: z.literal('music'), music: id('music').nullable(), fade: z.number().min(0).optional() }),
  z.strictObject({ do: z.literal('showScreen'), screen: id('screen'), replace: z.boolean().optional() }),
  z.strictObject({ do: z.literal('hideScreen'), screen: id('screen') }),
  z.strictObject({ do: z.literal('cinematic'), cinematic: id('cinematic'), once: z.boolean().optional() }),
  z.strictObject({ do: z.literal('setVar'), var: z.string().min(1), value: z.unknown() }),
  z.strictObject({ do: z.literal('addVar'), var: z.string().min(1), value: z.number() }),
  z.strictObject({ do: z.literal('setState'), state: z.string().min(1), target: id('instance').optional() }),
  z.strictObject({ do: z.literal('teleport'), spawn: id('spawn') }),
  z.strictObject({ do: z.literal('travel'), map: id('map'), spawn: id('spawn') }),
  z.strictObject({ do: z.literal('give'), item: z.string().min(1), count: z.number().int().positive().optional() }),
  z.strictObject({ do: z.literal('spawn'), asset: id('asset'), at: id('spawn') }),
  z.strictObject({ do: z.literal('despawn'), target: id('instance') }),
  z.strictObject({ do: z.literal('wait'), seconds: z.number().min(0) }),
  /** game flow from screens: start (title → HUD), resume (close pause), retry (last checkpoint), quit (to title) */
  z.strictObject({ do: z.literal('game'), op: z.enum(['start', 'resume', 'pause', 'retry', 'quit']) }),
  /** a one-shot music stinger from audio/music.json (ducks the music while it plays) */
  z.strictObject({ do: z.literal('stinger'), stinger: z.string().min(1) }),
]);
export type Action = z.infer<typeof Action>;
export const ActionList = z.array(Action);
