import { describe, expect, it } from 'vitest';
import {
  brickAt,
  fillFrom,
  mirrorOf,
  overlaps,
  stampAt,
  stampOf,
  stampSize,
  touching,
} from '../../src/core/bricks/build-tools';
import type { Brick } from '../../src/core/bricks/codec';

const b = (id: number, type: string, x: number, y: number, z: number, color = '#ff0000', rot = 0): Brick => ({
  id,
  type,
  x,
  y,
  z,
  rot,
  color,
  flags: 0,
});

describe('faster building', () => {
  it('mirrors a brick across X, Z or both, skipping one that sits on the plane', () => {
    expect(mirrorOf(b(1, 'brick1x2', 2, 0, 0), { x: 0, z: null }).map((m) => [m.x, m.z])).toEqual([[-4, 0]]);
    expect(mirrorOf(b(1, 'brick1x2', 2, 0, 1), { x: 0, z: 0 }).map((m) => [m.x, m.z])).toEqual([
      [-4, 1],
      [2, -2],
      [-4, -2],
    ]);
    // a 2-wide brick centred on the plane at 0 is its own mirror
    expect(mirrorOf(b(1, 'brick1x2', -1, 0, 0), { x: 0, z: null })).toEqual([]);
    // a plane through the middle of a stud column
    expect(mirrorOf(b(1, 'brick1x1', 3, 0, 0), { x: 0.5, z: null })[0]!.x).toBe(-3);
  });
  it('finds the brick where a mirror image would be', () => {
    const all = [b(1, 'brick1x2', 2, 0, 0), b(2, 'brick1x2', -4, 0, 0)];
    expect(brickAt(all, mirrorOf(all[0]!, { x: 0, z: null })[0]!)?.id).toBe(2);
    expect(brickAt(all, { type: 'plate1x2', x: -4, y: 0, z: 0, rot: 0 })).toBeUndefined();
  });
  it('knows touching from overlapping', () => {
    expect(touching(b(1, 'brick1x1', 0, 0, 0), b(2, 'brick1x1', 1, 0, 0))).toBe(true);
    expect(touching(b(1, 'brick1x1', 0, 0, 0), b(2, 'brick1x1', 0, 3, 0))).toBe(true);
    expect(touching(b(1, 'brick1x1', 0, 0, 0), b(2, 'brick1x1', 1, 3, 0))).toBe(false);
    expect(touching(b(1, 'brick1x1', 0, 0, 0), b(2, 'brick1x1', 2, 0, 0))).toBe(false);
    expect(overlaps(b(1, 'brick2x2', 0, 0, 0), b(2, 'plate1x1', 1, 2, 1))).toBe(true);
    expect(overlaps(b(1, 'brick2x2', 0, 0, 0), b(2, 'plate1x1', 1, 3, 1))).toBe(false);
  });
  it('fills the joined bricks of one colour only', () => {
    const all = [
      b(1, 'brick1x1', 0, 0, 0),
      b(2, 'brick1x1', 1, 0, 0),
      b(3, 'brick1x1', 2, 0, 0, '#0000ff'),
      b(4, 'brick1x1', 3, 0, 0),
      b(5, 'brick1x1', 1, 3, 0),
    ];
    expect(fillFrom(all, 1).sort()).toEqual([1, 2, 5]);
    expect(fillFrom(all, 4)).toEqual([4]);
    expect(fillFrom(all, 99)).toEqual([]);
  });
  it('copies bricks to a stamp and puts it down anywhere', () => {
    const s = stampOf([b(7, 'brick1x2', 4, 3, 5), b(8, 'plate2x2', 5, 6, 5, '#00ff00')]);
    expect(s).toEqual([
      { type: 'brick1x2', x: 0, y: 0, z: 0, rot: 0, color: '#ff0000' },
      { type: 'plate2x2', x: 1, y: 3, z: 0, rot: 0, color: '#00ff00' },
    ]);
    expect(stampSize(s)).toEqual([3, 2]);
    expect(stampAt(s, 10, 0, -2)[1]).toMatchObject({ x: 11, y: 3, z: -2 });
    expect(stampOf([])).toEqual([]);
  });
});
