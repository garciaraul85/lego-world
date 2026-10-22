import type { LegacyPiece } from '../../core/legacy/types';

const height = (p: LegacyPiece) => (p.kind === 'brick' ? 3 : 1);
const dims = (p: LegacyPiece): [number, number] => (p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows]);
// P27 part 3: x, z in ±(2048 + 64) studs
const SPAN = 2112;
const key = (x: number, z: number, y: number) => ((x + SPAN) * 2 * SPAN + (z + SPAN)) * 400 + y;

/**
 * v68 inspect() on legacy pieces, including the set of pieces still connected to the ground
 * (smashing uses it to drop everything a broken object was holding up).
 */
export function inspectPieces(
  list: readonly LegacyPiece[],
  /** P27 part 3: a check of one area of a big map: pieces at its edge count as connected */
  anchored?: (p: LegacyPiece) => boolean,
): { ok: boolean; reason?: string; connected?: Set<number> } {
  const occupied = new Map<number, number>();
  const tops = new Map<number, number>();
  const bottoms = new Map<number, number>();
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    const [w, d] = dims(p);
    const h = height(p);
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        for (let y = 0; y < h; y++) {
          const k = key(p.x + x, p.z + z, p.y + y);
          if (occupied.has(k)) return { ok: false, reason: 'Pieces overlap. Try a different position or height.' };
          occupied.set(k, i);
        }
        bottoms.set(key(p.x + x, p.z + z, p.y), i);
        if (p.kind !== 'tile') tops.set(key(p.x + x, p.z + z, p.y + h), i);
      }
  }
  const adj: number[][] = list.map(() => []);
  for (const [k, a] of tops) {
    const b = bottoms.get(k);
    if (b !== undefined && a !== b) {
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }
  const seen = new Set<number>();
  const queue: number[] = [];
  for (let i = 0; i < list.length; i++)
    if (list[i]!.y === 0 || anchored?.(list[i]!)) {
      seen.add(i);
      queue.push(i);
    }
  for (let j = 0; j < queue.length; j++)
    for (const n of adj[queue[j]!]!)
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  if (seen.size !== list.length)
    return { ok: false, reason: 'Needs a stud connection to the build. Tiles have no top studs.', connected: seen };
  return { ok: true };
}

export const chunkKeyOf = (p: LegacyPiece) => `${Math.floor(p.x / 32)}_${Math.floor(p.z / 32)}`;

/** P27 part 3: chunks each way from the hero's chunk in a big map's play window (7 × 7 chunks of 32 studs) */
export const WINDOW_RADIUS = 3;

/** P27 part 3: pieces grouped by chunk key */
export function indexByChunk(pieces: readonly LegacyPiece[]): Map<string, LegacyPiece[]> {
  const out = new Map<string, LegacyPiece[]>();
  for (const p of pieces) {
    const k = chunkKeyOf(p);
    const list = out.get(k);
    if (list) list.push(p);
    else out.set(k, [p]);
  }
  return out;
}

/** P27 part 3: the pieces of the chunks within `r` chunks of a chunk */
export function piecesAround(
  byChunk: ReadonlyMap<string, LegacyPiece[]>,
  key: string,
  r = WINDOW_RADIUS,
): LegacyPiece[] {
  const [cx, cz] = key.split('_').map(Number) as [number, number];
  const out: LegacyPiece[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dz = -r; dz <= r; dz++) {
      const list = byChunk.get(`${cx + dx}_${cz + dz}`);
      if (list) for (const p of list) out.push(p);
    }
  return out;
}

/** studs around the changed pieces that are checked; pieces reaching no closer count as connected */
export const LOCAL_MARGIN = 8;

/**
 * P27 part 3d: the part of a big map a change can affect. `around` are the pieces that came or went; the pieces of
 * `next` (the map after the change) within LOCAL_MARGIN studs of them are checked, and those in a further ring as
 * wide as the widest piece (8 studs) hold them up (count as connected). A small break checks a few hundred pieces,
 * not whole chunks.
 */
export function localArea(
  next: readonly LegacyPiece[],
  around: readonly LegacyPiece[],
): { list: LegacyPiece[]; anchored: (p: LegacyPiece) => boolean } {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const p of around) {
    const [w, d] = dims(p);
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x + w);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z + d);
  }
  const ix0 = x0 - LOCAL_MARGIN;
  const ix1 = x1 + LOCAL_MARGIN;
  const iz0 = z0 - LOCAL_MARGIN;
  const iz1 = z1 + LOCAL_MARGIN;
  const meets = (p: LegacyPiece, a0: number, a1: number, b0: number, b1: number) => {
    const turned = p.turn % 2 === 1;
    return p.x < a1 && p.x + (turned ? p.rows : p.cols) > a0 && p.z < b1 && p.z + (turned ? p.cols : p.rows) > b0;
  };
  const list: LegacyPiece[] = [];
  // pieces reaching the inner area, and those up to 8 studs further that may hold them up (a quick test first:
  // no piece is wider than 8 studs)
  const ox0 = ix0 - 16;
  const ox1 = ix1 + 8;
  const oz0 = iz0 - 16;
  const oz1 = iz1 + 8;
  for (let i = 0; i < next.length; i++) {
    const p = next[i]!;
    if (p.x < ox0 || p.x >= ox1 || p.z < oz0 || p.z >= oz1) continue;
    if (meets(p, ix0 - 8, ix1 + 8, iz0 - 8, iz1 + 8)) list.push(p);
  }
  return { list, anchored: (p) => !meets(p, ix0, ix1, iz0, iz1) };
}
