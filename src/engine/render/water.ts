import type { WaterInstance } from '../../core/schema/instances';
import type { Marker } from './renderer';

/** Milestone 2b: water is drawn as a see-through box up to its surface (in Play and in the Scene) */
const WATER_COLORS: Record<string, [number, number, number]> = {
  pool: [0.35, 0.75, 0.95],
  river: [0.25, 0.55, 0.8],
  lake: [0.2, 0.45, 0.7],
  sea: [0.12, 0.35, 0.6],
};

export function waterMarker(it: WaterInstance): Marker {
  const c = it.color ? hexRgb(it.color) : (WATER_COLORS[it.body] ?? WATER_COLORS.pool!);
  return {
    pos: [it.pos[0] + it.size[0] / 2, it.pos[1] + it.size[1] / 2, it.pos[2] + it.size[2] / 2],
    size: [it.size[0], it.size[1], it.size[2]],
    color: c,
    alpha: 0.45,
  };
}

const hexRgb = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.replace('#', ''), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Milestone 2b, 10c part 4: a body of water as the renderers draw it: its box, colour and current */
export type WaterSurface = {
  min: [number, number, number];
  max: [number, number, number];
  color: [number, number, number];
  current: [number, number];
};

export function waterSurface(it: WaterInstance): WaterSurface {
  return {
    min: [it.pos[0], it.pos[1], it.pos[2]],
    max: [it.pos[0] + it.size[0], it.pos[1] + it.size[1], it.pos[2] + it.size[2]],
    color: it.color ? hexRgb(it.color) : (WATER_COLORS[it.body] ?? WATER_COLORS.pool!),
    current: it.current ?? [0, 0],
  };
}

/** the water's body under its surface: a see-through box, a little lighter than before (the surface shows on top) */
export function waterBody(w: WaterSurface): Marker {
  return {
    pos: [(w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2 - 0.01, (w.min[2] + w.max[2]) / 2],
    size: [w.max[0] - w.min[0], w.max[1] - w.min[1] - 0.02, w.max[2] - w.min[2]],
    color: w.color,
    alpha: 0.35,
  };
}

/** the water whose surface the reflection is drawn for: the one nearest what the camera looks at */
export function reflectedWater(list: readonly WaterSurface[], focus: readonly number[]): WaterSurface | null {
  let best: WaterSurface | null = null;
  let dist = Infinity;
  for (const w of list) {
    const dx = Math.max(w.min[0] - focus[0]!, 0, focus[0]! - w.max[0]);
    const dz = Math.max(w.min[2] - focus[2]!, 0, focus[2]! - w.max[2]);
    const d = Math.hypot(dx, dz) + Math.abs(w.max[1] - focus[1]!) * 0.5;
    if (d < dist) {
      dist = d;
      best = w;
    }
  }
  return best;
}

/** a mirror at height h: the world turned upside down about the water's surface (column-major) */
export function mirrorAt(h: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * h, 0, 1]);
}
