/**
 * Milestone 3b (B5b): how a minifig's body reacts to a hit, by the kind of hit (see core/combat/hurt.ts) — rocked
 * back, staggering with its arms out, knocked flat on its back and getting up, hopping and patting out flames,
 * frozen stiff and shivering, jolted with its arms flung out, swaying dizzy. Timed over the reaction's seconds.
 * Arms and legs: a negative x swings forward; a knee bends with a positive value (as attack-poses.ts).
 */
import { HURT_TIME, type HurtHow } from '../../core/combat/hurt';
import { clipFromPoses, type Pose } from './posing';
import { type PoseParams, sampleParams } from './routine';

type Key = [number, Pose, ('easeIn' | 'easeOut' | 'easeInOut' | 'linear')?];

/** the keys of each reaction, at fractions of its time */
const KEYS: Record<HurtHow, Key[]> = {
  flinch: [
    [0, {}, 'easeOut'],
    [
      0.18,
      {
        'torso.lean': -0.35,
        'head.turn': 0.15,
        'leftArm.x': 0.45,
        'rightArm.x': 0.45,
        'leftArm.z': -0.3,
        'rightArm.z': 0.3,
      },
    ],
    [1, {}],
  ],
  stagger: [
    [0, {}, 'easeOut'],
    [
      0.15,
      {
        'root.forward': -0.35,
        'torso.lean': -0.5,
        'leftArm.x': 0.6,
        'rightArm.x': -0.4,
        'leftArm.z': -0.9,
        'rightArm.z': 0.9,
        'leftLeg.x': 0.55,
        'rightShin.bend': 0.35,
      },
    ],
    [
      0.45,
      {
        'root.forward': -0.55,
        'torso.lean': -0.2,
        'leftArm.z': -0.6,
        'rightArm.z': 0.6,
        'rightLeg.x': 0.4,
        'leftShin.bend': 0.3,
      },
    ],
    [1, {}],
  ],
  // knocked off its feet onto its back, a moment down, then up again
  knockdown: [
    [0, {}, 'easeIn'],
    [
      0.14,
      {
        'root.pitch': -0.9,
        'root.forward': -0.6,
        'root.height': 1.5,
        'leftArm.x': -1.4,
        'rightArm.x': -1.4,
        'leftLeg.x': -0.7,
        'rightLeg.x': -0.5,
      },
      'easeOut',
    ],
    [
      0.28,
      {
        'root.pitch': -1.45,
        'root.forward': -1.0,
        'root.height': 0.55,
        'leftArm.z': -1.2,
        'rightArm.z': 1.2,
        'leftLeg.x': -0.4,
        'rightLeg.x': -0.25,
      },
    ],
    [
      0.6,
      {
        'root.pitch': -1.4,
        'root.forward': -1.0,
        'root.height': 0.55,
        'leftArm.z': -1.1,
        'rightArm.z': 1.1,
        'leftLeg.x': -0.5,
        'rightLeg.x': -0.1,
        'rightShin.bend': 0.6,
      },
      'easeInOut',
    ],
    // pushing up: sitting, a knee bent under
    [
      0.8,
      {
        'root.pitch': -0.4,
        'root.forward': -0.6,
        'root.height': 0.9,
        'torso.lean': 0.4,
        'leftArm.x': 0.6,
        'rightArm.x': 0.6,
        'leftShin.bend': 1.3,
        'rightLeg.x': -1.0,
      },
    ],
    [1, {}],
  ],
  // hopping, both hands patting at the flames
  burn: [
    [0, {}, 'easeOut'],
    [
      0.12,
      {
        'torso.lean': 0.3,
        'leftArm.x': -1.1,
        'rightArm.x': -0.4,
        'leftForearm.bend': -1.6,
        'rightForearm.bend': -1.6,
        'root.height': 2.05,
      },
    ],
    [
      0.3,
      {
        'torso.lean': 0.3,
        'leftArm.x': -0.4,
        'rightArm.x': -1.1,
        'leftForearm.bend': -1.6,
        'rightForearm.bend': -1.6,
        'root.height': 1.78,
        'leftLeg.x': -0.5,
        'leftShin.bend': 0.8,
      },
    ],
    [
      0.48,
      {
        'torso.lean': 0.3,
        'leftArm.x': -1.1,
        'rightArm.x': -0.4,
        'leftForearm.bend': -1.6,
        'rightForearm.bend': -1.6,
        'root.height': 2.05,
      },
    ],
    [
      0.66,
      {
        'torso.lean': 0.3,
        'leftArm.x': -0.4,
        'rightArm.x': -1.1,
        'leftForearm.bend': -1.6,
        'rightForearm.bend': -1.6,
        'root.height': 1.78,
        'rightLeg.x': -0.5,
        'rightShin.bend': 0.8,
      },
    ],
    [
      0.84,
      {
        'torso.lean': 0.2,
        'leftArm.x': -0.8,
        'rightArm.x': -0.8,
        'leftForearm.bend': -1.2,
        'rightForearm.bend': -1.2,
        'root.height': 1.95,
      },
    ],
    [1, {}],
  ],
  // caught stiff: arms a little out, hunched, held (the shiver is added on top)
  freeze: [
    [0, {}, 'easeOut'],
    [
      0.08,
      {
        'torso.lean': 0.15,
        'leftArm.z': -0.35,
        'rightArm.z': 0.35,
        'leftArm.x': -0.3,
        'rightArm.x': -0.3,
        'leftForearm.bend': -1.0,
        'rightForearm.bend': -1.0,
        'root.height': 1.7,
      },
      'linear',
    ],
    [
      0.85,
      {
        'torso.lean': 0.15,
        'leftArm.z': -0.35,
        'rightArm.z': 0.35,
        'leftArm.x': -0.3,
        'rightArm.x': -0.3,
        'leftForearm.bend': -1.0,
        'rightForearm.bend': -1.0,
        'root.height': 1.7,
      },
    ],
    [1, {}],
  ],
  // jolted: arms flung out, back arched, legs apart (the jitter is added on top)
  shock: [
    [0, {}, 'easeOut'],
    [
      0.08,
      {
        'torso.lean': -0.3,
        'leftArm.z': -1.4,
        'rightArm.z': 1.4,
        'leftArm.x': -0.4,
        'rightArm.x': -0.4,
        'leftLeg.z': -0.25,
        'rightLeg.z': 0.25,
        'root.height': 1.9,
      },
      'linear',
    ],
    [
      0.7,
      {
        'torso.lean': -0.3,
        'leftArm.z': -1.3,
        'rightArm.z': 1.3,
        'leftArm.x': -0.3,
        'rightArm.x': -0.3,
        'leftLeg.z': -0.25,
        'rightLeg.z': 0.25,
        'root.height': 1.85,
      },
    ],
    [1, {}],
  ],
  // dizzy: head lolling, body swaying (the sway is added on top), arms hanging
  stun: [
    [0, {}, 'easeOut'],
    [
      0.12,
      {
        'torso.lean': 0.25,
        'leftArm.x': 0.15,
        'rightArm.x': 0.15,
        'leftArm.z': -0.15,
        'rightArm.z': 0.15,
        'leftShin.bend': 0.25,
        'rightShin.bend': 0.25,
      },
    ],
    [
      0.85,
      {
        'torso.lean': 0.25,
        'leftArm.x': 0.15,
        'rightArm.x': 0.15,
        'leftArm.z': -0.15,
        'rightArm.z': 0.15,
        'leftShin.bend': 0.25,
        'rightShin.bend': 0.25,
      },
    ],
    [1, {}],
  ],
};

const clips = new Map<HurtHow, ReturnType<typeof clipFromPoses>>();
function clipOf(how: HurtHow) {
  let c = clips.get(how);
  if (!c) {
    const dur = HURT_TIME[how];
    c = clipFromPoses(
      { id: `clp_hurt${how}`.slice(0, 14) as never, name: 'Hurt', group: 'Moves', length: dur, loop: false },
      KEYS[how].map(([u, p, e]) => [u * dur, p, e]),
    );
    clips.set(how, c);
  }
  return c;
}

const add = (p: PoseParams, key: string, v: number) => {
  p[key] = (Number(p[key]) || 0) + v;
};

/** where in its reaction the body is (t seconds since the hit) */
/** (`wob`: the clock for the shiver, jolt or sway, which keeps going while a long reaction holds) */
export function hurtPose(how: HurtHow, t: number, wob = t): PoseParams {
  const dur = HURT_TIME[how];
  const u = Math.max(0, Math.min(dur, t));
  const p = sampleParams(clipOf(how), u);
  // what moves on top of the held pose: a shiver, a jolt, a sway
  const fade = Math.min(1, (dur - u) / (dur * 0.15));
  if (how === 'freeze') {
    add(p, 'turn', Math.sin(wob * 70) * 0.03 * fade);
    add(p, 'lean', Math.sin(wob * 53) * 0.02 * fade);
  } else if (how === 'shock') {
    add(p, 'turn', Math.sin(wob * 90) * 0.09 * fade);
    add(p, 'lean', Math.sin(wob * 77 + 1) * 0.07 * fade);
    add(p, 'roll', Math.sin(wob * 61 + 2) * 0.06 * fade);
  } else if (how === 'stun') {
    add(p, 'roll', Math.sin(wob * 5) * 0.22 * fade);
    add(p, 'head', Math.sin(wob * 5 + 1.2) * 0.4 * fade);
    add(p, 'turn', Math.sin(wob * 2.5) * 0.15 * fade);
  }
  return p;
}
