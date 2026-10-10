import { hash64 } from '../../core/hash';
import type { Clip } from '../../core/schema';
import { PARAM_BONES, POSE_DEFAULTS, paramOf, trackOf } from './clip-params';

export type Ease = Clip['tracks'][number]['keys'][number][2];
export type PoseParams = Record<string, number | number[] | boolean | null>;
/** A v68 StudioMotion routine: keys are [progress 0..1, partial parameters]. */
export type Routine = {
  id: string;
  label: string;
  group: string;
  duration: number;
  keys: [number, Record<string, unknown>][];
  prop: string | null;
};

const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  // v68 StudioMotion's smooth(): every routine segment eases in and out
  easeInOut: (t) => t * t * (3 - 2 * t),
  step: () => 0,
};

export const clipId = (key: string) =>
  `clp_${(BigInt(`0x${hash64(key)}`) % 36n ** 10n).toString(36).padStart(10, '0')}` as Clip['id'];

/** P3.5 port: a v68 routine becomes a keyframe clip with one track per number it moves. */
export function clipFromRoutine(r: Routine): Clip {
  const times = r.keys.map(([u]) => Math.round(u * r.duration * 1e6) / 1e6);
  const tracks: Clip['tracks'] = [];
  const value = (i: number, param: string) => (r.keys[i]![1][param] ?? POSE_DEFAULTS[param]) as unknown;
  for (const param of Object.keys(PARAM_BONES)) {
    const def = POSE_DEFAULTS[param];
    if (param === 'grip') {
      const vals = r.keys.map((_, i) => value(i, 'grip') as number[] | null);
      if (vals.every((v) => v === null)) continue;
      const mixed = vals.some((v) => v === null);
      if (mixed) tracks.push({ bone: 'prop', prop: 'gripOn', keys: times.map((t, i) => [t, vals[i] ? 1 : 0, 'step']) });
      const len = vals.find((v) => v)!.length;
      for (let k = 0; k < len; k++)
        tracks.push({
          ...trackOf('grip', k),
          keys: times.map((t, i) => [t, (vals[i] ?? vals.find((v) => v)!)[k]!, mixed ? 'step' : 'easeInOut']),
        });
      continue;
    }
    if (typeof def === 'boolean') {
      const vals = r.keys.map((_, i) => (value(i, param) ? 1 : 0));
      if (vals.some((v) => v !== (def ? 1 : 0)))
        tracks.push({ ...trackOf(param), keys: times.map((t, i) => [t, vals[i]!, 'step']) });
      continue;
    }
    if (Array.isArray(def)) {
      for (let k = 0; k < def.length; k++) {
        const vals = r.keys.map((_, i) => (value(i, param) as number[])[k]!);
        if (vals.some((v) => v !== def[k]))
          tracks.push({ ...trackOf(param, k), keys: times.map((t, i) => [t, vals[i]!, 'easeInOut']) });
      }
      continue;
    }
    const vals = r.keys.map((_, i) => value(i, param) as number);
    if (vals.some((v) => v !== def))
      tracks.push({ ...trackOf(param), keys: times.map((t, i) => [t, vals[i]!, 'easeInOut']) });
  }
  return {
    id: clipId(`builtin:${r.id}`),
    name: r.label,
    group: r.group,
    ...(r.prop ? { prop: r.prop } : {}),
    length: r.duration,
    loop: true,
    tracks,
    events: [],
  };
}

/** One track's value at time t (keys sorted by time; before the first key = first value). */
export function sampleTrack(keys: Clip['tracks'][number]['keys'], t: number): number {
  if (!keys.length) return 0;
  if (keys.length === 1 || t <= keys[0]![0]) return keys[0]![1];
  // v68 picks the first segment whose end is at or after t
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i]![0]) {
      const a = keys[i - 1]!;
      const b = keys[i]!;
      const span = b[0] - a[0];
      const u = span > 0 ? EASE[a[2]]((t - a[0]) / span) : 1;
      return a[1] + (b[1] - a[1]) * u;
    }
  }
  return keys[keys.length - 1]![1];
}

/** The v68 routine parameters a clip gives at time t (what StudioMotion.parameters returns). */
export function sampleParams(clip: Pick<Clip, 'tracks'>, t: number): PoseParams {
  const p: PoseParams = {};
  for (const [k, v] of Object.entries(POSE_DEFAULTS)) p[k] = Array.isArray(v) ? [...v] : v;
  let gripOn: number | null = null;
  const grip: number[] = [];
  for (const tr of clip.tracks) {
    const v = sampleTrack(tr.keys, t);
    if (tr.bone === 'prop' && tr.prop === 'gripOn') {
      gripOn = v;
      continue;
    }
    const at = paramOf(tr.bone, tr.prop);
    if (!at) continue;
    if (at.param === 'grip') grip[at.k] = v;
    else if (at.param === 'free') p.free = v >= 0.5;
    else if (at.k >= 0) (p[at.param] as number[])[at.k] = v;
    else p[at.param] = v;
  }
  if (grip.length && gripOn !== 0) p.grip = grip;
  return p;
}
