import { useEffect, useRef, useState } from 'preact/hooks';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { FieldHelp } from '../../components/fields';
import { previewArt } from './CharacterPreview';
import type { Props } from './Sheet';

/**
 * Milestone 3, 10d: the Draw tab — v68's paint, in the new editor. Pick a part (head, torso, a leg, the hat…) and a
 * side of it (front, back, left, right, top, bottom) and draw on it: a pen, an eraser, a fill and a colour picker,
 * any size and colour, a picture put on the side, undo and clear. The drawing shows on the 3D figure as it is drawn
 * (the preview turns to that side) and is kept in the character as v68 part paint: a 384×256 picture per part, six
 * 128-pixel sides, drawn over the part's own look. Each stroke is one undo step.
 */
export const DRAW_HELP =
  'Draw on the figure: pick a part and a side, then draw with the pen, rub out with the eraser, fill an area, or pick a colour off the figure. The drawing shows on the figure as you draw and is kept in the character (Undo takes back a stroke). Faces, tattoos, logos, patterns, freckles, a printed shirt — anything.';

const CELL = 128;
const SIDES = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'] as const;
export type DrawTool = 'pen' | 'eraser' | 'fill' | 'pick';
const TOOLS: [DrawTool, string, string][] = [
  ['pen', '✏️ Pen', 'Draw lines'],
  ['eraser', '🧽 Eraser', 'Rub out the drawing (the part’s own look shows again)'],
  ['fill', '🪣 Fill', 'Fill the area of one colour you click'],
  ['pick', '💧 Pick', 'Take the colour you click'],
];
/** a part has to be worn to be drawn on: what goes on when it isn't (as in v68) */
const WEAR_TO_DRAW: Record<string, [string, string, string][]> = {
  hair: [['hair', 'Bald', 'Short']],
  hat: [['hat', 'None', 'Baseball cap']],
  back: [['back', 'None', 'Backpack']],
  held: [['held', 'None', 'Hammer']],
  cape: [['cape', 'None', 'Short cape']],
  glasses: [['glasses', 'None', 'Round']],
};

const blank = () => {
  const c = document.createElement('canvas');
  c.width = CELL * 3;
  c.height = CELL * 2;
  return c;
};
const cellOf = (side: number) => ({ x: (side % 3) * CELL, y: Math.floor(side / 3) * CELL });
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** the pixels of one side that a fill at (px, py) reaches: the joined area whose colour is near the clicked one */
export function fillArea(rgba: Uint8ClampedArray, w: number, h: number, px: number, py: number, tolerance = 40) {
  const at = (x: number, y: number) => (y * w + x) * 4;
  const i0 = at(px, py);
  const [r0, g0, b0, a0] = [rgba[i0]!, rgba[i0 + 1]!, rgba[i0 + 2]!, rgba[i0 + 3]!];
  const near = (i: number) =>
    Math.abs(rgba[i]! - r0) + Math.abs(rgba[i + 1]! - g0) + Math.abs(rgba[i + 2]! - b0) + Math.abs(rgba[i + 3]! - a0) <=
    tolerance;
  const seen = new Uint8Array(w * h);
  const stack = [px + py * w];
  seen[px + py * w] = 1;
  const out: number[] = [];
  while (stack.length) {
    const p = stack.pop()!;
    out.push(p);
    const x = p % w;
    const y = (p - x) / w;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = nx + ny * w;
      if (seen[q] || !near(q * 4)) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  return out;
}

export function DrawTab({
  c,
  chr,
  profile,
  setFields,
}: Props & {
  profile: Record<string, unknown>;
  setFields: (patch: Record<string, unknown>, label: string) => void;
}) {
  const ed = c.ed;
  const L = legacyRuntime();
  const part = ed.drawPart.value;
  const side = ed.drawSide.value;
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#1b1b1b');
  const [size, setSize] = useState(4);
  const [message, setMessage] = useState('');
  const view = useRef<HTMLCanvasElement>(null);
  // the drawing (paint layer) and the part's own look under it, both whole atlases
  const atlas = useRef<HTMLCanvasElement>(blank());
  const base = useRef<HTMLCanvasElement>(blank());
  const history = useRef<string[]>([]);
  /** which character, part and saved drawing the canvas holds: the store sending back what was just saved changes nothing */
  const wrote = useRef<string | null>(null);
  const [ready, setReady] = useState(0);
  const stroke = useRef<{ id: number; last: [number, number] } | null>(null);
  const [, redraw] = useState(0);
  const paint = (profile.paint ?? {}) as Record<string, string>;

  const show = () => {
    const v = view.current;
    if (!v) return;
    const ctx = v.getContext('2d')!;
    const { x, y } = cellOf(side);
    ctx.clearRect(0, 0, 256, 256);
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) {
        ctx.fillStyle = (a + b) % 2 ? '#243247' : '#30415a';
        ctx.fillRect(a * 32, b * 32, 32, 32);
      }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base.current, x, y, CELL, CELL, 0, 0, 256, 256);
    ctx.drawImage(atlas.current, x, y, CELL, CELL, 0, 0, 256, 256);
  };
  const live = () => {
    previewArt.current?.setLivePaint(part, atlas.current);
    show();
  };

  // load the part: its own look (from the figure's renderer) and its drawing so far
  const look = JSON.stringify({ ...profile, paint: undefined });
  const saved = paint[part] ?? '';
  useEffect(() => {
    let gone = false;
    const art = previewArt.current;
    // the figure's renderer comes up with the preview: try again in a moment
    if (!art) {
      const t = setTimeout(() => setReady((n) => n + 1), 300);
      return () => clearTimeout(t);
    }
    const b = base.current.getContext('2d')!;
    b.clearRect(0, 0, CELL * 3, CELL * 2);
    try {
      const own = art.appearanceAtlas(profile, part);
      if (own) b.putImageData(new ImageData(new Uint8ClampedArray(own.data), own.width, own.height), 0, 0);
    } catch {
      /* the preview isn't up yet: the drawing still works over the checkerboard */
    }
    const a = atlas.current.getContext('2d', { willReadFrequently: true })!;
    const holds = `${chr.id}/${part}/${saved}`;
    if (!stroke.current && holds !== wrote.current) {
      wrote.current = holds;
      a.clearRect(0, 0, CELL * 3, CELL * 2);
      if (saved) {
        const img = new Image();
        img.onload = () => {
          if (gone) return;
          a.clearRect(0, 0, CELL * 3, CELL * 2);
          a.drawImage(img, 0, 0, CELL * 3, CELL * 2);
          live();
        };
        img.src = saved;
      }
    }
    live();
    return () => {
      gone = true;
    };
  }, [chr.id, part, look, saved, ready]);
  useEffect(show, [side]);
  // leaving the tab: the figure shows what is saved
  useEffect(() => () => previewArt.current?.setLivePaint(null), []);
  useEffect(() => {
    history.current = [];
    redraw((n) => n + 1);
  }, [part, chr.id]);

  const remember = () => {
    history.current.push(atlas.current.toDataURL('image/png'));
    if (history.current.length > 24) history.current.shift();
  };
  /** keep the drawing in the character: one undo step; an empty drawing removes the part's paint */
  const save = (label: string) => {
    const a = atlas.current.getContext('2d', { willReadFrequently: true })!;
    const px = a.getImageData(0, 0, CELL * 3, CELL * 2).data;
    let ink = false;
    for (let i = 3; i < px.length; i += 4)
      if (px[i]) {
        ink = true;
        break;
      }
    const next = { ...paint };
    const data = ink ? atlas.current.toDataURL('image/png') : '';
    if (ink) next[part] = data;
    else delete next[part];
    try {
      L.CharacterCatalog.validatePaint(next);
    } catch (e) {
      setMessage(`${(e as Error).message} Draw less detail, or clear a side.`);
      return;
    }
    setMessage('');
    if (data) previewArt.current?.cachePaint(data, atlas.current);
    wrote.current = `${chr.id}/${part}/${data}`;
    setFields({ paint: next }, label);
    redraw((n) => n + 1);
  };
  const wear = () => {
    const change: Record<string, unknown> = {};
    for (const [k, none, put] of WEAR_TO_DRAW[part] ?? []) if (profile[k] === none) change[k] = put;
    if (part === 'accessory' && profile.scarf === 'None' && profile.neck === 'None' && profile.ears === 'None')
      change.scarf = 'Short scarf';
    if (part === 'dress' && profile.outfit !== 'Dress' && !String(profile.pants).toLowerCase().includes('skirt'))
      change.outfit = 'Dress';
    if (Object.keys(change).length) setFields(change, `Wear a ${part} to draw on`);
  };

  const point = (e: PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CELL, ((e.clientY - r.top) / r.height) * CELL];
  };
  const line = (a: [number, number], b: [number, number]) => {
    const { x, y } = cellOf(side);
    const ctx = atlas.current.getContext('2d', { willReadFrequently: true })!;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CELL, CELL);
    ctx.clip();
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + a[0], y + a[1]);
    ctx.lineTo(x + b[0] + 0.001, y + b[1]);
    ctx.stroke();
    ctx.restore();
    live();
  };
  /** what the side looks like where it's clicked: the drawing over the part's own look */
  const seen = () => {
    const { x, y } = cellOf(side);
    const c2 = document.createElement('canvas');
    c2.width = c2.height = CELL;
    const ctx = c2.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(base.current, x, y, CELL, CELL, 0, 0, CELL, CELL);
    ctx.drawImage(atlas.current, x, y, CELL, CELL, 0, 0, CELL, CELL);
    return ctx.getImageData(0, 0, CELL, CELL).data;
  };
  const fill = (p: [number, number]) => {
    const { x, y } = cellOf(side);
    const px = Math.max(0, Math.min(CELL - 1, Math.floor(p[0])));
    const py = Math.max(0, Math.min(CELL - 1, Math.floor(p[1])));
    const area = fillArea(seen(), CELL, CELL, px, py);
    const ctx = atlas.current.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(x, y, CELL, CELL);
    const rgb = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
    for (const q of area) img.data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], q * 4);
    ctx.putImageData(img, x, y);
    live();
  };
  const pick = (p: [number, number]) => {
    const d = seen();
    const i = (Math.floor(p[1]) * CELL + Math.floor(p[0])) * 4;
    if (d[i + 3]) setColor(hex(d[i]!, d[i + 1]!, d[i + 2]!));
    setTool('pen');
  };

  const down = (e: PointerEvent) => {
    e.preventDefault();
    if (stroke.current) return;
    wear();
    const p = point(e);
    if (tool === 'pick') return pick(p);
    remember();
    if (tool === 'fill') {
      fill(p);
      save(`Fill on the ${part}`);
      return;
    }
    stroke.current = { id: e.pointerId, last: p };
    view.current!.setPointerCapture(e.pointerId);
    line(p, p);
  };
  const move = (e: PointerEvent) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    const p = point(e);
    line(s.last, p);
    s.last = p;
  };
  const up = (e: PointerEvent) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    stroke.current = null;
    save(tool === 'eraser' ? `Rub out on the ${part}` : `Draw on the ${part}`);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev === undefined) return;
    const img = new Image();
    img.onload = () => {
      const ctx = atlas.current.getContext('2d', { willReadFrequently: true })!;
      ctx.clearRect(0, 0, CELL * 3, CELL * 2);
      ctx.drawImage(img, 0, 0);
      live();
      save(`Undo drawing on the ${part}`);
    };
    img.src = prev;
  };
  const clearSide = () => {
    remember();
    const { x, y } = cellOf(side);
    atlas.current.getContext('2d')!.clearRect(x, y, CELL, CELL);
    live();
    save(`Clear the ${part} ${SIDES[side]!.toLowerCase()}`);
  };
  const picture = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setMessage('Choose a PNG, JPEG or WebP picture under 20 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((ok, bad) => {
        img.onload = () => ok();
        img.onerror = () => bad(new Error('That picture could not be opened.'));
        img.src = url;
      });
      wear();
      remember();
      const { x, y } = cellOf(side);
      atlas.current.getContext('2d')!.drawImage(img, x, y, CELL, CELL);
      live();
      save(`Picture on the ${part}`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const parts = Object.entries(L.CharacterCatalog.paintParts);
  const drawn = Object.keys(paint);
  return (
    <div class="sec" data-tour="char-draw" data-help="characters.draw">
      <div class="sech">
        <span>
          Draw on the figure
          <FieldHelp label="Draw on the figure" text={DRAW_HELP} />
        </span>
      </div>
      <label class="field">
        Part
        <select
          class="inp"
          data-tour="draw-part"
          value={part}
          onChange={(e) => (ed.drawPart.value = (e.target as HTMLSelectElement).value)}
        >
          {parts.map(([id, label]) => (
            <option value={id}>
              {label}
              {drawn.includes(id) ? ' ✎' : ''}
            </option>
          ))}
        </select>
      </label>
      <div
        class="row"
        role="radiogroup"
        aria-label="Side"
        data-tour="draw-sides"
        style={{ flexWrap: 'wrap', gap: '6px' }}
      >
        {SIDES.map((s, i) => (
          <button
            type="button"
            role="radio"
            aria-checked={side === i}
            class={`btn small ${side === i ? 'on' : ''}`}
            data-tour={`draw-side-${s.toLowerCase()}`}
            onClick={() => (ed.drawSide.value = i)}
          >
            {s}
          </button>
        ))}
      </div>
      <canvas
        ref={view}
        width={256}
        height={256}
        class="draw-canvas"
        data-tour="draw-canvas"
        role="img"
        aria-label={`Drawing: ${L.CharacterCatalog.paintParts[part] ?? part}, ${SIDES[side]!.toLowerCase()}`}
        style={{
          width: '100%',
          maxWidth: '256px',
          aspectRatio: '1',
          imageRendering: 'pixelated',
          touchAction: 'none',
          cursor: tool === 'fill' || tool === 'pick' ? 'cell' : 'crosshair',
          borderRadius: '6px',
          display: 'block',
          margin: '8px 0',
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
      />
      <div
        class="row"
        role="radiogroup"
        aria-label="Tool"
        data-tour="draw-tools"
        style={{ flexWrap: 'wrap', gap: '6px' }}
      >
        {TOOLS.map(([id, label, tip]) => (
          <button
            type="button"
            role="radio"
            aria-checked={tool === id}
            class={`btn small ${tool === id ? 'on' : ''}`}
            data-tour={`draw-tool-${id}`}
            data-tip={tip}
            onClick={() => setTool(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="grid2">
        <label class="field">
          Colour
          <input
            type="color"
            class="inp"
            data-tour="draw-color"
            value={color}
            onInput={(e) => setColor((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>
            Size <span class="mono muted">{size}</span>
          </span>
          <input
            type="range"
            min={1}
            max={32}
            value={size}
            data-tour="draw-size"
            aria-valuetext={`${size} pixels`}
            onInput={(e) => setSize(Number((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
      <div class="row" style={{ flexWrap: 'wrap', gap: '6px' }}>
        <button type="button" class="btn small" data-tour="draw-undo" disabled={!history.current.length} onClick={undo}>
          ↶ Undo stroke
        </button>
        <button type="button" class="btn small" data-tour="draw-clear" onClick={clearSide}>
          Clear this side
        </button>
        <label class="btn small" data-tour="draw-picture">
          🖼 Put a picture on this side
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Put a picture on this side"
            hidden
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              void picture(input.files?.[0]);
              input.value = '';
            }}
          />
        </label>
      </div>
      {message && (
        <p class="hint warn" role="alert">
          {message}
        </p>
      )}
      <p class="hint">
        Drawn on: {drawn.length ? drawn.map((d) => L.CharacterCatalog.paintParts[d] ?? d).join(', ') : 'nothing yet'}.
      </p>
    </div>
  );
}
