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
  z.strictObject({
    do: z.literal('game'),
    op: z.enum([
      'start',
      'resume',
      'pause',
      'retry',
      'quit',
      'continue',
      'saveMenu',
      'loadMenu',
      // P26 part 2
      'finish',
      'newGamePlus',
      'settingsMenu',
      'achievementsMenu',
    ]),
  }),
  /** P26: save the game (to a slot; none: the slot in use) — a save point's “Save” runs this */
  z.strictObject({ do: z.literal('save'), slot: z.number().int().min(1).max(3).optional() }),
  /** P26: load a save (none: the newest) */
  z.strictObject({ do: z.literal('load'), slot: z.number().int().min(0).max(3).optional() }),
  /** P26: a slot button of the Saves screen: saves or loads that slot, as the screen was opened for */
  z.strictObject({ do: z.literal('slot'), slot: z.number().int().min(1).max(3) }),
  /** P26: Retry and falls come back to where the hero stands now */
  z.strictObject({ do: z.literal('checkpoint') }),
  /** P26 part 2: unlock an achievement (Project › Progress) for this player */
  z.strictObject({ do: z.literal('achieve'), id: z.string().min(1).max(40) }),
  /** P26 part 2: a player setting steps to its next value (Settings screen), or is set */
  z.strictObject({
    do: z.literal('setting'),
    key: z.enum(['music', 'sounds', 'invertY', 'cameraSpeed', 'textSize', 'difficulty', 'reduceMotion']),
    value: z.union([z.number(), z.boolean(), z.string()]).optional(),
  }),
  /** P22 part 2: the hero puts on an outfit from its sheet ('' : its own look) */
  z.strictObject({ do: z.literal('outfit'), name: z.string().max(40) }),
  /** P22 part 2: experience for the hero (levels come from its sheet's curve) */
  z.strictObject({ do: z.literal('xp'), amount: z.number().int().min(-10000).max(10000) }),
  /**
   * P23: play an effect: at the hero (at empty), at the object doing it ('self'), or at an object, neighbour
   * or placed effect by name
   */
  z.strictObject({ do: z.literal('effect'), effect: id('effect'), at: z.string().max(60).optional() }),
  /** P23: start or stop an effect placed on the map (by its name) */
  z.strictObject({ do: z.literal('effectOn'), name: z.string().min(1).max(60), on: z.boolean() }),
  /** P27: switch a light placed on the map (by its name; an asset that gives light too) on, off or over */
  z.strictObject({
    do: z.literal('lightOn'),
    name: z.string().min(1).max(60),
    on: z.enum(['on', 'off', 'toggle']),
  }),
  /** P23 part 2: play a screen effect (shake, flash, fade, hit-stop, slow motion) */
  z.strictObject({ do: z.literal('screenEffect'), effect: id('screenEffect') }),
  /** P22: start a conversation (a sign, an object's interaction, a screen button or logic) */
  z.strictObject({ do: z.literal('talk'), conversation: id('dialogue') }),
  /** a one-shot music stinger from audio/music.json (ducks the music while it plays) */
  z.strictObject({ do: z.literal('stinger'), stinger: z.string().min(1) }),
  /** P9c: a message in the HUD's message line (help, hints, story text): screen UI, never in the 3D world */
  z.strictObject({
    do: z.literal('message'),
    text: z.string().min(1).max(200),
    seconds: z.number().min(0.5).max(30).optional(),
  }),
]);
export type Action = z.infer<typeof Action>;
export const ActionList = z.array(Action);
