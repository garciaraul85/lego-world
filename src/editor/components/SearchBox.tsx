import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

/**
 * Finding things in lists: every list with pictures or previews has a search box. Words are matched anywhere in
 * a name (and its kind or group), all of them, in any order and case: “fire blue” finds “Blue fire”.
 */
export const searchWords = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** every word of the search is somewhere in the texts */
export function matches(q: string, ...texts: (string | number | null | undefined)[]): boolean {
  const w = searchWords(q);
  if (!w.length) return true;
  const hay = texts
    .filter((t) => t !== null && t !== undefined)
    .join(' ')
    .toLowerCase();
  return w.every((x) => hay.includes(x));
}

/** A search box over a list: typing filters it, Esc clears it. */
export function SearchBox({
  label,
  value,
  onInput,
  tour,
  autoFocus,
  onEnter,
}: {
  /** what is searched, as in “Search clips” */
  label: string;
  value: string;
  onInput: (q: string) => void;
  tour?: string;
  autoFocus?: boolean;
  /** Enter: pick the first thing found */
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // a box that appears because the person opened a list: typing goes straight into it
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      type="search"
      class="inp list-search"
      aria-label={`Search ${label}`}
      placeholder={`Search ${label}…`}
      data-tour={tour}
      value={value}
      onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && value) {
          e.stopPropagation();
          onInput('');
        }
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

/** What a filtered list says when nothing matches. */
export function NoMatch({ q, what }: { q: string; what: string }) {
  return q ? (
    <span class="muted small no-match">
      No {what} match “{q}”.
    </span>
  ) : null;
}

/** lists shorter than this need no search box (a pop-up picker, a dropdown) */
export const SEARCH_FROM = 7;

/**
 * A search for a dropdown list (a select with a preview next to it): 🔍 opens a box that hides the choices
 * that do not match, so the list shows only those; Enter picks the first match, Esc closes. The select itself
 * is unchanged, so everything that sets it (scripts, the tutorial, the AI) works as before.
 */
export function SearchSelect({ label, children }: { label: string; children: ComponentChildren }) {
  const box = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [many, setMany] = useState(false);
  const select = () => box.current?.querySelector('select') ?? null;
  // after every redraw (new options come with the parent's redraw): hide the choices that do not match
  useLayoutEffect(() => {
    const s = select();
    if (!s) return;
    const opts = [...s.options];
    const longList = opts.length >= SEARCH_FROM;
    if (longList !== many) setMany(longList);
    for (const o of opts) o.hidden = !!q && o.value !== s.value && !matches(q, o.text, o.value);
  });
  const first = () => [...(select()?.options ?? [])].find((o) => !o.hidden && o.value && matches(q, o.text, o.value));
  return (
    <span class="search-select" ref={box}>
      {children}
      {many &&
        (open ? (
          <SearchBox
            label={label}
            value={q}
            autoFocus
            onInput={(v) => {
              setQ(v);
              if (!v) setOpen(false);
            }}
            onEnter={() => {
              const o = first();
              const s = select();
              if (o && s) {
                s.value = o.value;
                s.dispatchEvent(new Event('change', { bubbles: true }));
              }
              setQ('');
              setOpen(false);
            }}
          />
        ) : (
          <button
            type="button"
            class="btn icon search-toggle"
            aria-label={`Search ${label}`}
            data-tip={`Find a ${label.replace(/s$/, '')} by name: only the matches stay in the list`}
            onClick={() => setOpen(true)}
          >
            🔍
          </button>
        ))}
    </span>
  );
}
