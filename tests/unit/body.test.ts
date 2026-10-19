import { describe, expect, it } from 'vitest';
import {
  BODY_FAMILIES,
  BodyPlan,
  checkPlan,
  nearestBone,
  PARAM_INFO,
  PARAM_KEYS,
  restPositions,
} from '../../src/core/character/body';
import { FAMILY_INFO, makeFamily } from '../../src/core/character/families';
import { attachAsset, resolveBody } from '../../src/core/character/resolve';
import { Character } from '../../src/core/schema';
import type { Asset } from '../../src/core/schema/asset';
import {
  advance,
  bodyOverlays,
  bodyPose,
  bodyWorld,
  boneTurn,
  lift,
  newMotion,
} from '../../src/engine/character/body-anim';

/** P22 part 3: body plans — families from sliders, skeletons of your own, bricks worn on bones, generated movement. */
const at = (p: Record<string, number>) => Object.fromEntries(PARAM_KEYS.map((k) => [k, p[k] ?? PARAM_INFO[k].def]));

describe('body families', () => {
  for (const f of BODY_FAMILIES) {
    if (f === 'minifig') continue;
    it(`${f} makes a valid skeleton with bricks at every slider extreme`, () => {
      for (const ext of ['lo', 'hi'] as const) {
        const p = at(Object.fromEntries(PARAM_KEYS.map((k) => [k, PARAM_INFO[k][ext]])));
        const made = makeFamily(f, p)!;
        const plan = { id: 'bpl_test000001', name: 'Test', family: f, ...made };
        const r = BodyPlan.safeParse(plan);
        expect(r.success, JSON.stringify(r.error?.issues[0])).toBe(true);
        expect(checkPlan(made)).toEqual([]);
        expect(made.bricks.length).toBeGreaterThan(2);
        expect(made.move).toBe(FAMILY_INFO[f].move);
      }
    });
  }
  it('the minifig has no plan (v68 draws it)', () => {
    expect(makeFamily('minifig')).toBeNull();
    expect(resolveBody({ family: 'minifig' }, () => undefined)).toBeNull();
    expect(resolveBody(undefined, () => undefined)).toBeNull();
  });
  it('four legs step in a diagonal pair; the spider in two alternating sets', () => {
    const dog = makeFamily('fourLegs')!;
    const ph = (n: string) => dog.bones.find((b) => b.name === n)!.phase;
    expect(ph('front left leg')).toBe(ph('back right leg'));
    expect(ph('front right leg')).toBe(ph('back left leg'));
    expect(ph('front left leg')).not.toBe(ph('front right leg'));
    const spider = makeFamily('spider')!;
    const legs = spider.bones.filter((b) => b.role === 'leg' && b.parent === 'body');
    expect(legs).toHaveLength(8);
    expect(new Set(legs.map((b) => b.phase)).size).toBe(2);
  });
  it('sliders change the body: a longer tail has more tail bones, longer legs stand taller', () => {
    const short = makeFamily('fourLegs', { tail: 0.5, legs: 0.5 })!;
    const long = makeFamily('fourLegs', { tail: 2, legs: 2 })!;
    const tails = (m: typeof short) => m.bones.filter((b) => b.role === 'tail').length;
    expect(tails(long)).toBeGreaterThan(tails(short));
    expect(long.bones[0]!.at[1]).toBeGreaterThan(short.bones[0]!.at[1]);
  });
});

describe('a character’s body', () => {
  it('is part of the character file', () => {
    const c = {
      id: 'chr_rexdog0001',
      name: 'Rex',
      role: 'npc',
      profile: {},
      body: { family: 'fourLegs', params: { tail: 1.5 }, colors: { main: '#222222' } },
    };
    expect(Character.safeParse(c).success).toBe(true);
    expect(Character.safeParse({ ...c, body: { family: 'unicorn' } }).success).toBe(false);
  });
  it('resolves colours of slots and a project body plan; a missing plan falls back to nothing', () => {
    const b = resolveBody({ family: 'fourLegs', colors: { main: '#123456' } }, () => undefined)!;
    expect(b.bricks.some((k) => k.color === '#123456')).toBe(true);
    expect(b.bricks.every((k) => k.color.startsWith('#'))).toBe(true);
    const plan = { id: 'bpl_mine000001', name: 'Mine', family: 'custom', ...makeFamily('slime')! };
    const r = resolveBody({ plan: plan.id }, (p) => (p === `bodyplans/${plan.id}.json` ? plan : undefined))!;
    expect(r.name).toBe('Mine');
    expect(resolveBody({ plan: 'bpl_gone00000a' }, () => undefined)).toBeNull();
  });
});

describe('skeletons', () => {
  it('finds broken skeletons: two roots, a missing parent, a loop, bricks on no bone', () => {
    const ok = makeFamily('bird')!;
    expect(checkPlan(ok)).toEqual([]);
    const two = {
      bones: [
        ...ok.bones,
        { name: 'extra', at: [0, 0, 0] as [number, number, number], role: 'other' as const, swing: 0 },
      ],
      bricks: ok.bricks,
    };
    expect(checkPlan(two).join(' ')).toMatch(/exactly one bone/);
    const lost = { bones: ok.bones.map((b) => (b.name === 'head' ? { ...b, parent: 'nope' } : b)), bricks: ok.bricks };
    expect(checkPlan(lost).join(' ')).toMatch(/not a bone/);
    const loop = {
      bones: [
        { name: 'a', at: [0, 0, 0] as [number, number, number], role: 'root' as const, swing: 0 },
        { name: 'b', parent: 'c', at: [0, 0, 0] as [number, number, number], role: 'other' as const, swing: 0 },
        { name: 'c', parent: 'b', at: [0, 0, 0] as [number, number, number], role: 'other' as const, swing: 0 },
      ],
      bricks: [],
    };
    expect(checkPlan(loop).join(' ')).toMatch(/hangs from itself/);
  });
  it('rest positions add up joint offsets; the nearest bone of a point', () => {
    const dog = makeFamily('fourLegs')!;
    const rest = restPositions(dog.bones);
    const body = rest.get('body')!;
    const leg = rest.get('front left leg')!;
    expect(leg[1]).toBeCloseTo(body[1]);
    expect(nearestBone(dog.bones, [leg[0], 0.2, leg[2]], dog.bricks)).toBe('front left leg');
    expect(nearestBone(dog.bones, [0, body[1] + 0.5, 0], dog.bricks)).toBe('body');
  });
});

describe('bricks worn on a skeleton (from the Asset studio)', () => {
  const asset = {
    id: 'ast_beastbody1',
    name: 'Beast',
    category: 'prop',
    footprint: [4, 6],
    palette: { types: ['brick1x1', 'brick2x4'], colors: ['#ff0000', '#00ff00'] },
    bricks: [
      [1, 1, 6, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 0],
      [0, 3, 0, 5, 0, 1, 0],
    ],
    sockets: [],
  } as unknown as Asset;
  it('each brick follows the nearest bone, unless attach names another', () => {
    const dog = makeFamily('fourLegs')!;
    const near = attachAsset(asset, dog.bones, {}, dog.bricks);
    expect(near).toHaveLength(3);
    expect(near[1]!.bone).toMatch(/leg/);
    expect(near[0]!.bone).toBe('body');
    const moved = attachAsset(asset, dog.bones, { '0': 'head' });
    expect(moved[0]!.bone).toBe('head');
    expect(attachAsset(asset, dog.bones, { '0': 'not a bone' }, dog.bricks)[0]!.bone).toBe('body');
    const r = resolveBody({ family: 'fourLegs', asset: asset.id }, (p) =>
      p === `assets/${asset.id}.json` ? asset : undefined,
    )!;
    expect(r.fromAsset).toBe(true);
    expect(r.bricks.map((b) => b.color)).toEqual(['#ff0000', '#00ff00', '#00ff00']);
  });
});

describe('generated movement', () => {
  const dog = resolveBody({ family: 'fourLegs' }, () => undefined)!;
  it('walking moves the cycle on by distance; standing still settles', () => {
    const m = newMotion();
    for (let i = 0; i < 60; i++) advance(m, dog, 0.1, 1 / 60);
    expect(m.moving).toBeGreaterThan(0.9);
    expect(m.gait).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) advance(m, dog, 0, 1 / 60);
    expect(m.moving).toBeLessThan(0.05);
  });
  it('legs swing opposite to their diagonal partners; at rest nothing turns', () => {
    const m = { gait: Math.PI / 2, moving: 1, time: 0 };
    const fl = boneTurn(dog, dog.bones.find((b) => b.name === 'front left leg')!, m);
    const fr = boneTurn(dog, dog.bones.find((b) => b.name === 'front right leg')!, m);
    // rotX: element [6] is sin of the angle
    expect(Math.sign(fl[6]!)).toBe(-Math.sign(fr[6]!));
    const still = boneTurn(dog, dog.bones.find((b) => b.name === 'front left leg')!, { gait: 1, moving: 0, time: 0 });
    expect(still[6]).toBeCloseTo(0);
  });
  it('a bird hovers, a slime hops only when moving', () => {
    const bird = resolveBody({ family: 'bird' }, () => undefined)!;
    expect(lift(bird, newMotion())).toBeGreaterThan(1.5);
    const slime = resolveBody({ family: 'slime' }, () => undefined)!;
    expect(lift(slime, { gait: Math.PI / 2, moving: 1, time: 0 })).toBeGreaterThan(1);
    expect(lift(slime, { gait: Math.PI / 2, moving: 0, time: 0 })).toBeLessThan(0.1);
  });
  it('one overlay per bone with bricks, placed where the body stands', () => {
    const pose = bodyPose(dog, newMotion());
    const world = bodyWorld(dog, { x: 10, y: 2, z: -4, heading: 0 }, null);
    const ov = bodyOverlays(dog, pose, world);
    expect(ov.length).toBe(new Set(dog.bricks.map((b) => b.bone)).size);
    const body = ov[0]!.model!;
    expect(body[12]).toBeCloseTo(10);
    expect(body[14]).toBeCloseTo(-4);
  });
});
