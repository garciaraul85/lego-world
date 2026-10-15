import { useEffect, useRef, useState } from 'preact/hooks';

/** Number input that commits on blur / Enter. */
export function Num({
  value,
  onCommit,
  label,
  step = 1,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  step?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setV(String(value));
  };
  return (
    <label>
      {label}
      <input
        class="inp mono"
        inputMode="numeric"
        value={v}
        step={step}
        aria-label={label}
        onInput={(e) => setV((e.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

/** Text input that commits on blur / Enter (empty reverts). */
export function TextField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => (v.trim() && v !== value ? onCommit(v) : setV(value));
  return (
    <input
      class="inp"
      aria-label={label}
      value={v}
      onInput={(e) => setV((e.target as HTMLInputElement).value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

/** Inspector header: colored chip, title and kind. */
export function Header({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid var(--line2)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '30px',
          height: '30px',
          borderRadius: '6px',
          background: color,
          boxShadow: 'inset 0 -5px 0 #00000040',
          flex: 'none',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div class="mono small muted">{sub}</div>
      </div>
    </div>
  );
}

/**
 * A text box that keeps what is being typed while its screen redraws (a playing clip redraws every frame, which
 * would put a plain box back to its saved value at each frame), and hands the text over once: on Enter, or when
 * the box loses focus. `onCommit` returns false to refuse the text (the box then shows the saved value again).
 */
export function DraftText({
  value,
  onCommit,
  same = (a, b) => a === b,
  tour,
  ...rest
}: {
  value: string;
  onCommit: (text: string) => boolean | undefined;
  /** two texts that mean the same value (no change to make) */
  same?: (a: string, b: string) => boolean;
  class?: string;
  style?: Record<string, string | number>;
  'aria-label'?: string;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: 'decimal' | 'numeric' | 'text';
  /** hook name for scripts (tutorial lines, AI plans) */
  tour?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter and the change event both hand the text over; only the first one counts
  const last = useRef(value);
  last.current = value;
  const commit = (text: string) => {
    setDraft(null);
    if (same(text, last.current)) return;
    if (onCommit(text) === false) return;
    last.current = text;
  };
  return (
    <input
      {...rest}
      data-tour={tour}
      value={draft ?? value}
      onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
      onChange={(e) => commit((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        else if (e.key === 'Escape') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
