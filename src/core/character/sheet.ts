import { z } from 'zod';
import { id } from '../schema/common';

/**
 * P22 part 2: the character sheet — stats, outfits, moves, animations, voice and behaviour, beside the
 * look (the v68 profile) that characters already had. Every part is optional: a character without it
 * plays as before (old characters keep their look unchanged).
 */
export const Stats = z.strictObject({
  /** hearts (the hero) or hit points (a neighbour that can be harmed) */
  health: z.number().int().min(1).max(99),
  stamina: z.number().int().min(10).max(500),
  /** walking and running speed, 1 = normal */
  speed: z.number().min(0.5).max(2),
  /** jump height, 1 = normal */
  jump: z.number().min(0.5).max(2),
  /** how hard its hits are, 1 = normal */
  strength: z.number().min(0.5).max(3),
  /** each point takes 8% off the damage it takes (at most 80%) */
  defence: z.number().int().min(0).max(10),
  level: z.number().int().min(1).max(99),
  /** how much experience each level needs */
  xpCurve: z.enum(['slow', 'normal', 'fast']),
});
export type Stats = z.infer<typeof Stats>;
export const DEFAULT_STATS: Stats = {
  health: 3,
  stamina: 100,
  speed: 1,
  jump: 1,
  strength: 1,
  defence: 0,
  level: 1,
  xpCurve: 'normal',
};

/** Experience needed to reach a level from the one before (level 2 needs 100 on the normal curve). */
export function xpFor(level: number, curve: Stats['xpCurve']): number {
  const k = curve === 'slow' ? 1.6 : curve === 'fast' ? 1.2 : 1.4;
  return Math.round(100 * (level - 1) ** k);
}
/** The level a total of experience reaches. */
export function levelOf(xp: number, curve: Stats['xpCurve'], max = 99): number {
  let l = 1;
  while (l < max && xp >= xpFor(l + 1, curve)) l++;
  return l;
}

/** what an outfit changes: look fields (hat, shirt, colours…) and stat bonuses */
export const Outfit = z.strictObject({
  name: z.string().min(1).max(40),
  look: z.record(z.string(), z.unknown()),
  stats: z
    .strictObject({
      speed: z.number().min(-1).max(1).optional(),
      jump: z.number().min(-1).max(1).optional(),
      strength: z.number().min(-2).max(2).optional(),
      defence: z.number().int().min(-10).max(10).optional(),
    })
    .optional(),
});
export type Outfit = z.infer<typeof Outfit>;

export const MOVE_STYLES = ['balanced', 'swift', 'heavy', 'defensive'] as const;
export const STYLE_MOVES: Record<
  (typeof MOVE_STYLES)[number],
  { power: number; speed: number; label: string; about: string }
> = {
  balanced: { power: 1, speed: 1, label: 'Balanced', about: 'normal hits at a normal pace' },
  swift: { power: 0.8, speed: 1.3, label: 'Swift', about: 'lighter hits, much quicker' },
  heavy: { power: 1.5, speed: 0.75, label: 'Heavy', about: 'big hits, slower to swing' },
  defensive: { power: 0.9, speed: 1, label: 'Defensive', about: 'a little lighter, guards take less' },
};
export const Moves = z.strictObject({
  style: z.enum(MOVE_STYLES),
  /** fine-tuning on top of the style */
  power: z.number().min(0.5).max(3),
  speed: z.number().min(0.5).max(2),
});
export type Moves = z.infer<typeof Moves>;

/** the clip played for each action (missing: the built-in motion) */
export const ANIM_ACTIONS = ['idle', 'victory', 'hurt', 'walk', 'run', 'jump', 'attack'] as const;
export type AnimAction = (typeof ANIM_ACTIONS)[number];
/** actions Play uses (P23 part 4: all of them, through the animation state machine) */
export const ANIM_LIVE: readonly AnimAction[] = ANIM_ACTIONS;
export const Animations = z.partialRecord(z.enum(ANIM_ACTIONS), id('clip'));
export type Animations = z.infer<typeof Animations>;

export const Voice = z.strictObject({
  /** voice blips in dialogue, 0.5 (deep) to 2 (high) */
  pitch: z.number().min(0.5).max(2),
  /** its own blip sound (none: the game's) */
  blip: id('sound').optional(),
  footsteps: id('sound').optional(),
  /** when it is hurt */
  grunt: id('sound').optional(),
});
export type Voice = z.infer<typeof Voice>;

export const BEHAVIOURS = [
  'hero',
  'villager',
  'shopkeeper',
  'questGiver',
  'companion',
  'enemy',
  'boss',
  'racer',
  'sportsPlayer',
] as const;
export const BEHAVIOUR_INFO: Record<(typeof BEHAVIOURS)[number], { label: string; about: string }> = {
  hero: { label: 'Hero', about: 'played by the player (also a party member)' },
  villager: { label: 'Villager', about: 'lives on the map, talks, says barks' },
  shopkeeper: { label: 'Shopkeeper', about: 'stands at a counter and talks (shops arrive with items, P11)' },
  questGiver: { label: 'Quest giver', about: 'talks about what needs doing (quests arrive with P17)' },
  companion: { label: 'Companion', about: 'a friend of the hero (following arrives with AI brains, P12)' },
  enemy: { label: 'Enemy', about: 'fights the hero (Moves › Fights the hero)' },
  boss: { label: 'Boss', about: 'a big enemy with lots of health' },
  racer: { label: 'Racer', about: 'races the hero (vehicles arrive with P14)' },
  sportsPlayer: { label: 'Sports player', about: 'plays a sport (with sports games, P16)' },
};
export const Behaviour = z.strictObject({
  kind: z.enum(BEHAVIOURS),
  /** what it does on its own: walks around, or stands where it was put */
  routine: z.enum(['wander', 'stand']),
});
export type Behaviour = z.infer<typeof Behaviour>;
