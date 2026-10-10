import { describe, expect, it } from 'vitest';
import { bricksToAsset, expandAsset } from '../../src/core/assets/expand';
import { footprint } from '../../src/core/bricks/inspect';
import type { Asset } from '../../src/core/schema';

/** An L-shaped 4×3 asset: a 2×4 brick along x and a 1×1 brick in front of its far end, plus a socket at the far end. */
const def: Asset = {
  id: 'ast_testl00001',
  name: 'L block',
  category: 'prop',
  bricks: [
    [0, 0, 0, 0, 0, 0, 0],
    [1, 3, 0, 2, 0, 1, 0],
  ],
  palette: { types: ['brick2x4', 'brick1x1'], colors: ['#d20c20', '#0058ac'] },
  pivot: [0, 0, 0],
  footprint: [4, 3],
  sockets: [{ id: 'tip', kind: 'interact', pos: [3.5, 1, 2.5], prompt: 'Poke' }],
  states: ['default'],
  initialState: 'default',
  interactions: [],
  smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
  generator: null,
};

const cells = (bs: ReturnType<typeof expandAsset>['bricks']) =>
  new Set(
    bs.flatMap((b) => {
      const [w, d] = footprint(b);
      const out: string[] = [];
      for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) out.push(`${b.x + x},${b.z + z}`);
      return out;
    }),
  );

describe('expandAsset', () => {
  it('places bricks at the instance position with ids idBase + i and a group', () => {
    const { bricks } = expandAsset(def, { pos: [10, 3, -5], rot: 0, idBase: 100 });
    expect(bricks.map((b) => [b.id, b.x, b.y, b.z, b.rot])).toEqual([
      [100, 10, 3, -5, 0],
      [101, 13, 3, -3, 0],
    ]);
    expect(bricks[0]!.group).toBe('l-block-100');
  });

  it('turns all four ways around the footprint, keeping the shape inside the turned footprint', () => {
    const shapes: string[] = [];
    for (let rot = 0; rot < 4; rot++) {
      const { bricks, sockets } = expandAsset(def, { pos: [0, 0, 0], rot, idBase: 1 });
      const c = cells(bricks);
      expect(c.size).toBe(9); // 8 + 1, no overlap after turning
      const [w, d] = rot % 2 ? [3, 4] : [4, 3];
      for (const k of c) {
        const [x, z] = k.split(',').map(Number) as [number, number];
        expect(x >= 0 && x < w && z >= 0 && z < d).toBe(true);
      }
      // the socket stays over the 1×1 brick
      const tip = bricks[1]!;
      const [sx, , sz] = sockets[0]!.world;
      expect(sx).toBeGreaterThan(tip.x);
      expect(sx).toBeLessThan(tip.x + 1);
      expect(sz).toBeGreaterThan(tip.z);
      expect(sz).toBeLessThan(tip.z + 1);
      shapes.push([...c].sort().join(' '));
    }
    expect(new Set(shapes).size).toBe(4);
    // four quarter turns come back to the start
    const once = expandAsset(def, { pos: [0, 0, 0], rot: 0, idBase: 1 }).bricks;
    const again = expandAsset(def, { pos: [0, 0, 0], rot: 4, idBase: 1 }).bricks;
    expect(again).toEqual(once);
  });

  it('bricksToAsset is the inverse of expandAsset at rot 0', () => {
    const { bricks } = expandAsset(def, { pos: [7, 2, 9], rot: 0, idBase: 1 });
    const back = bricksToAsset(bricks);
    expect(back.bricks).toEqual(def.bricks);
    expect(back.footprint).toEqual([4, 3]);
    expect(back.origin).toEqual([7, 2, 9]);
  });

  it('shows state-only bricks only in their state', () => {
    const chest = { ...def, states: ['closed', 'open'], initialState: 'closed', onlyIn: { open: [1] } };
    expect(expandAsset(chest, { pos: [0, 0, 0], rot: 0, idBase: 1 }).bricks).toHaveLength(1);
    expect(expandAsset(chest, { pos: [0, 0, 0], rot: 0, idBase: 1, state: 'open' }).bricks).toHaveLength(2);
  });
});
