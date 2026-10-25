import { type BodyBrick, type BodyPlan, MAX_BODY_BRICKS } from '../../../core/character/body';

/**
 * Milestone 3, 10d part 3: painting and brick-sculpting a creature on the preview. A click finds the brick (and
 * which of its six faces) under the pointer; Paint gives that brick a colour, Add puts a new brick against that
 * face on the same bone, Remove takes the brick away. Each click is one change of the body plan (one undo step).
 */
export type SculptMode = 'paint' | 'add' | 'remove';
export type SculptTool = {
  mode: SculptMode;
  /** a colour or a colour slot (main, accent, belly, eye, dark) */
  color: BodyBrick['color'];
  kind: BodyBrick['kind'];
  w: number;
  d: number;
};
/** a brick's index in the plan and the face clicked, in the bone's own axes: 0 x, 1 y (up), 2 z */
export type BrickHit = { index: number; axis: 0 | 1 | 2; sign: -1 | 1; t: number };

export const DEFAULT_SCULPT: SculptTool = { mode: 'paint', color: 'accent', kind: 'plate', w: 1, d: 1 };

export const brickHeight = (kind: BodyBrick['kind']) => (kind === 'brick' ? 1.2 : 0.4);
const PLATES = (kind: BodyBrick['kind']) => (kind === 'brick' ? 3 : 1);

type M4 = ArrayLike<number>;
/** a × b, both 4×4 column-major */
export function mul4(a: M4, b: M4): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}
/** the inverse of a 4×4 column-major matrix (null if it has none) */
export function invert4(m: M4): Float32Array | null {
  const a = Array.from(m);
  const inv = new Float32Array(16);
  inv[0] =
    a[5]! * a[10]! * a[15]! -
    a[5]! * a[11]! * a[14]! -
    a[9]! * a[6]! * a[15]! +
    a[9]! * a[7]! * a[14]! +
    a[13]! * a[6]! * a[11]! -
    a[13]! * a[7]! * a[10]!;
  inv[4] =
    -a[4]! * a[10]! * a[15]! +
    a[4]! * a[11]! * a[14]! +
    a[8]! * a[6]! * a[15]! -
    a[8]! * a[7]! * a[14]! -
    a[12]! * a[6]! * a[11]! +
    a[12]! * a[7]! * a[10]!;
  inv[8] =
    a[4]! * a[9]! * a[15]! -
    a[4]! * a[11]! * a[13]! -
    a[8]! * a[5]! * a[15]! +
    a[8]! * a[7]! * a[13]! +
    a[12]! * a[5]! * a[11]! -
    a[12]! * a[7]! * a[9]!;
  inv[12] =
    -a[4]! * a[9]! * a[14]! +
    a[4]! * a[10]! * a[13]! +
    a[8]! * a[5]! * a[14]! -
    a[8]! * a[6]! * a[13]! -
    a[12]! * a[5]! * a[10]! +
    a[12]! * a[6]! * a[9]!;
  inv[1] =
    -a[1]! * a[10]! * a[15]! +
    a[1]! * a[11]! * a[14]! +
    a[9]! * a[2]! * a[15]! -
    a[9]! * a[3]! * a[14]! -
    a[13]! * a[2]! * a[11]! +
    a[13]! * a[3]! * a[10]!;
  inv[5] =
    a[0]! * a[10]! * a[15]! -
    a[0]! * a[11]! * a[14]! -
    a[8]! * a[2]! * a[15]! +
    a[8]! * a[3]! * a[14]! +
    a[12]! * a[2]! * a[11]! -
    a[12]! * a[3]! * a[10]!;
  inv[9] =
    -a[0]! * a[9]! * a[15]! +
    a[0]! * a[11]! * a[13]! +
    a[8]! * a[1]! * a[15]! -
    a[8]! * a[3]! * a[13]! -
    a[12]! * a[1]! * a[11]! +
    a[12]! * a[3]! * a[9]!;
  inv[13] =
    a[0]! * a[9]! * a[14]! -
    a[0]! * a[10]! * a[13]! -
    a[8]! * a[1]! * a[14]! +
    a[8]! * a[2]! * a[13]! +
    a[12]! * a[1]! * a[10]! -
    a[12]! * a[2]! * a[9]!;
  inv[2] =
    a[1]! * a[6]! * a[15]! -
    a[1]! * a[7]! * a[14]! -
    a[5]! * a[2]! * a[15]! +
    a[5]! * a[3]! * a[14]! +
    a[13]! * a[2]! * a[7]! -
    a[13]! * a[3]! * a[6]!;
  inv[6] =
    -a[0]! * a[6]! * a[15]! +
    a[0]! * a[7]! * a[14]! +
    a[4]! * a[2]! * a[15]! -
    a[4]! * a[3]! * a[14]! -
    a[12]! * a[2]! * a[7]! +
    a[12]! * a[3]! * a[6]!;
  inv[10] =
    a[0]! * a[5]! * a[15]! -
    a[0]! * a[7]! * a[13]! -
    a[4]! * a[1]! * a[15]! +
    a[4]! * a[3]! * a[13]! +
    a[12]! * a[1]! * a[7]! -
    a[12]! * a[3]! * a[5]!;
  inv[14] =
    -a[0]! * a[5]! * a[14]! +
    a[0]! * a[6]! * a[13]! +
    a[4]! * a[1]! * a[14]! -
    a[4]! * a[2]! * a[13]! -
    a[12]! * a[1]! * a[6]! +
    a[12]! * a[2]! * a[5]!;
  inv[3] =
    -a[1]! * a[6]! * a[11]! +
    a[1]! * a[7]! * a[10]! +
    a[5]! * a[2]! * a[11]! -
    a[5]! * a[3]! * a[10]! -
    a[9]! * a[2]! * a[7]! +
    a[9]! * a[3]! * a[6]!;
  inv[7] =
    a[0]! * a[6]! * a[11]! -
    a[0]! * a[7]! * a[10]! -
    a[4]! * a[2]! * a[11]! +
    a[4]! * a[3]! * a[10]! +
    a[8]! * a[2]! * a[7]! -
    a[8]! * a[3]! * a[6]!;
  inv[11] =
    -a[0]! * a[5]! * a[11]! +
    a[0]! * a[7]! * a[9]! +
    a[4]! * a[1]! * a[11]! -
    a[4]! * a[3]! * a[9]! -
    a[8]! * a[1]! * a[7]! +
    a[8]! * a[3]! * a[5]!;
  inv[15] =
    a[0]! * a[5]! * a[10]! -
    a[0]! * a[6]! * a[9]! -
    a[4]! * a[1]! * a[10]! +
    a[4]! * a[2]! * a[9]! +
    a[8]! * a[1]! * a[6]! -
    a[8]! * a[2]! * a[5]!;
  const det = a[0]! * inv[0]! + a[1]! * inv[4]! + a[2]! * inv[8]! + a[3]! * inv[12]!;
  if (!det || !Number.isFinite(det)) return null;
  for (let i = 0; i < 16; i++) inv[i] = inv[i]! / det;
  return inv;
}
const apply = (m: M4, p: [number, number, number]): [number, number, number] => {
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  return [0, 1, 2].map((i) => (m[i]! * p[0] + m[4 + i]! * p[1] + m[8 + i]! * p[2] + m[12 + i]!) / (w || 1)) as [
    number,
    number,
    number,
  ];
};

/**
 * The brick under a point of the picture: (nx, ny) from -1 to 1 (left/bottom to right/top), `mvp` the camera's
 * projection × view, `world` where the body stands, `pose` each bone's matrix. The nearest brick the ray enters.
 */
export function pickBrick(
  nx: number,
  ny: number,
  mvp: M4,
  world: M4,
  pose: Map<string, M4>,
  bricks: readonly Pick<BodyBrick, 'bone' | 'x' | 'y' | 'z' | 'w' | 'd' | 'kind'>[],
): BrickHit | null {
  const inv = invert4(mvp);
  if (!inv) return null;
  const near = apply(inv, [nx, ny, -1]);
  const far = apply(inv, [nx, ny, 1]);
  let best: BrickHit | null = null;
  const local = new Map<string, Float32Array | null>();
  bricks.forEach((k, index) => {
    let toLocal = local.get(k.bone);
    if (toLocal === undefined) {
      const bm = pose.get(k.bone);
      toLocal = bm ? invert4(mul4(world, bm)) : null;
      local.set(k.bone, toLocal);
    }
    if (!toLocal) return;
    const o = apply(toLocal, near);
    const f = apply(toLocal, far);
    const dir = [f[0] - o[0], f[1] - o[1], f[2] - o[2]];
    const lo = [k.x, k.y * 0.4, k.z];
    const hi = [k.x + k.w, k.y * 0.4 + brickHeight(k.kind), k.z + k.d];
    // slabs: where the ray enters and leaves the brick's box (t from 0 at the near plane to 1 at the far)
    let t0 = -Infinity;
    let t1 = Infinity;
    let axis: 0 | 1 | 2 = 0;
    let sign: -1 | 1 = 1;
    for (const i of [0, 1, 2] as const) {
      if (Math.abs(dir[i]!) < 1e-12) {
        if (o[i]! < lo[i]! || o[i]! > hi[i]!) return;
        continue;
      }
      let a = (lo[i]! - o[i]!) / dir[i]!;
      let b = (hi[i]! - o[i]!) / dir[i]!;
      let s: -1 | 1 = -1;
      if (a > b) {
        [a, b] = [b, a];
        s = 1;
      }
      if (a > t0) {
        t0 = a;
        axis = i;
        sign = s;
      }
      t1 = Math.min(t1, b);
    }
    if (t0 > t1 || t1 < 0) return;
    if (!best || t0 < best.t) best = { index, axis, sign, t: t0 };
  });
  return best;
}

/** where a new brick goes against a face of another, on the same bone */
export function brickAgainst(
  of: BodyBrick,
  hit: Pick<BrickHit, 'axis' | 'sign'>,
  tool: Pick<SculptTool, 'kind' | 'w' | 'd' | 'color'>,
): BodyBrick {
  const n: BodyBrick = {
    bone: of.bone,
    kind: tool.kind,
    w: tool.w,
    d: tool.d,
    x: of.x,
    y: of.y,
    z: of.z,
    color: tool.color,
  };
  // centred on the face it is put against
  const cx = of.x + of.w / 2;
  const cz = of.z + of.d / 2;
  n.x = Math.round(cx - n.w / 2) || 0;
  n.z = Math.round(cz - n.d / 2) || 0;
  if (hit.axis === 1) n.y = hit.sign > 0 ? of.y + PLATES(of.kind) : of.y - PLATES(n.kind);
  else {
    n.y = of.y;
    if (hit.axis === 0) n.x = hit.sign > 0 ? of.x + of.w : of.x - n.w;
    else n.z = hit.sign > 0 ? of.z + of.d : of.z - n.d;
  }
  return n;
}

/** the plan after one click of the tool on a brick, or why it can't be done */
export function sculptPlan(plan: BodyPlan, hit: BrickHit, tool: SculptTool): BodyPlan | string {
  const of = plan.bricks[hit.index];
  if (!of) return 'That brick is gone.';
  if (tool.mode === 'paint') {
    if (of.color === tool.color) return 'It is that colour already.';
    return { ...plan, bricks: plan.bricks.map((k, i) => (i === hit.index ? { ...k, color: tool.color } : k)) };
  }
  if (tool.mode === 'remove') {
    if (plan.bricks.length <= 1) return 'A body keeps at least one brick.';
    return { ...plan, bricks: plan.bricks.filter((_, i) => i !== hit.index) };
  }
  if (plan.bricks.length >= MAX_BODY_BRICKS) return `A body has at most ${MAX_BODY_BRICKS} bricks.`;
  const n = brickAgainst(of, hit, tool);
  if (Math.abs(n.x) > 30 || Math.abs(n.z) > 30 || Math.abs(n.y) > 75) return 'That is too far from the bone.';
  return { ...plan, bricks: [...plan.bricks, n] };
}
