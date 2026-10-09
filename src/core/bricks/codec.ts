import { type BrickTuple, CHUNK, type Chunk } from '../schema/chunk';

/** One brick, decoded from a chunk tuple. Positions: x/z studs, y plates; color is a hex string. */
export type Brick = {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  color: string;
  flags: number;
  group?: string;
};

export const chunkKey = (x: number, z: number) => `${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`;
export const chunkCoords = (key: string) => key.split('_').map(Number) as [number, number];

export function decodeChunk(c: Chunk): Brick[] {
  return c.bricks.map((b) => {
    const brick: Brick = {
      id: b[7],
      type: c.palette.types[b[0]]!,
      x: b[1],
      y: b[2],
      z: b[3],
      rot: b[4],
      color: c.palette.colors[b[5]]!,
      flags: b[6],
    };
    if (b[8] >= 0) brick.group = c.palette.groups[b[8]]!;
    return brick;
  });
}

/**
 * Encodes bricks into chunks keyed "cx_cz". Bricks are written in id order; palettes list values
 * in order of first use, so the same bricks always produce the same files.
 */
export function encodeChunks(bricks: Iterable<Brick>): Map<string, Chunk> {
  const byKey = new Map<string, Brick[]>();
  for (const b of [...bricks].sort((a, b) => a.id - b.id)) {
    const key = chunkKey(b.x, b.z);
    const list = byKey.get(key) ?? [];
    if (!byKey.has(key)) byKey.set(key, list);
    list.push(b);
  }
  const out = new Map<string, Chunk>();
  for (const [key, list] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    const [cx, cz] = chunkCoords(key);
    const types: string[] = [];
    const colors: string[] = [];
    const groups: string[] = [];
    const index = (arr: string[], v: string) => {
      const i = arr.indexOf(v);
      return i >= 0 ? i : arr.push(v) - 1;
    };
    const tuples = list.map(
      (b): BrickTuple => [
        index(types, b.type),
        b.x,
        b.y,
        b.z,
        b.rot,
        index(colors, b.color),
        b.flags,
        b.id,
        b.group === undefined ? -1 : index(groups, b.group),
      ],
    );
    out.set(key, { cx, cz, palette: { types, colors, groups }, bricks: tuples });
  }
  return out;
}
