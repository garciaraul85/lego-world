import type { Brick } from '../bricks/codec';
import { brickHeight } from '../bricks/map-bricks';

/**
 * Free rotation of a placed asset (P31): degrees about X, Y and Z, on top of its quarter turn `rot`, around
 * the middle of the asset. A tilted asset is a free object: it is drawn turned, it does not take part in the
 * brick grid rules (no overlap or support checks), nothing can be built on it, and in Play things bump
 * into it as if it stood straight. Loose bricks always stand studs-up.
 */
export type Tilt = [number, number, number];
type V3 = [number, number, number];

export const hasTilt = (t: readonly number[] | undefined | null): t is Tilt => !!t && t.some((v) => Math.abs(v) > 1e-6);

/** Angles kept in -180..180, rounded to a tenth of a degree. */
export function normalizeTilt(t: readonly number[]): Tilt {
  return t.map((v) => {
    let a = ((((v + 180) % 360) + 360) % 360) - 180;
    if (a === -180) a = 180;
    return Math.round(a * 10) / 10 || 0;
  }) as Tilt;
}

const brickTop = (b: Brick) => (b.y + brickHeight(b.type)) * 0.4;
function footprintOf(b: Brick): [number, number] {
  const m = /(\d+)x(\d+)$/.exec(b.type)!;
  const rows = Number(m[1]);
  const cols = Number(m[2]);
  return b.rot % 2 ? [rows, cols] : [cols, rows];
}

/** World box of bricks as they would stand untilted. */
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

/** The point the asset turns around: the middle of its untilted box. */
export function tiltPivot(bricks: readonly Brick[]): V3 {
  const [a, b] = bricksBox(bricks);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
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

/** A point of the untilted asset, where it ends up when tilted. */
export function tiltPoint(t: readonly number[], pivot: readonly number[], p: readonly number[]): V3 {
  const q = mul(tiltMatrix(t), [p[0]! - pivot[0]!, p[1]! - pivot[1]!, p[2]! - pivot[2]!]);
  return [q[0] + pivot[0]!, q[1] + pivot[1]!, q[2] + pivot[2]!];
}

/** A world ray as seen from the untilted asset (for picking its bricks). Distances along the ray are kept. */
export function untiltRay(
  t: readonly number[],
  pivot: readonly number[],
  r: { o: readonly number[]; d: readonly number[] },
) {
  const m = tiltMatrix(t);
  const o = mulT(m, [r.o[0]! - pivot[0]!, r.o[1]! - pivot[1]!, r.o[2]! - pivot[2]!]);
  return { o: [o[0] + pivot[0]!, o[1] + pivot[1]!, o[2] + pivot[2]!] as V3, d: mulT(m, r.d) };
}

/** Column-major 4×4 model matrix (for the renderer): move to the pivot, turn, move back. */
export function tiltModel(t: readonly number[], pivot: readonly number[]): Float32Array {
  const r = tiltMatrix(t);
  const [px, py, pz] = pivot as V3;
  const rp = mul(r, pivot);
  return new Float32Array([
    r[0]!,
    r[3]!,
    r[6]!,
    0,
    r[1]!,
    r[4]!,
    r[7]!,
    0,
    r[2]!,
    r[5]!,
    r[8]!,
    0,
    px - rp[0],
    py - rp[1],
    pz - rp[2],
    1,
  ]);
}

/** The world box around the tilted asset (gizmo, physics box, framing). */
export function tiltedBox(bricks: readonly Brick[], t: readonly number[]): [V3, V3] {
  const [a, b] = bricksBox(bricks);
  if (!hasTilt(t)) return [a, b];
  const pivot = tiltPivot(bricks);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [a[0], b[0]])
    for (const y of [a[1], b[1]])
      for (const z of [a[2], b[2]]) {
        const p = tiltPoint(t, pivot, [x, y, z]);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, p[i]!);
          max[i] = Math.max(max[i]!, p[i]!);
        }
      }
  return [min, max];
}
