import type { Bone } from '../../core/character/body';
import type { ResolvedBody } from '../../core/character/resolve';
import { multiply } from '../render/math';
import type { Overlay, RenderBrick } from '../render/renderer';

/**
 * P22 part 3: generated movement for a body plan. Each bone moves by its role — legs step in a gait (their
 * phase says which step together), knees bend, wings flap, a spine snakes, a tail sways — so any skeleton
 * walks, flies, swims, slithers or hops without clips. The bricks of each bone are drawn as one overlay
 * turned by that bone.
 */
export type Motion = {
  /** the step cycle, in radians (one turn per stride) */
  gait: number;
  /** 0 standing … 1 moving */
  moving: number;
  /** seconds, for idle motion */
  time: number;
};
export const newMotion = (): Motion => ({ gait: 0, moving: 0, time: 0 });

/** Moves the cycle on by the distance travelled this frame. */
export function advance(m: Motion, body: Pick<ResolvedBody, 'stride' | 'scale'>, dist: number, dt: number) {
  m.time += dt;
  if (dt <= 0) return;
  const speed = dist / dt;
  const target = speed > 0.15 ? 1 : 0;
  m.moving += (target - m.moving) * Math.min(1, dt * 6);
  m.gait = (m.gait + (dist / Math.max(0.1, body.stride * body.scale)) * Math.PI * 2) % (Math.PI * 200);
}

const I = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function translate(x: number, y: number, z: number) {
  const m = I();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
export function rotX(a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
/** about y, the way v68 turns a figure by its heading */
export function rotY(a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function rotZ(a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function scaleM(k: number) {
  const m = I();
  m[0] = k;
  m[5] = k;
  m[10] = k;
  return m;
}
const deg = Math.PI / 180;
const TAU = Math.PI * 2;

/** parents before children */
export function boneOrder(bones: readonly Bone[]): Bone[] {
  const out: Bone[] = [];
  const done = new Set<string>();
  const byName = new Map(bones.map((b) => [b.name, b]));
  const visit = (b: Bone, depth: number) => {
    if (done.has(b.name) || depth > bones.length) return;
    const p = b.parent ? byName.get(b.parent) : undefined;
    if (p) visit(p, depth + 1);
    done.add(b.name);
    out.push(b);
  };
  for (const b of bones) visit(b, 0);
  return out;
}

/** The turn of one bone for this moment of its motion. */
export function boneTurn(body: Pick<ResolvedBody, 'move' | 'bones'>, b: Bone, m: Motion): Float32Array {
  const A = b.swing * deg;
  const ph = TAU * (b.phase ?? 0);
  const side = b.side ?? 0;
  const mv = m.moving;
  const parent = b.parent ? body.bones.find((x) => x.name === b.parent) : undefined;
  const g = m.gait;
  switch (b.role) {
    case 'leg': {
      const knee = parent?.role === 'leg';
      const hasKnee = body.bones.some((x) => x.parent === b.name && x.role === 'leg');
      if (knee) return rotZ(-side * A * 0.6 * mv * Math.max(0, Math.cos(g + ph)));
      // a leg reaching out sideways (spiders, walkers) sweeps forward and back about y and lifts
      if (hasKnee && side)
        return multiply(
          rotY(side * A * mv * Math.sin(g + ph)),
          rotZ(side * A * 0.5 * mv * Math.max(0, Math.cos(g + ph))),
        );
      return rotX(A * mv * Math.sin(g + ph));
    }
    case 'arm':
      return rotX(-A * mv * Math.sin(g + ph));
    case 'wing': {
      const flap = body.move === 'fly' ? 0.7 + 0.3 * mv : 0.25;
      return rotZ(side * A * flap * Math.sin(m.time * (body.move === 'fly' ? 7 : 12) + ph));
    }
    case 'tail':
      return rotY(A * (0.4 * Math.sin(m.time * 2.6 - ph * 6) + 0.5 * mv * Math.sin(g - ph * 6)));
    case 'spine': {
      const wave = g + m.time * (body.move === 'swim' || body.move === 'slither' ? 2 : 0.8);
      return rotY(A * (0.35 + 0.65 * mv) * Math.sin(wave - ph * 1.5 * TAU));
    }
    case 'neck':
      return rotX(A * (0.5 * mv * Math.sin(g * 2) + 0.25 * Math.sin(m.time * 1.3)));
    case 'head':
      return multiply(rotY(A * 0.6 * Math.sin(m.time * 0.7)), rotX(A * 0.2 * Math.sin(m.time * 1.1)));
    case 'jaw':
      return rotX(A * Math.max(0, Math.sin(m.time * 1.7)) ** 4);
    case 'fin':
      return rotY(side * A * Math.sin(m.time * 5 + ph));
    case 'wheel':
      return rotX(g);
    case 'turret':
      return rotY(A * Math.sin(m.time * 0.5));
    default:
      return I();
  }
}

/** how high the body is lifted off its feet this moment (hops, hovering, the bob of a step) */
export function lift(body: Pick<ResolvedBody, 'move' | 'hover'>, m: Motion): number {
  switch (body.move) {
    case 'hop':
      return Math.max(0, Math.sin(m.gait)) * 1.1 * m.moving + 0.05 * Math.max(0, Math.sin(m.time * 3)) * (1 - m.moving);
    case 'fly':
    case 'swim':
      return body.hover + Math.sin(m.time * 2) * 0.2;
    case 'walk':
      return Math.abs(Math.sin(m.gait)) * 0.08 * m.moving;
    default:
      return 0;
  }
}

/** Each bone's matrix in the body's frame for this moment (rest when `m` is null). */
export function bodyPose(body: Pick<ResolvedBody, 'move' | 'bones'>, m: Motion | null): Map<string, Float32Array> {
  const out = new Map<string, Float32Array>();
  for (const b of boneOrder(body.bones)) {
    const local = multiply(translate(b.at[0], b.at[1], b.at[2]), m ? boneTurn(body, b, m) : I());
    const p = b.parent ? out.get(b.parent) : undefined;
    out.set(b.name, p ? multiply(p, local) : local);
  }
  return out;
}

/** Where the body stands: position, heading, its size and the lift of its motion. */
export function bodyWorld(
  body: Pick<ResolvedBody, 'move' | 'hover' | 'scale'>,
  at: { x: number; y: number; z: number; heading: number },
  m: Motion | null,
) {
  return multiply(
    multiply(translate(at.x, at.y + (m ? lift(body, m) : body.hover) * body.scale, at.z), rotY(at.heading)),
    scaleM(body.scale),
  );
}

const bricksByBone = new WeakMap<object, Map<string, RenderBrick[]>>();
function grouped(body: ResolvedBody): Map<string, RenderBrick[]> {
  let g = bricksByBone.get(body);
  if (!g) {
    g = new Map();
    for (const b of body.bricks) {
      const list = g.get(b.bone) ?? [];
      list.push({ id: 0, w: b.w, d: b.d, kind: b.kind, x: b.x, y: b.y, z: b.z, color: b.color });
      g.set(b.bone, list);
    }
    bricksByBone.set(body, g);
  }
  return g;
}

/** The body's bricks as overlays, one per bone, turned by that bone. */
export function bodyOverlays(
  body: ResolvedBody,
  pose: Map<string, Float32Array>,
  world: Float32Array,
  alpha = 1,
): Overlay[] {
  const out: Overlay[] = [];
  for (const [bone, bricks] of grouped(body)) {
    const m = pose.get(bone);
    if (!m) continue;
    out.push({ bricks, alpha, flat: false, model: multiply(world, m) });
  }
  return out;
}

/** The skeleton as lines (joint to joint) in world space, and each joint's position. */
export function boneLines(body: Pick<ResolvedBody, 'bones'>, pose: Map<string, Float32Array>, world: Float32Array) {
  const joint = new Map<string, [number, number, number]>();
  for (const [name, m] of pose) {
    const w = multiply(world, m);
    joint.set(name, [w[12]!, w[13]!, w[14]!]);
  }
  const lines: number[] = [];
  for (const b of body.bones) {
    const a = b.parent ? joint.get(b.parent) : undefined;
    const c = joint.get(b.name);
    if (a && c) lines.push(...a, ...c);
  }
  return { lines, joint };
}

/** The body's extent at rest, in the body's frame with its size (for framing a camera on it). */
export function bodyBounds(body: ResolvedBody): { min: [number, number, number]; max: [number, number, number] } {
  const pose = bodyPose(body, null);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of body.bricks) {
    const m = pose.get(b.bone);
    if (!m) continue;
    const h = b.kind === 'brick' ? 1.2 : 0.4;
    for (const [x, y, z] of [
      [b.x, b.y * 0.4, b.z],
      [b.x + b.w, b.y * 0.4 + h, b.z + b.d],
    ] as const) {
      const p = [m[12]! + x, m[13]! + y + body.hover, m[14]! + z];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, p[i]! * body.scale);
        max[i] = Math.max(max[i]!, p[i]! * body.scale);
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [-1, 0, -1], max: [1, 2, 1] };
  return { min, max };
}
