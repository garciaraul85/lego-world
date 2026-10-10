export type Vec3 = [number, number, number];

export const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
export const cross = (a: readonly number[], b: readonly number[]): Vec3 => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
export function normalize(v: readonly number[]): Vec3 {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}

/** Column-major 4x4 multiply (same as v68 multiply()). */
export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

/** v68 projection: vertical fov in radians, near 0.1, far 2000. */
export function perspective(fov: number, aspect: number, near = 0.1, far = 2000): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
}

export function viewMatrix(eye: Vec3, right: Vec3, up: Vec3, forward: Vec3): Float32Array {
  const z = forward.map((v) => -v);
  const x = right;
  const y = up;
  return new Float32Array([
    x[0],
    y[0],
    z[0]!,
    0,
    x[1],
    y[1],
    z[1]!,
    0,
    x[2],
    y[2],
    z[2]!,
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}

/** Six frustum planes (a, b, c, d) from a column-major view-projection matrix. */
export function frustumPlanes(m: Float32Array): Float32Array[] {
  const row = (i: number) => [m[i]!, m[4 + i]!, m[8 + i]!, m[12 + i]!];
  const r0 = row(0);
  const r1 = row(1);
  const r2 = row(2);
  const r3 = row(3);
  const add = (a: number[], b: number[], s: number) => new Float32Array(a.map((v, i) => v + s * b[i]!));
  return [add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), add(r3, r2, 1), add(r3, r2, -1)];
}

/** True when the box is at least partly inside every plane. */
export function boxVisible(planes: Float32Array[], min: Vec3, max: Vec3): boolean {
  for (const p of planes) {
    const x = p[0]! >= 0 ? max[0] : min[0];
    const y = p[1]! >= 0 ? max[1] : min[1];
    const z = p[2]! >= 0 ? max[2] : min[2];
    if (p[0]! * x + p[1]! * y + p[2]! * z + p[3]! < 0) return false;
  }
  return true;
}
