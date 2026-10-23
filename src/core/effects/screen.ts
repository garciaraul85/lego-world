import { z } from 'zod';
import { id } from '../schema/common';

/**
 * P23 part 2: screen effects — what happens to the whole view, not to things in the world: the camera shakes,
 * the screen flashes a colour or fades, the game freezes for a split second on a heavy hit (hit-stop), or runs
 * in slow motion. One screen effect can do several at once (a big hit: shake + white flash + hit-stop).
 */
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const ScreenEffect = z
  .strictObject({
    id: id('screenEffect'),
    name: z.string().min(1).max(40),
    /** the camera shakes: how hard (studs), for how long; a rumble is slow and heavy, a shake quick */
    shake: z
      .strictObject({
        strength: z.number().min(0.02).max(3),
        seconds: z.number().min(0.05).max(5),
        rumble: z.boolean(),
      })
      .optional(),
    /** the screen flashes a colour, then fades back */
    flash: z
      .strictObject({ color: hex, alpha: z.number().min(0.05).max(1), seconds: z.number().min(0.05).max(3) })
      .optional(),
    /** the screen fades to a colour (out), from it (in), or out and back in */
    fade: z
      .strictObject({ color: hex, mode: z.enum(['out', 'in', 'outIn']), seconds: z.number().min(0.1).max(5) })
      .optional(),
    /** the game freezes for this many seconds (a heavy hit lands); sounds and the screen go on */
    hitStop: z.number().min(0.02).max(0.5).optional(),
    /** the game runs slower for a while (speed 0.1–0.9 of normal) */
    slowMo: z.strictObject({ speed: z.number().min(0.1).max(0.9), seconds: z.number().min(0.1).max(5) }).optional(),
  })
  .refine((e) => !!(e.shake || e.flash || e.fade || e.hitStop || e.slowMo), {
    message: 'a screen effect does at least one thing (shake, flash, fade, hit-stop or slow motion)',
  });
export type ScreenEffect = z.infer<typeof ScreenEffect>;

/** the parts of a screen effect, in the order the editor shows them */
export const SCREEN_PARTS = ['shake', 'flash', 'fade', 'hitStop', 'slowMo'] as const;
export type ScreenPart = (typeof SCREEN_PARTS)[number];
export const PART_INFO: Record<ScreenPart, { label: string; about: string }> = {
  shake: { label: 'Shake', about: 'The camera shakes: a quick shake for hits, a slow rumble for earthquakes.' },
  flash: { label: 'Flash', about: 'The screen flashes a colour and fades back.' },
  fade: { label: 'Fade', about: 'The screen fades to a colour, from a colour, or out and back in.' },
  hitStop: { label: 'Hit-stop', about: 'The game freezes for a split second, so a heavy hit feels heavy.' },
  slowMo: { label: 'Slow motion', about: 'The game runs slower for a while.' },
};

/** What plays a screen effect in a game by itself (none set: the built-in one; 'none': nothing). */
export const SCREEN_EVENTS = ['hurt', 'bigHit', 'levelUp', 'defeat', 'death', 'land', 'smash'] as const;
export type ScreenEvent = (typeof SCREEN_EVENTS)[number];
export const SCREEN_EVENT_INFO: Record<ScreenEvent, string> = {
  hurt: 'The hero is hurt',
  bigHit: 'The hero lands a charged hit',
  levelUp: 'Level up',
  defeat: 'An enemy beaten',
  death: 'The hero is beaten',
  land: 'Landing from a high fall',
  smash: 'Bricks breaking',
};
const Ref = z.union([id('screenEffect'), z.literal('none')]);
export const ScreenHooks = z.strictObject({
  events: z.partialRecord(z.enum(SCREEN_EVENTS), Ref).optional(),
  /** red edges that pulse while the hero is low on health (on unless turned off) */
  lowHealth: z.boolean().optional(),
});
export type ScreenHooks = z.infer<typeof ScreenHooks>;

/** At most this many screen effects in a game (built-in ones do not count). */
export const MAX_SCREEN_EFFECTS = 40;

/**
 * A map's mood: a colour grade over the whole view, a dark vignette at the edges, and something drifting
 * across the screen (rain streaks, snow, fog, dust, embers). Logic can change it while the game runs.
 */
export const GRADES = ['none', 'warm', 'cold', 'night', 'dream', 'oldFilm', 'mono', 'toxic'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_INFO: Record<Grade, { label: string; filter: string }> = {
  none: { label: 'None', filter: 'none' },
  warm: { label: 'Warm (sunset)', filter: 'sepia(0.25) saturate(1.25) hue-rotate(-8deg) brightness(1.03)' },
  cold: { label: 'Cold (winter)', filter: 'saturate(0.8) hue-rotate(12deg) brightness(1.02) contrast(1.05)' },
  night: { label: 'Night', filter: 'brightness(0.62) saturate(0.7) hue-rotate(18deg) contrast(1.1)' },
  dream: { label: 'Dream', filter: 'saturate(1.4) brightness(1.08) contrast(0.9) hue-rotate(-20deg)' },
  oldFilm: { label: 'Old film', filter: 'sepia(0.8) contrast(1.1) brightness(0.95)' },
  mono: { label: 'Black and white', filter: 'grayscale(1) contrast(1.1)' },
  toxic: { label: 'Toxic', filter: 'saturate(1.6) hue-rotate(50deg) contrast(1.05)' },
};
export const DRIFTS = ['none', 'rain', 'snow', 'fog', 'dust', 'embers', 'leaves'] as const;
export type Drift = (typeof DRIFTS)[number];
export const DRIFT_INFO: Record<Drift, string> = {
  none: 'Nothing',
  rain: 'Rain streaks',
  snow: 'Snowflakes',
  fog: 'Fog',
  dust: 'Dust',
  embers: 'Embers',
  leaves: 'Falling leaves',
};
export const Mood = z.strictObject({
  grade: z.enum(GRADES),
  /** dark edges, 0 (none) to 1 (strong) */
  vignette: z.number().min(0).max(1),
  drift: z.enum(DRIFTS),
  /** how much drifts across, 0–1 */
  amount: z.number().min(0).max(1),
});
export type Mood = z.infer<typeof Mood>;
export const NO_MOOD: Mood = { grade: 'none', vignette: 0, drift: 'none', amount: 0.5 };
