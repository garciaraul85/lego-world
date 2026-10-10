import type { CameraItem } from '../../core/schema';
import type { CameraFrame } from '../render/camera';
import { cross, normalize, type Vec3 } from '../render/math';
import type { ShotState } from './tracks/camera';

export type RigScene = {
  /** a role's feet position and yaw, or a mark's position and yaw */
  role(name: string): { pos: Vec3; yaw: number } | null;
  mark(id: string): { pos: Vec3; yaw: number } | null;
};

const HEAD = 1.7;
const DEFAULT_FOV = 50;

/** pseudo-noise for shake: deterministic in t */
const noise = (t: number, seed: number) =>
  Math.sin(t * 37.1 + seed * 11.3) * 0.6 + Math.sin(t * 23.7 + seed * 5.1) * 0.4;

/** Eye, target and fov of one shot at local time `local`. */
export function shotPose(it: CameraItem, scene: RigScene, t: number): { eye: Vec3; target: Vec3; fov: number } {
  const fol = it.follow ? scene.role(it.follow) : null;
  let eye: Vec3;
  if (fol) {
    const [ox, oy, oz] = it.offset ?? [0, 2.6, -6];
    const s = Math.sin(fol.yaw);
    const c = Math.cos(fol.yaw);
    // role frame: ahead = (sin yaw, cos yaw), right = (cos yaw, -sin yaw)
    eye = [fol.pos[0] + ox * c + oz * s, fol.pos[1] + oy, fol.pos[2] - ox * s + oz * c];
  } else eye = it.pos ? [...it.pos] : [0, 8, 12];
  let target: Vec3;
  const lookRole = it.look ? (scene.role(it.look) ?? scene.mark(it.look)) : null;
  if (lookRole) target = [lookRole.pos[0], lookRole.pos[1] + (scene.role(it.look!) ? HEAD : 0.5), lookRole.pos[2]];
  else if (it.lookAt) target = [...it.lookAt];
  else if (fol) target = [fol.pos[0], fol.pos[1] + HEAD, fol.pos[2]];
  else target = [eye[0], eye[1] - 2, eye[2] - 8];
  if (it.shake) {
    eye = [
      eye[0] + noise(t, 1) * it.shake * 0.25,
      eye[1] + noise(t, 2) * it.shake * 0.25,
      eye[2] + noise(t, 3) * it.shake * 0.25,
    ];
  }
  return { eye, target, fov: it.fov ?? DEFAULT_FOV };
}

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

export function frameFrom(eye: Vec3, target: Vec3, fovDeg: number): CameraFrame {
  let z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  if (!Number.isFinite(z[0])) z = [0, 0, 1];
  let right = normalize(cross([0, 1, 0], z));
  if (!Number.isFinite(right[0]) || Math.hypot(...right) < 0.5) right = [1, 0, 0];
  const up = cross(z, right);
  return {
    eye,
    right,
    up,
    forward: [-z[0], -z[1], -z[2]],
    fov: (fovDeg * Math.PI) / 180,
    distance: Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]),
  };
}

/**
 * The cinematic camera (P6.2): the current shot, eased from the previous one while blending.
 * The play renderer uses this frame instead of the follow camera while a cinematic runs.
 */
export function rigFrame(shot: ShotState, scene: RigScene, t: number): (CameraFrame & { target: Vec3 }) | null {
  if (!shot) return null;
  const cur = shotPose(shot.cur, scene, t);
  if (shot.k >= 1 || !shot.prev) return { ...frameFrom(cur.eye, cur.target, cur.fov), target: cur.target };
  const prev = shotPose(shot.prev, scene, t);
  const eye = lerp3(prev.eye, cur.eye, shot.k);
  const target = lerp3(prev.target, cur.target, shot.k);
  const fov = prev.fov + (cur.fov - prev.fov) * shot.k;
  return { ...frameFrom(eye, target, fov), target };
}
