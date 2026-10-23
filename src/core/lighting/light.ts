import { z } from 'zod';

/**
 * P27 part 1: lights. A light lights the bricks and characters around it: its colour, how bright it is, how far it
 * reaches, whether it flickers like a flame and whether it casts shadows. Lights are placed on a map, carried by an
 * asset (a torch, a lamp) or by an effect (fire glows). A map can be dark, so only its lights show it.
 */
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const LightDef = z.strictObject({
  color: hex,
  /** 0 off … 4 very bright */
  brightness: z.number().min(0).max(4),
  /** studs it reaches */
  range: z.number().min(2).max(40),
  /** 0 steady … 1 a flame in the wind */
  flicker: z.number().min(0).max(1),
  /** bricks block it: shadows (the nearest such light casts them) */
  shadow: z.boolean(),
  /** P27 part 2: it shines only at night (a street lamp), coming on as the sky gets dark */
  atNight: z.boolean().optional(),
});
export type LightDef = z.infer<typeof LightDef>;

/** an asset's light: where on it (studs across, world units up, studs deep, from its corner) and in which states */
export const AssetLight = LightDef.extend({
  at: z.tuple([z.number(), z.number(), z.number()]),
  /** it glows only in these states (none: always) */
  states: z.array(z.string()).max(8).optional(),
});
export type AssetLight = z.infer<typeof AssetLight>;

export const LIGHT_PRESETS = ['torch', 'candle', 'lamp', 'crystal', 'lava', 'moon'] as const;
export type LightPreset = (typeof LIGHT_PRESETS)[number];
export const LIGHT_PRESET: Record<LightPreset, { name: string; about: string; light: LightDef }> = {
  torch: {
    name: 'Torch',
    about: 'Warm orange, flickers like a flame, casts shadows',
    light: { color: '#ff9a3c', brightness: 1.6, range: 11, flicker: 0.5, shadow: true },
  },
  candle: {
    name: 'Candle',
    about: 'A small warm glow',
    light: { color: '#ffc26b', brightness: 1, range: 5, flicker: 0.35, shadow: false },
  },
  lamp: {
    name: 'Lamp',
    about: 'Steady warm white, lights a room',
    light: { color: '#fff0d0', brightness: 1.4, range: 15, flicker: 0, shadow: false },
  },
  crystal: {
    name: 'Crystal',
    about: 'Cold blue magic, steady',
    light: { color: '#6fb8ff', brightness: 1.3, range: 9, flicker: 0.05, shadow: false },
  },
  lava: {
    name: 'Lava glow',
    about: 'Deep red, slowly pulsing',
    light: { color: '#ff4a1c', brightness: 1.8, range: 13, flicker: 0.2, shadow: false },
  },
  moon: {
    name: 'Moonbeam',
    about: 'Pale silver light from above',
    light: { color: '#c8d8ff', brightness: 0.9, range: 24, flicker: 0, shadow: true },
  },
};

/** which preset a light is (null: changed from all of them) */
export function presetOf(l: LightDef): LightPreset | null {
  for (const k of LIGHT_PRESETS) {
    const p = LIGHT_PRESET[k].light;
    if (
      p.color.toLowerCase() === l.color.toLowerCase() &&
      p.brightness === l.brightness &&
      p.range === l.range &&
      p.flicker === l.flicker &&
      p.shadow === l.shadow &&
      !l.atNight
    )
      return k;
  }
  return null;
}

/**
 * How bright a flickering light is at time t (1: its own brightness): a few slow and quick waves, different for
 * each light (seed), never below 1 − flicker.
 */
export function flickerAt(flicker: number, t: number, seed = 0): number {
  if (flicker <= 0) return 1;
  const s = seed * 1.7;
  const w = 0.5 * Math.sin(t * 7.3 + s) + 0.3 * Math.sin(t * 13.1 + s * 2.3) + 0.2 * Math.sin(t * 23.7 + s * 0.7);
  return 1 - flicker * 0.5 * (1 - w);
}

/** a light's colour as the renderer takes it: linear, times its brightness (and its flicker now) */
export function lightRgb(l: Pick<LightDef, 'color' | 'brightness'>, k = 1): [number, number, number] {
  const c = [1, 3, 5].map((i) => (Number.parseInt(l.color.slice(i, i + 2), 16) / 255) ** 2.2);
  return [c[0]! * l.brightness * k, c[1]! * l.brightness * k, c[2]! * l.brightness * k];
}

/** how dark a map is without lights: 0 lit by its sky as usual … 1 pitch black */
export const Darkness = z.number().min(0).max(1);
