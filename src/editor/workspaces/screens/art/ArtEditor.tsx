import { useEffect, useRef, useState } from 'preact/hooks';
import { artSvg, decodePixels, encodePixels, floodFill, GLYPH_SET, patternSvg } from '../../../../core/art/render';
import { pixelFontTtf, starterGlyphs } from '../../../../core/art/ttf';
import type { Art, ArtSource } from '../../../../core/schema';
import { ColorField } from '../../../components/ColorPicker';
import type { EditorState } from '../../../state';
import { artFont, artUrl } from './render';

type Pattern = Extract<ArtSource, { type: 'pattern' }>;
type Pixels = Extract<ArtSource, { type: 'pixels' }>;
type PixelFont = Extract<ArtSource, { type: 'pixelFont' }>;

/** Saves the browser a file (desktop app and pages that may download). */
export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** An SVG drawn into a PNG of the given size. */
export async function svgToPng(svg: string, w: number, h: number, pixel = false): Promise<Blob | null> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = !pixel;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

const slug = (s: string) =>
  s
    .replace(/[^\w-]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'art';

/**
 * P31 art editors: the middle of the Screens workspace when an art file is open. Every finished change
 * (a stroke, a pattern setting, a letter) is one undo step.
 */
export function ArtEditor({ ed, art, onClose }: { ed: EditorState; art: Art; onClose: () => void }) {
  const save = (source: ArtSource, label: string) =>
    ed.exec({ type: 'art.put', payload: { art: { ...art, source } } }, { label });
  const rename = (name: string) =>
    name.trim() &&
    ed.exec({ type: 'art.put', payload: { art: { ...art, name: name.trim().slice(0, 60) } } }, { label: 'Rename art' });
  const exportArt = async (as: 'png' | 'svg' | 'file' | 'ttf') => {
    const src = art.source;
    const base = slug(art.name);
    if (as === 'ttf' && src.type === 'pixelFont')
      return download(
        `${base}.ttf`,
        new Blob([pixelFontTtf(src, art.name) as Uint8Array<ArrayBuffer>], { type: 'font/ttf' }),
      );
    if ((as === 'file' && src.type === 'image') || (as === 'file' && src.type === 'fontFile')) {
      const b = await ed.media?.get(src.media);
      if (!b) return ed.notify('That file is still loading; try again in a moment.', true);
      const ext = b.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'bin';
      return download(`${base}.${ext}`, b);
    }
    const svg = artSvg(src);
    if (!svg) return;
    if (as === 'svg') return download(`${base}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
    const [w, h] = src.type === 'pixels' ? fitPng(src.w, src.h) : [1280, 720];
    const png = await svgToPng(svg, w, h, src.type === 'pixels');
    if (png) download(`${base}.png`, png);
  };
  const del = () => {
    if (ed.exec({ type: 'art.delete', payload: { id: art.id } }, { label: `Delete ${art.name}` }).ok) onClose();
  };
  const src = art.source;
  return (
    <section class="art-editor" aria-label={`Edit ${art.name}`}>
      <div class="studio-tools" role="toolbar" aria-label="Art">
        <button type="button" class="btn" onClick={onClose} data-tip="Back to the screen">
          ← Screen
        </button>
        <input
          class="inp"
          aria-label="Name"
          value={art.name}
          style={{ width: '180px' }}
          onChange={(e) => rename((e.target as HTMLInputElement).value)}
        />
        <span class="muted small">
          {art.kind === 'font' ? 'Font' : art.kind === 'icon' ? 'Icon' : 'Background'} ·{' '}
          {src.type === 'image'
            ? 'imported picture'
            : src.type === 'fontFile'
              ? 'imported font'
              : src.type === 'pattern'
                ? 'generated'
                : src.type === 'pixels'
                  ? `drawn ${src.w}×${src.h}`
                  : 'designed pixel font'}
        </span>
        <span class="sep" />
        <span class="group" role="group" aria-label="Export">
          {(src.type === 'pattern' || src.type === 'pixels') && (
            <>
              <button
                type="button"
                class="btn"
                onClick={() => exportArt('png')}
                data-tip="Save it to your computer as a PNG picture"
              >
                ⤒ PNG
              </button>
              <button
                type="button"
                class="btn"
                onClick={() => exportArt('svg')}
                data-tip="Save it as an SVG (sharp at any size)"
              >
                ⤒ SVG
              </button>
            </>
          )}
          {(src.type === 'image' || src.type === 'fontFile') && (
            <button
              type="button"
              class="btn"
              onClick={() => exportArt('file')}
              data-tip="Save the original file to your computer"
            >
              ⤒ Export
            </button>
          )}
          {src.type === 'pixelFont' && (
            <button
              type="button"
              class="btn"
              onClick={() => exportArt('ttf')}
              data-tip="Save it as a TrueType font (.ttf) you can install or use in other games"
            >
              ⤒ TTF
            </button>
          )}
        </span>
        <button type="button" class="btn danger" onClick={del}>
          Delete
        </button>
      </div>
      <div class="art-body">
        {src.type === 'pattern' && <PatternEditor src={src} save={save} />}
        {src.type === 'pixels' && <PixelEditor src={src} save={save} icon={art.kind === 'icon'} />}
        {src.type === 'pixelFont' && <FontDesigner ed={ed} art={art} src={src} save={save} />}
        {src.type === 'image' && (
          <div class="art-preview">
            {artUrl(ed, art.id) ? <img src={artUrl(ed, art.id)} alt={art.name} /> : <span class="muted">Loading…</span>}
          </div>
        )}
        {src.type === 'fontFile' && <FontSample ed={ed} art={art} />}
      </div>
    </section>
  );
}

const fitPng = (w: number, h: number): [number, number] => {
  const k = Math.max(1, Math.floor(512 / Math.max(w, h)));
  return [w * k, h * k];
};

// ---------- background generator ----------

const PATTERNS: [Pattern['pattern'], string][] = [
  ['solid', 'Solid'],
  ['linear', 'Gradient'],
  ['radial', 'Glow'],
  ['stripes', 'Stripes'],
  ['dots', 'Dots'],
  ['checks', 'Checks'],
  ['bricks', 'Bricks'],
  ['waves', 'Waves'],
  ['grid', 'Grid'],
  ['stars', 'Stars'],
];

function PatternEditor({ src, save }: { src: Pattern; save: (s: ArtSource, label: string) => unknown }) {
  const [draft, setDraft] = useState(src);
  useEffect(() => setDraft(src), [JSON.stringify(src)]);
  const commit = (next: Pattern, label = 'Change background') => {
    setDraft(next);
    save(next, label);
  };
  const url = (p: Pattern) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(patternSvg(p, 320, 180))}`;
  return (
    <div class="art-split">
      <div
        class="art-preview big"
        style={{ backgroundImage: `url("${url(draft)}")` }}
        role="img"
        aria-label="Background preview"
      />
      <div class="art-side">
        <div class="field">
          Pattern
          <div class="art-patterns" role="radiogroup" aria-label="Pattern">
            {PATTERNS.map(([p, name]) => (
              <button
                type="button"
                role="radio"
                aria-checked={draft.pattern === p}
                class={`art-pat ${draft.pattern === p ? 'on' : ''}`}
                onClick={() => commit({ ...draft, pattern: p })}
              >
                <span style={{ backgroundImage: `url("${url({ ...draft, pattern: p })}")` }} aria-hidden="true" />
                <span class="small">{name}</span>
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          Colours
          <span class="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
            {draft.colors.map((c, i) => (
              <ColorField
                label={`Colour ${i + 1}`}
                value={c}
                alpha
                onChange={(hex) => {
                  if (!hex) return;
                  const colors = [...draft.colors];
                  colors[i] = hex;
                  commit({ ...draft, colors });
                }}
              />
            ))}
            {draft.colors.length < 3 && (
              <button
                type="button"
                class="btn"
                onClick={() => commit({ ...draft, colors: [...draft.colors, '#ffffff'] })}
              >
                + colour
              </button>
            )}
            {draft.colors.length > 1 && (
              <button type="button" class="btn" onClick={() => commit({ ...draft, colors: draft.colors.slice(0, -1) })}>
                − colour
              </button>
            )}
          </span>
        </div>
        <label class="field">
          Angle · {draft.angle}°
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={draft.angle}
            aria-label="Angle"
            onInput={(e) => setDraft({ ...draft, angle: Number((e.target as HTMLInputElement).value) })}
            onChange={(e) => commit({ ...draft, angle: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
        <label class="field">
          Size · {draft.scale}px
          <input
            type="range"
            min="4"
            max="200"
            value={draft.scale}
            aria-label="Pattern size"
            onInput={(e) => setDraft({ ...draft, scale: Number((e.target as HTMLInputElement).value) })}
            onChange={(e) => commit({ ...draft, scale: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
      </div>
    </div>
  );
}

// ---------- pixel editor (icons and drawn backgrounds) ----------

type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'picker';
const TOOLS: [Tool, string, string][] = [
  ['pencil', '✎', 'Pencil'],
  ['eraser', '⌫', 'Eraser'],
  ['fill', '◧', 'Fill'],
  ['line', '╱', 'Line'],
  ['rect', '▭', 'Box'],
  ['picker', '⌖', 'Pick a colour from the picture'],
];

function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}

const SIZES_ICON: [number, number][] = [
  [16, 16],
  [24, 24],
  [32, 32],
  [48, 48],
];
const SIZES_BG: [number, number][] = [
  [64, 36],
  [128, 72],
  [160, 90],
  [256, 144],
];

function PixelEditor({
  src,
  save,
  icon,
}: {
  src: Pixels;
  save: (s: ArtSource, label: string) => unknown;
  icon: boolean;
}) {
  const [rows, setRows] = useState(() => decodePixels(src));
  const [palette, setPalette] = useState(src.palette);
  const [color, setColor] = useState(0);
  const [tool, setTool] = useState<Tool>('pencil');
  const [mirror, setMirror] = useState(false);
  const stroke = useRef<{ start: [number, number]; base: number[][] } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    setRows(decodePixels(src));
    setPalette(src.palette);
  }, [src.data, src.w, src.h, src.palette.join()]);
  const cell = Math.max(4, Math.floor(Math.min(560 / src.w, 420 / src.h)));
  // draw
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const v = rows[y]?.[x] ?? -1;
        ctx.fillStyle = v >= 0 ? (palette[v] ?? '#ff00ff') : (x + y) % 2 ? '#2a2f38' : '#323843';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    if (cell >= 8) {
      ctx.strokeStyle = '#ffffff14';
      for (let x = 0; x <= src.w; x++) ctx.strokeRect(x * cell + 0.5, 0, 0, src.h * cell);
      for (let y = 0; y <= src.h; y++) ctx.strokeRect(0, y * cell + 0.5, src.w * cell, 0);
    }
    if (mirror) {
      ctx.strokeStyle = '#ffd84a88';
      ctx.strokeRect((src.w * cell) / 2, 0, 0, src.h * cell);
    }
  });
  const at = (e: PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(src.w - 1, Math.floor(((e.clientX - r.left) / r.width) * src.w))),
      Math.max(0, Math.min(src.h - 1, Math.floor(((e.clientY - r.top) / r.height) * src.h))),
    ];
  };
  const paint = (base: number[][], pts: [number, number][], v: number) => {
    const out = base.map((r) => [...r]);
    for (const [x, y] of pts) {
      out[y]![x] = v;
      if (mirror) out[y]![src.w - 1 - x] = v;
    }
    return out;
  };
  const value = tool === 'eraser' ? -1 : color;
  const shape = (a: [number, number], b: [number, number]): [number, number][] => {
    if (tool === 'line') return linePoints(a[0], a[1], b[0], b[1]);
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1; x++) pts.push([x, y0], [x, y1]);
    for (let y = y0; y <= y1; y++) pts.push([x0, y], [x1, y]);
    return pts;
  };
  const commit = (next: number[][], pal = palette, label = 'Draw') =>
    save({ type: 'pixels', w: src.w, h: src.h, palette: pal, data: encodePixels(next) }, label);
  const resize = ([w, h]: [number, number]) => {
    const next = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => rows[y]?.[x] ?? -1));
    save({ type: 'pixels', w, h, palette, data: encodePixels(next) }, 'Resize drawing');
  };
  return (
    <div class="art-split">
      <div class="art-canvas-wrap">
        <canvas
          ref={canvas}
          class="art-canvas"
          width={src.w * cell}
          height={src.h * cell}
          aria-label="Drawing: click and drag to paint"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const p = at(e as unknown as PointerEvent);
            if (tool === 'picker') {
              const v = rows[p[1]]?.[p[0]] ?? -1;
              if (v >= 0) setColor(v);
              setTool('pencil');
              return;
            }
            if (tool === 'fill') {
              const next = floodFill(rows, p[0], p[1], value);
              setRows(next);
              commit(next, palette, 'Fill');
              return;
            }
            stroke.current = { start: p, base: rows };
            setRows(paint(rows, [p], value));
          }}
          onPointerMove={(e) => {
            const s = stroke.current;
            if (!s) return;
            const p = at(e as unknown as PointerEvent);
            if (tool === 'line' || tool === 'rect') setRows(paint(s.base, shape(s.start, p), value));
            else setRows((cur) => paint(cur, [p], value));
          }}
          onPointerUp={() => {
            if (!stroke.current) return;
            stroke.current = null;
            commit(rows);
          }}
        />
      </div>
      <div class="art-side">
        <div class="field">
          Tools
          <span class="row" style={{ gap: '4px', flexWrap: 'wrap' }} role="radiogroup" aria-label="Drawing tool">
            {TOOLS.map(([t, g, name]) => (
              <button
                type="button"
                role="radio"
                aria-checked={tool === t}
                class={`btn icon ${tool === t ? 'on' : ''}`}
                aria-label={name}
                data-tip={name}
                onClick={() => setTool(t)}
              >
                {g}
              </button>
            ))}
            <button
              type="button"
              class={`btn ${mirror ? 'on' : ''}`}
              aria-pressed={mirror}
              data-tip="Mirror: paint both halves at once"
              onClick={() => setMirror(!mirror)}
            >
              ⇋ Mirror
            </button>
          </span>
        </div>
        <div class="field">
          Colours
          <span class="row" style={{ gap: '4px', flexWrap: 'wrap' }} role="radiogroup" aria-label="Paint colour">
            {palette.map((c, i) => (
              <button
                type="button"
                role="radio"
                aria-checked={color === i}
                class={`swatch ${color === i ? 'on' : ''}`}
                aria-label={`Colour ${c}`}
                style={{ background: c }}
                onClick={() => {
                  setColor(i);
                  if (tool === 'eraser' || tool === 'picker') setTool('pencil');
                }}
              />
            ))}
          </span>
          <span class="row" style={{ gap: '6px' }}>
            <ColorField
              label="This colour"
              alpha
              value={palette[color]}
              onChange={(hex) => {
                if (!hex) return;
                const pal = [...palette];
                pal[color] = hex;
                setPalette(pal);
                commit(rows, pal, 'Change colour');
              }}
            />
            {palette.length < 62 && (
              <button
                type="button"
                class="btn"
                onClick={() => {
                  const pal = [...palette, '#ffffff'];
                  setPalette(pal);
                  setColor(pal.length - 1);
                  commit(rows, pal, 'Add colour');
                }}
              >
                + colour
              </button>
            )}
          </span>
        </div>
        <div class="field">
          Size
          <span class="row" style={{ gap: '4px', flexWrap: 'wrap' }}>
            {(icon ? SIZES_ICON : SIZES_BG).map(([w, h]) => (
              <button
                type="button"
                class={`btn ${src.w === w && src.h === h ? 'on' : ''}`}
                onClick={() => resize([w, h])}
              >
                {w}×{h}
              </button>
            ))}
          </span>
        </div>
        <div class="field">
          Preview
          <span class="row" style={{ gap: '10px', alignItems: 'end' }}>
            {[1, 2, 4].map((k) => (
              <img
                alt=""
                class="art-px"
                style={{ width: `${src.w * k}px`, height: `${src.h * k}px` }}
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artSvg({ ...src, palette, data: encodePixels(rows) })!)}`}
              />
            ))}
          </span>
        </div>
        <button
          type="button"
          class="btn"
          onClick={() => {
            const empty = rows.map((r) => r.map(() => -1));
            setRows(empty);
            commit(empty, palette, 'Clear drawing');
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ---------- pixel font designer ----------

const glyphRows = (src: PixelFont, ch: string): string[] =>
  (src.glyphs[ch] ?? Array.from({ length: src.cellH }, () => '.'.repeat(src.cellW)).join('|')).split('|');

/** a letter drawn small, for the letter list */
function GlyphMini({ src, ch }: { src: PixelFont; ch: string }) {
  const rows = glyphRows(src, ch);
  const rects = rows.flatMap((r, y) =>
    [...r].flatMap((c, x) => (c === '#' ? [<rect x={x} y={y} width="1" height="1" />] : [])),
  );
  return (
    <svg
      viewBox={`0 0 ${src.cellW} ${src.cellH}`}
      width={src.cellW * 3}
      height={src.cellH * 3}
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      <g fill="currentColor">{rects}</g>
    </svg>
  );
}

function FontDesigner({
  ed,
  art,
  src,
  save,
}: {
  ed: EditorState;
  art: Art;
  src: PixelFont;
  save: (s: ArtSource, label: string) => unknown;
}) {
  const [ch, setCh] = useState('A');
  const [sample, setSample] = useState('Hello brick world! 123');
  const [rows, setRows] = useState(() => glyphRows(src, ch));
  const paintOn = useRef<boolean | null>(null);
  useEffect(() => setRows(glyphRows(src, ch)), [ch, JSON.stringify(src.glyphs[ch]), src.cellW, src.cellH]);
  const cell = Math.floor(Math.min(320 / src.cellW, 320 / src.cellH));
  const setPx = (x: number, y: number, on: boolean) =>
    setRows((cur) => cur.map((r, j) => (j === y ? r.slice(0, x) + (on ? '#' : '.') + r.slice(x + 1) : r)));
  const commit = (next = rows) =>
    save({ ...src, glyphs: { ...src.glyphs, [ch]: next.join('|') } }, `Draw letter ${ch}`);
  const reshape = (patch: Partial<PixelFont>) => {
    const n = { ...src, ...patch };
    const glyphs = Object.fromEntries(
      Object.entries(src.glyphs).map(([k, g]) => {
        const r = g.split('|');
        // keep letters standing on the baseline: add or take rows at the top
        const dy = n.baseline - src.baseline;
        const shifted = dy >= 0 ? [...Array.from({ length: dy }, () => ''), ...r] : r.slice(-dy);
        const out = Array.from({ length: n.cellH }, (_, y) =>
          (shifted[y] ?? '').padEnd(n.cellW, '.').slice(0, n.cellW),
        );
        return [k, out.map((x) => x.replace(/[^#]/g, '.')).join('|')];
      }),
    );
    save({ ...n, glyphs }, 'Change font grid');
  };
  const ff = artFont(ed, `art:${art.id}`);
  return (
    <div class="art-split">
      <div class="art-font-main">
        <div
          class="art-glyph-grid"
          style={{ gridTemplateColumns: `repeat(${src.cellW}, ${cell}px)` }}
          role="grid"
          aria-label={`Letter ${ch}`}
        >
          {rows.flatMap((r, y) =>
            [...r].map((c, x) => (
              <button
                type="button"
                class={`art-gpx ${c === '#' ? 'on' : ''}${y === src.baseline - 1 ? ' base' : ''}`}
                aria-label={`Pixel ${x + 1}, ${y + 1}`}
                aria-pressed={c === '#'}
                style={{ width: `${cell}px`, height: `${cell}px` }}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                  paintOn.current = c !== '#';
                  setPx(x, y, paintOn.current);
                }}
                onPointerEnter={() => {
                  if (paintOn.current !== null) setPx(x, y, paintOn.current);
                }}
                onPointerUp={() => {
                  paintOn.current = null;
                  commit();
                }}
              />
            )),
          )}
        </div>
        <label class="field">
          Try it
          <input
            class="inp"
            value={sample}
            aria-label="Sample text"
            onInput={(e) => setSample((e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="art-font-sample" style={{ fontFamily: ff }}>
          {sample}
        </div>
      </div>
      <div class="art-side">
        <div class="field">
          Letters · click one to draw it
          <div class="art-letters" role="radiogroup" aria-label="Letter">
            {[...GLYPH_SET].map((g) => (
              <button
                type="button"
                role="radio"
                aria-checked={ch === g}
                class={`art-letter ${ch === g ? 'on' : ''}`}
                aria-label={`Letter ${g}`}
                onClick={() => setCh(g)}
              >
                <GlyphMini src={src} ch={g} />
              </button>
            ))}
          </div>
        </div>
        <div class="grid3">
          <label>
            Width
            <input
              class="inp mono"
              type="number"
              min="3"
              max="16"
              value={src.cellW}
              onChange={(e) => reshape({ cellW: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
          <label>
            Height
            <input
              class="inp mono"
              type="number"
              min="4"
              max="20"
              value={src.cellH}
              onChange={(e) =>
                reshape({
                  cellH: Number((e.target as HTMLInputElement).value),
                  baseline: Math.min(src.baseline, Number((e.target as HTMLInputElement).value)),
                })
              }
            />
          </label>
          <label>
            Gap
            <input
              class="inp mono"
              type="number"
              min="0"
              max="4"
              value={src.spacing}
              onChange={(e) =>
                save({ ...src, spacing: Number((e.target as HTMLInputElement).value) }, 'Change letter gap')
              }
            />
          </label>
        </div>
        <div class="row" style={{ gap: '6px' }}>
          <button
            type="button"
            class="btn"
            onClick={() => {
              const empty = rows.map((r) => '.'.repeat(r.length));
              setRows(empty);
              commit(empty);
            }}
          >
            Clear letter
          </button>
          <button
            type="button"
            class="btn"
            data-tip="Put back the built-in 6×9 letters"
            onClick={() => save({ ...src, cellW: 6, cellH: 9, baseline: 7, glyphs: starterGlyphs() }, 'Reset font')}
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}

function FontSample({ ed, art }: { ed: EditorState; art: Art }) {
  const ff = artFont(ed, `art:${art.id}`);
  return (
    <div class="art-font-main">
      <div class="art-font-sample big" style={{ fontFamily: ff }}>
        ABCDEFGHIJKLM
        <br />
        abcdefghijklm 0123456789
        <br />
        The quick brown fox jumps over the lazy dog!
      </div>
    </div>
  );
}
