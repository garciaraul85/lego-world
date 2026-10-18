import type { Clip } from '../../core/schema';

type K = [number, number, Clip['tracks'][number]['keys'][number][2]];
const tr = (bone: string, prop: string, keys: K[]) => ({ bone, prop, keys });
const E = 'easeInOut' as const;
const L = 'linear' as const;
const hold = (bone: string, prop: string, v: number, len = 1) =>
  tr(bone, prop, [
    [0, v, E],
    [len, v, E],
  ]);
const clip = (id: string, name: string, length: number, loop: boolean, tracks: Clip['tracks']): Clip => ({
  id: id as Clip['id'],
  name,
  group: 'Combat',
  length,
  loop,
  tracks,
  events: [],
});

/**
 * P9b: the hero's combat moves as keyframe clips (they show under “Combat” in the Character studio, where
 * they can be duplicated and changed like any clip). Play uses them while guarding, charging, rolling,
 * hopping, flipping and for the special attacks.
 */
export const COMBAT_CLIPS: Clip[] = [
  // shield up in front of the chest (left arm), sword ready (right)
  clip('clp_cbguard000', 'Guard', 1, true, [
    hold('leftArm', 'x', -1.35),
    hold('leftArm', 'z', -0.25),
    hold('leftForearm', 'bend', -1.3),
    hold('rightArm', 'x', -0.45),
    hold('rightForearm', 'bend', -0.6),
    hold('root', 'height', 1.62),
  ]),
  // no shield: both forearms crossed in front of the face
  clip('clp_cbdefend00', 'Defend', 1, true, [
    hold('leftArm', 'x', -1.5),
    hold('rightArm', 'x', -1.5),
    hold('leftArm', 'z', 0.35),
    hold('rightArm', 'z', -0.35),
    hold('leftForearm', 'bend', -1.9),
    hold('rightForearm', 'bend', -1.9),
    hold('root', 'height', 1.62),
  ]),
  // winding up: sword arm back, body turned, feet apart; it breathes while held (P9d)
  clip('clp_cbcharge00', 'Charge', 1, true, [
    tr('rightArm', 'x', [
      [0, 1.1, E],
      [0.5, 1.25, E],
      [1, 1.1, E],
    ]),
    tr('rightArm', 'z', [
      [0, 0.55, E],
      [1, 0.55, E],
    ]),
    tr('rightForearm', 'bend', [
      [0, -0.5, E],
      [1, -0.5, E],
    ]),
    tr('hips', 'turn', [
      [0, -0.45, E],
      [0.5, -0.55, E],
      [1, -0.45, E],
    ]),
    tr('leftArm', 'x', [
      [0, -0.7, E],
      [1, -0.7, E],
    ]),
    tr('root', 'height', [
      [0, 1.6, E],
      [0.5, 1.56, E],
      [1, 1.6, E],
    ]),
    tr('leftLeg', 'x', [
      [0, -0.45, E],
      [1, -0.45, E],
    ]),
    tr('rightLeg', 'x', [
      [0, 0.35, E],
      [1, 0.35, E],
    ]),
    tr('leftShin', 'bend', [
      [0, 0.5, E],
      [1, 0.5, E],
    ]),
    tr('root', 'stance', [
      [0, 0.55, E],
      [1, 0.55, E],
    ]),
  ]),
  // a full turn with the sword arm out
  clip('clp_cbspin0000', 'Spin attack', 0.5, false, [
    tr('root', 'turn', [
      [0, 0, L],
      [0.5, Math.PI * 2, E],
    ]),
    hold('rightArm', 'z', 1.45, 0.5),
    hold('leftArm', 'z', -0.6, 0.5),
    hold('root', 'height', 1.6, 0.5),
  ]),
  // forward roll: curl down, one turn over, up again
  clip('clp_cbroll0000', 'Dodge roll', 0.45, false, [
    tr('root', 'pitch', [
      [0, 0, L],
      [0.45, Math.PI * 2, E],
    ]),
    tr('root', 'height', [
      [0, 1.78, E],
      [0.12, 1.05, E],
      [0.33, 1.05, E],
      [0.45, 1.78, E],
    ]),
    hold('leftLeg', 'x', -1.4, 0.45),
    hold('rightLeg', 'x', -1.4, 0.45),
    hold('leftShin', 'bend', 1.6, 0.45),
    hold('rightShin', 'bend', 1.6, 0.45),
    hold('leftArm', 'x', -1.2, 0.45),
    hold('rightArm', 'x', -1.2, 0.45),
  ]),
  // a quick hop to the side: dip, spring up with the knees tucked, lean into it (P9d)
  clip('clp_cbsidehop0', 'Side hop', 0.4, false, [
    tr('torso', 'roll', [
      [0, 0, E],
      [0.15, 0.45, E],
      [0.4, 0, E],
    ]),
    tr('leftArm', 'z', [
      [0, -0.06, E],
      [0.15, -0.9, E],
      [0.4, -0.06, E],
    ]),
    tr('rightArm', 'z', [
      [0, 0.06, E],
      [0.15, 0.9, E],
      [0.4, 0.06, E],
    ]),
    tr('leftShin', 'bend', [
      [0, 0.035, E],
      [0.18, 0.9, E],
      [0.4, 0.035, E],
    ]),
    tr('rightShin', 'bend', [
      [0, 0.035, E],
      [0.18, 0.9, E],
      [0.4, 0.035, E],
    ]),
    tr('root', 'height', [
      [0, 1.78, E],
      [0.06, 1.62, E],
      [0.18, 1.95, E],
      [0.32, 1.7, E],
      [0.4, 1.78, E],
    ]),
  ]),
  // backwards somersault
  clip('clp_cbbackflp0', 'Back flip', 0.6, false, [
    tr('root', 'pitch', [
      [0, 0, L],
      [0.6, -Math.PI * 2, E],
    ]),
    hold('leftArm', 'z', -2.4, 0.6),
    hold('rightArm', 'z', 2.4, 0.6),
    hold('leftShin', 'bend', 1.2, 0.6),
    hold('rightShin', 'bend', 1.2, 0.6),
  ]),
  // leaping chop: sword over the head, then down
  clip('clp_cbjumpatk0', 'Jump attack', 0.5, false, [
    tr('rightArm', 'x', [
      [0, -0.4, E],
      [0.15, -2.8, E],
      [0.38, -0.1, E],
      [0.5, -0.3, E],
    ]),
    tr('leftArm', 'x', [
      [0, -0.4, E],
      [0.15, -2.4, E],
      [0.38, -0.2, E],
      [0.5, -0.3, E],
    ]),
    hold('leftShin', 'bend', 0.9, 0.5),
    hold('rightShin', 'bend', 0.9, 0.5),
  ]),
  // falling straight down: sword raised in both hands, then driven down at the ground (P9d)
  clip('clp_cbplunge00', 'Plunge', 0.6, false, [
    tr('rightArm', 'x', [
      [0, -2.7, E],
      [0.18, -2.8, E],
      [0.32, -0.7, E],
      [0.6, -0.7, E],
    ]),
    tr('leftArm', 'x', [
      [0, -2.7, E],
      [0.18, -2.8, E],
      [0.32, -0.7, E],
      [0.6, -0.7, E],
    ]),
    tr('rightForearm', 'bend', [
      [0, -0.3, E],
      [0.32, -0.5, E],
      [0.6, -0.5, E],
    ]),
    tr('leftShin', 'bend', [
      [0, 1.1, E],
      [0.6, 1.1, E],
    ]),
    tr('rightShin', 'bend', [
      [0, 1.1, E],
      [0.6, 1.1, E],
    ]),
    tr('rightArm', 'z', [
      [0, -0.25, E],
      [0.6, -0.25, E],
    ]),
    tr('leftArm', 'z', [
      [0, 0.25, E],
      [0.6, 0.25, E],
    ]),
    tr('leftForearm', 'bend', [
      [0, -0.3, E],
      [0.32, -0.5, E],
      [0.6, -0.5, E],
    ]),
    tr('rightLeg', 'x', [
      [0, -0.5, E],
      [0.6, -0.5, E],
    ]),
    tr('leftLeg', 'x', [
      [0, -0.5, E],
      [0.6, -0.5, E],
    ]),
    tr('torso', 'lean', [
      [0, 0, E],
      [0.32, 0.25, E],
      [0.6, 0.25, E],
    ]),
  ]),
  // shove with the shield: pull it in, then drive it out with the hips (P9d)
  clip('clp_cbbash0000', 'Shield bash', 0.35, false, [
    tr('leftArm', 'x', [
      [0, -1.1, E],
      [0.1, -0.7, E],
      [0.18, -1.6, E],
      [0.35, -1.3, E],
    ]),
    tr('leftForearm', 'bend', [
      [0, -1.3, E],
      [0.1, -1.8, E],
      [0.18, -0.3, E],
      [0.35, -0.9, E],
    ]),
    tr('root', 'forward', [
      [0, 0, E],
      [0.12, 0.45, E],
      [0.35, 0, E],
    ]),
    tr('hips', 'turn', [
      [0, 0, E],
      [0.1, 0.35, E],
      [0.18, -0.3, E],
      [0.35, 0, E],
    ]),
    tr('torso', 'lean', [
      [0, 0, E],
      [0.18, 0.3, E],
      [0.35, 0, E],
    ]),
    tr('rightArm', 'x', [
      [0, -0.45, E],
      [0.35, -0.45, E],
    ]),
    tr('rightForearm', 'bend', [
      [0, -0.6, E],
      [0.35, -0.6, E],
    ]),
  ]),
];
export const combatClip = (name: string) => COMBAT_CLIPS.find((c) => c.name === name)!;
