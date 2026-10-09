import { z } from 'zod';
import { Color } from './common';

/** Chunk edge in studs. cx = floor(x / CHUNK), cz = floor(z / CHUNK) of a brick's origin. */
export const CHUNK = 32;

export const BRICK_KINDS = ['brick', 'plate', 'tile'] as const;
/** [rows, cols] footprints v68 accepts. */
export const BRICK_SIZES: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [4, 8],
  [8, 8],
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 6],
  [1, 8],
  [2, 2],
  [2, 3],
  [2, 4],
  [2, 6],
  [2, 8],
];
export const BrickType = z.string().regex(/^(brick|plate|tile)\d+x\d+$/, 'expected <kind><rows>x<cols>');

export const FLAG = { smashable: 1, rebuildable: 2, static: 4, generated: 8 } as const;

/**
 * One brick: [type, x, y, z, rot, color, flags, id, group]
 * type  index into palette.types ("brick2x4" = kind brick, rows 2, cols 4)
 * x, z  studs (integers, origin corner like legacy pieces); y plates (3 plates = 1 brick)
 * rot   0..3 quarter turns; color index into palette.colors; flags bitmask FLAG
 * id    stable brick id, unique within the map (legacy piece id); group index into palette.groups or -1
 */
export const BrickTuple = z.tuple([
  z.number().int().min(0),
  z.number().int().min(-256).max(256),
  z.number().int().min(0).max(300),
  z.number().int().min(-256).max(256),
  z.number().int().min(0).max(3),
  z.number().int().min(0),
  z.number().int().min(0).max(15),
  z.number().int().min(1).max(1_000_000),
  z.number().int().min(-1),
]);
export type BrickTuple = z.infer<typeof BrickTuple>;

export const Chunk = z
  .strictObject({
    cx: z.number().int(),
    cz: z.number().int(),
    palette: z.strictObject({
      types: z.array(BrickType),
      colors: z.array(Color),
      groups: z.array(z.string().max(100)),
    }),
    bricks: z.array(BrickTuple).min(1),
  })
  .superRefine((c, ctx) => {
    c.bricks.forEach((b, i) => {
      if (b[0] >= c.palette.types.length)
        ctx.addIssue({ code: 'custom', path: ['bricks', i, 0], message: 'type out of palette' });
      if (b[5] >= c.palette.colors.length)
        ctx.addIssue({ code: 'custom', path: ['bricks', i, 5], message: 'color out of palette' });
      if (b[8] >= c.palette.groups.length)
        ctx.addIssue({ code: 'custom', path: ['bricks', i, 8], message: 'group out of palette' });
      if (Math.floor(b[1] / CHUNK) !== c.cx || Math.floor(b[3] / CHUNK) !== c.cz)
        ctx.addIssue({
          code: 'custom',
          path: ['bricks', i],
          message: `brick at x=${b[1]} z=${b[3]} is not in chunk ${c.cx}_${c.cz}`,
        });
    });
  });
export type Chunk = z.infer<typeof Chunk>;
