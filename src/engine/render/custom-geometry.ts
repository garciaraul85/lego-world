import type { CustomBrick } from '../../core/bricks/custom';
import { type Geometry, PLATE, turnedY } from './brick-geometry';
import { cross, normalize } from './math';

/**
 * Step 11 (P24 part 2): the shape of a custom brick, centred at the origin like brickGeometry: w × d studs (before
 * it is turned; `rot` quarter turns turn it like the brick), its kind's height. Back is −z, front +z.
 *
 * Slopes, curves, arches and wedges are made of slices across one axis, each with its own bottom and top height
 * and its own reach along the other axis; round bricks, cones and domes are turned profiles. Studs stand only on
 * flat tops.
 */
type V3 = [number, number, number];
const EPS = 0.0125;

class Mesh {
  p: number[] = [];
  n: number[] = [];
  /** a flat polygon (a fan), turned to face `out` */
  face(pts: V3[], out: V3) {
    if (pts.length < 3) return;
    const nrm = normalize(cross(sub(pts[1]!, pts[0]!), sub(pts[2]!, pts[0]!))) as V3;
    const flip = nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] < 0;
    const n = (Number.isFinite(nrm[0]) ? (flip ? (nrm.map((v) => -v) as V3) : nrm) : out) as V3;
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = flip ? [pts[0]!, pts[i + 1]!, pts[i]!] : [pts[0]!, pts[i]!, pts[i + 1]!];
      this.p.push(...a, ...b, ...c);
      this.n.push(...n, ...n, ...n);
    }
  }
  /** a surface of revolution about the y axis at (cx, cz); profile [radius, y] from bottom to top */
  lathe(cx: number, cz: number, profile: [number, number][], segments: number) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k]!;
      const [r1, y1] = profile[k + 1]!;
      const len = Math.hypot(y1 - y0, r1 - r0) || 1;
      const radial = (y1 - y0) / len;
      const ny = (r0 - r1) / len;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const b = ((i + 1) / segments) * Math.PI * 2;
        const pt = (r: number, y: number, t: number): V3 => [cx + r * Math.cos(t), y, cz + r * Math.sin(t)];
        const nm = (t: number) => [radial * Math.cos(t), ny, radial * Math.sin(t)];
        this.p.push(...pt(r0, y0, a), ...pt(r1, y1, b), ...pt(r0, y0, b));
        this.n.push(...nm(a), ...nm(b), ...nm(b));
        this.p.push(...pt(r0, y0, a), ...pt(r1, y1, a), ...pt(r1, y1, b));
        this.n.push(...nm(a), ...nm(a), ...nm(b));
      }
    }
  }
  stud(x: number, z: number, y: number, segments: number) {
    this.lathe(
      x,
      z,
      [
        [0.3, y - 0.005],
        [0.3, y + 0.202],
        [0.294, y + 0.218],
        [0.28, y + 0.225],
        [0, y + 0.225],
      ],
      segments,
    );
  }
  done(): Geometry {
    return { positions: new Float32Array(this.p), normals: new Float32Array(this.n) };
  }
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * A solid of slices: s goes along `axis` (x or z) from s0 to s1; each slice has a bottom and top height and a reach
 * [e0, e1] along the other horizontal axis.
 */
function slices(
  m: Mesh,
  axis: 'x' | 'z',
  s0: number,
  s1: number,
  steps: number,
  at: (s: number) => { y0: number; y1: number; e0: number; e1: number },
) {
  const P = (s: number, e: number, y: number): V3 => (axis === 'x' ? [s, y, e] : [e, y, s]);
  const S: V3 = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  const E: V3 = axis === 'x' ? [0, 0, 1] : [1, 0, 0];
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
  const list = Array.from({ length: steps + 1 }, (_, i) => {
    const s = s0 + ((s1 - s0) * i) / steps;
    return { s, ...at(s) };
  });
  for (let i = 0; i < steps; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    // top, bottom, and the two sides along the reach
    m.face([P(a.s, a.e0, a.y1), P(b.s, b.e0, b.y1), P(b.s, b.e1, b.y1), P(a.s, a.e1, a.y1)], [0, 1, 0]);
    m.face([P(a.s, a.e0, a.y0), P(b.s, b.e0, b.y0), P(b.s, b.e1, b.y0), P(a.s, a.e1, a.y0)], [0, -1, 0]);
    m.face([P(a.s, a.e0, a.y0), P(b.s, b.e0, b.y0), P(b.s, b.e0, b.y1), P(a.s, a.e0, a.y1)], neg(E));
    m.face([P(a.s, a.e1, a.y0), P(b.s, b.e1, b.y0), P(b.s, b.e1, b.y1), P(a.s, a.e1, a.y1)], E);
  }
  for (const [c, out] of [
    [list[0]!, neg(S)],
    [list[steps]!, S],
  ] as const)
    if (c.y1 - c.y0 > 1e-4 && c.e1 - c.e0 > 1e-4)
      m.face([P(c.s, c.e0, c.y0), P(c.s, c.e1, c.y0), P(c.s, c.e1, c.y1), P(c.s, c.e0, c.y1)], out);
}

/** the custom brick's geometry, turned `rot` quarter turns like a brick of it */
export function customGeometry(def: CustomBrick, rot = 0, segments = 12): Geometry {
  const m = new Mesh();
  const h = (def.base === 'brick' ? 3 : 1) * PLATE;
  const W = def.w - 2 * EPS;
  const D = def.d - 2 * EPS;
  const x0 = -W / 2;
  const x1 = W / 2;
  const z0 = -D / 2;
  const z1 = D / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const lip = Math.min(h * 0.25, 0.15);
  // the flat back strip a slope or a curve keeps (a stud's depth when it is 2 or more deep)
  const flat = def.d >= 2 ? 1 : 0;
  const studs: [number, number, number][] = [];
  const cells = (keep: (x: number, z: number) => boolean, y = y1) => {
    for (let i = 0; i < def.w; i++)
      for (let j = 0; j < def.d; j++) {
        const x = i - (def.w - 1) / 2;
        const z = j - (def.d - 1) / 2;
        if (keep(x, z)) studs.push([x, z, y]);
      }
  };
  switch (def.shape) {
    case 'slope':
      slices(m, 'z', z0, z1, Math.max(2, Math.round(def.d * 2)), (z) => ({
        y0,
        y1: z <= z0 + flat ? y1 : y1 - (y1 - (y0 + lip)) * ((z - z0 - flat) / Math.max(1e-6, D - flat)),
        e0: x0,
        e1: x1,
      }));
      cells((_x, z) => z < z0 + flat);
      break;
    case 'slope-inverted':
      slices(m, 'z', z0, z1, Math.max(2, Math.round(def.d * 2)), (z) => ({
        y0: z <= z0 + flat ? y0 : y0 + (y1 - lip - y0) * ((z - z0 - flat) / Math.max(1e-6, D - flat)),
        y1,
        e0: x0,
        e1: x1,
      }));
      cells(() => true);
      break;
    case 'curve': {
      const n = Math.max(8, def.d * 6);
      slices(m, 'z', z0, z1, n, (z) => {
        if (z <= z0 + flat) return { y0, y1, e0: x0, e1: x1 };
        const t = (z - z0 - flat) / Math.max(1e-6, D - flat);
        return { y0, y1: y0 + lip + (y1 - y0 - lip) * Math.cos((t * Math.PI) / 2), e0: x0, e1: x1 };
      });
      cells((_x, z) => z < z0 + flat);
      break;
    }
    case 'arch': {
      // pillars a stud wide, a round hole through from front to back between them
      const r = (def.w - 2) / 2;
      const spring = Math.max(y0, y1 - Math.max(0.12, h * 0.25) - r);
      slices(m, 'x', x0, x1, Math.max(12, def.w * 8), (x) => {
        const inner = Math.abs(x) < r;
        const bottom = inner ? Math.min(y1 - 0.08, spring + Math.sqrt(Math.max(0, r * r - x * x))) : y0;
        return { y0: bottom, y1, e0: z0, e1: z1 };
      });
      cells(() => true);
      break;
    }
    case 'wedge':
      // a slanted cut from the back left to the front right: each slice across reaches less deep
      slices(m, 'x', x0, x1, Math.max(2, def.w * 2), (x) => ({
        y0,
        y1,
        e0: z0,
        e1: z0 + Math.max(0.02, D * (1 - (x - x0) / W)),
      }));
      cells((x, z) => z + 0.5 <= z0 + D * (1 - (x + 0.5 - x0) / W) + 1e-6);
      break;
    case 'round': {
      const R = W / 2;
      m.lathe(
        0,
        0,
        [
          [0, y0],
          [R, y0],
          [R, y1],
          [0, y1],
        ],
        segments * 2,
      );
      cells((x, z) => Math.hypot(x, z) <= R - 0.25);
      break;
    }
    case 'cone': {
      const R = W / 2;
      const top = Math.max(0.3, R * 0.35);
      m.lathe(
        0,
        0,
        [
          [0, y0],
          [R, y0],
          [top, y1],
          [0, y1],
        ],
        segments * 2,
      );
      if (def.w % 2) cells((x, z) => x === 0 && z === 0);
      else studs.push([0, 0, y1]);
      break;
    }
    case 'dome': {
      const R = W / 2;
      const prof: [number, number][] = [[0, y0]];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * (Math.PI / 2);
        prof.push([R * Math.cos(a), y0 + (y1 - y0) * Math.sin(a)]);
      }
      m.lathe(0, 0, prof, segments * 2);
      break;
    }
  }
  if (def.studs !== 'none' && def.base !== 'tile') for (const [x, z, y] of studs) m.stud(x, z, y, segments);
  const g = m.done();
  return rot % 4 ? turnedY(g, (-(rot % 4) * Math.PI) / 2) : g;
}
