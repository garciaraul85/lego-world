import { cleanMarks, type Mark, PAINT_SIDES } from '../../core/character/marks';

/**
 * Milestone 3, 10d: marks drawn into v68 part paint — the same pictures the Draw tab makes (384×256, six 128-pixel
 * sides). Used by From a picture, so words and Claude can draw on a figure.
 */
const CELL = 128;

/** a little random that is the same every time for the same mark (spots and freckles land in the same places) */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** draws one mark on its side of the part's picture */
export function drawMark(g: CanvasRenderingContext2D, m: Mark) {
  const side = Math.max(0, PAINT_SIDES.indexOf(m.side));
  const ox = (side % 3) * CELL;
  const oy = Math.floor(side / 3) * CELL;
  const r = (m.size * CELL) / 2;
  g.save();
  g.beginPath();
  g.rect(ox, oy, CELL, CELL);
  g.clip();
  if (m.shape === 'fill') {
    g.fillStyle = m.color;
    g.fillRect(ox, oy, CELL, CELL);
    g.restore();
    return;
  }
  g.translate(ox + m.x * CELL, oy + m.y * CELL);
  g.rotate((m.turn * Math.PI) / 180);
  g.fillStyle = m.color;
  g.strokeStyle = m.color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const poly = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  };
  const rand = seeded(Math.round(m.x * 997 + m.y * 7919 + m.size * 104729));
  switch (m.shape) {
    case 'star':
      poly(
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const k = i % 2 ? r * 0.45 : r;
          return [k * Math.cos(a), k * Math.sin(a)] as [number, number];
        }),
      );
      break;
    case 'heart': {
      g.beginPath();
      g.moveTo(0, r * 0.9);
      g.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.4);
      g.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.9);
      g.fill();
      break;
    }
    case 'circle':
    case 'dot':
      g.beginPath();
      g.arc(0, 0, Math.max(1.5, r), 0, Math.PI * 2);
      g.fill();
      break;
    case 'ring':
      g.lineWidth = Math.max(2, r * 0.3);
      g.beginPath();
      g.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'square':
      g.fillRect(-r, -r, r * 2, r * 2);
      break;
    case 'triangle':
      poly([
        [0, -r],
        [r * 0.95, r * 0.7],
        [-r * 0.95, r * 0.7],
      ]);
      break;
    case 'cross':
    case 'plus':
      g.lineWidth = Math.max(2, r * 0.35);
      g.beginPath();
      if (m.shape === 'cross') {
        g.moveTo(-r, -r);
        g.lineTo(r, r);
        g.moveTo(r, -r);
        g.lineTo(-r, r);
      } else {
        g.moveTo(-r, 0);
        g.lineTo(r, 0);
        g.moveTo(0, -r);
        g.lineTo(0, r);
      }
      g.stroke();
      break;
    case 'lightning':
      poly([
        [r * 0.2, -r],
        [-r * 0.55, r * 0.1],
        [-r * 0.05, r * 0.1],
        [-r * 0.25, r],
        [r * 0.55, -r * 0.15],
        [r * 0.05, -r * 0.15],
      ]);
      break;
    case 'drop':
      g.beginPath();
      g.moveTo(0, -r);
      g.quadraticCurveTo(r * 0.8, r * 0.2, 0, r);
      g.quadraticCurveTo(-r * 0.8, r * 0.2, 0, -r);
      g.fill();
      break;
    case 'stripe':
      g.fillRect(-CELL, -r * 0.35, CELL * 2, r * 0.7);
      break;
    case 'stripes': {
      // tiger-like bands across the whole side
      const n = 5;
      for (let i = 0; i < n; i++) {
        const y = -CELL / 2 + ((i + 0.5) * CELL) / n;
        g.beginPath();
        g.moveTo(-CELL / 2, y - 4);
        g.lineTo(CELL / 2, y - 10);
        g.lineTo(CELL / 2, y);
        g.lineTo(-CELL / 2, y + 6);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'spots':
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.arc((rand() - 0.5) * r * 2, (rand() - 0.5) * r * 2, 3 + rand() * 6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'freckles':
      for (const s of [-1, 1])
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(s * (r * 0.55 + rand() * r * 0.4), (rand() - 0.5) * r * 0.5, 1.4 + rand(), 0, Math.PI * 2);
          g.fill();
        }
      break;
    case 'scar': {
      g.lineWidth = Math.max(1.5, r * 0.12);
      g.beginPath();
      g.moveTo(-r, -r * 0.6);
      g.lineTo(r, r * 0.6);
      for (let i = -2; i <= 2; i++) {
        const t = i / 2.5;
        g.moveTo(t * r - r * 0.12, t * r * 0.6 + r * 0.2);
        g.lineTo(t * r + r * 0.12, t * r * 0.6 - r * 0.2);
      }
      g.stroke();
      break;
    }
    case 'text': {
      const text = (m.text ?? '').slice(0, 10);
      if (!text) break;
      let px = r * 1.6;
      g.font = `900 ${px}px system-ui, sans-serif`;
      const w = g.measureText(text).width;
      if (w > CELL * 0.92) {
        px *= (CELL * 0.92) / w;
        g.font = `900 ${px}px system-ui, sans-serif`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 0, 0);
      break;
    }
  }
  g.restore();
}

const load = (src: string) =>
  new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });

/**
 * The drawings after the marks: each part with marks drawn over what it has (or clean with `replace`). Only the
 * parts that change are returned.
 */
export async function paintWithMarks(
  existing: Record<string, string>,
  raw: unknown,
  replace = false,
): Promise<Record<string, string>> {
  const marks = cleanMarks(raw);
  const out: Record<string, string> = {};
  for (const part of new Set(marks.map((m) => m.part))) {
    const c = document.createElement('canvas');
    c.width = CELL * 3;
    c.height = CELL * 2;
    const g = c.getContext('2d')!;
    const had = existing[part];
    if (had && !replace) {
      const img = await load(had);
      if (img) g.drawImage(img, 0, 0, CELL * 3, CELL * 2);
    }
    for (const m of marks) if (m.part === part) drawMark(g, m);
    out[part] = c.toDataURL('image/png');
  }
  return out;
}
