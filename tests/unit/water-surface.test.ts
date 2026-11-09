import { describe, expect, it } from 'vitest';
import { QUALITY } from '../../src/core/render/quality';
import type { WaterInstance } from '../../src/core/schema';
import { multiply } from '../../src/engine/render/math';
import { mirrorAt, reflectedWater, waterBody, waterSurface } from '../../src/engine/render/water';

/** Milestone 2b, 10c part 4: how the renderers see a body of water, and the mirror the reflection is drawn with */
const pool = (pos: [number, number, number], size: [number, number, number], extra: Partial<WaterInstance> = {}) =>
  ({ id: 'ins_pool', kind: 'water', name: 'Pool', pos, size, body: 'pool', ...extra }) as WaterInstance;

describe('water surfaces', () => {
  it('a body of water: its box, colour and current', () => {
    const w = waterSurface(pool([2, 1, 3], [4, 2, 6], { current: [0.5, -1] } as Partial<WaterInstance>));
    expect(w.min).toEqual([2, 1, 3]);
    expect(w.max).toEqual([6, 3, 9]);
    expect(w.current).toEqual([0.5, -1]);
    expect(waterSurface(pool([0, 0, 0], [1, 1, 1], { color: '#ff0000' })).color).toEqual([1, 0, 0]);
  });

  it('its body is a see-through box just under the surface', () => {
    const b = waterBody(waterSurface(pool([0, 0, 0], [4, 2, 4])));
    expect(b.alpha).toBeLessThan(1);
    expect(b.pos[1] + b.size[1] / 2).toBeLessThan(2);
    expect(b.pos[1] + b.size[1] / 2).toBeGreaterThan(1.95);
  });

  it('the water nearest what the camera looks at is the one mirrored', () => {
    const a = waterSurface(pool([0, 0, 0], [4, 1, 4]));
    const b = waterSurface(pool([40, 0, 40], [4, 1, 4]));
    expect(reflectedWater([a, b], [41, 1, 41])).toBe(b);
    expect(reflectedWater([a, b], [1, 1, 1])).toBe(a);
    expect(reflectedWater([], [0, 0, 0])).toBeNull();
  });

  it('the mirror turns the world upside down about the surface', () => {
    const m = mirrorAt(3);
    const at = (p: [number, number, number]) => {
      const v = [p[0], p[1], p[2], 1];
      return [0, 1, 2].map((r) => v.reduce((s, x, c) => s + m[c * 4 + r]! * x, 0));
    };
    expect(at([1, 5, 2])).toEqual([1, 1, 2]);
    expect(at([0, 3, 0])).toEqual([0, 3, 0]);
    // twice is no change
    const twice = multiply(m, m);
    expect(Array.from(twice)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('reflections are on at Medium and High, off at Low', () => {
    expect([QUALITY.low.reflections, QUALITY.medium.reflections, QUALITY.high.reflections]).toEqual([
      false,
      true,
      true,
    ]);
  });
});
