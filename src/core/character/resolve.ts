import { expandAsset } from '../assets/expand';
import { footprint } from '../bricks/inspect';
import type { Asset } from '../schema/asset';
import { type Body, type BodyBrick, type BodyPlan, type Bone, nearestBone, restPositions } from './body';
import { FAMILY_INFO, makeFamily, slotColors } from './families';

/** A body ready to draw and move: bones, bricks with their colours, how it moves, its scale. */
export type ResolvedBody = {
  name: string;
  family: string;
  move: BodyPlan['move'];
  bones: Bone[];
  /** src: the brick's index in the worn asset */
  bricks: (BodyBrick & { color: string; src?: number })[];
  stride: number;
  hover: number;
  scale: number;
  /** bricks come from an asset worn on the skeleton */
  fromAsset: boolean;
};

const P = 0.4;

/**
 * The body a character has (null: the minifig). `get` reads project files (body plans, assets); a body
 * plan or asset that is missing falls back to the family's own bricks.
 */
export function resolveBody(body: Body | undefined, get: (path: string) => unknown): ResolvedBody | null {
  if (!body) return null;
  const own = body.plan ? (get(`bodyplans/${body.plan}.json`) as BodyPlan | undefined) : undefined;
  const family = body.family ?? (own ? undefined : 'minifig');
  if (!own && (!family || family === 'minifig')) return null;
  const made = own ?? makeFamily(family!, body.params);
  if (!made) return null;
  const colors = slotColors({ family: (own?.family as Body['family']) ?? family, colors: body.colors });
  const paint = (c: string) => (c.startsWith('#') ? c : (colors[c] ?? '#ff00ff'));
  let bricks = made.bricks.map((b) => ({ ...b, color: paint(b.color) }));
  let fromAsset = false;
  const asset = body.asset ? (get(`assets/${body.asset}.json`) as Asset | undefined) : undefined;
  if (asset) {
    bricks = attachAsset(asset, made.bones, body.attach ?? {}, made.bricks);
    fromAsset = true;
  }
  return {
    name: own?.name ?? FAMILY_INFO[family!].label,
    family: own?.family ?? family!,
    move: made.move,
    bones: made.bones,
    bricks,
    stride: made.stride,
    hover: made.hover,
    scale: body.params?.size ?? 1,
    fromAsset,
  };
}

/** Where each brick of an asset sits in the body's frame: centred on the skeleton, standing on the ground. */
export function assetBricksInBody(asset: Asset) {
  const { bricks } = expandAsset(asset, { pos: [0, 0, 0], rot: 0, idBase: 0 });
  const [fw, fd] = asset.footprint;
  return bricks.map((b) => {
    const [w, d] = footprint(b);
    const kind = (/^(brick|plate|tile)/.exec(b.type)?.[1] ?? 'brick') as BodyBrick['kind'];
    const h = (kind === 'brick' ? 3 : 1) * P;
    const x = b.x - fw / 2;
    const z = b.z - fd / 2;
    return {
      index: b.id,
      w,
      d,
      kind,
      x,
      y: b.y,
      z,
      color: b.color,
      center: [x + w / 2, b.y * P + h / 2, z + d / 2] as const,
    };
  });
}

/** Each brick of the asset on its bone (the nearest, unless `attach` names one), in that bone's frame. */
export function attachAsset(
  asset: Asset,
  bones: readonly Bone[],
  attach: Record<string, string>,
  /** the plan's own bricks: the shape each bone has */
  shape: readonly BodyBrick[] = [],
): (BodyBrick & { color: string; src: number })[] {
  const rest = restPositions(bones);
  const names = new Set(bones.map((b) => b.name));
  return assetBricksInBody(asset).map((b) => {
    const chosen = attach[String(b.index)];
    const bone = chosen && names.has(chosen) ? chosen : nearestBone(bones, b.center, shape);
    const j = rest.get(bone)!;
    return {
      bone,
      w: Math.min(8, b.w),
      d: Math.min(8, b.d),
      kind: b.kind,
      x: b.x - j[0],
      y: b.y - j[1] / P,
      z: b.z - j[2],
      color: b.color,
      src: b.index,
    };
  });
}
