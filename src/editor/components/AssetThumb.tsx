import { useEffect, useRef } from 'preact/hooks';
import { expandAsset } from '../../core/assets/expand';
import { footprint } from '../../core/bricks/inspect';
import type { Asset } from '../../core/schema';

const cache = new Map<string, string>();

const shade = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c.join(',')})`;
};

/** Small isometric picture of an asset (2D canvas, painter's order), cached per asset shape. */
export function drawAsset(def: Asset, state?: string, size = 96): string {
  const key = `${def.id}|${state ?? ''}|${size}|${def.bricks.length}|${def.palette.colors.join()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const bricks = expandAsset(def, { pos: [0, 0, 0], rot: 0, idBase: 1, ...(state ? { state } : {}) }).bricks;
  // iso projection: x right-down, z left-down, y up (1 plate = 0.4 studs, 1 stud ≈ 1.2 plates high)
  const P = (x: number, y: number, z: number): [number, number] => [(x - z) * 0.87, (x + z) * 0.5 - y * 0.4 * 1.15];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const boxes = bricks.map((b) => {
    const [w, d] = footprint(b);
    const h = b.type.startsWith('brick') ? 3 : 1;
    for (const [x, y, z] of [
      [b.x, b.y, b.z],
      [b.x + w, b.y, b.z],
      [b.x, b.y, b.z + d],
      [b.x + w, b.y, b.z + d],
      [b.x, b.y + h, b.z],
      [b.x + w, b.y + h, b.z + d],
    ] as const) {
      const [px, py] = P(x, y, z);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    return { b, w, d, h };
  });
  const scale = Math.min((size - 8) / Math.max(1, maxX - minX), (size - 8) / Math.max(1, maxY - minY));
  const ox = (size - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (size - (maxY - minY) * scale) / 2 - minY * scale;
  const S = (x: number, y: number, z: number): [number, number] => {
    const [px, py] = P(x, y, z);
    return [px * scale + ox, py * scale + oy];
  };
  boxes.sort((a, b) => a.b.x + a.b.z + a.w + a.d - (b.b.x + b.b.z + b.w + b.d) || a.b.y - b.b.y);
  const poly = (pts: [number, number][], fill: string) => {
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  };
  for (const { b, w, d, h } of boxes) {
    const x0 = b.x;
    const z0 = b.z;
    const y0 = b.y;
    const x1 = x0 + w;
    const z1 = z0 + d;
    const y1 = y0 + h;
    poly([S(x1, y0, z0), S(x1, y0, z1), S(x1, y1, z1), S(x1, y1, z0)], shade(b.color, 0.72));
    poly([S(x0, y0, z1), S(x1, y0, z1), S(x1, y1, z1), S(x0, y1, z1)], shade(b.color, 0.86));
    poly([S(x0, y1, z0), S(x1, y1, z0), S(x1, y1, z1), S(x0, y1, z1)], shade(b.color, 1.08));
  }
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

export function AssetThumb({ def, state, size = 96 }: { def: Asset; state?: string; size?: number }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.src = drawAsset(def, state, size * 2);
  }, [def, state, size]);
  return <img ref={ref} alt="" width={size} height={size} style={{ objectFit: 'contain' }} />;
}
