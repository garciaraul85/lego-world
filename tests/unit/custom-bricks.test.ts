import { describe, expect, it } from 'vitest';
import {
  CUSTOM_SHAPES,
  type CustomBrick,
  customBrick,
  customIdOf,
  customType,
  parseBrickType,
  plainType,
  registerCustomBrick,
  unregisterCustomBrick,
} from '../../src/core/bricks/custom';
import { validBrickType } from '../../src/core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { customGeometry } from '../../src/engine/render/custom-geometry';

const slope: CustomBrick = {
  id: 'cbk_testslope1' as CustomBrick['id'],
  name: 'Roof slope',
  base: 'brick',
  w: 2,
  d: 3,
  shape: 'slope',
  studs: 'flat',
};

describe('custom brick type names', () => {
  it('keep the kind first and the size last', () => {
    expect(customType(slope)).toBe('brick:cbk_testslope1:3x2');
    expect(customIdOf('brick:cbk_testslope1:3x2')).toBe('cbk_testslope1');
    expect(customIdOf('brick2x4')).toBeNull();
    expect(plainType('plate:cbk_testslope1:1x4')).toBe('plate1x4');
    expect(plainType('brick2x4')).toBe('brick2x4');
    expect(parseBrickType('tile:cbk_testslope1:2x3')).toEqual({ kind: 'tile', rows: 2, cols: 3 });
    expect(parseBrickType('brick1x2')).toEqual({ kind: 'brick', rows: 1, cols: 2 });
    expect(parseBrickType('slope:cbk_x:2x2')).toBeNull();
  });
  it('are valid only while their brick is known, at its own size', () => {
    unregisterCustomBrick(slope.id);
    expect(validBrickType('brick:cbk_testslope1:3x2')).toBe(false);
    registerCustomBrick(slope);
    expect(customBrick(slope.id)).toEqual(slope);
    expect(validBrickType('brick:cbk_testslope1:3x2')).toBe(true);
    expect(validBrickType('brick:cbk_testslope1:2x2')).toBe(false);
    expect(validBrickType('plate:cbk_testslope1:3x2')).toBe(false);
    unregisterCustomBrick(slope.id);
  });
});

describe('brick.put and brick.delete', () => {
  const setup = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'T' }));
    const bus = registerAll(new CommandBus(store));
    const run = (type: string, payload: unknown) => bus.execute([{ type, payload }], { source: 'user' });
    const map = store.list('maps/')[0]!.split('/')[1]!;
    return { store, run, map };
  };
  it('saves one, registers it, and checks its shape rules', () => {
    const { store, run } = setup();
    expect(run('brick.put', { brick: slope }).ok).toBe(true);
    expect(store.has('bricks/cbk_testslope1.json')).toBe(true);
    expect(customBrick(slope.id)?.name).toBe('Roof slope');
    expect(run('brick.put', { brick: { ...slope, shape: 'arch', w: 2 } }).error).toMatch(/3 studs/);
    expect(run('brick.put', { brick: { ...slope, shape: 'dome' } }).error).toMatch(/as deep as/);
    expect(run('brick.put', { brick: { ...slope, w: 9 } }).ok).toBe(false);
    expect(run('brick.delete', { id: slope.id }).ok).toBe(true);
    expect(customBrick(slope.id)).toBeUndefined();
  });
  it('keeps the size of a used brick and refuses to delete it; its shape still changes', () => {
    const { run, map } = setup();
    run('brick.put', { brick: slope });
    // on the first height where it stands on something
    let placed = { ok: false } as { ok: boolean; error?: string };
    for (let y = 0; y < 80 && !placed.ok; y++)
      placed = run('bricks.place', {
        map,
        bricks: [{ type: customType(slope), x: 0, y, z: 0, rot: 1, color: '#c91a09' }],
      });
    expect(placed.error).toBeUndefined();
    expect(run('brick.put', { brick: { ...slope, d: 4 } }).error).toMatch(/kind and size stay/);
    expect(run('brick.put', { brick: { ...slope, shape: 'curve' } }).ok).toBe(true);
    expect(customBrick(slope.id)?.shape).toBe('curve');
    expect(run('brick.delete', { id: slope.id }).error).toMatch(/still in/);
  });
});

describe('custom brick shapes', () => {
  it('every shape at every turn has faces with unit normals', () => {
    for (const shape of CUSTOM_SHAPES)
      for (const studs of ['flat', 'none'] as const)
        for (const rot of [0, 1, 2, 3]) {
          const square = shape === 'round' || shape === 'cone' || shape === 'dome';
          const b: CustomBrick = { ...slope, shape, studs, w: shape === 'arch' ? 4 : 2, d: square ? 2 : 3 };
          const g = customGeometry(b, rot);
          expect(g.positions.length, `${shape} ${rot}`).toBeGreaterThan(36);
          expect(g.positions.length % 9).toBe(0);
          expect(g.normals.length).toBe(g.positions.length);
          for (let i = 0; i < g.normals.length; i += 3) {
            const l = Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!);
            expect(Math.abs(l - 1), `${shape} normal`).toBeLessThan(1e-3);
          }
          // inside its footprint (turned: w and d swap)
          const [hx, hz] = rot % 2 ? [b.d / 2, b.w / 2] : [b.w / 2, b.d / 2];
          for (let i = 0; i < g.positions.length; i += 3) {
            expect(Math.abs(g.positions[i]!)).toBeLessThanOrEqual(hx + 1e-4);
            expect(Math.abs(g.positions[i + 2]!)).toBeLessThanOrEqual(hz + 1e-4);
          }
        }
  });
  it('studs only where asked: none draws fewer triangles', () => {
    const a = customGeometry(slope).positions.length;
    const b = customGeometry({ ...slope, studs: 'none' }).positions.length;
    expect(b).toBeLessThan(a);
  });
});
