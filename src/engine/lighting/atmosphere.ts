import type { SkyCycleApi, SkySample } from '../../core/legacy/modules';
import { type Ambient, type Fog, skyElapsed } from '../../core/lighting/atmosphere';
import type { MapDoc } from '../../core/schema';

/**
 * P27 part 2: the sky and fog of a map at a moment: v68's sky for its start time moved on by the game clock (at
 * the map's day length), the shadows tinted by its ambient, and its fog (the sky fades toward thick fog).
 */
export type FogParams = {
  near: number;
  far: number;
  /** how thick at the far end (v68: 0.62) */
  max: number;
  color: [number, number, number];
  /** ground fog: height (world units) and thickness (0: none) */
  height: number;
  ground: number;
};

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => (Number.parseInt(hex.slice(i, i + 2), 16) / 255) ** 1.5) as [number, number, number];
const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);

/** the shadows' light: the sky's, pulled toward the ambient colour and scaled by its strength */
export function ambientOf(skyAmbient: readonly number[], a: Ambient | undefined): number[] {
  if (!a) return [...skyAmbient];
  const lum = (skyAmbient[0]! + skyAmbient[1]! + skyAmbient[2]!) / 3;
  const c = rgb(a.color);
  const k = Math.max(...c) || 1;
  // the colour, as bright as the sky's own ambient, then scaled
  const tinted = c.map((v) => (v / k) * lum * 1.2);
  return mix(skyAmbient, tinted, 0.75).map((v) => v * a.strength);
}

export function fogParams(fog: Fog | undefined, sky: SkySample): FogParams | null {
  if (!fog) return null;
  return {
    near: fog.near,
    far: fog.far,
    max: fog.thickness,
    color: fog.color ? rgb(fog.color) : (sky.horizon.slice(0, 3) as [number, number, number]),
    height: fog.height ?? 0,
    ground: fog.height === undefined ? 0 : (fog.groundThickness ?? 0.8),
  };
}

export type Atmosphere = { sky: SkySample; fog: FogParams | null };

/** the map's sky and fog `seconds` into the game (the editor shows it at a chosen hour the same way) */
export function atmosphere(
  map: Pick<MapDoc, 'sky' | 'weather' | 'fog' | 'ambient' | 'dayLength'>,
  seconds: number,
  cycle: Pick<SkyCycleApi, 'sample'>,
  /** an editor preview of the hour: seconds of v68's day from the start time, the day length aside */
  previewSky?: number,
): Atmosphere {
  const elapsed = previewSky ?? skyElapsed(seconds, map.dayLength);
  const base = cycle.sample(map.sky.time, elapsed, map.weather.rain, map.weather.snowing);
  const fog = fogParams(map.fog, base);
  let sky: SkySample = { ...base, ambient: ambientOf(base.ambient, map.ambient) };
  // thick fog hides the sky too
  if (fog) {
    const k = Math.max(0, Math.min(1, (160 - fog.far) / 160)) * fog.max;
    if (k > 0) sky = { ...sky, horizon: mix(sky.horizon, fog.color, k), zenith: mix(sky.zenith, fog.color, k * 0.8) };
  }
  return { sky, fog };
}
