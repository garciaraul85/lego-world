// Port of v68 builder.js mesh()/box()/lathe(): the same rounded shells, studs and tubes.
// Units: 1 = one stud horizontally; a plate is 0.4 tall, a brick 1.2.
import { cross, normalize } from './math';

export type Geometry = { positions: Float32Array; normals: Float32Array };

export const PLATE = 0.4;

class Builder {
  p: number[] = [];
  n: number[] = [];
  tri(a: number[], b: number[], c: number[], na?: number[], nb?: number[], nc?: number[]) {
    this.p.push(...a, ...b, ...c);
    if (!na) {
      na = normalize(
        cross(
          b.map((v, i) => v - a[i]!),
          c.map((v, i) => v - a[i]!),
        ),
      );
      nb = na;
      nc = na;
    }
    this.n.push(...na, ...nb!, ...nc!);
  }
  /** Rounded box (3x3 subdivided faces projected onto a bevel of radius r). */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, r = 0.025) {
    const half = [w / 2, h / 2, d / 2];
    const center = [cx, cy, cz];
    r = Math.min(r, w / 3, h / 3, d / 3);
    const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const U = [-half[u]!, -half[u]! + r, half[u]! - r, half[u]!];
        const V = [-half[v]!, -half[v]! + r, half[v]! - r, half[v]!];
        const point = (i: number, j: number) => {
          const p = [0, 0, 0];
          p[axis] = sign * half[axis]!;
          p[u] = U[i]!;
          p[v] = V[j]!;
          const inside = p.map((x, k) => clamp(x, -half[k]! + r, half[k]! - r));
          const n = normalize(p.map((x, k) => x - inside[k]!));
          return { p: inside.map((x, k) => x + r * n[k]! + center[k]!), n };
        };
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++) {
            const a = point(i, j);
            const b = point(i + 1, j);
            const c = point(i + 1, j + 1);
            const d0 = point(i, j + 1);
            this.tri(a.p, b.p, c.p, a.n, b.n, c.n);
            this.tri(a.p, c.p, d0.p, a.n, c.n, d0.n);
          }
      }
  }
  /** Surface of revolution around a vertical axis; profile is [[radius, y], ...]. */
  lathe(cx: number, cz: number, profile: number[][], segments: number) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k] as [number, number];
      const [r1, y1] = profile[k + 1] as [number, number];
      const len = Math.hypot(y1 - y0, r1 - r0) || 1;
      const radial = (y1 - y0) / len;
      const ny = (r0 - r1) / len;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const b = ((i + 1) / segments) * Math.PI * 2;
        const pt = (r: number, y: number, t: number) => [cx + r * Math.cos(t), y, cz + r * Math.sin(t)];
        const nm = (t: number) => [radial * Math.cos(t), ny, radial * Math.sin(t)];
        this.tri(pt(r0, y0, a), pt(r0, y0, b), pt(r1, y1, b), nm(a), nm(b), nm(b));
        this.tri(pt(r0, y0, a), pt(r1, y1, b), pt(r1, y1, a), nm(a), nm(b), nm(a));
      }
    }
  }
  done(): Geometry {
    return { positions: new Float32Array(this.p), normals: new Float32Array(this.n) };
  }
}

/**
 * Geometry of one brick shape centered at the origin: w x d studs (after rotation), kind height.
 * `segments` 12 matches v68's world mode; `paved` gives the flat road/pavement slab.
 */
export function brickGeometry(
  w: number,
  d: number,
  kind: 'brick' | 'plate' | 'tile',
  segments = 12,
  paved = false,
): Geometry {
  const g = new Builder();
  const h = (kind === 'brick' ? 3 : 1) * PLATE;
  if (paved) {
    const a = [-w / 2, -h / 2, -d / 2];
    const b = [w / 2, h / 2, d / 2];
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [-1, 1]) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const n = [0, 0, 0];
        n[axis] = sign;
        const pts = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([i, j]) => {
          const p = [0, 0, 0];
          p[axis] = sign < 0 ? a[axis]! : b[axis]!;
          p[u] = i ? b[u]! : a[u]!;
          p[v] = j ? b[v]! : a[v]!;
          return p;
        });
        g.tri(pts[0]!, pts[1]!, pts[2]!, n, n, n);
        g.tri(pts[0]!, pts[2]!, pts[3]!, n, n, n);
      }
    return g.done();
  }
  const t = kind === 'brick' ? 0.15 : 0.08;
  const W = w - 0.025;
  const D = d - 0.025;
  g.box(0, h / 2 - t / 2, 0, W, t, D);
  g.box(0, -t / 2, -D / 2 + t / 2, W, h - t, t);
  g.box(0, -t / 2, D / 2 - t / 2, W, h - t, t);
  g.box(-W / 2 + t / 2, -t / 2, 0, t, h - t, D - 2 * t);
  g.box(W / 2 - t / 2, -t / 2, 0, t, h - t, D - 2 * t);
  if (kind !== 'tile')
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++)
        g.lathe(
          x - (w - 1) / 2,
          z - (d - 1) / 2,
          [
            [0.28, h / 2 - 0.005],
            [0.3, h / 2 + 0.015],
            [0.3, h / 2 + 0.202],
            [0.294, h / 2 + 0.218],
            [0.28, h / 2 + 0.225],
            [0, h / 2 + 0.225],
          ],
          segments,
        );
  if (w > 1 && d > 1) {
    for (let x = 0; x < w - 1; x++)
      for (let z = 0; z < d - 1; z++)
        g.lathe(
          x - (w - 2) / 2,
          z - (d - 2) / 2,
          [
            [0.325, -h / 2 + 0.03],
            [0.335, -h / 2 + 0.045],
            [0.335, h / 2 - t],
            [0.245, h / 2 - t],
            [0.245, -h / 2 + 0.045],
            [0.255, -h / 2 + 0.03],
            [0.325, -h / 2 + 0.03],
          ],
          segments,
        );
  } else {
    const alongX = w > 1;
    const len = Math.max(w, d);
    for (let i = 0; i < len - 1; i++)
      g.lathe(
        alongX ? i - (len - 2) / 2 : 0,
        alongX ? 0 : i - (len - 2) / 2,
        [
          [0.12, -h / 2 + 0.05],
          [0.13, -h / 2 + 0.065],
          [0.13, h / 2 - t],
          [0, h / 2 - t],
          [0, -h / 2 + 0.05],
          [0.12, -h / 2 + 0.05],
        ],
        segments,
      );
  }
  return g.done();
}

/** A plain box (for the floor, markers and far LOD). */
export function plainBox(w: number, h: number, d: number, r = 0.04): Geometry {
  const g = new Builder();
  g.box(0, 0, 0, w, h, d, r);
  return g.done();
}
