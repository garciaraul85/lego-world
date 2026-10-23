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

/** P27 part 3: how far from the origin bricks may be (studs) and how tall (plates). */
export const BUILD_HALF = 2048;
export const BUILD_HEIGHT = 300;
/** Ints per brick in a packed chunk: type, x, y, z, rot, color, flags, id, group. */
export const BRICK_STRIDE = 9;
export const MAX_BRICK_ID = 2_000_000_000;

/**
 * One brick: [type, x, y, z, rot, color, flags, id, group]
 * type  index into palette.types ("brick2x4" = kind brick, rows 2, cols 4)
 * x, z  studs (integers, origin corner like legacy pieces); y plates (3 plates = 1 brick)
 * rot   0..3 quarter turns; color index into palette.colors; flags bitmask FLAG
 * id    stable brick id, unique within the map (legacy piece id); group index into palette.groups or -1
 */
export const BrickTuple = z.tuple([
  z.number().int().min(0),
  z.number().int().min(-BUILD_HALF).max(BUILD_HALF),
  z.number().int().min(0).max(BUILD_HEIGHT),
  z.number().int().min(-BUILD_HALF).max(BUILD_HALF),
  z.number().int().min(0).max(3),
  z.number().int().min(0),
  z.number().int().min(0).max(15),
  z.number().int().min(1).max(MAX_BRICK_ID),
  z.number().int().min(-1),
]);
export type BrickTuple = z.infer<typeof BrickTuple>;

const Palette = z.strictObject({
  types: z.array(BrickType),
  colors: z.array(Color),
  groups: z.array(z.string().max(100)),
});

/** v5 chunks: one JSON list per brick (still read; written packed since P27 part 3). */
const TupleChunk = z.strictObject({
  cx: z.number().int(),
  cz: z.number().int(),
  palette: Palette,
  bricks: z.array(BrickTuple).min(1),
});
/**
 * P27 part 3: packed chunks. `data` is base64 of little-endian int32s, BRICK_STRIDE per brick in the order of a
 * BrickTuple; about 5 times smaller than tuples and decoded without building a list per brick.
 */
const PackedChunk = z.strictObject({
  cx: z.number().int(),
  cz: z.number().int(),
  palette: Palette,
  count: z.number().int().min(1),
  data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/),
});

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Uint8Array(128);
for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i;

/** int32s as base64 (little-endian) */
export function packInts(ints: Int32Array): string {
  const bytes = new Uint8Array(ints.buffer, ints.byteOffset, ints.byteLength);
  let out = '';
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out +=
      B64[a >> 2]! +
      B64[((a & 3) << 4) | (b >> 4)]! +
      (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)]! : '=') +
      (i + 2 < bytes.length ? B64[c & 63]! : '=');
    if (out.length >= 8192) {
      parts.push(out);
      out = '';
    }
  }
  parts.push(out);
  return parts.join('');
}

/** base64 back to int32s (null if it is not a whole number of int32s) */
export function unpackInts(s: string): Int32Array | null {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const n = (s.length / 4) * 3 - pad;
  if (s.length % 4 || n % 4) return null;
  const bytes = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64_INDEX[s.charCodeAt(i)]!;
    const b = B64_INDEX[s.charCodeAt(i + 1)]!;
    const c = B64_INDEX[s.charCodeAt(i + 2)]!;
    const d = B64_INDEX[s.charCodeAt(i + 3)]!;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < n) bytes[o++] = v >> 16;
    if (o < n) bytes[o++] = (v >> 8) & 255;
    if (o < n) bytes[o++] = v & 255;
  }
  // int32 views need little-endian bytes; every supported platform is little-endian
  return new Int32Array(bytes.buffer);
}

const rowsCache = new WeakMap<object, Int32Array>();

/** A chunk's bricks as packed rows (BRICK_STRIDE ints each), packed or tuple chunk alike; cached per chunk. */
export function chunkRows(c: Chunk): Int32Array {
  const hit = rowsCache.get(c);
  if (hit) return hit;
  let rows: Int32Array;
  if ('data' in c) rows = unpackInts(c.data) ?? new Int32Array(0);
  else {
    rows = new Int32Array(c.bricks.length * BRICK_STRIDE);
    c.bricks.forEach((b, i) => {
      rows.set(b, i * BRICK_STRIDE);
    });
  }
  rowsCache.set(c, rows);
  return rows;
}

/** how many bricks a chunk holds */
export const chunkCount = (c: Chunk): number => ('data' in c ? c.count : c.bricks.length);

function checkRows(c: Chunk, ctx: z.RefinementCtx) {
  const rows = chunkRows(c);
  const n = chunkCount(c);
  if (rows.length !== n * BRICK_STRIDE) {
    ctx.addIssue({ code: 'custom', path: ['data'], message: `expected ${n} bricks of packed data` });
    return;
  }
  const at = (i: number) => ('data' in c ? ['data', i] : ['bricks', i]);
  for (let i = 0; i < n; i++) {
    const o = i * BRICK_STRIDE;
    const [t, x, y, zz, rot, col, flags, id, grp] = [
      rows[o]!,
      rows[o + 1]!,
      rows[o + 2]!,
      rows[o + 3]!,
      rows[o + 4]!,
      rows[o + 5]!,
      rows[o + 6]!,
      rows[o + 7]!,
      rows[o + 8]!,
    ];
    let msg = '';
    if (t < 0 || t >= c.palette.types.length) msg = 'type out of palette';
    else if (col < 0 || col >= c.palette.colors.length) msg = 'color out of palette';
    else if (grp < -1 || grp >= c.palette.groups.length) msg = 'group out of palette';
    else if (Math.abs(x) > BUILD_HALF || Math.abs(zz) > BUILD_HALF || y < 0 || y > BUILD_HEIGHT)
      msg = 'outside the build area';
    else if (rot < 0 || rot > 3 || flags < 0 || flags > 15 || id < 1 || id > MAX_BRICK_ID) msg = 'bad value';
    else if (Math.floor(x / CHUNK) !== c.cx || Math.floor(zz / CHUNK) !== c.cz)
      msg = `brick at x=${x} z=${zz} is not in chunk ${c.cx}_${c.cz}`;
    if (msg) {
      ctx.addIssue({ code: 'custom', path: at(i), message: msg });
      return;
    }
  }
}

export const Chunk = z.union([PackedChunk, TupleChunk]).superRefine(checkRows);
export type Chunk = z.infer<typeof Chunk>;
export type PackedChunk = z.infer<typeof PackedChunk>;

/** a v5 tuple chunk as a packed one (packed chunks are returned as they are) */
export function packChunk(c: Chunk): PackedChunk {
  if ('data' in c) return c;
  return { cx: c.cx, cz: c.cz, palette: c.palette, count: c.bricks.length, data: packInts(chunkRows(c)) };
}
