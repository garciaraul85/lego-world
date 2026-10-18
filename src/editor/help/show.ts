import type { ActionCtx } from '../actions/registry';
import { entryForElement, helpEntries, helpEntry, SCREENS, visibleControls } from './entries';

/**
 * P32 “Show me where it is”: finds the control a Help entry describes on the live editor (opening its
 * workspace first when needed), scrolls it into view and makes it pulse for a moment.
 */
export function showControl(c: ActionCtx, id: string, tries = 0): void {
  const e = helpEntry(id);
  if (!e) return;
  const el = findControl(id);
  if (el) {
    flash(el);
    return;
  }
  const ws = SCREENS.find((s) => s.id === e.screen)?.workspace;
  if (tries === 0 && ws && c.ed.workspace.value !== ws) {
    c.ui.workspace(ws);
    // the workspace renders on the next frames
    setTimeout(() => showControl(c, id, 1), 120);
    return;
  }
  c.ed.notify(`${e.name} isn't on screen right now. ${e.steps?.[0] ?? ''}`.trim());
}

/** The control (or area) a Help entry describes, when it is on screen now. */
export function findControl(id: string, preferArea = false): HTMLElement | null {
  const e = helpEntry(id);
  if (!e) return null;
  const entries = helpEntries();
  const area = () => findArea(e.match?.map((m) => m.sel).filter((s): s is string => !!s) ?? []);
  const control = () => visibleControls().find((x) => entryForElement(x, entries)?.id === id) ?? null;
  if (!preferArea) return control() ?? area();
  // Brix's Show me rings the whole setting (its row or small section) when the entry names one
  const c = control();
  for (const m of e.match ?? []) {
    const box = m.in ? c?.closest<HTMLElement>(m.in) : null;
    if (box && box.getBoundingClientRect().height < 220) return box;
  }
  return area() ?? c;
}

function findArea(sels: string[]): HTMLElement | null {
  for (const s of sels) {
    const el = document.querySelector<HTMLElement>(s);
    if (el && el.getBoundingClientRect().width > 0) return el;
  }
  return null;
}

export function flash(el: HTMLElement) {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const ring = document.createElement('div');
  ring.className = 'help-flash';
  ring.setAttribute('aria-hidden', 'true');
  Object.assign(ring.style, {
    left: `${r.left - 4}px`,
    top: `${r.top - 4}px`,
    width: `${r.width + 8}px`,
    height: `${r.height + 8}px`,
  });
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 2600);
}
