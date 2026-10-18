import { z } from 'zod';
import { DAMAGE_TYPES, type Health } from './damage';

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
