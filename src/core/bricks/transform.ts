import type { Brick } from './codec';
import { footprint } from './inspect';

/** Integer pivot near the center of a set of bricks' footprints. */
export function pivotOf(bricks: readonly Brick[]): [number, number] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const b of bricks) {
    const [w, d] = footprint(b);
    x0 = Math.min(x0, b.x);
    z0 = Math.min(z0, b.z);
    x1 = Math.max(x1, b.x + w);
    z1 = Math.max(z1, b.z + d);
  }
  return [Math.round((x0 + x1) / 2), Math.round((z0 + z1) / 2)];
}

/**
 * Rotates bricks a quarter turn (counter-clockwise seen from above) around an integer pivot.
 * Positions stay whole studs; each brick's footprint swaps width and depth.
 */
export function rotateQuarter(bricks: readonly Brick[], pivot = pivotOf(bricks)): Brick[] {
  const [cx, cz] = pivot;
  return bricks.map((b) => {
    const [, d] = footprint(b);
    return { ...b, x: cx + cz - b.z - d, z: cz - cx + b.x, rot: (b.rot + 1) % 4 };
  });
}
