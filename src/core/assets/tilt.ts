import type { Brick } from '../bricks/codec';
import { brickHeight } from '../bricks/map-bricks';

/**
 * Free transform of a placed asset (P31): a turn in degrees about X, Y and Z (on top of its quarter turn
 * `rot`) and a size per axis. The asset grows from the middle of its base, then turns around its middle.
 * Such an asset is a free object: it is drawn turned and sized, it does not take part in the brick grid
 * rules (no overlap or support checks), nothing can be built on it, and in Play things bump into it as if
 * it stood straight at its normal size. Loose bricks always stand studs-up at their real size.
 */
export type Tilt = [number, number, number];
export type Scale = [number, number, number];
type V3 = [number, number, number];

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;

export const hasTilt = (t: readonly number[] | undefined | null): t is Tilt => !!t && t.some((v) => Math.abs(v) > 1e-6);
export const hasScale = (s: readonly number[] | undefined | null): s is Scale =>
  !!s && s.some((v) => Math.abs(v - 1) > 1e-6);
/** turned or resized: drawn with a model matrix, outside the grid rules */
export const isFree = (i: { tilt?: readonly number[]; scale?: readonly number[] } | undefined | null) =>
  !!i && (hasTilt(i.tilt) || hasScale(i.scale));

/** Angles kept in -180..180, rounded to a tenth of a degree. */
export function normalizeTilt(t: readonly number[]): Tilt {
  return t.map((v) => {
    let a = ((((v + 180) % 360) + 360) % 360) - 180;
    if (a === -180) a = 180;
    return Math.round(a * 10) / 10 || 0;
  }) as Tilt;
}

/** Sizes kept in 0.1..10, rounded to hundredths. */
export function normalizeScale(s: readonly number[]): Scale {
  return s.map((v) => Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, v)) * 100) / 100) as Scale;
}

const brickTop = (b: Brick) => (b.y + brickHeight(b.type)) * 0.4;
function footprintOf(b: Brick): [number, number] {
  const m = /(\d+)x(\d+)$/.exec(b.type)!;
  const rows = Number(m[1]);
  const cols = Number(m[2]);
  return b.rot % 2 ? [rows, cols] : [cols, rows];
}

/** World box of bricks as they would stand straight at their normal size. */
export function bricksBox(bricks: readonly Brick[]): [V3, V3] {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const b of bricks) {
    const [w, d] = footprintOf(b);
    min[0] = Math.min(min[0], b.x);
    min[1] = Math.min(min[1], b.y * 0.4);
    min[2] = Math.min(min[2], b.z);
    max[0] = Math.max(max[0], b.x + w);
    max[1] = Math.max(max[1], brickTop(b));
    max[2] = Math.max(max[2], b.z + d);
  }
  return [min, max];
}

/** Row-major 3×3 rotation: yaw (Y), then pitch (X), then roll (Z). */
export function tiltMatrix(t: readonly number[]): number[] {
  const [x, y, z] = t.map((d) => (d * Math.PI) / 180) as V3;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  // R = Ry * Rx * Rz
  return [
    cy * cz + sy * sx * sz,
    -cy * sz + sy * sx * cz,
    sy * cx,
    cx * sz,
    cx * cz,
    -sx,
    -sy * cz + cy * sx * sz,
    sy * sz + cy * sx * cz,
    cy * cx,
  ];
}

const mul = (r: number[], v: readonly number[]): V3 => [
  r[0]! * v[0]! + r[1]! * v[1]! + r[2]! * v[2]!,
  r[3]! * v[0]! + r[4]! * v[1]! + r[5]! * v[2]!,
  r[6]! * v[0]! + r[7]! * v[1]! + r[8]! * v[2]!,
];
const mulT = (r: number[], v: readonly number[]): V3 => [
  r[0]! * v[0]! + r[3]! * v[1]! + r[6]! * v[2]!,
  r[1]! * v[0]! + r[4]! * v[1]! + r[7]! * v[2]!,
  r[2]! * v[0]! + r[5]! * v[1]! + r[8]! * v[2]!,
];

export type FreeTransform = {
  /** the middle the asset turns around (middle of the sized box) */
  center: V3;
  /** the middle of the base the asset grows from */
  base: V3;
  tilt: Tilt;
  scale: Scale;
  /** a point of the straight, normal-size asset → where it is drawn */
  point(p: readonly number[]): V3;
  /** a world ray → the same ray seen from the straight, normal-size asset (ray parameter t is kept) */
  ray(r: { o: readonly number[]; d: readonly number[] }): { o: V3; d: V3 };
  /** column-major 4×4 for the renderer */
  model: Float32Array;
  /** world box around the drawn asset */
  box: [V3, V3];
};

/**
 * world = center + R · (base + S · (p − base) − center), with center = base + S · (middle − base).
 */
export function freeTransform(
  bricks: readonly Brick[],
  tilt: readonly number[] = [0, 0, 0],
  scale: readonly number[] = [1, 1, 1],
): FreeTransform {
  const [a, b] = bricksBox(bricks);
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const base: V3 = [mid[0], a[1], mid[2]];
  const S = scale as Scale;
  const center: V3 = [0, 1, 2].map((i) => base[i]! + S[i]! * (mid[i]! - base[i]!)) as V3;
  const R = tiltMatrix(tilt);
  const point = (p: readonly number[]): V3 => {
    const q = [0, 1, 2].map((i) => base[i]! + S[i]! * (p[i]! - base[i]!) - center[i]!);
    const w = mul(R, q);
    return [w[0] + center[0], w[1] + center[1], w[2] + center[2]];
  };
  const ray = (r: { o: readonly number[]; d: readonly number[] }) => {
    const q = mulT(R, [r.o[0]! - center[0], r.o[1]! - center[1], r.o[2]! - center[2]]);
    const o = [0, 1, 2].map((i) => base[i]! + (q[i]! + center[i]! - base[i]!) / S[i]!) as V3;
    const dd = mulT(R, r.d);
    return { o, d: [dd[0] / S[0], dd[1] / S[1], dd[2] / S[2]] as V3 };
  };
  // linear part A = R·S, translation t = center + R·(base − S·base − center)
  const t = mul(
    R,
    [0, 1, 2].map((i) => base[i]! - S[i]! * base[i]! - center[i]!),
  );
  const model = new Float32Array([
    R[0]! * S[0],
    R[3]! * S[0],
    R[6]! * S[0],
    0,
    R[1]! * S[1],
    R[4]! * S[1],
    R[7]! * S[1],
    0,
    R[2]! * S[2],
    R[5]! * S[2],
    R[8]! * S[2],
    0,
    t[0] + center[0],
    t[1] + center[1],
    t[2] + center[2],
    1,
  ]);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [a[0], b[0]])
    for (const y of [a[1], b[1]])
      for (const z of [a[2], b[2]]) {
        const p = point([x, y, z]);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, p[i]!);
          max[i] = Math.max(max[i]!, p[i]!);
        }
      }
  return { center, base, tilt: [...tilt] as Tilt, scale: [...S] as Scale, point, ray, model, box: [min, max] };
}
