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

/**
 * climbing onto a ledge (0.92 s, as the climb itself): both hands up onto the top, the pull up with the elbows
 * bending and a knee coming up onto the edge, then over and up to stand
 */
const reach = {
  'leftArm.x': -2.9,
  'rightArm.x': -2.9,
  'leftForearm.bend': -0.15,
  'rightForearm.bend': -0.15,
  'torso.lean': 0.1,
  'leftLeg.x': 0,
  'rightLeg.x': 0,
  'leftShin.bend': 0.1,
  'rightShin.bend': 0.1,
  'root.height': 1.78,
};
const pullUp = {
  'leftArm.x': -2.1,
  'rightArm.x': -2.1,
  'leftForearm.bend': -1.6,
  'rightForearm.bend': -1.6,
  'torso.lean': 0.35,
  'leftLeg.x': 0.25,
  'rightLeg.x': 0.35,
  'leftShin.bend': 0.5,
  'rightShin.bend': 0.7,
  'root.height': 1.78,
};
const kneeUp = {
  'leftArm.x': -1.1,
  'rightArm.x': -1.1,
  'leftForearm.bend': -1.9,
  'rightForearm.bend': -1.9,
  'torso.lean': 0.6,
  'leftLeg.x': -1.4,
  'leftShin.bend': 1.7,
  'rightLeg.x': 0.5,
  'rightShin.bend': 0.4,
  'root.height': 1.6,
};
const standUp = {
  'leftArm.x': -0.3,
  'rightArm.x': -0.3,
  'leftForearm.bend': -0.4,
  'rightForearm.bend': -0.4,
  'torso.lean': 0.2,
  'leftLeg.x': -0.4,
  'leftShin.bend': 0.7,
  'rightLeg.x': 0.3,
  'rightShin.bend': 0.5,
  'root.height': 1.7,
};
const climb = clipFromPoses({ id: 'clp_moveclimb0', name: 'Climb', group: 'Moves', length: 0.92, loop: false }, [
  [0, reach],
  [0.18, reach],
  [0.45, pullUp],
  [0.66, kneeUp],
  [0.92, standUp],
]);

/**
 * step 12b: climbing a ladder or vines (a loop): one hand reaches up while the other pulls, the knee on the same
 * side comes up to the next rung, then the other side
 */
const rung = (k: number) => ({
  'leftArm.x': k > 0 ? -2.95 : -2.2,
  'rightArm.x': k > 0 ? -2.2 : -2.95,
  'leftForearm.bend': k > 0 ? -0.2 : -1.3,
  'rightForearm.bend': k > 0 ? -1.3 : -0.2,
  'leftLeg.x': k > 0 ? -0.95 : -0.15,
  'rightLeg.x': k > 0 ? -0.15 : -0.95,
  'leftShin.bend': k > 0 ? 1.4 : 0.35,
  'rightShin.bend': k > 0 ? 0.35 : 1.4,
  'torso.lean': 0.08,
  'root.height': 1.78,
});
const ladder = clipFromPoses({ id: 'clp_moveladdr0', name: 'Ladder', group: 'Moves', length: 1.0, loop: true }, [
  [0, rung(1)],
  [0.5, rung(-1)],
  [1.0, rung(1)],
]);

/**
 * step 12c: climbing a wall (Climbing: Anything): hands flat on the face, one high and one at the head, leaning in;
 * the knee on the side of the low hand drawn up to a foothold, the other leg pushing below, then the other side
 */
const grip = (k: number) => ({
  'leftArm.x': k > 0 ? -2.75 : -2.05,
  'rightArm.x': k > 0 ? -2.05 : -2.75,
  'leftArm.z': -0.15,
  'rightArm.z': 0.15,
  'leftForearm.bend': k > 0 ? -0.35 : -1.05,
  'rightForearm.bend': k > 0 ? -1.05 : -0.35,
  'leftLeg.x': k > 0 ? -0.25 : -1.15,
  'rightLeg.x': k > 0 ? -1.15 : -0.25,
  'leftShin.bend': k > 0 ? 0.55 : 1.55,
  'rightShin.bend': k > 0 ? 1.55 : 0.55,
  'torso.lean': 0.04,
  'root.height': 1.7,
});
export const wallClimb = clipFromPoses(
  { id: 'clp_movewall00', name: 'Wall climb', group: 'Moves', length: 1.1, loop: true },
  [
    [0, grip(1)],
    [0.55, grip(-1)],
    [1.1, grip(1)],
  ],
);

/**
 * step 12c: pulling up over the top of a wall (a mantle, as climbers and Breath of the Wild do it): hanging from
 * both hands on the edge, the pull up until the head is over it (elbows bent, the chest against the wall), the
 * press down on the hands with a knee up onto the top, then standing up on it. The game moves the body so that the
 * hands stay on the edge until the press is done (MANTLE_HANDS in the runtime: where the hands are in this clip).
 */
const hang = {
  'leftArm.x': -2.25,
  'rightArm.x': -2.25,
  'leftArm.z': -0.08,
  'rightArm.z': 0.08,
  'leftForearm.bend': -0.2,
  'rightForearm.bend': -0.2,
  'torso.lean': 0.02,
  'leftLeg.x': -0.35,
  'rightLeg.x': 0.05,
  'leftShin.bend': 0.7,
  'rightShin.bend': 0.25,
  'root.height': 1.78,
};
const chinUp = {
  'leftArm.x': -0.65,
  'rightArm.x': -0.65,
  'leftArm.z': -0.12,
  'rightArm.z': 0.12,
  'leftForearm.bend': -2.35,
  'rightForearm.bend': -2.35,
  'torso.lean': 0.18,
  'leftLeg.x': -0.7,
  'rightLeg.x': 0.15,
  'leftShin.bend': 1.2,
  'rightShin.bend': 0.35,
  'root.height': 1.78,
};
const elbowsOver = {
  'leftArm.x': 0.3,
  'rightArm.x': 0.3,
  'leftArm.z': -0.12,
  'rightArm.z': 0.12,
  'leftForearm.bend': -1.9,
  'rightForearm.bend': -1.9,
  'torso.lean': 0.4,
  'leftLeg.x': -1.1,
  'rightLeg.x': 0.3,
  'leftShin.bend': 1.6,
  'rightShin.bend': 0.3,
  'root.height': 1.78,
};
const pressUp = {
  'leftArm.x': 0.1,
  'rightArm.x': 0.1,
  'leftArm.z': -0.12,
  'rightArm.z': 0.12,
  'leftForearm.bend': -0.9,
  'rightForearm.bend': -0.9,
  'torso.lean': 0.6,
  'leftLeg.x': -1.55,
  'rightLeg.x': 0.45,
  'leftShin.bend': 1.95,
  'rightShin.bend': 0.3,
  'root.height': 1.78,
};
/** how long the pull up over the top takes, and when the hands leave the edge (seconds) */
export const MANTLE_SECONDS = 1.1;
export const MANTLE_RELEASE = 0.78;
export const ledgePull = clipFromPoses(
  { id: 'clp_moveledge0', name: 'Pull up', group: 'Moves', length: MANTLE_SECONDS, loop: false },
  [
    [0, hang],
    [0.15, hang, 'easeInOut'],
    [0.5, chinUp, 'easeInOut'],
    [0.64, elbowsOver, 'easeInOut'],
    [MANTLE_RELEASE, pressUp, 'easeInOut'],
    [MANTLE_SECONDS, standUp],
  ],
);

/**
 * step 12c: sliding on ice: the feet stay put under the body (nothing to push off), knees bent low, one foot a
 * little ahead, the arms out to the sides for balance, wobbling one way and the other
 */
const balance = (k: number) => ({
  'leftArm.z': -1.15 - 0.2 * k,
  'rightArm.z': 1.15 - 0.2 * k,
  'leftArm.x': -0.35 + 0.1 * k,
  'rightArm.x': -0.35 - 0.1 * k,
  'leftForearm.bend': -0.35,
  'rightForearm.bend': -0.35,
  'leftLeg.x': -0.3,
  'rightLeg.x': 0.25,
  'leftShin.bend': 0.55,
  'rightShin.bend': 0.45,
  'torso.lean': 0.12,
  'head.turn': 0.08 * k,
  'root.height': 1.62,
});
export const iceSlide = clipFromPoses(
  { id: 'clp_moveslide0', name: 'Slide', group: 'Moves', length: 1.6, loop: true },
  [
    [0, balance(1), 'easeInOut'],
    [0.8, balance(-1), 'easeInOut'],
    [1.6, balance(1)],
  ],
);

/**
 * step 12b: picking a bomb up over the head (bend, grab low, lift), holding it up (standing, and walking), throwing
 * it (arms back over the head, then forward and down), and putting it down (bend forward, arms down)
 */
// held up in front of the face, both hands on its sides (the arms raised forward, elbows a little bent)
const overhead = {
  'leftArm.x': -2.3,
  'rightArm.x': -2.3,
  'leftForearm.bend': -0.35,
  'rightForearm.bend': -0.35,
  'leftArm.z': 0.2,
  'rightArm.z': -0.2,
};
const low = {
  'leftArm.x': -0.9,
  'rightArm.x': -0.9,
  'leftForearm.bend': -0.3,
  'rightForearm.bend': -0.3,
  'torso.lean': 0.65,
  'leftShin.bend': 0.9,
  'rightShin.bend': 0.9,
  'leftLeg.x': -0.45,
  'rightLeg.x': -0.45,
  'root.height': 1.45,
};
const upright = {
  'torso.lean': 0,
  'leftShin.bend': 0.05,
  'rightShin.bend': 0.05,
  'leftLeg.x': 0,
  'rightLeg.x': 0,
  'root.height': 1.78,
};
const lift = clipFromPoses({ id: 'clp_movelift00', name: 'Lift', group: 'Moves', length: 0.45, loop: false }, [
  [0, low],
  [0.15, low],
  [0.3, { ...upright, 'leftArm.x': -1.8, 'rightArm.x': -1.8, 'leftForearm.bend': -1.2, 'rightForearm.bend': -1.2 }],
  [0.45, { ...upright, ...overhead }],
]);
const hold = clipFromPoses({ id: 'clp_movehold00', name: 'Hold up', group: 'Moves', length: 1.6, loop: true }, [
  [0, { ...upright, ...overhead }],
  [0.8, { ...upright, ...overhead, 'root.height': 1.75, 'leftForearm.bend': -0.85, 'rightForearm.bend': -0.85 }],
  [1.6, { ...upright, ...overhead }],
]);
const carryStep = (leg: number, shin: [number, number]) => ({
  ...overhead,
  'leftLeg.x': -leg,
  'rightLeg.x': leg,
  'leftShin.bend': shin[0],
  'rightShin.bend': shin[1],
  'torso.lean': 0.05,
  'root.height': 1.78,
});
const carry = clipFromPoses({ id: 'clp_movecarry0', name: 'Carry', group: 'Moves', length: 0.8, loop: true }, [
  [0, carryStep(0.45, [0.08, 0.3])],
  [0.2, { ...carryStep(0, [0.05, 0.6]), 'root.height': 1.84 }],
  [0.4, carryStep(-0.45, [0.3, 0.08])],
  [0.6, { ...carryStep(0, [0.6, 0.05]), 'root.height': 1.84 }],
  [0.8, carryStep(0.45, [0.08, 0.3])],
]);
const toss = clipFromPoses({ id: 'clp_movethrow0', name: 'Throw', group: 'Moves', length: 0.35, loop: false }, [
  [0, { ...upright, ...overhead, 'leftArm.x': -3.2, 'rightArm.x': -3.2, 'torso.lean': -0.25 }],
  [0.12, { ...upright, ...overhead, 'leftArm.x': -3.3, 'rightArm.x': -3.3, 'torso.lean': -0.3, 'rightLeg.x': 0.3 }],
  [
    0.24,
    {
      ...upright,
      'leftArm.x': -1.4,
      'rightArm.x': -1.4,
      'leftForearm.bend': -0.1,
      'rightForearm.bend': -0.1,
      'torso.lean': 0.35,
      'leftLeg.x': -0.4,
      'rightLeg.x': 0.3,
    },
  ],
  [
    0.35,
    { ...upright, 'leftArm.x': -0.7, 'rightArm.x': -0.7, 'torso.lean': 0.15, 'leftLeg.x': -0.3, 'rightLeg.x': 0.2 },
  ],
]);
const putDown = clipFromPoses({ id: 'clp_movedrop00', name: 'Put down', group: 'Moves', length: 0.4, loop: false }, [
  [0, { ...upright, ...overhead }],
  [0.2, { ...low, 'leftArm.x': -1.3, 'rightArm.x': -1.3 }],
  [0.3, low],
  [0.4, { ...upright, 'leftArm.x': -0.3, 'rightArm.x': -0.3 }],
]);

/** step 12b: picking a thing up off the floor (a branch, a key): a bend and a reach down with the right hand, then up */
const pickUp = clipFromPoses({ id: 'clp_movepick00', name: 'Pick up', group: 'Moves', length: 0.5, loop: false }, [
  [0, upright],
  [0.18, { ...low, 'leftArm.x': -0.3, 'leftForearm.bend': -0.2, 'rightArm.x': -1.1, 'rightForearm.bend': -0.05 }],
  [0.28, { ...low, 'leftArm.x': -0.3, 'leftForearm.bend': -0.2, 'rightArm.x': -1.0, 'rightForearm.bend': -0.4 }],
  [0.5, { ...upright, 'rightArm.x': -0.5, 'rightForearm.bend': -0.9 }],
]);

export const MOVE_CLIPS: Clip[] = [
  walk,
  run,
  jump,
  swing,
  flinch,
  breathe,
  swim,
  tread,
  push,
  pull,
  climb,
  ladder,
  wallClimb,
  ledgePull,
  iceSlide,
  lift,
  hold,
  carry,
  toss,
  putDown,
  pickUp,
];

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
  climb: climb.id,
  ladder: ladder.id,
  lift: lift.id,
  throw: toss.id,
  drop: putDown.id,
  pick: pickUp.id,
  carry: carry.id,
  hold: hold.id,
} as const;
