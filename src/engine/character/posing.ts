import type { Clip } from '../../core/schema';
import { ALL_TRACKS, POSE_DEFAULTS, paramOf } from './clip-params';
import { sampleTrack } from './routine';

/**
 * P23 part 4: animation by posing. A pose is where every joint is at one moment; a clip made of poses keys every
 * track at the same moments, and the motion between two poses is filled in by the clip's easing (smooth, even,
 * snappy or held). These functions read and change a clip pose by pose; the timeline still shows each track.
 */
type Key = Clip['tracks'][number]['keys'][number];
export type Ease = Key[2];
/** `${bone}.${prop}` → value */
export type Pose = Record<string, number>;

export const jointKey = (bone: string, prop: string) => `${bone}.${prop}`;
const split = (k: string) => {
  const i = k.indexOf('.');
  return { bone: k.slice(0, i), prop: k.slice(i + 1) };
};

/** the joints the pose sliders move, with their ranges (radians, or studs for the height) */
export const JOINTS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'head.turn', label: 'Head turn', min: -1, max: 1 },
  { key: 'torso.lean', label: 'Lean', min: -0.8, max: 0.8 },
  { key: 'torso.roll', label: 'Tilt', min: -0.5, max: 0.5 },
  { key: 'hips.turn', label: 'Hips turn', min: -0.6, max: 0.6 },
  { key: 'root.turn', label: 'Body turn', min: -3.14, max: 3.14 },
  { key: 'root.height', label: 'Height', min: 0.4, max: 2.6 },
  { key: 'leftArm.x', label: 'Left arm forward', min: -3, max: 1.3 },
  { key: 'leftArm.z', label: 'Left arm out', min: -3, max: 0.4 },
  { key: 'leftForearm.bend', label: 'Left elbow', min: -2.2, max: 0 },
  { key: 'rightArm.x', label: 'Right arm forward', min: -3, max: 1.3 },
  { key: 'rightArm.z', label: 'Right arm out', min: -0.4, max: 3 },
  { key: 'rightForearm.bend', label: 'Right elbow', min: -2.2, max: 0 },
  { key: 'leftLeg.x', label: 'Left leg forward', min: -1.7, max: 1.3 },
  { key: 'leftShin.bend', label: 'Left knee', min: 0, max: 1.9 },
  { key: 'rightLeg.x', label: 'Right leg forward', min: -1.7, max: 1.3 },
  { key: 'rightShin.bend', label: 'Right knee', min: 0, max: 1.9 },
];

/** where a joint is when the figure just stands */
export function restOf(key: string): number {
  const { bone, prop } = split(key);
  const at = paramOf(bone, prop);
  if (!at) return 0;
  const d = POSE_DEFAULTS[at.param];
  const v = Array.isArray(d) ? d[at.k] : d;
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
const round = (t: number) => Math.round(t * 1e4) / 1e4;

/** the moments the clip has a pose (every time any track has a key), in order */
export function poseTimes(clip: Pick<Clip, 'tracks'>): number[] {
  const out: number[] = [];
  for (const tr of clip.tracks) for (const k of tr.keys) if (!out.some((t) => near(t, k[0]))) out.push(round(k[0]));
  return out.sort((a, b) => a - b);
}

/** every joint at time t: the sliders' joints and the clip's own tracks (sampled, or rest when not moved) */
export function poseAt(clip: Pick<Clip, 'tracks'>, t: number): Pose {
  const out: Pose = {};
  for (const j of JOINTS) out[j.key] = restOf(j.key);
  // at a pose its own keys (a held pose before it would still show there)
  for (const tr of clip.tracks)
    out[jointKey(tr.bone, tr.prop)] = tr.keys.find((k) => near(k[0], t))?.[1] ?? sampleTrack(tr.keys, t);
  return out;
}

/** the ease from the pose at t to the next one (the first key's at that time) */
export function easeAt(clip: Pick<Clip, 'tracks'>, t: number): Ease | null {
  for (const tr of clip.tracks) for (const k of tr.keys) if (near(k[0], t)) return k[2];
  return null;
}

function upsert(keys: Key[], t: number, v: number, ease?: Ease): Key[] {
  const i = keys.findIndex((k) => near(k[0], t));
  if (i >= 0) return keys.map((k, n) => (n === i ? [k[0], v, ease ?? k[2]] : k));
  const prev = [...keys].reverse().find((k) => k[0] < t);
  return [...keys, [round(t), v, ease ?? prev?.[2] ?? 'easeInOut'] as Key].sort((a, b) => a[0] - b[0]);
}

/**
 * A pose at t: every track and every joint of the sliders keyed with the value it has there now, so the
 * in-between at t becomes a pose of its own and nothing moves. A joint the clip did not move yet gets a track
 * that stands at rest in every pose. Already a pose: only the missing joints are added.
 */
export function addPose(clip: Clip, t: number): Clip {
  const at = round(Math.max(0, Math.min(clip.length, t)));
  const times = [...poseTimes(clip), at].filter((x, i, l) => l.findIndex((y) => near(x, y)) === i);
  times.sort((a, b) => a - b);
  const tracks = clip.tracks.map((tr) =>
    tr.keys.some((k) => near(k[0], at)) ? tr : { ...tr, keys: upsert(tr.keys, at, sampleTrack(tr.keys, at)) },
  );
  for (const j of JOINTS) {
    const { bone, prop } = split(j.key);
    if (tracks.some((tr) => tr.bone === bone && tr.prop === prop)) continue;
    const rest = restOf(j.key);
    tracks.push({ bone, prop, keys: times.map((x) => [x, rest, 'easeInOut'] as Key) });
  }
  return { ...clip, tracks };
}

/**
 * Sets joints in the pose at t (adding the pose first if t is between poses). A joint the clip does not move
 * yet gets a track that holds its rest value at every other pose, so the other poses stay as they were.
 */
export function setPose(clip: Clip, t: number, values: Pose, ease?: Ease): Clip {
  const at = round(Math.max(0, Math.min(clip.length, t)));
  let next = addPose(clip, at);
  const times = poseTimes(next);
  for (const [key, v] of Object.entries(values)) {
    const { bone, prop } = split(key);
    if (!paramOf(bone, prop) && !(bone === 'prop' && prop === 'gripOn')) continue;
    const i = next.tracks.findIndex((tr) => tr.bone === bone && tr.prop === prop);
    if (i < 0) {
      const rest = restOf(key);
      const keys: Key[] = times.map((x) => [x, near(x, at) ? v : rest, ease && near(x, at) ? ease : 'easeInOut']);
      next = { ...next, tracks: [...next.tracks, { bone, prop, keys }] };
    } else
      next = {
        ...next,
        tracks: next.tracks.map((tr, n) => (n === i ? { ...tr, keys: upsert(tr.keys, at, v, ease) } : tr)),
      };
  }
  return next;
}

/** the pose at t taken out: every track loses its key there (a track left with no keys goes) */
export function removePose(clip: Clip, t: number): Clip {
  return {
    ...clip,
    tracks: clip.tracks
      .map((tr) => ({ ...tr, keys: tr.keys.filter((k) => !near(k[0], t)) }))
      .filter((tr) => tr.keys.length > 0),
  };
}

/** the pose at `from` moved to `to` (refused onto another pose: the clip comes back unchanged) */
export function movePose(clip: Clip, from: number, to: number): Clip {
  const at = round(Math.max(0, Math.min(clip.length, to)));
  if (near(from, at)) return clip;
  if (poseTimes(clip).some((x) => near(x, at))) return clip;
  return {
    ...clip,
    tracks: clip.tracks.map((tr) => ({
      ...tr,
      keys: tr.keys.map((k) => (near(k[0], from) ? ([at, k[1], k[2]] as Key) : k)).sort((a, b) => a[0] - b[0]),
    })),
  };
}

/** the ease from the pose at t to the next one, on every track */
export function easePose(clip: Clip, t: number, ease: Ease): Clip {
  return {
    ...clip,
    tracks: clip.tracks.map((tr) => ({
      ...tr,
      keys: tr.keys.map((k) => (near(k[0], t) ? ([k[0], k[1], ease] as Key) : k)),
    })),
  };
}

/** the other side's joint for a left or right one (and whether its sideways turns flip) */
function mirrorOf(key: string): { key: string; sign: number } {
  const { bone, prop } = split(key);
  const sideways = prop === 'y' || prop === 'z';
  if (bone.startsWith('left')) return { key: jointKey(`right${bone.slice(4)}`, prop), sign: sideways ? -1 : 1 };
  if (bone.startsWith('right')) return { key: jointKey(`left${bone.slice(5)}`, prop), sign: sideways ? -1 : 1 };
  // turns and tilts of the middle of the body go the other way
  const turns = ['head.turn', 'root.turn', 'hips.turn', 'torso.roll'];
  return { key, sign: turns.includes(key) ? -1 : 1 };
}

/** the pose at t as its mirror image: left and right swap, turns and tilts go the other way */
export function mirrorPose(clip: Clip, t: number): Clip {
  const now = poseAt(clip, t);
  const out: Pose = {};
  for (const [key, v] of Object.entries(now)) {
    const m = mirrorOf(key);
    if (key === m.key && m.sign === 1) continue;
    out[m.key] = m.sign * v;
  }
  // a joint whose mirror is not in the pose goes back to its rest on that side
  for (const key of Object.keys(now)) {
    const m = mirrorOf(key);
    if (!(m.key in now) && !(key in out)) out[key] = restOf(key);
  }
  return setPose(clip, t, out);
}

/** the joints of a pose that differ from standing (what Copy pose keeps for Paste) */
export function movedJoints(p: Pose): Pose {
  const out: Pose = {};
  for (const [k, v] of Object.entries(p)) if (Math.abs(v - restOf(k)) > 1e-4) out[k] = v;
  return out;
}

/**
 * A clip from poses: [time, joints that differ from standing, ease to the next pose]. Each joint any pose moves
 * gets a track keyed at every pose (rest where a pose leaves it out). Used for the built-in moves.
 */
export function clipFromPoses(
  head: Omit<Clip, 'tracks' | 'events'> & { events?: Clip['events'] },
  poses: [number, Pose, Ease?][],
): Clip {
  const keys = [...new Set(poses.flatMap(([, p]) => Object.keys(p)))];
  const tracks: Clip['tracks'] = keys.map((key) => {
    const { bone, prop } = split(key);
    return {
      bone,
      prop,
      keys: poses.map(([t, p, e]) => [t, p[key] ?? restOf(key), e ?? 'easeInOut'] as Key),
    };
  });
  return { ...head, tracks, events: head.events ?? [] };
}

/** every joint the timeline can add (for checks that a pose key is a real joint) */
export const POSE_KEYS = ALL_TRACKS.map((a) => jointKey(a.bone, a.prop));
