/**
 * The v68 routine rig's pose parameters (StudioMotion defaults) and how they map to clip tracks.
 * A clip track is (bone, prop); arrays become x/y/z (or grip0..5) props.
 */
export const POSE_DEFAULTS: Record<string, number | number[] | boolean | null> = {
  y: 1.78,
  z: 0,
  body: 0,
  hipTurn: 0,
  turn: 0,
  lean: 0,
  roll: 0,
  head: 0,
  stance: 0.39,
  free: false,
  la: [0, 0, -0.06],
  ra: [0, 0, 0.06],
  ll: [0, 0, 0],
  rl: [0, 0, 0],
  le: -0.12,
  re: -0.12,
  lk: 0.035,
  rk: 0.035,
  grip: null,
};

/** v68 parameter -> [bone, prop prefix]. Arrays get x/y/z suffixes. */
export const PARAM_BONES: Record<string, [string, string]> = {
  y: ['root', 'height'],
  z: ['root', 'forward'],
  body: ['root', 'pitch'],
  hipTurn: ['hips', 'turn'],
  turn: ['root', 'turn'],
  lean: ['torso', 'lean'],
  roll: ['torso', 'roll'],
  head: ['head', 'turn'],
  stance: ['root', 'stance'],
  free: ['root', 'free'],
  la: ['leftArm', ''],
  ra: ['rightArm', ''],
  ll: ['leftLeg', ''],
  rl: ['rightLeg', ''],
  le: ['leftForearm', 'bend'],
  re: ['rightForearm', 'bend'],
  lk: ['leftShin', 'bend'],
  rk: ['rightShin', 'bend'],
  grip: ['prop', 'grip'],
};

const AXES = ['x', 'y', 'z'];

/** Track address of one number of a v68 parameter (k = array slot, -1 for plain numbers). */
export function trackOf(param: string, k = -1): { bone: string; prop: string } {
  const [bone, prefix] = PARAM_BONES[param]!;
  if (k < 0) return { bone, prop: prefix };
  if (param === 'grip') return { bone, prop: `grip${k}` };
  return { bone, prop: prefix ? `${prefix}${AXES[k]}` : AXES[k]! };
}

/** Inverse: which v68 parameter (and array slot) a track drives, or null for an unknown track. */
export function paramOf(bone: string, prop: string): { param: string; k: number } | null {
  for (const [param, [b, prefix]] of Object.entries(PARAM_BONES)) {
    if (b !== bone) continue;
    const def = POSE_DEFAULTS[param];
    if (param === 'grip') {
      if (/^grip\d$/.test(prop)) return { param, k: Number(prop.slice(4)) };
      continue;
    }
    if (!Array.isArray(def)) {
      if (prop === prefix) return { param, k: -1 };
      continue;
    }
    const axis = prop.slice(prefix.length);
    if (prop.startsWith(prefix) && AXES.includes(axis)) return { param, k: AXES.indexOf(axis) };
  }
  return null;
}

/** Every track a full-body clip can have, for the timeline's track list. */
export const ALL_TRACKS: { bone: string; prop: string; param: string; k: number }[] = Object.entries(POSE_DEFAULTS)
  .filter(([p]) => p !== 'grip')
  .flatMap(([param, def]) =>
    Array.isArray(def)
      ? def.map((_, k) => ({ ...trackOf(param, k), param, k }))
      : [{ ...trackOf(param), param, k: -1 }],
  );
