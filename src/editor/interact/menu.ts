import { signal } from '@preact/signals';
import { ACTIONS, type ActionCtx } from '../actions/registry';

/**
 * P31 interaction layer: one right-click menu for the whole editor. Menus are lists of entries; an entry is
 * either a registry action (so the menu, the menu bar, shortcuts and Brix all run the same code) or a one-off
 * item. Only one menu is open at a time.
 */
export type MenuEntry =
  | { kind: 'action'; id: string; label?: string }
  | { kind: 'item'; id: string; label: string; key?: string; run: () => void; disabled?: boolean; danger?: boolean }
  | { kind: 'sep' };

export type ResolvedItem = {
  id: string;
  label: string;
  key?: string;
  disabled: boolean;
  danger: boolean;
  /** shown greyed with the phase that delivers it */
  later?: string;
  run: () => void;
};
export type ResolvedEntry = ResolvedItem | { sep: true };

export type MenuSpec = {
  /** what was right-clicked, shown at the top of the menu ("This object", "Floor switch") */
  title: string;
  /** the Help page that explains this kind of thing (the last item, "Help about …") */
  help?: { page: string; label: string };
  entries: MenuEntry[];
};

export type OpenMenu = { x: number; y: number; title: string; items: ResolvedEntry[] };

export const openMenuState = signal<OpenMenu | null>(null);

const DANGER = new Set(['edit.delete']);

/** Turns entries into what the menu shows: labels, shortcuts and disabled states from the registry. */
export function resolveMenu(c: ActionCtx, spec: MenuSpec): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const e of spec.entries) {
    if (e.kind === 'sep') {
      if (out.length && !('sep' in out[out.length - 1]!)) out.push({ sep: true });
      continue;
    }
    if (e.kind === 'item') {
      out.push({
        id: e.id,
        label: e.label,
        ...(e.key ? { key: e.key } : {}),
        disabled: !!e.disabled,
        danger: !!e.danger,
        run: e.run,
      });
      continue;
    }
    const a = ACTIONS.find((x) => x.id === e.id);
    if (!a) throw new Error(`menu: unknown action ${e.id}`);
    out.push({
      id: a.id,
      label: e.label ?? a.label,
      ...(a.key ? { key: a.key } : {}),
      disabled: !!a.later || (a.when ? !a.when(c) : false),
      danger: DANGER.has(a.id),
      ...(a.later ? { later: a.later } : {}),
      run: () => a.run(c),
    });
  }
  if (spec.help) {
    const help = spec.help;
    if (out.length && !('sep' in out[out.length - 1]!)) out.push({ sep: true });
    out.push({
      id: 'help.about-this',
      label: help.label,
      disabled: false,
      danger: false,
      run: () => c.ui.help(help.page),
    });
  }
  // a delete-like item always comes last, after a separator
  const di = out.findIndex((x) => 'danger' in x && x.danger);
  if (di >= 0 && di !== out.length - 1) {
    const [d] = out.splice(di, 1);
    if (!('sep' in out[out.length - 1]!)) out.push({ sep: true });
    out.push(d!);
  }
  while (out.length && 'sep' in out[out.length - 1]!) out.pop();
  return out;
}

/** Opens a menu at a screen point; the menu is clamped to the window when it is drawn. */
export function openMenu(c: ActionCtx, spec: MenuSpec, x: number, y: number): OpenMenu {
  const m = { x, y, title: spec.title, items: resolveMenu(c, spec) };
  openMenuState.value = m;
  return m;
}

export function closeMenu() {
  openMenuState.value = null;
}

/** Runs one item by id (used by keyboard, tests and Brix's "show me"). Returns false if it is missing or disabled. */
export function runMenuItem(id: string): boolean {
  const m = openMenuState.value;
  const it = m?.items.find((x): x is ResolvedItem => !('sep' in x) && x.id === id);
  if (!it || it.disabled) return false;
  closeMenu();
  it.run();
  return true;
}
