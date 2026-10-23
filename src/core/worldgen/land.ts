import type { Brick } from '../bricks/codec';
import { MAX_BRICKS_PER_MAP } from '../bricks/map-bricks';

/**
 * P27 part 3: big land for big worlds — rolling grass with hills of stacked bricks (dirt below, grass on top,
 * snow on the highest), a flat clearing in the middle for the start. Every brick sits on the one below or on
 * the ground plates, so the map follows the brick rules by construction. Sizes are studs per side.
 */
export const LAND_SIZES = [256, 512, 1024, 2048] as const;
export type LandSize = (typeof LAND_SIZES)[number];
export type LandConfig = { size: LandSize; seed: number };

const CLEARING = 24;
const GRASS = ['#4b9f4a', '#3f8f3e', '#58a852'];
const DIRT = '#8a6a45';
const HILL = '#5aa04a';
const SNOW = '#f2f3f2';

/** smooth value noise in 0..1 at (x, z), cells of `scale` studs */
function noise(seed: number, x: number, z: number, scale: number): number {
  const h = (ix: number, iz: number) => {
    let n = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
}

/** hill height at a 2×2 column, in bricks (0: flat grass) */
export function hillAt(cfg: LandConfig, x: number, z: number): number {
  if (Math.abs(x) < CLEARING && Math.abs(z) < CLEARING) return 0;
  const n = noise(cfg.seed, x, z, 96) * 0.7 + noise(cfg.seed + 7, x, z, 24) * 0.3;
  return Math.max(0, Math.floor((n - 0.52) * 22));
}

/** room left on a map of big land for building (bricks) */
export const LAND_ROOM = 50_000;

/** the land's bricks (ids from 1), leaving LAND_ROOM bricks of room on the map */
export function generateLand(cfg: LandConfig): Brick[] {
  const half = cfg.size / 2;
  const cap = MAX_BRICKS_PER_MAP - LAND_ROOM;
  const out: Brick[] = [];
  let id = 1;
  for (let x = -half; x < half; x += 4)
    for (let z = -half; z < half; z += 4) {
      const g = Math.floor(noise(cfg.seed + 3, x, z, 40) * GRASS.length) % GRASS.length;
      out.push({ id: id++, type: 'plate4x4', x, y: 0, z, rot: 0, color: GRASS[g]!, flags: 4 });
    }
  // hills: columns of 2×2 bricks on the ground plates, while there is room on the map
  for (let x = -half; x < half && out.length < cap; x += 2)
    for (let z = -half; z < half && out.length < cap; z += 2) {
      const h = hillAt(cfg, x, z);
      for (let k = 0; k < h && out.length < cap; k++) {
        const top = k === h - 1;
        const color = top ? (k >= 7 ? SNOW : HILL) : DIRT;
        out.push({ id: id++, type: 'brick2x2', x, y: 1 + k * 3, z, rot: 0, color, flags: 4 });
      }
    }
  return out;
}
