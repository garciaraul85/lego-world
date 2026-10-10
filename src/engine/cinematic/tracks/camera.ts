import type { CameraItem } from '../../../core/schema';

export type ShotState = { cur: CameraItem; prev: CameraItem | null; k: number; local: number } | null;

const ease = (k: number) => k * k * (3 - 2 * k);

/** The camera track at time t: the current shot, the shot it blends from, and the blend (eased 0..1). */
export function cameraAt(items: readonly CameraItem[], t: number): ShotState {
  const list = [...items].sort((a, b) => a.t - b.t);
  let i = -1;
  for (let j = 0; j < list.length; j++) if (list[j]!.t <= t) i = j;
  if (i < 0) return null;
  const cur = list[i]!;
  const prev = i > 0 ? list[i - 1]! : null;
  const blend = cur.blend ?? 0;
  const local = t - cur.t;
  const k = !prev || blend <= 0 ? 1 : ease(Math.max(0, Math.min(1, local / blend)));
  return { cur, prev, k, local };
}
