import type { Brick } from '../bricks/codec';
import type { ExpandedInstance } from './instances';
import {
  type Affine,
  composeAffine,
  type FreeTransform,
  freeAffine,
  hasScale,
  hasTilt,
  isFree,
  type Scale,
  type Tilt,
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

type InstLike = { id: string; rot: number; tilt?: readonly number[]; scale?: readonly number[] };
type DefLike = { parts?: { bricks: number[]; tilt?: readonly number[]; scale?: readonly number[] }[] };

const freePart = (p: { tilt?: readonly number[]; scale?: readonly number[] }) => hasTilt(p.tilt) || hasScale(p.scale);

/** Does this placed asset draw anything turned or sized? */
export const hasFree = (inst: InstLike, def: DefLike) => isFree(inst) || !!def.parts?.some(freePart);

/**
 * Groups for one placed asset. `bricks` are its expanded bricks (brick id = idBase + asset index), `inst`
 * may be a preview (a turn being dragged).
 */
export function freeGroupsOf(
  e: { inst: InstLike & { idBase: number }; def: DefLike; bricks: Brick[] },
  inst: InstLike = e.inst,
): FreeGroup[] {
  if (!hasFree(inst, e.def)) return [];
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
    const part = freeAffine(bricks, pt, ps, inst.rot);
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

/** Every free group of a map's placed assets. */
export const freeGroups = (list: readonly ExpandedInstance[]): FreeGroup[] =>
  list.flatMap((e) => freeGroupsOf(e as never));
