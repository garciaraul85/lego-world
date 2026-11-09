import { describe, expect, it } from 'vitest';
import type { BodyPlan } from '../../src/core/character/body';
import {
  brickAgainst,
  DEFAULT_SCULPT,
  invert4,
  mul4,
  pickBrick,
  sculptPlan,
} from '../../src/editor/workspaces/character-studio/sculpt';

const I = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const T = (x: number, y: number, z: number) => {
  const m = I();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
};
/** an orthographic camera looking down -z: x, y from -10 to 10 on screen, z from 10 (near) to -10 (far) */
const ORTHO = new Float32Array([0.1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, -0.1, 0, 0, 0, 0, 1]);

const plan: BodyPlan = {
  id: 'bpl_aaaaaaaaaa',
  name: 'Blob',
  family: 'custom',
  move: 'walk',
  stride: 1,
  hover: 0,
  bones: [{ name: 'body', at: [0, 0, 0], role: 'root', swing: 0 }],
  bricks: [
    { bone: 'body', kind: 'brick', w: 2, d: 2, x: -1, y: 0, z: -1, color: 'main' },
    { bone: 'body', kind: 'brick', w: 2, d: 2, x: -1, y: 0, z: -4, color: 'main' },
  ],
};

describe('painting and sculpting a creature', () => {
  it('inverts and multiplies matrices', () => {
    const m = mul4(T(1, 2, 3), ORTHO);
    const inv = invert4(m)!;
    const back = mul4(m, inv);
    for (let i = 0; i < 16; i++) expect(back[i]).toBeCloseTo(I()[i]!, 5);
    expect(invert4(new Float32Array(16))).toBeNull();
  });
  it('finds the nearest brick under the pointer and the face it enters', () => {
    const pose = new Map([['body', I()]]);
    // straight at the front brick (z -1…1): its +z face, the brick behind is hidden
    const hit = pickBrick(0, 0.06, ORTHO, I(), pose, plan.bricks)!;
    expect(hit).toMatchObject({ index: 0, axis: 2, sign: 1 });
    expect(pickBrick(0.9, 0.9, ORTHO, I(), pose, plan.bricks)).toBeNull();
    // the body moved 5 to the right: the pointer must move too
    expect(pickBrick(0, 0.06, ORTHO, T(5, 0, 0), pose, plan.bricks)).toBeNull();
    expect(pickBrick(0.5, 0.06, ORTHO, T(5, 0, 0), pose, plan.bricks)?.index).toBe(0);
  });
  it('puts a new brick against the face clicked, centred on it', () => {
    const of = plan.bricks[0]!;
    const tool = { ...DEFAULT_SCULPT, kind: 'plate' as const, w: 1, d: 1, color: '#ff0000' };
    expect(brickAgainst(of, { axis: 1, sign: 1 }, tool)).toMatchObject({ x: 0, y: 3, z: 0, kind: 'plate' });
    expect(brickAgainst(of, { axis: 1, sign: -1 }, tool)).toMatchObject({ y: -1 });
    expect(brickAgainst(of, { axis: 0, sign: 1 }, tool)).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(brickAgainst(of, { axis: 2, sign: -1 }, tool)).toMatchObject({ x: 0, z: -2 });
  });
  it('paints, adds and removes, one plan each; refuses what it cannot do', () => {
    const hit = { index: 0, axis: 1 as const, sign: 1 as const, t: 0 };
    const painted = sculptPlan(plan, hit, { ...DEFAULT_SCULPT, mode: 'paint', color: '#00ff00' }) as BodyPlan;
    expect(painted.bricks[0]!.color).toBe('#00ff00');
    expect(sculptPlan(painted, hit, { ...DEFAULT_SCULPT, mode: 'paint', color: '#00ff00' })).toMatch(/already/);
    const added = sculptPlan(plan, hit, { ...DEFAULT_SCULPT, mode: 'add' }) as BodyPlan;
    expect(added.bricks).toHaveLength(3);
    expect(added.bricks[2]).toMatchObject({ bone: 'body', y: 3, color: 'accent' });
    const removed = sculptPlan(plan, hit, { ...DEFAULT_SCULPT, mode: 'remove' }) as BodyPlan;
    expect(removed.bricks).toHaveLength(1);
    expect(sculptPlan(removed, { ...hit, index: 0 }, { ...DEFAULT_SCULPT, mode: 'remove' })).toMatch(/at least one/);
    const far = { ...plan, bricks: [{ ...plan.bricks[0]!, x: 29 }] };
    expect(sculptPlan(far, { ...hit, axis: 0 }, { ...DEFAULT_SCULPT, mode: 'add' })).toMatch(/too far/);
  });
});
