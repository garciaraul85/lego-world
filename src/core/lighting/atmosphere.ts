import { z } from 'zod';

/**
 * P27 part 2: a map's atmosphere — fog by distance (and low ground fog by height), the colour of the light that
 * fills the shadows (ambient), and how long its day lasts while the game plays (the sun moves, night falls).
 */
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const Fog = z.strictObject({
  /** studs from the eye where fog starts, and where it is thickest */
  near: z.number().min(0).max(400),
  far: z.number().min(2).max(600),
  /** how thick it gets far away: 0 none … 1 nothing shows through (v68's own haze is 0.62) */
  thickness: z.number().min(0).max(1),
  /** its colour (none: the sky's horizon) */
  color: hex.optional(),
  /** ground fog: thick below this height (world units), thinning above it */
  height: z.number().min(-20).max(100).optional(),
  groundThickness: z.number().min(0).max(1).optional(),
});
export type Fog = z.infer<typeof Fog>;

export const Ambient = z.strictObject({
  /** the colour shadows are filled with (a green cave, a red sunset) */
  color: hex,
  /** 0 black shadows … 1 as the sky gives … 2 twice as bright */
  strength: z.number().min(0).max(2),
});
export type Ambient = z.infer<typeof Ambient>;

/** minutes a whole day takes while the game plays (v68: 20); 0: time stands still */
export const DayLength = z.number().min(0).max(120);
export const DEFAULT_DAY_MINUTES = 20;

export const FOG_PRESETS = ['haze', 'mist', 'thick', 'ground', 'swamp', 'smoke'] as const;
export type FogPreset = (typeof FOG_PRESETS)[number];
export const FOG_PRESET: Record<FogPreset, { name: string; about: string; fog: Fog }> = {
  haze: { name: 'Haze', about: 'A light haze far away', fog: { near: 40, far: 160, thickness: 0.5 } },
  mist: {
    name: 'Mist',
    about: 'Pale mist: the far side of the map fades',
    fog: { near: 10, far: 60, thickness: 0.85, color: '#c8d2dc' },
  },
  thick: {
    name: 'Thick fog',
    about: 'You see a few steps ahead',
    fog: { near: 2, far: 24, thickness: 1, color: '#9aa4ad' },
  },
  ground: {
    name: 'Ground fog',
    about: 'Low fog lying on the ground',
    fog: { near: 60, far: 220, thickness: 0.4, height: 2.5, groundThickness: 0.8, color: '#d5dde6' },
  },
  swamp: {
    name: 'Swamp',
    about: 'Green murk, low and thick',
    fog: { near: 6, far: 50, thickness: 0.9, color: '#5d7a4a', height: 3, groundThickness: 0.9 },
  },
  smoke: {
    name: 'Smoke',
    about: 'Brown smoke over a battlefield',
    fog: { near: 8, far: 70, thickness: 0.85, color: '#6b5a4a' },
  },
};

/** which preset a fog is (null: changed from all of them) */
export function fogPresetOf(f: Fog | undefined): FogPreset | null {
  if (!f) return null;
  for (const k of FOG_PRESETS) if (JSON.stringify(FOG_PRESET[k].fog) === JSON.stringify(f)) return k;
  return null;
}

/** the game's clock (seconds) as v68's sky clock, for a day of `minutes` (0: stands still) */
export function skyElapsed(seconds: number, minutes: number | undefined): number {
  const m = minutes ?? DEFAULT_DAY_MINUTES;
  if (m <= 0) return 0;
  return seconds * (DEFAULT_DAY_MINUTES / m);
}

/** what the hour is at a point of the day: 0 = the map's start time, 1 = a whole day later */
export const DAY_SECONDS = 1200;
