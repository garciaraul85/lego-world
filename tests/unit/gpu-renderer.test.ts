import { describe, expect, it } from 'vitest';
import { boxMesh } from '../../src/engine/physics/physics';
import { chunkGroups, frameFog, type RenderBrick } from '../../src/engine/render/renderer';
import { RENDERER_CHOICES, rendererFor } from '../../src/engine/render/scene-renderer';

/** Milestone 2b, 10c part 1: what both renderers share, and the choice of renderer. */
const brick = (x: number, y: number, z: number, w = 2, d = 2, kind: RenderBrick['kind'] = 'brick'): RenderBrick => ({
  id: 0,
  w,
  d,
  kind,
  x,
  y,
  z,
  color: '#ff0000',
});

describe('shared by the WebGL and WebGPU renderers', () => {
  it('groups a chunk’s bricks by shape, leaves studs off covered bricks, and boxes the chunk', () => {
    const { groups, min, max } = chunkGroups([brick(0, 0, 0), brick(0, 3, 0), brick(4, 0, 0, 1, 1, 'plate')]);
    // the lower 2×2 is covered by the one on it; the upper is not; the plate is its own shape
    const covered = groups.find((g) => g.w === 2 && g.covered)!;
    const open = groups.find((g) => g.w === 2 && !g.covered)!;
    expect(covered.values.length / 6).toBe(1);
    expect(open.values.length / 6).toBe(1);
    expect(groups.find((g) => g.kind === 'plate')!.values.length).toBe(6);
    expect(min).toEqual([0, 0, 0]);
    expect(max[0]).toBe(5);
    expect(max[1]).toBeCloseTo(1.2 + 1.2 + 0.25);
  });

  it('works out the frame’s fog the same way for both (a streamed map’s edge is fully fogged)', () => {
    const cam = {
      eye: [0, 10, 10],
      right: [1, 0, 0],
      up: [0, 1, 0],
      forward: [0, 0, -1],
      fov: 1,
      distance: 20,
    } as never;
    const f = frameFog(null, null, 0, cam, true, Number.POSITIVE_INFINITY);
    expect(f.near).toBe(55);
    expect(f.far).toBe(120);
    expect(f.max).toBeCloseTo(0.62);
    const edge = frameFog({ near: 10, far: 400, max: 0.5, color: [1, 1, 1] } as never, null, 0.5, cam, false, 100);
    expect(edge.far).toBe(120);
    expect(edge.max).toBe(1);
    expect(edge.color[0]).toBeCloseTo(0.55);
    expect(edge.ground).toBe(0);
  });

  it('draws with WebGL unless WebGPU is picked and works (no WebGPU here)', () => {
    expect(RENDERER_CHOICES).toEqual(['auto', 'webgpu', 'webgl']);
    expect(rendererFor('auto')).toBe('webgl');
    expect(rendererFor('webgl')).toBe('webgl');
    expect(rendererFor('webgpu')).toBe('webgl');
  });
});

describe('the physics engine’s brick meshes', () => {
  it('leaves out faces two bricks share', () => {
    const one = boxMesh([{ x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 }]);
    expect(one.indices.length / 3).toBe(12);
    // two stacked: the shared top and bottom go (10 faces = 20 triangles)
    const two = boxMesh([
      { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 },
      { x0: 0, x1: 1, y0: 1, y1: 2, z0: 0, z1: 1 },
    ]);
    expect(two.indices.length / 3).toBe(20);
    // side by side
    const side = boxMesh([
      { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 },
      { x0: 1, x1: 2, y0: 0, y1: 1, z0: 0, z1: 1 },
    ]);
    expect(side.indices.length / 3).toBe(20);
  });
});
