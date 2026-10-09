import type { Brick } from './codec';
import { brickHeight } from './map-bricks';

/** [w, d] footprint in studs after rotation (legacy dims()). */
export function footprint(b: Pick<Brick, 'type' | 'rot'>): [number, number] {
  const m = /(\d+)x(\d+)$/.exec(b.type)!;
  const rows = Number(m[1]);
  const cols = Number(m[2]);
  return b.rot % 2 ? [rows, cols] : [cols, rows];
}

export type LayoutCheck = { ok: true } | { ok: false; reason: string };

// Numeric cell key: x, z in [-300, 400), y in [0, 400).
const key = (x: number, z: number, y: number) => ((x + 300) * 700 + (z + 300)) * 400 + y;

/**
 * v68's inspect(): no two bricks share a cell, and every brick connects to the ground (y = 0)
 * through stud joints (a brick's top studs into the bottom of the brick above; tiles have no studs).
 * Every brick edit must keep this true, or LEGO World v68 would refuse to load the save.
 */
export function inspectBricks(list: readonly Brick[], max = 12_000): LayoutCheck {
  if (list.length > max) return { ok: false, reason: `This world has reached ${max.toLocaleString('en-US')} pieces.` };
  const occupied = new Map<number, number>();
  const tops = new Map<number, number>();
  const bottoms = new Map<number, number>();
  for (let i = 0; i < list.length; i++) {
    const b = list[i]!;
    const [w, d] = footprint(b);
    const h = brickHeight(b.type);
    const studs = !b.type.startsWith('tile');
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        for (let y = 0; y < h; y++) {
          const k = key(b.x + x, b.z + z, b.y + y);
          if (occupied.has(k)) return { ok: false, reason: 'Pieces overlap. Try a different position or height.' };
          occupied.set(k, i);
        }
        bottoms.set(key(b.x + x, b.z + z, b.y), i);
        if (studs) tops.set(key(b.x + x, b.z + z, b.y + h), i);
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
  const seen = new Uint8Array(list.length);
  const queue: number[] = [];
  for (let i = 0; i < list.length; i++)
    if (list[i]!.y === 0) {
      seen[i] = 1;
      queue.push(i);
    }
  for (let j = 0; j < queue.length; j++)
    for (const n of adj[queue[j]!]!)
      if (!seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
  if (queue.length !== list.length)
    return { ok: false, reason: 'Needs a stud connection to the build. Tiles have no top studs.' };
  return { ok: true };
}
