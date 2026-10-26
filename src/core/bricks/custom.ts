import { z } from 'zod';
import { id } from '../schema/common';

/**
 * Step 11 (P24 part 2): custom bricks — new brick shapes of the game's own (a slope, a curve, a round brick, a cone,
 * a dome, an arch, a wedge…), each a brick, a plate or a tile in height, 1 to 8 studs wide and deep, with studs on
 * its flat top or none. bricks/<id>.json holds one.
 *
 * A custom brick's type name keeps the kind first and the size last, with its id between: brick:cbk_…:2x4 (rows ×
 * columns, like brick2x4). So everything that reads a kind ("starts with brick") or a size ("ends with 2x4") from a
 * type name treats it as the brick of that kind and size: the brick rules, heights, footprints, turning. Only its
 * look differs (the renderer draws its shape). Play in v68 shows it as that plain brick.
 */
export const CUSTOM_SHAPES = ['slope', 'slope-inverted', 'curve', 'round', 'cone', 'dome', 'arch', 'wedge'] as const;
export type CustomShape = (typeof CUSTOM_SHAPES)[number];
/** studs on its flat top (where it has one), or none */
export const CUSTOM_STUDS = ['flat', 'none'] as const;

export const SHAPE_INFO: Record<CustomShape, { label: string; about: string; studs: (typeof CUSTOM_STUDS)[number] }> = {
  slope: { label: 'Slope', about: 'Falls from the back to the front, studs along the back', studs: 'flat' },
  'slope-inverted': { label: 'Inverted slope', about: 'Its underside slopes, the top is flat', studs: 'flat' },
  curve: { label: 'Curve', about: 'A quarter-round top, from the back down to the front', studs: 'flat' },
  round: { label: 'Round', about: 'A cylinder', studs: 'flat' },
  cone: { label: 'Cone', about: 'Narrows to the top', studs: 'flat' },
  dome: { label: 'Dome', about: 'Half a ball', studs: 'none' },
  arch: { label: 'Arch', about: 'A round hole through it from front to back (3 studs wide or more)', studs: 'flat' },
  wedge: { label: 'Wedge', about: 'Cut on a slant from the back left to the front right', studs: 'flat' },
};

export const CustomBrick = z.strictObject({
  id: id('custombrick'),
  name: z.string().min(1).max(40),
  /** its height: a brick (3 plates), a plate (1) or a tile (1, no studs under anything) */
  base: z.enum(['brick', 'plate', 'tile']),
  /** studs across (x) and deep (z), before it is turned */
  w: z.number().int().min(1).max(8),
  d: z.number().int().min(1).max(8),
  shape: z.enum(CUSTOM_SHAPES),
  studs: z.enum(CUSTOM_STUDS),
});
export type CustomBrick = z.infer<typeof CustomBrick>;

export const MAX_CUSTOM_BRICKS = 64;

const CUSTOM_TYPE = /^(brick|plate|tile):(cbk_[0-9a-z]{10}):(\d+)x(\d+)$/;

/** the type name bricks of this custom brick have */
export const customType = (b: Pick<CustomBrick, 'base' | 'id' | 'w' | 'd'>) => `${b.base}:${b.id}:${b.d}x${b.w}`;
/** the custom brick a type name is of (null: a built-in brick) */
export const customIdOf = (type: string): string | null => CUSTOM_TYPE.exec(type)?.[2] ?? null;
/** the plain brick of the same kind and size (for Play in v68, and anything that only knows built-in bricks) */
export const plainType = (type: string) => {
  const m = CUSTOM_TYPE.exec(type);
  return m ? `${m[1]}${m[3]}x${m[4]}` : type;
};
/** kind, rows and columns of any brick type name, built-in or custom */
export function parseBrickType(type: string): { kind: 'brick' | 'plate' | 'tile'; rows: number; cols: number } | null {
  const m = /^(brick|plate|tile)(?::cbk_[0-9a-z]{10}:)?(\d+)x(\d+)$/.exec(type);
  return m ? { kind: m[1] as 'brick', rows: Number(m[2]), cols: Number(m[3]) } : null;
}

/**
 * The custom bricks the editor and the game know, by id. Kept in step with every open project's bricks/ files
 * (ProjectStore registers them as they load and change), so the renderer and the brick rules can read a shape from a
 * type name alone.
 */
const registry = new Map<string, CustomBrick>();
const listeners = new Set<() => void>();
export function registerCustomBrick(b: CustomBrick) {
  const old = registry.get(b.id);
  if (old && JSON.stringify(old) === JSON.stringify(b)) return;
  registry.set(b.id, b);
  for (const f of listeners) f();
}
export function unregisterCustomBrick(id: string) {
  if (registry.delete(id)) for (const f of listeners) f();
}
export const customBrick = (id: string): CustomBrick | undefined => registry.get(id);
export const customBricks = (): CustomBrick[] => [...registry.values()];
/** called when a custom brick changes (the renderer drops the shapes it made) */
export function onCustomBricks(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
