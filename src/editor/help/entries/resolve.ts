import type { HelpEntry, Match } from './types';

/** Controls Help covers: anything a person can click, type in, drag or pick. */
export const CONTROL_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'select',
  'textarea',
  'canvas',
  '[role=button]',
  '[role=tab]',
  '[role=option]',
  '[role=radio]',
  '[role=menuitem]',
  '[role=checkbox]',
  '[role=slider]',
  '[role=treeitem]',
].join(', ');

/** The role a control plays, from its role attribute or its tag. */
export function roleOf(el: Element): string {
  const r = el.getAttribute('role');
  if (r && r !== 'presentation') return r;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type;
    return t === 'checkbox' ? 'checkbox' : t === 'radio' ? 'radio' : t === 'range' ? 'slider' : 'textbox';
  }
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'a') return 'link';
  return tag;
}

/** The name a person (or a screen reader) knows a control by. */
export function accessibleName(el: Element): string {
  const h = el as HTMLElement;
  const label = el.getAttribute('aria-label');
  if (label) return clean(label);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const t = by
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (t.trim()) return clean(t);
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels?.length) {
    // a label wrapping its control also holds the control's own text (a select's options): leave that out
    const own = el.textContent ?? '';
    const t = clean([...labels].map((l) => (l.textContent ?? '').replace(own, '')).join(' '));
    if (t) return t;
  }
  const title = el.getAttribute('title') || el.getAttribute('data-tip');
  const text = clean(h.innerText ?? el.textContent ?? '');
  // content names a control first (as screen readers do), unless it is only a symbol like ✕ or ↖
  if (text && el.tagName !== 'SELECT' && (/[\p{L}\p{N}]/u.test(text) || !title)) return text;
  return clean(title || el.getAttribute('placeholder') || text || '');
}
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function holds(el: Element, m: Match, name: string, role: string): number {
  let score = 0;
  if (m.sel) {
    if (!el.matches(m.sel)) return -1;
    score += 8;
  }
  if (m.name !== undefined) {
    const ok = typeof m.name === 'string' ? name.toLowerCase().startsWith(m.name.toLowerCase()) : m.name.test(name);
    if (!ok) return -1;
    score += 4 + (typeof m.name === 'string' ? Math.min(m.name.length, 40) / 100 : 0.2);
  }
  if (m.role) {
    if (m.role !== role) return -1;
    score += 2;
  }
  if (m.in) {
    const box = el.closest(m.in);
    if (!box) return -1;
    // the nearer the container, the better
    let d = 0;
    for (let p: Element | null = el; p && p !== box; p = p.parentElement) d++;
    score += 1 + 1 / (1 + d);
  }
  return score;
}

/** The Help entry for a control, or null when nothing describes it. */
export function entryForElement(el: Element, entries: readonly HelpEntry[]): HelpEntry | null {
  const name = accessibleName(el);
  const role = roleOf(el);
  let best: HelpEntry | null = null;
  let bestScore = 0;
  // a panel can name the entry that describes everything in it (data-help); specific matches still win
  const tagged = el.closest('[data-help]')?.getAttribute('data-help');
  if (tagged) {
    best = entries.find((e) => e.id === tagged) ?? null;
    if (best) bestScore = 3.5;
  }
  for (const e of entries)
    for (const m of e.match ?? []) {
      const s = holds(el, m, name, role);
      if (s > bestScore) {
        best = e;
        bestScore = s;
      }
    }
  return best;
}

/** The entry for whatever is at (or around) an element: the control itself, then the controls it sits in. */
export function entryNear(el: Element | null, entries: readonly HelpEntry[]): HelpEntry | null {
  for (let p = el, i = 0; p && i < 10; p = p.parentElement, i++) {
    const e = entryForElement(p, entries);
    if (e) return e;
  }
  return null;
}

/** Every visible control on the page, for coverage checks and screenshots. */
export function visibleControls(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter((el) => {
    if (el.closest('[aria-hidden="true"], .help-back, .hovertip')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && !(el as HTMLInputElement).hidden;
  });
}

/** Where each entry's controls and areas are on the page now (for screenshots with callouts). */
export function entryRects(entries: readonly HelpEntry[]): Record<string, [number, number, number, number][]> {
  const out: Record<string, [number, number, number, number][]> = {};
  const add = (id: string, el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0) return;
    out[id] ??= [];
    const list = out[id];
    const rect: [number, number, number, number] = [
      Math.round(r.left),
      Math.round(r.top),
      Math.round(r.width),
      Math.round(r.height),
    ];
    if (!list.some((x) => x.join() === rect.join())) list.push(rect);
  };
  // areas first (a screen guide numbers an area by its first box): the element an entry names with a selector of its own
  for (const e of entries)
    for (const m of e.match ?? [])
      if (m.sel && !m.name && !m.in && !m.role)
        for (const el of document.querySelectorAll(m.sel)) if (!el.closest('[aria-hidden="true"]')) add(e.id, el);
  for (const el of visibleControls()) {
    const e = entryForElement(el, entries);
    if (e) add(e.id, el);
  }
  return out;
}
