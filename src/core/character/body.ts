import { z } from 'zod';
import { id } from '../schema/common';

/**
 * P22 part 3: body plans. A character is a minifig (v68's model) unless it has a body: a skeleton of bones,
 * bricks that follow those bones, and a way of moving. Movement is generated from the bones' roles (legs
 * step in a gait, wings flap, a spine snakes), so a new creature walks, flies, swims or hops without clips.
 *
 * Units: bone positions are world units (1 = a stud across; a brick is 1.2 tall); body bricks use the
 * renderer's brick frame (x, z in studs from the bone's joint, y in plates of 0.4).
 */
export const BONE_ROLES = [
  'root',
  'spine',
  'neck',
  'head',
  'jaw',
  'leg',
  'arm',
  'wing',
  'tail',
  'fin',
  'wheel',
  'turret',
  'other',
] as const;
export type BoneRole = (typeof BONE_ROLES)[number];
export const ROLE_INFO: Record<BoneRole, string> = {
  root: 'the body: everything hangs from it; it bobs as it walks',
  spine: 'bends side to side (snakes and fish swim with it)',
  neck: 'nods a little as it walks',
  head: 'looks around',
  jaw: 'opens and shuts',
  leg: 'steps (a leg on a leg is a knee: it bends)',
  arm: 'swings against the legs',
  wing: 'flaps',
  tail: 'sways (a chain of tail bones whips)',
  fin: 'paddles',
  wheel: 'rolls as it moves',
  turret: 'turns slowly',
  other: 'does not move on its own',
};

const coord = z.number().min(-30).max(30);
export const BoneName = z
  .string()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z][A-Za-z0-9 _-]*$/, 'letters, digits, spaces, _ and - (starting with a letter)');

export const Bone = z.strictObject({
  name: BoneName,
  /** the bone it hangs from (none: the root) */
  parent: BoneName.optional(),
  /** where its joint is, from its parent's joint, at rest (world units) */
  at: z.tuple([coord, coord, coord]),
  role: z.enum(BONE_ROLES),
  /** how far it moves, in degrees (its joint limit) */
  swing: z.number().min(0).max(90),
  /** when in the step it moves (0 to 1; legs with the same phase step together) */
  phase: z.number().min(0).max(1).optional(),
  /** -1 left, 1 right: wings and fins mirror */
  side: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
});
export type Bone = z.infer<typeof Bone>;

/** a colour, or one of the body's colour slots */
export const BODY_SLOTS = ['main', 'accent', 'belly', 'eye', 'dark'] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];
export const BodyColor = z.union([z.enum(BODY_SLOTS), z.string().regex(/^#[0-9a-f]{6}$/i)]);

export const BodyBrick = z.strictObject({
  bone: BoneName,
  w: z.number().int().min(1).max(8),
  d: z.number().int().min(1).max(8),
  kind: z.enum(['brick', 'plate', 'tile']),
  /** from the bone's joint: studs across, plates up, studs ahead (the brick's corner, like the renderer) */
  x: coord,
  y: z.number().min(-75).max(75),
  z: coord,
  color: BodyColor,
});
export type BodyBrick = z.infer<typeof BodyBrick>;

export const MOVE_KINDS = ['walk', 'fly', 'swim', 'slither', 'hop'] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];
export const MOVE_INFO: Record<MoveKind, string> = {
  walk: 'walks on its legs',
  fly: 'hovers and flaps its wings',
  swim: 'floats and swims with its spine and fins',
  slither: 'slides along the ground, its spine snaking',
  hop: 'bounces along',
};

export const MAX_BONES = 48;
export const MAX_BODY_BRICKS = 400;

/** bodyplans/<id>.json: a skeleton of your own, with its bricks */
export const BodyPlan = z.strictObject({
  id: id('bodyplan'),
  name: z.string().min(1).max(40),
  /** the family it was made from (custom: from nothing) */
  family: z.string().max(20),
  move: z.enum(MOVE_KINDS),
  bones: z.array(Bone).min(1).max(MAX_BONES),
  bricks: z.array(BodyBrick).max(MAX_BODY_BRICKS),
  /** how far one step carries it (world units) */
  stride: z.number().min(0.3).max(12),
  /** height above the ground it hovers at (fly, swim) */
  hover: z.number().min(0).max(8),
});
export type BodyPlan = z.infer<typeof BodyPlan>;

export const BODY_FAMILIES = [
  'minifig',
  'fourLegs',
  'bird',
  'fish',
  'serpent',
  'spider',
  'insect',
  'slime',
  'dragon',
  'robot',
] as const;
export type BodyFamily = (typeof BODY_FAMILIES)[number];

/** the sliders; which ones a family uses is in FAMILY_INFO */
export const BodyParams = z.strictObject({
  size: z.number().min(0.5).max(2.5).optional(),
  legs: z.number().min(0.5).max(2).optional(),
  neck: z.number().min(0).max(2).optional(),
  tail: z.number().min(0).max(2).optional(),
  wings: z.number().min(0).max(2).optional(),
  head: z.number().min(0.6).max(1.6).optional(),
  build: z.number().min(0.6).max(1.6).optional(),
});
export type BodyParams = z.infer<typeof BodyParams>;
export const PARAM_KEYS = ['size', 'legs', 'neck', 'tail', 'wings', 'head', 'build'] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];
export const PARAM_INFO: Record<ParamKey, { label: string; lo: number; hi: number; def: number }> = {
  size: { label: 'Size', lo: 0.5, hi: 2.5, def: 1 },
  legs: { label: 'Leg length', lo: 0.5, hi: 2, def: 1 },
  neck: { label: 'Neck', lo: 0, hi: 2, def: 1 },
  tail: { label: 'Tail length', lo: 0, hi: 2, def: 1 },
  wings: { label: 'Wing span', lo: 0, hi: 2, def: 1 },
  head: { label: 'Head size', lo: 0.6, hi: 1.6, def: 1 },
  build: { label: 'Build', lo: 0.6, hi: 1.6, def: 1 },
};

export const BodyColors = z.strictObject({
  main: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  belly: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  eye: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export type BodyColors = z.infer<typeof BodyColors>;

/**
 * A character's body: a family made from sliders, or a body plan of the project's own; its colours; and,
 * optionally, a brick build from the Asset studio worn on the skeleton (each brick follows a bone: the
 * nearest, unless `attach` says otherwise — keys are brick indexes in the asset).
 */
export const Body = z.strictObject({
  family: z.enum(BODY_FAMILIES).optional(),
  plan: id('bodyplan').optional(),
  params: BodyParams.optional(),
  colors: BodyColors.optional(),
  asset: id('asset').optional(),
  attach: z.record(z.string().regex(/^\d+$/), BoneName).optional(),
});
export type Body = z.infer<typeof Body>;

/** the bones' resting joints in the body's own frame (parents before children) */
export function restPositions(bones: readonly Bone[]): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  const byName = new Map(bones.map((b) => [b.name, b]));
  const visit = (b: Bone, depth: number): [number, number, number] => {
    const have = out.get(b.name);
    if (have) return have;
    const p = b.parent && depth < MAX_BONES ? byName.get(b.parent) : undefined;
    const base = p ? visit(p, depth + 1) : ([0, 0, 0] as [number, number, number]);
    const at: [number, number, number] = [base[0] + b.at[0], base[1] + b.at[1], base[2] + b.at[2]];
    out.set(b.name, at);
    return at;
  };
  for (const b of bones) visit(b, 0);
  return out;
}

/** What is wrong with a skeleton (none: an empty list): names, parents, loops, bricks on missing bones. */
export function checkPlan(plan: Pick<BodyPlan, 'bones' | 'bricks'>): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  for (const b of plan.bones) {
    if (names.has(b.name)) out.push(`Two bones are called “${b.name}”.`);
    names.add(b.name);
  }
  const roots = plan.bones.filter((b) => !b.parent);
  if (roots.length !== 1) out.push(`A skeleton has exactly one bone without a parent (this one has ${roots.length}).`);
  const byName = new Map(plan.bones.map((b) => [b.name, b]));
  for (const b of plan.bones) {
    if (b.parent && !byName.has(b.parent)) out.push(`“${b.name}” hangs from “${b.parent}”, which is not a bone.`);
    // a loop: walking up never reaches the root
    let p = b.parent;
    for (let i = 0; p && i <= plan.bones.length; i++) {
      if (p === b.name) {
        out.push(`“${b.name}” hangs from itself (through its parents).`);
        break;
      }
      p = byName.get(p)?.parent;
    }
  }
  const lost = new Set(plan.bricks.filter((k) => !byName.has(k.bone)).map((k) => k.bone));
  for (const n of lost) out.push(`Some bricks follow “${n}”, which is not a bone.`);
  return out;
}

/**
 * The bone a point is nearest to: by the bone's own bricks at rest (a brick-built body follows the family's
 * shape), else along the bone from its joint to its first child's.
 */
export function nearestBone(
  bones: readonly Bone[],
  p: readonly number[],
  bricks: readonly Pick<BodyBrick, 'bone' | 'w' | 'd' | 'kind' | 'x' | 'y' | 'z'>[] = [],
): string {
  const rest = restPositions(bones);
  const dist = new Map<string, number>();
  const keep = (name: string, d: number) => dist.set(name, Math.min(dist.get(name) ?? Infinity, d));
  for (const k of bricks) {
    const j = rest.get(k.bone);
    if (!j) continue;
    const lo = [j[0] + k.x, j[1] + k.y * 0.4, j[2] + k.z];
    const hi = [lo[0]! + k.w, lo[1]! + (k.kind === 'brick' ? 1.2 : 0.4), lo[2]! + k.d];
    const d = Math.hypot(...[0, 1, 2].map((i) => Math.max(lo[i]! - p[i]!, 0, p[i]! - hi[i]!)));
    keep(k.bone, d);
  }
  for (const b of bones) {
    const a = rest.get(b.name)!;
    const child = bones.find((c) => c.parent === b.name);
    const e = child ? rest.get(child.name)! : a;
    const ab = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
    const ap = [p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]];
    const len2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = len2 ? Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / len2)) : 0;
    keep(b.name, Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t) + 0.05);
  }
  let best = bones[0]!.name;
  let bestD = Infinity;
  for (const b of bones) {
    const d = dist.get(b.name) ?? Infinity;
    if (d < bestD - 1e-9) {
      bestD = d;
      best = b.name;
    }
  }
  return best;
}
