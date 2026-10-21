import { z } from 'zod';
import { DAMAGE_TYPES } from '../combat/damage';
import { LightDef } from '../lighting/light';
import { id } from '../schema/common';

/**
 * P23 part 1: effects. An effect is a recipe for particles that are tiny bricks, plates, tiles and studs:
 * how many, where they start, how fast and which way they fly, how long they live, how their size and
 * colour change over their life, gravity, drag and bouncing off bricks. A burst throws them all at once
 * (a hit, an explosion); a stream keeps making them (fire, smoke, a fountain).
 */
export const PARTICLE_SHAPES = ['brick', 'plate', 'tile', 'stud'] as const;
export const SPAWN_SHAPES = ['point', 'sphere', 'ring', 'box', 'line'] as const;
export const DIRECTIONS = ['up', 'out', 'down', 'forward'] as const;

const range = (lo: number, hi: number) => z.tuple([z.number().min(lo).max(hi), z.number().min(lo).max(hi)]);
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const Effect = z.strictObject({
  id: id('effect'),
  name: z.string().min(1).max(40),
  /** what each particle is */
  shape: z.enum(PARTICLE_SHAPES),
  /** burst: all at once; stream: so many a second, for `duration` seconds (0: as long as it plays) */
  mode: z.enum(['burst', 'stream']),
  count: z.number().int().min(1).max(400),
  rate: z.number().min(0).max(400),
  duration: z.number().min(0).max(60),
  /** where particles start, around the effect's point (radius in studs) */
  spawn: z.enum(SPAWN_SHAPES),
  radius: z.number().min(0).max(20),
  /** which way they fly, and how far from it (degrees: 0 a straight line, 180 every way) */
  direction: z.enum(DIRECTIONS),
  spread: z.number().min(0).max(180),
  /** studs a second */
  speed: range(0, 60),
  /** seconds */
  life: range(0.05, 20),
  /** studs across, at birth and at death */
  size: range(0.02, 3),
  /** colour over life: the first at birth, the last at death */
  colors: z.array(hex).min(1).max(4),
  /** studs a second², down (negative: they rise) */
  gravity: z.number().min(-40).max(40),
  /** how fast they slow down (0: never) */
  drag: z.number().min(0).max(10),
  /** how much speed they keep when they hit bricks (0: no bouncing, they pass through) */
  bounce: z.number().min(0).max(1),
  /** P27: it lights what is around it while it plays (fire, magic) */
  light: LightDef.optional(),
});
export type Effect = z.infer<typeof Effect>;

/** Which effect plays for things that happen in a game (none set: the built-in one; 'none': nothing). */
export const EFFECT_EVENTS = ['levelUp', 'heal', 'coin', 'smash', 'defeat'] as const;
export type EffectEvent = (typeof EFFECT_EVENTS)[number];
const EffectRef = z.union([id('effect'), z.literal('none')]);
export const EffectHooks = z.strictObject({
  /** a hit, by its damage type */
  hits: z.partialRecord(z.enum(DAMAGE_TYPES), EffectRef).optional(),
  events: z.partialRecord(z.enum(EFFECT_EVENTS), EffectRef).optional(),
});
export type EffectHooks = z.infer<typeof EffectHooks>;
export const EVENT_INFO: Record<EffectEvent, string> = {
  levelUp: 'Level up',
  heal: 'Healing',
  coin: 'Picking up treasure',
  smash: 'Bricks breaking',
  defeat: 'An enemy beaten',
};

/** At most this many effects in a game (built-in ones do not count). */
export const MAX_EFFECTS = 80;
