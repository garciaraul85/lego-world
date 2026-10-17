import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export type PreviewOption = { value: string; name: string; thumb: ComponentChildren; note?: string };

/**
 * P31: a choice shown as pictures, not a plain list — the button shows the current choice's preview, and the
 * pop-up shows every option as a card with its preview (a background, an icon, "Aa" in a font…).
 */
export function PreviewPicker({
  label,
  value,
  options,
  onPick,
  footer,
  tour,
  placeholder = '—',
}: {
  label: string;
  value: string;
  options: PreviewOption[];
  onPick: (value: string) => void;
  /** extra content under the cards (e.g. "Make a new one…") */
  footer?: (close: () => void) => ComponentChildren;
  /** P32: hook names for scripts (tutorial lines, AI plans): the button is `pick-<tour>`, its cards `pick-<tour>-list` */
  tour?: string;
  /** P32: what the button says while nothing is chosen (“+ Track…”) */
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value) ?? {
    value,
    name: value ? `(missing) ${value}` : placeholder,
    thumb: null,
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    pop.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  // stay on screen: below the button, or above when there is no room, never past the sides
  useLayoutEffect(() => {
    const el = pop.current;
    const at = ref.current?.getBoundingClientRect();
    if (!open || !el || !at) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    let top = at.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, at.top - 4 - h);
    const left = Math.min(Math.max(8, at.right - w), window.innerWidth - w - 8);
    Object.assign(el.style, { top: `${top}px`, left: `${left}px` });
  }, [open]);
  return (
    <span class="pv-field" ref={ref}>
      <button
        type="button"
        class="btn pv-btn"
        aria-label={`${label}: ${cur.name}`}
        aria-haspopup="listbox"
        data-tour={tour ? `pick-${tour}` : undefined}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class="pv-btn-thumb" aria-hidden="true">
          {cur.thumb}
        </span>
        <span class="pv-btn-name">{cur.name}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div ref={pop} class="pv-pop" role="dialog" aria-label={`${label} choices`}>
          <div class="pv-grid" role="listbox" aria-label={label} data-tour={tour ? `pick-${tour}-list` : undefined}>
            {options.map((o) => (
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                data-value={o.value}
                data-name={o.name}
                class={`pv-opt ${o.value === value ? 'on' : ''}`}
                title={o.note ? `${o.name} · ${o.note}` : o.name}
                onClick={() => {
                  onPick(o.value);
                  setOpen(false);
                }}
              >
                <span class="pv-thumb" aria-hidden="true">
                  {o.thumb}
                </span>
                <span class="pv-name small">{o.name}</span>
                {o.note && <span class="pv-note small muted">{o.note}</span>}
              </button>
            ))}
          </div>
          {footer?.(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
