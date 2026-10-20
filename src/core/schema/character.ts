import { z } from 'zod';
import { Body } from '../character/body';
import { Faces } from '../character/faces';
import { Animations, Behaviour, Moves, Outfit, Stats, Voice } from '../character/sheet';
import { StateSettings } from '../character/states';
import { Health } from '../combat/damage';
import { Enemy } from '../combat/enemy';
import { Bark, TalkEntry } from '../dialogue/schema';
import { id } from './common';

/**
 * characters/<charId>.json.
 * `profile` is the v68 CharacterCatalog profile (about 57 fields) kept verbatim until P3.5 turns looks into data;
 * CharacterCatalog.validate() remains its validator.
 */
export const Character = z.strictObject({
  id: id('character'),
  name: z.string().max(60),
  role: z.enum(['hero', 'npc']),
  profile: z.record(z.string(), z.unknown()),
  legacyId: z.number().int().min(1).optional(),
  /** clips this character can play on its own (hero: keys 1-4 in play) */
  emotes: z.array(id('clip')).max(8).optional(),
  /** P9a: a neighbour the hero can hurt (“Can be harmed”); without it, hits do nothing (villagers default to off) */
  harm: z.strictObject({ canBeHarmed: z.boolean(), health: Health }).optional(),
  /** P9b: what the off hand holds (the main hand is the profile's held item) */
  gear: z.strictObject({ offHand: z.enum(['None', 'Shield']) }).optional(),
  /** P9c: it fights the hero (it also needs “Can be harmed” to be beaten) */
  enemy: Enemy.optional(),
  /** P22: which conversation plays when the hero talks to it: the first whose condition holds */
  talk: z.array(TalkEntry).max(12).optional(),
  /** P22: short lines said when the hero walks past */
  barks: z.array(Bark).max(12).optional(),
  /** P22: its name's colour in dialogue boxes */
  nameColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  /** P22 part 2: the character sheet */
  stats: Stats.optional(),
  outfits: z.array(Outfit).max(8).optional(),
  /** the outfit it wears (an outfit's name; none: its own look) */
  outfit: z.string().max(40).optional(),
  moves: Moves.optional(),
  animations: Animations.optional(),
  /** P23 part 4: the numbers of its animation state machine (when it runs, how long a hit shows) */
  states: StateSettings.optional(),
  voice: Voice.optional(),
  behaviour: Behaviour.optional(),
  /** P22 part 3: a body other than the minifig (a family from sliders or a body plan), its colours and bricks */
  body: Body.optional(),
  /** P22 part 4: its face for each mood (dialogue moods): an expression and eyes */
  faces: Faces.optional(),
});
export type Character = z.infer<typeof Character>;
