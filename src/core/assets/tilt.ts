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

/** x → m·x + t, with m a row-major 3×3 (turn and size). */
export type Affine = { m: number[]; t: V3 };
export const IDENTITY: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export const applyAffine = (a: Affine, p: readonly number[]): V3 => {
  const q = mul(a.m, p);
  return [q[0] + a.t[0], q[1] + a.t[1], q[2] + a.t[2]];
};

/** a ∘ b: first b, then a. */
export function composeAffine(a: Affine, b: Affine): Affine {
  const m = [0, 1, 2].flatMap((r) =>
    [0, 1, 2].map((c) => a.m[r * 3]! * b.m[c]! + a.m[r * 3 + 1]! * b.m[3 + c]! + a.m[r * 3 + 2]! * b.m[6 + c]!),
  );
  return { m, t: applyAffine(a, b.t) };
}

/** The same transform for a thing moved by d (moving the asset moves its turn and size with it). */
export function shiftAffine(a: Affine, d: readonly number[]): Affine {
  const md = mul(a.m, d);
  return { m: a.m, t: [a.t[0] + d[0]! - md[0], a.t[1] + d[1]! - md[1], a.t[2] + d[2]! - md[2]] };
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function affineModel(a: Affine): Float32Array {
  const m = a.m;
  return new Float32Array([
    m[0]!,
    m[3]!,
    m[6]!,
    0,
    m[1]!,
    m[4]!,
    m[7]!,
    0,
    m[2]!,
    m[5]!,
    m[8]!,
    0,
    a.t[0],
    a.t[1],
    a.t[2],
    1,
  ]);
}

export type FreeTransform = {
  /** the middle the thing turns around (middle of the sized box) */
  center: V3;
  tilt: Tilt;
  scale: Scale;
  affine: Affine;
  /** a point of the straight, normal-size thing → where it is drawn */
  point(p: readonly number[]): V3;
  /** a world ray → the same ray seen from the straight, normal-size thing (ray parameter t is kept) */
  ray(r: { o: readonly number[]; d: readonly number[] }): { o: V3; d: V3 };
  /** column-major 4×4 for the renderer */
  model: Float32Array;
  /** world box around the drawn bricks */
  box: [V3, V3];
};

/** Everything a renderer, picker or gizmo needs from an affine, for these bricks. */
export function transformOf(a: Affine, bricks: readonly Brick[], tilt: Tilt, scale: Scale, center: V3): FreeTransform {
  const inv = invert3(a.m);
  const [lo, hi] = bricksBox(bricks);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]])
      for (const z of [lo[2], hi[2]]) {
        const p = applyAffine(a, [x, y, z]);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, p[i]!);
          max[i] = Math.max(max[i]!, p[i]!);
        }
      }
  return {
    center,
    tilt,
    scale,
    affine: a,
    point: (p) => applyAffine(a, p),
    ray: (r) => ({
      o: mul(inv, [r.o[0]! - a.t[0], r.o[1]! - a.t[1], r.o[2]! - a.t[2]]),
      d: mul(inv, r.d),
    }),
    model: affineModel(a),
    box: [min, max],
  };
}

/**
 * The turn-and-size of a group of bricks: it grows from the middle of its base, then turns around its
 * middle. world = center + R · (base + S · (p − base) − center), with center = base + S · (middle − base).
 * `quarters`: the group lives in something turned that many quarter turns about Y (a part inside a placed
 * asset), so its own X/Z axes and sizes turn with it.
 */
export function freeAffine(
  bricks: readonly Brick[],
  tilt: readonly number[] = [0, 0, 0],
  scale: readonly number[] = [1, 1, 1],
  quarters = 0,
): { affine: Affine; center: V3 } {
  const [a, b] = bricksBox(bricks);
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const base: V3 = [mid[0], a[1], mid[2]];
  const q = ((quarters % 4) + 4) % 4;
  // a quarter turn of the brick grid (rot + 1) maps +x to +z, which is −90° about Y here
  const Q = tiltMatrix([0, -90 * q, 0]);
  const QT = [Q[0]!, Q[3]!, Q[6]!, Q[1]!, Q[4]!, Q[7]!, Q[2]!, Q[5]!, Q[8]!];
  const r0 = tiltMatrix(tilt);
  const R = q
    ? composeAffine({ m: Q, t: [0, 0, 0] }, composeAffine({ m: r0, t: [0, 0, 0] }, { m: QT, t: [0, 0, 0] })).m
    : r0;
  const S = (q % 2 ? [scale[2]!, scale[1]!, scale[0]!] : [...scale]) as Scale;
  const center: V3 = [0, 1, 2].map((i) => base[i]! + S[i]! * (mid[i]! - base[i]!)) as V3;
  const m = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => R[r * 3 + c]! * S[c]!));
  const t = mul(
    R,
    [0, 1, 2].map((i) => base[i]! - S[i]! * base[i]! - center[i]!),
  );
  return { affine: { m, t: [t[0] + center[0], t[1] + center[1], t[2] + center[2]] }, center };
}

export function freeTransform(
  bricks: readonly Brick[],
  tilt: readonly number[] = [0, 0, 0],
  scale: readonly number[] = [1, 1, 1],
): FreeTransform {
  const { affine, center } = freeAffine(bricks, tilt, scale);
  return transformOf(affine, bricks, [...tilt] as Tilt, [...scale] as Scale, center);
}
