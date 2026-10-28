import { z } from 'zod';
import { DAMAGE_TYPES, type Health } from './damage';

/** step 11, 4a: the kinds of fighter (the built-in brains of step 14 are one each) */
export const ENEMY_STYLES = [
  'melee',
  'knight',
  'turret',
  'shooter',
  'popup',
  'flyer',
  'swarm',
  'ambusher',
  'ghost',
  'pack',
  'boss',
] as const;
export type EnemyStyle = (typeof ENEMY_STYLES)[number];
export const STYLE_INFO: Record<EnemyStyle, { label: string; about: string; now: string }> = {
  melee: { label: 'Melee', about: 'walks over and swings', now: 'walks over and swings' },
  knight: {
    label: 'Knight',
    about: 'blocks from the front, side-steps and counters',
    now: 'walks over and swings; its front blocks (set by its sides)',
  },
  turret: {
    label: 'Turret',
    about: 'stays put, turns to watch, fires when it sees you',
    now: 'stays put and turns to watch, striking what comes close',
  },
  shooter: {
    label: 'Shooter',
    about: 'keeps its distance and fires',
    now: 'walks over and swings (shots come in step 14)',
  },
  popup: {
    label: 'Pop-up',
    about: 'hides, pops up to fire, hides again',
    now: 'walks over and swings (hiding comes in step 14)',
  },
  flyer: {
    label: 'Flyer',
    about: 'flies and swoops',
    now: 'hovers as it walks over and swings (flight comes in step 14)',
  },
  swarm: { label: 'Swarm', about: 'many weak ones, erratic', now: 'walks over and swings' },
  ambusher: { label: 'Ambusher', about: 'waits hidden and drops on you', now: 'stands still until you come close' },
  ghost: {
    label: 'Ghost',
    about: 'fades in and out, can only be hit when seen',
    now: 'walks over and swings, half see-through',
  },
  pack: {
    label: 'Pack hunter',
    about: 'circles you and calls the others',
    now: 'walks over and swings; calls the others near it',
  },
  boss: { label: 'Boss', about: 'phases and weak moments', now: 'walks over and swings (phases come in step 14)' },
};

/**
 * P9c: a neighbour that fights the hero. When the hero comes within `sight` it walks over; within `reach` it
 * raises its arm for `windup` seconds (the tell: guard, dodge or parry now), then hits for `power` of `type`,
 * and waits `cooldown` before the next swing. A stunned enemy (shield bash, knock-back, parry) stops for a moment.
 */
export const Enemy = z.strictObject({
  power: z.number().min(0).max(20),
  type: z.enum(DAMAGE_TYPES),
  /** studs */
  reach: z.number().min(1).max(6),
  /** studs: how far away it notices the hero */
  sight: z.number().min(2).max(30),
  /** walking speed, 1 = a neighbour's normal walk */
  speed: z.number().min(0.2).max(3),
  /** seconds between swings */
  cooldown: z.number().min(0.3).max(10),
  /** seconds the swing is telegraphed before it lands */
  windup: z.number().min(0.1).max(2),
  /** step 11, 4a: how wide it sees, in degrees (360: all round; 120: only in front, so it can be sneaked past) */
  cone: z.number().min(30).max(360).optional(),
  /** step 11, 4a: studs: it hears the hero running or fighting this close, even out of sight */
  hearing: z.number().min(0).max(30).optional(),
  /**
   * step 11, 4a: how it decides — simple (the same pattern every time), smart (backs off after a swing, waits for an
   * opening), pack (calls the others near it when it sees the hero)
   */
  wits: z.enum(['simple', 'smart', 'pack']).optional(),
  /** step 11, 4a: the kind of fighter it is: today a melee fighter or a turret; its full brain comes in step 14 */
  style: z.enum(ENEMY_STYLES).optional(),
});
export type Enemy = z.infer<typeof Enemy>;

export const ENEMY_PRESETS: Record<string, { name: string; enemy: Enemy; health: Health }> = {
  grunt: {
    name: 'Grunt — 3 hits, slow swings',
    enemy: { power: 1, type: 'blunt', reach: 1.9, sight: 10, speed: 1.4, cooldown: 1.8, windup: 0.6 },
    health: { hp: 3, atZero: { break: false } },
  },
  brute: {
    name: 'Brute — tough and armoured, hits hard',
    enemy: { power: 2, type: 'blunt', reach: 2.2, sight: 9, speed: 1, cooldown: 2.4, windup: 0.9 },
    health: { hp: 8, armor: 1, atZero: { break: false } },
  },
  swift: {
    name: 'Swift — fragile, fast and quick to strike',
    enemy: { power: 1, type: 'slash', reach: 1.7, sight: 13, speed: 2.1, cooldown: 1.1, windup: 0.35 },
    health: { hp: 2, atZero: { break: false } },
  },
};
