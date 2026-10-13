import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { LEGACY_COLORS } from '../../core/legacy/constants';

/**
 * P31 colour picker: one field for every colour in the editor (screen styles, bricks, assets).
 * A swatch button opens a picker with a shade square, hue and (optionally) transparency sliders, a hex box,
 * the brick colours, recent colours and an eyedropper where the browser has one. The value is committed
 * when you let go or pick, so one choice is one undo step.
 */
type HSV = { h: number; s: number; v: number; a: number };

export function hexToHsv(hex: string): HSV {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, v: 1, a: 1 };
  const n = Number.parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max, a: m[2] ? Number.parseInt(m[2], 16) / 255 : 1 };
}

export function hsvToHex({ h, s, v, a }: HSV, withAlpha = false): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hx = (n: number) =>
    Math.round(Math.max(0, Math.min(1, n)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hx(r + m)}${hx(g + m)}${hx(b + m)}${withAlpha && a < 1 ? hx(a) : ''}`;
}

const RECENT_KEY = 'bw.recentColors';
function recent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}
function remember(hex: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...recent().filter((x) => x !== hex)].slice(0, 12)));
  } catch {
    /* private window: no recent list */
  }
}

export const BRICK_HEXES = LEGACY_COLORS.map(([, hex]) => hex);

export function ColorField({
  value,
  onChange,
  label,
  alpha = false,
  palette = BRICK_HEXES,
  placeholder = 'none',
  clearable = false,
}: {
  value: string | undefined;
  onChange: (hex: string | undefined) => void;
  label: string;
  alpha?: boolean;
  palette?: readonly string[];
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [open]);
  return (
    <span class="color-field" ref={ref}>
      <button
        type="button"
        class="btn color-btn"
        aria-label={`${label}: ${value ?? placeholder}`}
        aria-expanded={open}
        data-tip={`Pick ${label.toLowerCase()}`}
        onClick={() => setOpen(!open)}
      >
        <span class="color-chip" style={{ background: value ?? 'transparent' }} aria-hidden="true" />
        <span class="mono small">{value ?? placeholder}</span>
      </button>
      {open && (
        <ColorPicker
          value={value ?? '#ffffff'}
          alpha={alpha}
          palette={palette}
          label={label}
          onPick={(hex) => {
            remember(hex);
            onChange(hex);
          }}
          {...(clearable
            ? {
                onClear: () => {
                  onChange(undefined);
                  setOpen(false);
                },
              }
            : {})}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

export function ColorPicker({
  value,
  onPick,
  onClose,
  onClear,
  alpha = false,
  palette = BRICK_HEXES,
  label = 'Colour',
}: {
  value: string;
  onPick: (hex: string) => void;
  onClose?: () => void;
  onClear?: () => void;
  alpha?: boolean;
  palette?: readonly string[];
  label?: string;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const sq = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // stay on screen: below what opened it, or above when there is no room, never past the sides
  useLayoutEffect(() => {
    const el = pop.current;
    const at = el?.parentElement?.getBoundingClientRect();
    if (!el || !at) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    let top = at.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, at.top - 6 - h);
    const left = Math.min(Math.max(8, at.left), window.innerWidth - w - 8);
    Object.assign(el.style, { position: 'fixed', top: `${top}px`, left: `${left}px` });
  }, []);
  const hex = hsvToHex(hsv, alpha);
  useEffect(() => setHexText(hex), [hex]);
  const commit = (next: HSV = hsv) => onPick(hsvToHex(next, alpha));
  const fromSquare = (e: PointerEvent) => {
    const r = sq.current!.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    const next = { ...hsv, s, v };
    setHsv(next);
    return next;
  };
  const eye = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  return (
    <div ref={pop} class="color-pop" role="dialog" aria-label={`${label} picker`}>
      <div
        ref={sq}
        class="color-sq"
        role="slider"
        aria-label="Shade"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`${Math.round(hsv.s * 100)}% colour, ${Math.round(hsv.v * 100)}% light`}
        tabIndex={0}
        style={{ background: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          fromSquare(e);
        }}
        onPointerMove={(e) => {
          if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) fromSquare(e);
        }}
        onPointerUp={(e) => commit(fromSquare(e))}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
          if (!k) return;
          e.preventDefault();
          const next = {
            ...hsv,
            s: Math.max(0, Math.min(1, hsv.s + k[0]!)),
            v: Math.max(0, Math.min(1, hsv.v + k[1]!)),
          };
          setHsv(next);
          commit(next);
        }}
      >
        <span class="color-sq-white" />
        <span class="color-sq-black" />
        <span class="color-sq-dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <input
        class="color-hue"
        type="range"
        min="0"
        max="359"
        aria-label="Hue"
        value={Math.round(hsv.h)}
        onInput={(e) => setHsv({ ...hsv, h: Number((e.target as HTMLInputElement).value) })}
        onChange={(e) => commit({ ...hsv, h: Number((e.target as HTMLInputElement).value) })}
      />
      {alpha && (
        <input
          class="color-alpha"
          type="range"
          min="0"
          max="100"
          aria-label="See-through"
          style={{ ['--c' as never]: hsvToHex({ ...hsv, a: 1 }) }}
          value={Math.round(hsv.a * 100)}
          onInput={(e) => setHsv({ ...hsv, a: Number((e.target as HTMLInputElement).value) / 100 })}
          onChange={(e) => commit({ ...hsv, a: Number((e.target as HTMLInputElement).value) / 100 })}
        />
      )}
      <div class="row" style={{ gap: '6px' }}>
        <span class="color-chip big" style={{ background: hex }} aria-hidden="true" />
        <input
          class="inp mono"
          aria-label="Hex colour"
          value={hexText}
          onInput={(e) => setHexText((e.target as HTMLInputElement).value)}
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            const ok = /^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
            if (!ok) return setHexText(hex);
            const next = hexToHsv(v.startsWith('#') ? v : `#${v}`);
            setHsv(next);
            commit(next);
          }}
          style={{ width: '110px' }}
        />
        {eye && (
          <button
            type="button"
            class="btn"
            aria-label="Pick a colour from the screen"
            data-tip="Eyedropper: pick a colour from anywhere on the screen"
            onClick={async () => {
              try {
                const r = await new eye().open();
                const next = hexToHsv(r.sRGBHex);
                setHsv(next);
                commit(next);
              } catch {
                /* cancelled */
              }
            }}
          >
            ⌖
          </button>
        )}
      </div>
      <Swatchrow title="Brick colours" list={palette} pick={(h) => (setHsv(hexToHsv(h)), commit(hexToHsv(h)))} />
      {recent().length > 0 && (
        <Swatchrow title="Recent" list={recent()} pick={(h) => (setHsv(hexToHsv(h)), commit(hexToHsv(h)))} />
      )}
      <div class="row" style={{ justifyContent: 'flex-end', gap: '6px' }}>
        {onClear && (
          <button type="button" class="btn" onClick={onClear}>
            None
          </button>
        )}
        {onClose && (
          <button type="button" class="btn on" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function Swatchrow({ title, list, pick }: { title: string; list: readonly string[]; pick: (hex: string) => void }) {
  return (
    <div class="color-row" role="listbox" aria-label={title}>
      {list.map((h) => (
        <button
          type="button"
          role="option"
          aria-selected={false}
          class="swatch small"
          aria-label={h}
          style={{ background: h }}
          onClick={() => pick(h)}
        />
      ))}
    </div>
  );
}
