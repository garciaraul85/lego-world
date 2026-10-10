import type { LegacyPiece } from '../../core/legacy/types';

const height = (p: LegacyPiece) => (p.kind === 'brick' ? 3 : 1);
const dims = (p: LegacyPiece): [number, number] => (p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows]);
const key = (x: number, z: number, y: number) => ((x + 300) * 700 + (z + 300)) * 400 + y;

/**
 * v68 inspect() on legacy pieces, including the set of pieces still connected to the ground
 * (smashing uses it to drop everything a broken object was holding up).
 */
export function inspectPieces(list: readonly LegacyPiece[]): { ok: boolean; reason?: string; connected?: Set<number> } {
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
    if (list[i]!.y === 0) {
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
