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
