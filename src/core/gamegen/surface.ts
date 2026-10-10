import type { Brick } from '../bricks/codec';
import { footprint } from '../bricks/inspect';
import { brickHeight } from '../bricks/map-bricks';

/**
 * The walkable top surface of a map (P7.1): per stud cell, the plate height of its top, and a
 * breadth-first walk from the arrival spot (steps of at most 3 plates = 1.2 studs, v68's step
 * height is higher, so whatever this reaches the hero can reach).
 */
export class Surface {
  readonly top = new Map<string, number>();
  readonly tile = new Set<string>();
  /** occupied plate cells "x,z,y" (for head room checks) */
  private filled = new Set<string>();

  constructor(bricks: readonly Brick[]) {
    for (const b of bricks) {
      const [w, d] = footprint(b);
      const h = brickHeight(b.type);
      const t = b.y + h;
      for (let x = 0; x < w; x++)
        for (let z = 0; z < d; z++) {
          for (let y = b.y; y < t; y++) this.filled.add(`${b.x + x},${b.z + z},${y}`);
          const k = `${b.x + x},${b.z + z}`;
          if ((this.top.get(k) ?? -1) < t) {
            this.top.set(k, t);
            if (b.type.startsWith('tile')) this.tile.add(k);
            else this.tile.delete(k);
          }
        }
    }
  }

  /** the hero fits standing on this cell: its top is studded or a tile, with 9 free plates above (v68 body) */
  open(x: number, z: number): boolean {
    const t = this.topAt(x, z);
    if (t === undefined) return false;
    for (let y = t; y < t + 9; y++) if (this.filled.has(`${x},${z},${y}`)) return false;
    return true;
  }

  /** the biggest walkable region's cells (so a game never starts on a lonely peak) */
  largestRegion(): Map<string, number> | null {
    const seen = new Set<string>();
    let best: Map<string, number> | null = null;
    for (const k of this.top.keys()) {
      if (seen.has(k)) continue;
      const [x, z] = k.split(',').map(Number) as [number, number];
      if (!this.open(x, z)) continue;
      const comp = this.reach(x, z);
      for (const c of comp.keys()) seen.add(c);
      if (!best || comp.size > best.size) best = comp;
    }
    return best;
  }

  topAt(x: number, z: number): number | undefined {
    return this.top.get(`${x},${z}`);
  }

  /** the highest top within a rectangle, and whether it is flat and studded (an asset can stand there) */
  rect(x: number, z: number, w: number, d: number): { top: number; flat: boolean } | null {
    let top = -1;
    let lo = Infinity;
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) {
        const k = `${x + i},${z + j}`;
        const t = this.top.get(k);
        if (t === undefined || this.tile.has(k)) return null;
        top = Math.max(top, t);
        lo = Math.min(lo, t);
      }
    return { top, flat: top === lo };
  }

  /** cells reachable on foot from (x, z), with their distance in steps */
  reach(x: number, z: number, maxSteps = 4000): Map<string, number> {
    const start = `${x},${z}`;
    const seen = new Map<string, number>();
    if (!this.top.has(start)) return seen;
    seen.set(start, 0);
    const queue = [start];
    while (queue.length && seen.size < maxSteps * 10) {
      const k = queue.shift()!;
      const [cx, cz] = k.split(',').map(Number) as [number, number];
      const h = this.top.get(k)!;
      const d = seen.get(k)!;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nk = `${cx + dx},${cz + dz}`;
        const nh = this.top.get(nk);
        if (nh === undefined || seen.has(nk) || Math.abs(nh - h) > 3 || !this.open(cx + dx, cz + dz)) continue;
        seen.set(nk, d + 1);
        queue.push(nk);
      }
    }
    return seen;
  }

  /** an open cell near (x, z): the closest one with a top surface and the same column clear above */
  nearestOpen(
    x: number,
    z: number,
    ok: (x: number, z: number, top: number) => boolean,
  ): [number, number, number] | null {
    for (let r = 0; r < 40; r++)
      for (let dx = -r; dx <= r; dx++)
        for (const dz of r === 0 ? [0] : Math.abs(dx) === r ? range(-r, r) : [-r, r]) {
          const t = this.topAt(x + dx, z + dz);
          if (t !== undefined && ok(x + dx, z + dz, t)) return [x + dx, t, z + dz];
        }
    return null;
  }
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
