import type { Brick } from './codec';
import { footprint } from './inspect';
import { brickHeight } from './map-bricks';

/**
 * Milestone 3, step 11 (P24 part 1a): faster building on an asset's build plate — mirror placing, fill painting and
 * copy-and-stamp — as pure functions over bricks, so the plate, Brix and tests share them.
 */

/** where the mirror planes stand, in studs along X and Z (null: off). A plane at 0 sits between studs -1 and 0. */
export type Mirror = { x: number | null; z: number | null };
type Shape = Pick<Brick, 'type' | 'x' | 'y' | 'z' | 'rot'>;

const sameSpot = (a: Shape, b: Shape) => {
  const [aw, ad] = footprint(a);
  const [bw, bd] = footprint(b);
  return (
    a.type.replace(/\d+x\d+$/, '') === b.type.replace(/\d+x\d+$/, '') &&
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    aw === bw &&
    ad === bd
  );
};

/** the brick's mirror images across the planes set (one for X, one for Z, and one across both), without repeats */
export function mirrorOf<T extends Shape>(b: T, m: Mirror): T[] {
  const [w, d] = footprint(b);
  const out: T[] = [];
  const add = (x: number, z: number) => {
    const c = { ...b, x, z };
    if (!sameSpot(c, b) && !out.some((o) => sameSpot(o, c))) out.push(c);
  };
  const mx = m.x !== null ? 2 * m.x - b.x - w : null;
  const mz = m.z !== null ? 2 * m.z - b.z - d : null;
  if (mx !== null) add(mx, b.z);
  if (mz !== null) add(b.x, mz);
  if (mx !== null && mz !== null) add(mx, mz);
  return out;
}

/** a brick standing exactly where another one's shape would be (for painting and erasing in mirror) */
export function brickAt<T extends Shape>(all: readonly T[], shape: Shape): T | undefined {
  return all.find((b) => sameSpot(b, shape));
}

/** do two bricks overlap at all? (a mirror image that would cut into the brick itself is left out) */
export function overlaps(a: Shape, b: Shape): boolean {
  const [aw, ad] = footprint(a);
  const [bw, bd] = footprint(b);
  return (
    a.x < b.x + bw &&
    b.x < a.x + aw &&
    a.z < b.z + bd &&
    b.z < a.z + ad &&
    a.y < b.y + brickHeight(b.type) &&
    b.y < a.y + brickHeight(a.type)
  );
}

/** do two bricks touch (share a face: side by side, or one standing on the other)? */
export function touching(a: Shape, b: Shape): boolean {
  const [aw, ad] = footprint(a);
  const [bw, bd] = footprint(b);
  const ah = brickHeight(a.type);
  const bh = brickHeight(b.type);
  const span = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
  const sx = span(a.x, a.x + aw, b.x, b.x + bw);
  const sy = span(a.y, a.y + ah, b.y, b.y + bh);
  const sz = span(a.z, a.z + ad, b.z, b.z + bd);
  if (sx < 0 || sy < 0 || sz < 0) return false;
  // two of the three overlap and the third meets (or overlaps)
  return [sx > 0, sy > 0, sz > 0].filter(Boolean).length >= 2;
}

/**
 * Fill: the brick and every brick of the same colour joined to it through bricks of that colour (like a paint
 * bucket). `limit` keeps one click from repainting a whole map.
 */
export function fillFrom<T extends Shape & Pick<Brick, 'id' | 'color'>>(
  all: readonly T[],
  startId: number,
  limit = 5000,
): number[] {
  const start = all.find((b) => b.id === startId);
  if (!start) return [];
  const color = start.color.toLowerCase();
  const same = all.filter((b) => b.color.toLowerCase() === color);
  const seen = new Set<number>([start.id]);
  const queue: T[] = [start];
  while (queue.length && seen.size < limit) {
    const b = queue.shift()!;
    for (const o of same) if (!seen.has(o.id) && touching(b, o)) seen.add(o.id), queue.push(o);
  }
  return [...seen];
}

/** bricks copied for stamping: moved so their lowest corner is at 0, 0, 0 (ids and groups dropped) */
export type Stamp = Omit<Brick, 'id' | 'group' | 'flags'>[];
export function stampOf(bricks: readonly Brick[]): Stamp {
  if (!bricks.length) return [];
  const x0 = Math.min(...bricks.map((b) => b.x));
  const y0 = Math.min(...bricks.map((b) => b.y));
  const z0 = Math.min(...bricks.map((b) => b.z));
  return bricks.map((b) => ({ type: b.type, x: b.x - x0, y: b.y - y0, z: b.z - z0, rot: b.rot, color: b.color }));
}
/** the stamp's size in studs (x, z) */
export function stampSize(s: Stamp): [number, number] {
  let w = 0;
  let d = 0;
  for (const b of s) {
    const [bw, bd] = footprint(b);
    w = Math.max(w, b.x + bw);
    d = Math.max(d, b.z + bd);
  }
  return [w, d];
}
/** the stamp put down with its corner at (x, y, z) */
export function stampAt(s: Stamp, x: number, y: number, z: number): Stamp {
  return s.map((b) => ({ ...b, x: b.x + x, y: b.y + y, z: b.z + z }));
}
