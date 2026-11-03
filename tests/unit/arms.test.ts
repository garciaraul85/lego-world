import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ledgePull, MANTLE_RELEASE } from '../../src/builtin/clips/moves';
import { rigPose } from '../../src/engine/character/animator';
import { sampleParams } from '../../src/engine/character/routine';
import { mantleHands } from '../../src/engine/runtime/puzzles';

/**
 * Step 12b: arms of human proportion (the one change to v68's character model). v68's suites check the model as
 * it was (tests/legacy/run.mjs undoes the change for them); this checks what the change must keep: a swung item
 * stays in the hand all through its swing, with the longer forearm.
 */
type M = {
  jointPose(s: unknown, n: boolean, p: unknown): Record<string, Float32Array>;
  heldPose(pose: unknown, s: unknown, p: unknown): Float32Array;
  handGrip(side: number): number[];
};
const ctx: Record<string, unknown> = { Float32Array };
for (const [file, name] of [
  ['game-weapons.js', 'GameWeapons'],
  ['character-catalog.js', 'CharacterCatalog'],
  ['game-physics.js', 'GamePhysics'],
  ['studio-motion.js', 'StudioMotion'],
  ['character-model.js', 'CharacterModel'],
])
  runInNewContext(`${readFileSync(`src/legacy/${file}`, 'utf8')};globalThis.${name}=${name};`, ctx);
const W = ctx.GameWeapons as { catalog: Record<string, { duration: number; handDriven?: boolean }> };
const Mo = ctx.CharacterModel as M;
const C = ctx.CharacterCatalog as { validate(p: unknown): unknown; defaults: Record<string, unknown> };
const point = (m: Float32Array, p: number[]) =>
  [0, 1, 2].map((k) => m[k]! * p[0]! + m[k + 4]! * p[1]! + m[k + 8]! * p[2]! + m[k + 12]!);

describe('arms of human proportion', () => {
  it('the hand hangs lower than the toy’s (the longer forearm)', () => {
    expect(Mo.handGrip(1)[1]).toBeLessThan(-0.61 * 1.4);
  });

  it('a swung item’s grip stays in the hand all through its swing', () => {
    const grip = [0.02, Mo.handGrip(1)[1]!, 0.315];
    let n = 0;
    for (const [held, w] of Object.entries(W.catalog)) {
      if (w.handDriven) continue;
      const profile = C.validate({ ...C.defaults, held });
      for (let i = 0; i <= 20; i++) {
        const state = { heading: 0.8, grounded: true, attack: w.duration * (1 - i / 20), attackDuration: w.duration };
        const pose = Mo.jointPose(state, false, profile);
        const hand = point(pose.rightForearm!, Mo.handGrip(1));
        const at = point(Mo.heldPose(pose, state, profile), grip);
        expect(Math.hypot(hand[0]! - at[0]!, hand[1]! - at[1]!, hand[2]! - at[2]!), `${held} ${i}`).toBeLessThan(0.08);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('pulling up over a wall: the runtime knows where the Pull up move puts the hands (they stay on the edge)', () => {
    const profile = C.validate({ ...C.defaults });
    for (let t = 0; t <= MANTLE_RELEASE + 1e-6; t += 0.025) {
      const state = { heading: 0, grounded: true, studioPose: rigPose(sampleParams(ledgePull, t), ledgePull), studioProgress: 0, studioFist: false };
      const pose = Mo.jointPose(state, false, profile);
      const r = point(pose.rightForearm!, Mo.handGrip(1));
      const l = point(pose.leftForearm!, Mo.handGrip(-1));
      const [hz, hy] = mantleHands(t);
      expect(Math.abs((r[2]! + l[2]!) / 2 - hz), `forward at ${t}`).toBeLessThan(0.1);
      expect(Math.abs((r[1]! + l[1]!) / 2 - hy), `up at ${t}`).toBeLessThan(0.1);
    }
  });
});
