import type { Brick } from '../bricks/codec';
import { localToWorld } from './expand';
import type { ExpandedInstance } from './instances';
import {
  type Affine,
  applyAffine,
  composeAffine,
  type FreeTransform,
  freeAffine,
  hasScale,
  hasTilt,
  isFree,
  type Scale,
  type Tilt,
  tiltMatrix,
  transformOf,
} from './tilt';

/**
 * P31: the bricks of a placed asset that are drawn turned or sized, in groups that share one transform:
 * the whole asset when it is turned or sized itself, and each turned part inside it (on top of the
 * asset's own transform). Bricks in no group stand on the brick grid as usual.
 */
export type FreeGroup = {
  /** instance id, or instance id + "#" + part index */
  key: string;
  instance: string;
  part: number | null;
  bricks: Brick[];
  t: FreeTransform;
};

type InstLike = {
  id: string;
  rot: number;
  pos?: readonly number[];
  tilt?: readonly number[];
  scale?: readonly number[];
  state?: string | undefined;
};
type V3 = [number, number, number];
type PoseLike = { turn?: readonly number[]; move?: readonly number[] };
type PartLike = {
  bricks: number[];
  tilt?: readonly number[];
  scale?: readonly number[];
  pose?: Record<string, PoseLike>;
  hinge?: readonly number[];
  ease?: number;
};
type DefLike = { parts?: PartLike[]; footprint?: readonly number[]; initialState?: string };

/** P32: a state change in progress — the state it left and when (seconds on the same clock as `now`) */
export type PartAnim = { from: string; since: number; now: number };

const posed = (p: PartLike) => !!p.pose && Object.keys(p.pose).length > 0;
const freePart = (p: PartLike) => hasTilt(p.tilt) || hasScale(p.scale) || posed(p);

/** A moving part's turn and move in a state (none for states it does not list). */
const poseIn = (p: PartLike, state: string | undefined): { turn: V3; move: V3 } => {
  const q = (state && p.pose?.[state]) || {};
  return { turn: [...(q.turn ?? [0, 0, 0])] as V3, move: [...(q.move ?? [0, 0, 0])] as V3 };
};

/** Where a moving part stands now: its new state's pose, eased (smoothstep) from the old one. */
export function partPose(p: PartLike, state: string | undefined, anim?: PartAnim | null): { turn: V3; move: V3 } {
  const to = poseIn(p, state);
  if (!anim || anim.from === state) return to;
  const dur = p.ease ?? 0.6;
  const k = dur <= 0 ? 1 : Math.min(1, Math.max(0, (anim.now - anim.since) / dur));
  if (k >= 1) return to;
  const e = k * k * (3 - 2 * k);
  const from = poseIn(p, anim.from);
  const mix = (a: V3, b: V3) => a.map((v, i) => v + (b[i]! - v) * e) as V3;
  return { turn: mix(from.turn, to.turn), move: mix(from.move, to.move) };
}

/** Is any moving part of this placed asset still on its way? */
export const partsMoving = (def: DefLike, state: string | undefined, anim?: PartAnim | null) =>
  !!anim && anim.from !== state && (def.parts ?? []).some((p) => posed(p) && anim.now - anim.since < (p.ease ?? 0.6));

/** Does this placed asset draw anything turned or sized? */
export const hasFree = (inst: InstLike, def: DefLike) => isFree(inst) || !!def.parts?.some(freePart);

/**
 * Groups for one placed asset. `bricks` are its expanded bricks (brick id = idBase + asset index), `inst`
 * may be a preview (a turn being dragged).
 */
export function freeGroupsOf(
  e: { inst: InstLike & { idBase: number }; def: DefLike; bricks: Brick[]; state?: string },
  inst: InstLike = e.inst,
  anim?: PartAnim | null,
): FreeGroup[] {
  if (!hasFree(inst, e.def)) return [];
  const state = e.state ?? inst.state ?? e.def.initialState;
  const tilt = (inst.tilt ?? [0, 0, 0]) as Tilt;
  const scale = (inst.scale ?? [1, 1, 1]) as Scale;
  const whole = isFree(inst) ? freeAffine(e.bricks, tilt, scale) : null;
  const byId = new Map(e.bricks.map((b) => [b.id, b]));
  const inPart = new Set<number>();
  const out: FreeGroup[] = [];
  (e.def.parts ?? []).forEach((p, i) => {
    if (!freePart(p)) return;
    const bricks = p.bricks.flatMap((ix) => {
      const b = byId.get(e.inst.idBase + ix);
      return b ? [b] : [];
    });
    if (!bricks.length) return;
    for (const b of bricks) inPart.add(b.id);
    const pt = (p.tilt ?? [0, 0, 0]) as Tilt;
    const ps = (p.scale ?? [1, 1, 1]) as Scale;
    const part0 = freeAffine(bricks, pt, ps, inst.rot);
    // P32: a moving part turns around its hinge and moves, as it stands in the instance's state
    const part = posed(p) ? poseAffine(e, inst, p, part0, state, anim) : part0;
    const a: Affine = whole ? composeAffine(whole.affine, part.affine) : part.affine;
    const center = whole
      ? (transformOf(whole.affine, bricks, tilt, scale, whole.center).point(part.center) as never)
      : part.center;
    out.push({ key: `${inst.id}#${i}`, instance: inst.id, part: i, bricks, t: transformOf(a, bricks, pt, ps, center) });
  });
  if (whole) {
    const rest = e.bricks.filter((b) => !inPart.has(b.id));
    if (rest.length)
      out.push({
        key: inst.id,
        instance: inst.id,
        part: null,
        bricks: rest,
        t: transformOf(whole.affine, rest, tilt, scale, whole.center),
      });
  }
  return out;
}

/** Every free group of a map's placed assets (`anim`: the state change in progress of an instance, if any). */
export const freeGroups = (
  list: readonly ExpandedInstance[],
  anim?: (instance: string) => PartAnim | null | undefined,
): FreeGroup[] => list.flatMap((e) => freeGroupsOf(e as never, e.inst, anim?.(e.inst.id)));

/** The affine of a moving part: its own tilt (`base`), then its pose turned around the hinge, then moved. */
function poseAffine(
  e: { def: DefLike },
  inst: InstLike,
  p: PartLike,
  base: { affine: Affine; center: V3 },
  state: string | undefined,
  anim: PartAnim | null | undefined,
): { affine: Affine; center: V3 } {
  const { turn, move } = partPose(p, state, anim);
  const h: V3 | null =
    p.hinge && inst.pos && e.def.footprint
      ? localToWorld(
          { footprint: e.def.footprint as [number, number] },
          { pos: inst.pos as V3, rot: inst.rot },
          p.hinge,
        )
      : null;
  return posedAffine(base, turn, move, h, inst.rot);
}

/**
 * A part posed: turned `turn` (degrees, in the asset's own axes) around `hinge` (world point; the part's
 * middle when null) and moved `move` (studs, asset axes), on top of `base`. `quarters`: the asset's turn.
 */
export function posedAffine(
  base: { affine: Affine; center: V3 },
  turn: readonly number[],
  move: readonly number[],
  hinge: V3 | null,
  quarters = 0,
): { affine: Affine; center: V3 } {
  if (!hasTilt(turn) && !move.some((v) => Math.abs(v) > 1e-6)) return base;
  const q = ((quarters % 4) + 4) % 4;
  // the asset's own axes in the world (a quarter turn maps +x to +z: −90° about Y)
  const Q = tiltMatrix([0, -90 * q, 0]);
  const QT = [Q[0]!, Q[3]!, Q[6]!, Q[1]!, Q[4]!, Q[7]!, Q[2]!, Q[5]!, Q[8]!];
  const R = composeAffine(
    { m: Q, t: [0, 0, 0] },
    composeAffine({ m: tiltMatrix(turn), t: [0, 0, 0] }, { m: QT, t: [0, 0, 0] }),
  ).m;
  const h = hinge ?? base.center;
  const m = applyAffine({ m: Q, t: [0, 0, 0] }, move);
  // x → R·(x − h) + h + m
  const rh = applyAffine({ m: R, t: [0, 0, 0] }, h);
  const pose: Affine = { m: R, t: [h[0] - rh[0] + m[0], h[1] - rh[1] + m[1], h[2] - rh[2] + m[2]] };
  return { affine: composeAffine(pose, base.affine), center: applyAffine(pose, base.center) };
}
