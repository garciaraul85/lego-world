import type { Clip } from '../../core/schema';
import { clipFromPoses } from '../../engine/character/posing';

/**
 * P23 part 4: built-in moves for the animation state machine, each made by posing — a few poses, the motion
 * between them filled in by easing: walk, run, jump, swing (attack), flinch (hurt) and breathe (idle).
 * Arms and legs: a negative x swings forward; a positive knee bends back.
 */
const stride = (leg: number, arm: number, shin: [number, number], lift: number) => ({
  'leftLeg.x': -leg,
  'rightLeg.x': leg,
  'leftArm.x': arm,
  'rightArm.x': -arm,
  'leftShin.bend': shin[0],
  'rightShin.bend': shin[1],
  'root.height': 1.78 + lift,
});
const passing = (side: 'left' | 'right', knee: number, lift: number) => ({
  'leftLeg.x': side === 'left' ? 0.05 : -0.05,
  'rightLeg.x': side === 'left' ? -0.05 : 0.05,
  'leftArm.x': 0,
  'rightArm.x': 0,
  'leftShin.bend': side === 'left' ? knee : 0.05,
  'rightShin.bend': side === 'right' ? knee : 0.05,
  'root.height': 1.78 + lift,
});

const walk = clipFromPoses({ id: 'clp_movewalk00', name: 'Walk', group: 'Moves', length: 0.8, loop: true }, [
  [0, stride(0.5, 0.45, [0.08, 0.3], 0)],
  [0.2, passing('right', 0.6, 0.06)],
  [0.4, stride(-0.5, -0.45, [0.3, 0.08], 0)],
  [0.6, passing('left', 0.6, 0.06)],
  [0.8, stride(0.5, 0.45, [0.08, 0.3], 0)],
]);

const runPose = (s: number) => ({
  ...stride(0.85 * s, 0.9 * s, s > 0 ? [0.2, 1.3] : [1.3, 0.2], 0),
  'leftForearm.bend': -1.3,
  'rightForearm.bend': -1.3,
  'torso.lean': 0.22,
});
const run = clipFromPoses({ id: 'clp_moverun000', name: 'Run', group: 'Moves', length: 0.5, loop: true }, [
  [0, runPose(1)],
  [0.125, { ...passing('right', 1.5, 0.15), 'leftForearm.bend': -1.3, 'rightForearm.bend': -1.3, 'torso.lean': 0.22 }],
  [0.25, runPose(-1)],
  [0.375, { ...passing('left', 1.5, 0.15), 'leftForearm.bend': -1.3, 'rightForearm.bend': -1.3, 'torso.lean': 0.22 }],
  [0.5, runPose(1)],
]);

const jump = clipFromPoses({ id: 'clp_movejump00', name: 'Jump', group: 'Moves', length: 0.7, loop: false }, [
  [
    0,
    {
      'root.height': 1.6,
      'leftShin.bend': 0.7,
      'rightShin.bend': 0.7,
      'leftLeg.x': -0.35,
      'rightLeg.x': -0.35,
      'leftArm.x': 0.6,
      'rightArm.x': 0.6,
    },
    'easeOut',
  ],
  [0.15, { 'leftArm.x': -2.6, 'rightArm.x': -2.6, 'leftArm.z': -0.3, 'rightArm.z': 0.3 }, 'easeInOut'],
  [
    0.45,
    {
      'leftShin.bend': 1.1,
      'rightShin.bend': 1.1,
      'leftLeg.x': -0.7,
      'rightLeg.x': -0.5,
      'leftArm.x': -1.4,
      'rightArm.x': -1.4,
      'leftForearm.bend': -0.9,
      'rightForearm.bend': -0.9,
    },
    'easeInOut',
  ],
  [
    0.7,
    {
      'leftShin.bend': 0.3,
      'rightShin.bend': 0.3,
      'leftArm.x': -0.8,
      'rightArm.x': -0.8,
      'leftArm.z': -0.4,
      'rightArm.z': 0.4,
    },
  ],
]);

const swing = clipFromPoses({ id: 'clp_moveswing0', name: 'Swing', group: 'Moves', length: 0.5, loop: false }, [
  [0, {}, 'easeOut'],
  [
    0.16,
    { 'rightArm.x': -2.6, 'rightForearm.bend': -0.6, 'torso.lean': -0.1, 'hips.turn': -0.3, 'leftArm.x': -0.4 },
    'easeIn',
  ],
  [
    0.28,
    {
      'rightArm.x': -0.5,
      'rightForearm.bend': -0.1,
      'torso.lean': 0.3,
      'hips.turn': 0.35,
      'leftLeg.x': -0.45,
      'leftArm.x': 0.3,
    },
    'easeInOut',
  ],
  [0.5, {}],
]);

const flinch = clipFromPoses({ id: 'clp_moveflinch', name: 'Flinch', group: 'Moves', length: 0.45, loop: false }, [
  [0, {}, 'easeOut'],
  [
    0.08,
    {
      'torso.lean': -0.45,
      'head.turn': 0.3,
      'leftArm.z': -0.7,
      'rightArm.z': 0.7,
      'leftForearm.bend': -1.4,
      'rightForearm.bend': -1.4,
      'root.height': 1.7,
    },
    'easeInOut',
  ],
  [0.25, { 'torso.lean': -0.3, 'head.turn': 0.15, 'leftArm.z': -0.4, 'rightArm.z': 0.4 }, 'easeInOut'],
  [0.45, {}],
]);

const breathe = clipFromPoses({ id: 'clp_movebreath', name: 'Breathe', group: 'Moves', length: 2.4, loop: true }, [
  [0, {}],
  [1.2, { 'torso.lean': 0.04, 'leftArm.z': -0.16, 'rightArm.z': 0.16, 'head.turn': 0.1, 'root.height': 1.8 }],
  [2.4, {}],
]);

/**
 * step 11b: swimming. The body lies along the water (root pitch, as v68's plank), the arms wheel over one after the
 * other (a front crawl) and the legs flutter; treading water keeps the body upright, the arms sweeping and the
 * legs kicking slowly.
 */
const crawl = (lead: 'left' | 'right', reach: number) => {
  const a = lead === 'left' ? 1 : -1;
  return {
    'root.pitch': 1.3,
    'root.free': 1,
    'root.height': 1.0,
    'leftArm.x': a > 0 ? -2.9 * reach : 0.9 * reach,
    'rightArm.x': a > 0 ? 0.9 * reach : -2.9 * reach,
    'leftForearm.bend': a > 0 ? -0.15 : -0.9,
    'rightForearm.bend': a > 0 ? -0.9 : -0.15,
    'leftLeg.x': 0.18 * a,
    'rightLeg.x': -0.18 * a,
    'leftShin.bend': 0.25,
    'rightShin.bend': 0.25,
    'head.turn': 0.35 * a,
  };
};
const swim = clipFromPoses({ id: 'clp_moveswim00', name: 'Swim', group: 'Moves', length: 1.1, loop: true }, [
  [0, crawl('left', 1)],
  [0.55, crawl('right', 1)],
  [1.1, crawl('left', 1)],
]);
const treadPose = (k: number) => ({
  'root.height': 1.72,
  'leftArm.z': -0.9 - 0.25 * k,
  'rightArm.z': 0.9 + 0.25 * k,
  'leftArm.x': -0.35,
  'rightArm.x': -0.35,
  'leftForearm.bend': -0.5,
  'rightForearm.bend': -0.5,
  'leftLeg.x': -0.35 * k,
  'rightLeg.x': 0.35 * k,
  'leftShin.bend': 0.6,
  'rightShin.bend': 0.6,
});
const tread = clipFromPoses({ id: 'clp_movetread0', name: 'Tread water', group: 'Moves', length: 1.4, loop: true }, [
  [0, treadPose(1)],
  [0.7, treadPose(-1)],
  [1.4, treadPose(1)],
]);

/**
 * step 12a: pushing and pulling a block. Pushing leans in, both hands flat on the block, the feet digging in one
 * after the other; pulling sits back on bent knees, arms straight out gripping it, stepping back.
 */
const pushPose = (k: number) => ({
  'torso.lean': 0.42,
  'root.height': 1.7,
  'leftArm.x': -1.5,
  'rightArm.x': -1.5,
  'leftForearm.bend': -0.55,
  'rightForearm.bend': -0.55,
  'leftLeg.x': -0.35 * k + 0.15,
  'rightLeg.x': 0.35 * k + 0.15,
  'leftShin.bend': k > 0 ? 0.55 : 0.15,
  'rightShin.bend': k > 0 ? 0.15 : 0.55,
  'head.turn': 0,
});
const push = clipFromPoses({ id: 'clp_movepush00', name: 'Push', group: 'Moves', length: 1.2, loop: true }, [
  [0, pushPose(1)],
  [0.6, pushPose(-1)],
  [1.2, pushPose(1)],
]);
const pullPose = (k: number) => ({
  'torso.lean': -0.3,
  'root.height': 1.6,
  'leftArm.x': -1.35 + 0.08 * k,
  'rightArm.x': -1.35 - 0.08 * k,
  'leftForearm.bend': -0.12,
  'rightForearm.bend': -0.12,
  'leftLeg.x': -0.45 + 0.2 * k,
  'rightLeg.x': 0.25 - 0.2 * k,
  'leftShin.bend': 0.75,
  'rightShin.bend': 0.4,
});
const pull = clipFromPoses({ id: 'clp_movepull00', name: 'Pull', group: 'Moves', length: 1.0, loop: true }, [
  [0, pullPose(1)],
  [0.5, pullPose(-1)],
  [1.0, pullPose(1)],
]);

export const MOVE_CLIPS: Clip[] = [walk, run, jump, swing, flinch, breathe, swim, tread, push, pull];

/** the state each built-in move is made for (Use the built-in moves on the character sheet) */
export const MOVE_FOR = {
  walk: walk.id,
  run: run.id,
  jump: jump.id,
  attack: swing.id,
  hurt: flinch.id,
  idle: breathe.id,
  swim: swim.id,
  tread: tread.id,
  push: push.id,
  pull: pull.id,
} as const;
