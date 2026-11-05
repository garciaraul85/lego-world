/**
 * Step 14a fix: how a minifig enemy's body moves when it attacks — a tell (the arm drawn back, the body crouched
 * to spring, the head thrown back), the blow at the moment it lands, then back to standing. Timed by the attack:
 * the tell takes the brain's windup, so the blow is seen exactly when the hit is dealt.
 * Arms and legs: a negative x swings forward (up past the head at about −2.6); a knee bends with a positive value.
 */
import { clipFromPoses, type Pose } from './posing';
import { type PoseParams, sampleParams } from './routine';

export type AttackAs = 'swing' | 'claw' | 'pounce' | 'spit' | 'swoop' | 'howl';

/** the tell (held at the end of the windup) and the blow (just after it lands) */
const POSES: Record<AttackAs, { tell: Pose; blow: Pose }> = {
  // a weapon raised over the shoulder, then brought down across
  swing: {
    tell: { 'rightArm.x': -2.6, 'rightForearm.bend': -0.6, 'torso.lean': -0.12, 'hips.turn': -0.35, 'leftArm.x': -0.4 },
    blow: {
      'rightArm.x': -0.45,
      'rightForearm.bend': -0.1,
      'torso.lean': 0.32,
      'hips.turn': 0.35,
      'leftLeg.x': -0.5,
      'leftShin.bend': 0.3,
      'leftArm.x': 0.35,
    },
  },
  // both hands up like claws, then raked down in front
  claw: {
    tell: {
      'leftArm.x': -2.5,
      'rightArm.x': -2.5,
      'leftArm.z': -0.35,
      'rightArm.z': 0.35,
      'leftForearm.bend': -0.9,
      'rightForearm.bend': -0.9,
      'torso.lean': -0.18,
    },
    blow: {
      'leftArm.x': -0.6,
      'rightArm.x': -0.6,
      'leftForearm.bend': -0.3,
      'rightForearm.bend': -0.3,
      'torso.lean': 0.4,
      'leftLeg.x': -0.45,
      'leftShin.bend': 0.25,
    },
  },
  // a beast sinks back on bent knees, claws up in front, then springs: the whole body pitched forward and off the
  // ground, the back leg pushing straight, the front leg and both claws reaching
  pounce: {
    tell: {
      'root.height': 1.5,
      'root.forward': -0.3,
      'torso.lean': 0.3,
      'leftLeg.x': -0.6,
      'rightLeg.x': -0.45,
      'leftShin.bend': 1.1,
      'rightShin.bend': 1.0,
      'leftArm.x': -1.25,
      'rightArm.x': -1.25,
      'leftForearm.bend': -1.3,
      'rightForearm.bend': -1.3,
    },
    blow: {
      'root.height': 2.0,
      'root.forward': 0.7,
      'root.pitch': 0.45,
      'torso.lean': 0.2,
      'leftLeg.x': -0.55,
      'rightLeg.x': 0.7,
      'leftShin.bend': 0.5,
      'rightShin.bend': 0.1,
      'leftArm.x': -1.8,
      'rightArm.x': -1.8,
      'leftArm.z': -0.15,
      'rightArm.z': 0.15,
      'leftForearm.bend': -0.3,
      'rightForearm.bend': -0.3,
    },
  },
  // the head and body thrown back (cheeks puffed), then snapped forward to spit
  spit: {
    tell: { 'torso.lean': -0.35, 'leftArm.x': 0.45, 'rightArm.x': 0.45, 'leftArm.z': -0.3, 'rightArm.z': 0.3 },
    blow: { 'torso.lean': 0.45, 'leftArm.x': 0.2, 'rightArm.x': 0.2, 'leftLeg.x': -0.3 },
  },
  // arms (wings) beaten high, then swept down and forward as it dives
  swoop: {
    tell: { 'leftArm.x': -2.8, 'rightArm.x': -2.8, 'leftArm.z': -0.6, 'rightArm.z': 0.6 },
    blow: { 'leftArm.x': -0.9, 'rightArm.x': -0.9, 'torso.lean': 0.5 },
  },
  // the head thrown back and the arms out: a howl to the sky
  howl: {
    tell: { 'torso.lean': -0.45, 'leftArm.z': -0.7, 'rightArm.z': 0.7, 'leftArm.x': 0.3, 'rightArm.x': 0.3 },
    blow: { 'torso.lean': -0.5, 'leftArm.z': -0.8, 'rightArm.z': 0.8, 'leftArm.x': 0.35, 'rightArm.x': 0.35 },
  },
};

/** seconds the blow takes to land (from the tell) */
const SNAP = 0.09;

/** Where in its attack the body is: 0 standing, through the tell (held to `hit`), the blow, and back by `dur`. */
export function attackPose(as: AttackAs, t: number, hit: number, dur: number): PoseParams {
  const p = POSES[as] ?? POSES.claw;
  const snap = Math.min(SNAP, Math.max(0.03, (dur - hit) * 0.4));
  // the tell builds most of the way quickly, then holds (an anticipation the player can read)
  const built = Math.min(hit * 0.7, Math.max(0.05, hit - 0.05));
  const head = { id: 'clp_attackpose', name: 'Attack', group: 'Moves', length: dur, loop: false } as const;
  // the blow at once (the tell was held already: a swoop that has just reached the hero)
  if (hit <= 0.01) {
    const now = clipFromPoses(head, [
      [0, p.tell, 'easeIn'],
      [Math.min(dur, snap), p.blow, 'easeInOut'],
      [dur, {}],
    ]);
    return sampleParams(now, Math.max(0, Math.min(dur, t)));
  }
  const clip = clipFromPoses(head, [
    [0, {}, 'easeOut'],
    [built, p.tell, 'linear'],
    [hit, p.tell, 'easeIn'],
    [Math.min(dur, hit + snap), p.blow, 'easeInOut'],
    [dur, {}],
  ]);
  return sampleParams(clip, Math.max(0, Math.min(dur, t)));
}
