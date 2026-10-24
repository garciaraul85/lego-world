import { useEffect, useRef } from 'preact/hooks';
import type { ModelPart } from '../../core/media/gltf';
import { type MediaSource, prepareModel } from '../../engine/model/prepare';

/**
 * Milestone 2b, 10c part 5: a small picture of a 3D model for lists: its triangles drawn from above and to the
 * side, nearest last, each lit by a light from the upper left (no 3D view needed, so a long list stays quick)
 */
export function ModelThumb({ model, media, size = 48 }: { model: string; media: MediaSource | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    prepareModel(model, media).then(
      (up) => {
        const c = ref.current;
        if (live && c) drawThumb(c, up.data.parts, up.data.min, up.data.max, up.pictures.map(averageColor));
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [model]);
  const px = Math.round(size * Math.min(2, globalThis.devicePixelRatio || 1));
  return (
    <canvas
      ref={ref}
      class={`model-thumb ${size < 30 ? 'small' : ''}`}
      width={px}
      height={px}
      aria-hidden="true"
      data-model-thumb={model}
    />
  );
}

/** a picture's average colour (a textured part is drawn in it) */
function averageColor(pic: ImageBitmap | ImageData | HTMLCanvasElement | null): [number, number, number] | null {
  if (!pic) return null;
  try {
    let data: Uint8ClampedArray;
    if (pic instanceof ImageData) data = pic.data;
    else {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(pic, 0, 0, 8, 8);
      data = g.getImageData(0, 0, 8, 8).data;
    }
    const sum = [0, 0, 0];
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += data[i + k]!;
    return [sum[0]! / n / 255, sum[1]! / n / 255, sum[2]! / n / 255];
  } catch {
    return null;
  }
}

export function drawThumb(
  c: HTMLCanvasElement,
  parts: readonly ModelPart[],
  min: readonly number[],
  max: readonly number[],
  tints: readonly ([number, number, number] | null)[],
) {
  const g = c.getContext('2d');
  if (!g) return;
  const W = c.width;
  g.clearRect(0, 0, W, W);
  // turned 35° about the upright axis, looked at from 25° above
  const ya = 0.6;
  const xa = 0.45;
  const cy = Math.cos(ya);
  const sy = Math.sin(ya);
  const cx = Math.cos(xa);
  const sx = Math.sin(xa);
  const mid = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  const view = (x: number, y: number, z: number) => {
    const px = x - mid[0]!;
    const py = y - mid[1]!;
    const pz = z - mid[2]!;
    const rx = cy * px + sy * pz;
    const rz = -sy * px + cy * pz;
    return [rx, cx * py - sx * rz, sx * py + cx * rz];
  };
  const tris: { pts: number[]; depth: number; color: string }[] = [];
  let ext = 0.001;
  const light = [-0.45, 0.75, 0.5];
  parts.forEach((part, pi) => {
    const tint = tints[pi];
    const base = tint ? [part.color[0] * tint[0], part.color[1] * tint[1], part.color[2] * tint[2]] : part.color;
    const P = part.positions;
    const N = part.normals;
    // big models: a sample of their triangles is enough at this size
    const step = Math.max(1, Math.floor(P.length / 9 / 6000));
    for (let t = 0; t < P.length / 9; t += step) {
      const pts: number[] = [];
      let depth = 0;
      for (let k = 0; k < 3; k++) {
        const i = t * 9 + k * 3;
        const v = view(P[i]!, P[i + 1]!, P[i + 2]!);
        pts.push(v[0]!, v[1]!);
        depth += v[2]!;
        ext = Math.max(ext, Math.abs(v[0]!), Math.abs(v[1]!));
      }
      const i = t * 9;
      const n = [
        (N[i]! + N[i + 3]! + N[i + 6]!) / 3,
        (N[i + 1]! + N[i + 4]! + N[i + 7]!) / 3,
        (N[i + 2]! + N[i + 5]! + N[i + 8]!) / 3,
      ];
      const lit = 0.45 + 0.65 * Math.max(0, n[0]! * light[0]! + n[1]! * light[1]! + n[2]! * light[2]!);
      const col = [0, 1, 2].map((k) => Math.min(255, Math.round(base[k]! * lit * 255)));
      tris.push({ pts, depth, color: `rgba(${col[0]},${col[1]},${col[2]},${part.color[3]})` });
    }
  });
  tris.sort((a, b) => b.depth - a.depth);
  const scale = (W * 0.42) / ext;
  for (const tri of tris) {
    g.fillStyle = tri.color;
    g.strokeStyle = tri.color;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(W / 2 + tri.pts[0]! * scale, W / 2 - tri.pts[1]! * scale);
    g.lineTo(W / 2 + tri.pts[2]! * scale, W / 2 - tri.pts[3]! * scale);
    g.lineTo(W / 2 + tri.pts[4]! * scale, W / 2 - tri.pts[5]! * scale);
    g.closePath();
    g.fill();
    g.stroke();
  }
}
