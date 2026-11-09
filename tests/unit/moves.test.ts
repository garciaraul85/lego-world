import { describe, expect, it } from 'vitest';
import { BODY_FAMILIES } from '../../src/core/character/body';
import { composeCreature, specFromWords } from '../../src/core/character/compose';
import { makeFamily } from '../../src/core/character/families';
import { BODY_MOVES, MOVE_LENGTH, movesOf } from '../../src/core/character/moves';
import { actAmount, bodyPose, bodyWorld, newMotion } from '../../src/engine/character/body-anim';

/** Milestone 3, 10d part 2: moves for anything — a body gets the moves its parts can do, each played by its motion. */
const names = (bones: { role: string; name: string }[]) => movesOf(bones as never).map((m) => m.move);
const body = (made: { bones: unknown[]; move: string }) =>
  ({ ...made, hover: 0, scale: 1, stride: 1 }) as unknown as Parameters<typeof bodyPose>[0] & {
    hover: number;
    scale: number;
  };
const still = (b: Parameters<typeof bodyPose>[0]) => bodyPose(b, newMotion());
const moved = (a: Map<string, Float32Array>, b: Map<string, Float32Array>) =>
  [...a].reduce((s, [k, m]) => s + m.reduce((t, v, i) => t + Math.abs(v - b.get(k)![i]!), 0), 0);

describe('moves of a body', () => {
  it('every family gets the moves its parts can do', () => {
    for (const f of BODY_FAMILIES) {
      if (f === 'minifig') continue;
      const made = makeFamily(f)!;
      const m = names(made.bones);
      expect(m).toEqual(expect.arrayContaining(['attack', 'hurt', 'spin', 'dance', 'sleep']));
      for (const x of m) expect(BODY_MOVES).toContain(x);
    }
  });
  it('a dragon roars, swipes, flaps and glides; its strike is a bite', () => {
    const m = movesOf(makeFamily('dragon')!.bones);
    expect(m.map((x) => x.move)).toEqual(expect.arrayContaining(['roar', 'swipe', 'flap', 'glide', 'stomp']));
    expect(m[0]!.label).toBe('Bite');
  });
  it('a teapot from words: arms wave and punch, legs stomp, no wings to glide', () => {
    const made = composeCreature(specFromWords('a walking teapot with arms'));
    const m = movesOf(made.bones);
    expect(m.map((x) => x.move)).toEqual(expect.arrayContaining(['stomp', 'wave', 'grab']));
    expect(m.map((x) => x.move)).not.toContain('glide');
  });
  it('an octopus grabs with its tentacles and has no tail to swipe', () => {
    const made = composeCreature({ ...specFromWords('an octopus'), tentacles: 8, tail: 0 });
    const m = names(made.bones);
    expect(m).toContain('grab');
    expect(m).not.toContain('swipe');
  });
  it('the strike is named for what does it', () => {
    expect(movesOf([{ role: 'jaw', name: 'jaw' }])[0]!.label).toBe('Bite');
    expect(movesOf([{ role: 'arm', name: 'arm' }])[0]!.label).toBe('Punch');
    expect(movesOf([{ role: 'head', name: 'head' }])[0]!.label).toBe('Headbutt');
    expect(movesOf([{ role: 'root', name: 'root' }])[0]!.label).toBe('Strike');
  });
});

describe('moves play on the body', () => {
  const made = composeCreature(specFromWords('a winged dragon with a long tail and four legs'));
  const b = body(made);
  for (const kind of movesOf(made.bones).map((m) => m.move)) {
    it(`${kind} moves the bones or the whole body partway through, and is over at the end`, () => {
      const m = { ...newMotion(), act: { kind, u: 0.3 } };
      const at = { x: 0, y: 0, z: 0, heading: 0 };
      const pose = moved(bodyPose(b, m), still(b));
      const world = moved(new Map([['w', bodyWorld(b, at, m)]]), new Map([['w', bodyWorld(b, at, newMotion())]]));
      expect(pose + world).toBeGreaterThan(0.01);
      expect(actAmount({ act: { kind, u: 1 } }, kind)).toBeLessThan(0.05);
      expect(MOVE_LENGTH[kind]).toBeGreaterThan(0);
    });
  }
});
