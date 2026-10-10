/**
 * Nav grid for cinematic actors (P6.1 moveTo): one cell per stud, the height of the top surface.
 * Neighbouring cells connect when the step between them is at most STEP; A* finds a path of cell
 * centres. Built once per cinematic from the map's bricks, so playing and seeking agree.
 */
export type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
export type Vec3 = [number, number, number];

export const STEP = 1.25;
const MAX_EXPAND = 30_000;

export class NavGrid {
  private top = new Map<number, number>();
  constructor(
    boxes: Iterable<Box>,
    private readonly ground = 0,
  ) {
    for (const b of boxes) {
      for (let x = Math.floor(b.x0 + 0.01); x < Math.ceil(b.x1 - 0.01); x++)
        for (let z = Math.floor(b.z0 + 0.01); z < Math.ceil(b.z1 - 0.01); z++) {
          const k = key(x, z);
          if ((this.top.get(k) ?? -Infinity) < b.y1) this.top.set(k, b.y1);
        }
    }
  }

  /** ground height at a point (top surface of the stud cell) */
  heightAt(x: number, z: number): number {
    return this.top.get(key(Math.floor(x), Math.floor(z))) ?? this.ground;
  }

  /** a walkable path from a to b (cell centres, with heights); straight line when none is found */
  path(a: Vec3, b: Vec3): Vec3[] {
    const sx = Math.floor(a[0]);
    const sz = Math.floor(a[2]);
    const gx = Math.floor(b[0]);
    const gz = Math.floor(b[2]);
    if (sx === gx && sz === gz) return [a, b];
    const start = key(sx, sz);
    const goal = key(gx, gz);
    const g = new Map<number, number>([[start, 0]]);
    const from = new Map<number, number>();
    const open: [number, number][] = [[dist(sx, sz, gx, gz), start]];
    const closed = new Set<number>();
    let n = 0;
    while (open.length && n++ < MAX_EXPAND) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i;
      const [, cur] = open.splice(bi, 1)[0]!;
      if (cur === goal) return this.smooth(this.rebuild(from, cur, a, b));
      if (closed.has(cur)) continue;
      closed.add(cur);
      const [cx, cz] = unkey(cur);
      const h = this.heightAt(cx + 0.5, cz + 0.5);
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = cx + dx;
        const nz = cz + dz;
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        const nh = this.heightAt(nx + 0.5, nz + 0.5);
        if (Math.abs(nh - h) > STEP) continue;
        // no corner cutting past a wall
        if (dx && dz) {
          const h1 = this.heightAt(cx + dx + 0.5, cz + 0.5);
          const h2 = this.heightAt(cx + 0.5, cz + dz + 0.5);
          if (Math.abs(h1 - h) > STEP || Math.abs(h2 - h) > STEP) continue;
        }
        const ng = g.get(cur)! + Math.hypot(dx, dz) + Math.abs(nh - h) * 0.5;
        if (ng >= (g.get(nk) ?? Infinity)) continue;
        g.set(nk, ng);
        from.set(nk, cur);
        open.push([ng + dist(nx, nz, gx, gz), nk]);
      }
    }
    return [a, [b[0], this.heightAt(b[0], b[2]), b[2]]];
  }

  private rebuild(from: Map<number, number>, end: number, a: Vec3, b: Vec3): Vec3[] {
    const cells: number[] = [end];
    let c = end;
    while (from.has(c)) {
      c = from.get(c)!;
      cells.push(c);
    }
    cells.reverse();
    const pts: Vec3[] = cells.slice(1, -1).map((k) => {
      const [x, z] = unkey(k);
      return [x + 0.5, this.heightAt(x + 0.5, z + 0.5), z + 0.5];
    });
    return [a, ...pts, [b[0], this.heightAt(b[0], b[2]), b[2]]];
  }

  /** drop points on straight runs (same direction, same height) */
  private smooth(p: Vec3[]): Vec3[] {
    if (p.length <= 2) return p;
    const out: Vec3[] = [p[0]!];
    for (let i = 1; i < p.length - 1; i++) {
      const a = out.at(-1)!;
      const b = p[i]!;
      const c = p[i + 1]!;
      const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[2] - a[2])];
      const d2 = [Math.sign(c[0] - b[0]), Math.sign(c[2] - b[2])];
      if (d1[0] === d2[0] && d1[1] === d2[1] && b[1] === a[1] && c[1] === b[1]) continue;
      out.push(b);
    }
    out.push(p.at(-1)!);
    return out;
  }
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const OFF = 1 << 15;
const key = (x: number, z: number) => (x + OFF) * 65536 + (z + OFF);
const unkey = (k: number): [number, number] => [Math.floor(k / 65536) - OFF, (k % 65536) - OFF];
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
