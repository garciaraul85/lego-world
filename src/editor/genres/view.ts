import { signal } from '@preact/signals';
import { genreById } from '../../builtin/genres';
import { type Genre, showsControl } from '../../core/genres/types';
import { type Cinematic, type LogicGraph, paths } from '../../core/schema';
import type { EditorState } from '../state';
import { type ControlKind, KIND_NAMES, tagsOf } from './controls';

/**
 * P18: what the editor shows. The project's genre (project.json) picks a view; Open shows every control.
 * “Show everything” is a per-device switch that shows every control without changing the project. Pins,
 * hides and recently used logic nodes are kept per device and per genre.
 */

type Prefs = { pin: string[]; hide: string[]; recent: string[] };
const EMPTY: Prefs = { pin: [], hide: [], recent: [] };
const PREFS_KEY = (genre: string) => `bw.controls.${genre}`;
const OPEN_KEY = 'bw.showEverything';

/** bumps when a pin, hide, recent or the Show everything switch changes (components read it to redraw) */
export const viewRev = signal(0);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the change lasts until the page closes */
  }
  viewRev.value++;
}

/** Projects showing every control on this device (by project id). */
function showingEverything(ed: EditorState): boolean {
  return read<string[]>(OPEN_KEY, []).includes(ed.store.manifest.id);
}

/** The project's genre. */
export function projectGenre(ed: EditorState): Genre {
  return genreById(ed.store.manifest.genre);
}

/** The genre whose view the editor shows now (Open while Show everything is on). */
export function viewGenre(ed: EditorState): Genre {
  viewRev.value;
  ed.revision.value;
  return showingEverything(ed) ? genreById('open') : projectGenre(ed);
}

/** Show everything on this device (true), or go back to the project's genre view (false). */
export function setShowEverything(ed: EditorState, on: boolean) {
  const id = ed.store.manifest.id;
  const list = read<string[]>(OPEN_KEY, []).filter((x) => x !== id);
  write(OPEN_KEY, on ? [...list, id] : list);
}
export const isShowingEverything = (ed: EditorState) => {
  viewRev.value;
  return showingEverything(ed);
};

export function prefsOf(genre: string): Prefs {
  viewRev.value;
  return { ...EMPTY, ...read<Partial<Prefs>>(PREFS_KEY(genre), {}) };
}
const key = (kind: ControlKind, id: string) => `${kind}:${id}`;

/** Does the current view show this control? (a pin shows it, a hide hides it, in this genre) */
export function shows(ed: EditorState, kind: ControlKind, id: string): boolean {
  const g = viewGenre(ed);
  const p = prefsOf(g.id);
  const k = key(kind, id);
  if (p.hide.includes(k)) return false;
  if (p.pin.includes(k)) return true;
  return showsControl(g, tagsOf(kind, id));
}

export const isPinned = (ed: EditorState, kind: ControlKind, id: string) =>
  prefsOf(viewGenre(ed).id).pin.includes(key(kind, id));

/** Pin a control to the view (it shows, first), hide it, or put it back as the genre has it. */
export function setControl(ed: EditorState, kind: ControlKind, id: string, how: 'pin' | 'hide' | 'reset') {
  const g = viewGenre(ed).id;
  const p = prefsOf(g);
  const k = key(kind, id);
  const next: Prefs = {
    ...p,
    pin: p.pin.filter((x) => x !== k).concat(how === 'pin' ? [k] : []),
    hide: p.hide.filter((x) => x !== k).concat(how === 'hide' ? [k] : []),
  };
  write(PREFS_KEY(g), next);
}

/** Forget this genre's pins, hides and recent list on this device. */
export function resetControls(ed: EditorState) {
  write(PREFS_KEY(viewGenre(ed).id), EMPTY);
}

/** A logic node was just used: it rises to “Recent” in the node list (last 6). */
export function noteRecent(ed: EditorState, nodeType: string) {
  const g = viewGenre(ed).id;
  const p = prefsOf(g);
  write(PREFS_KEY(g), { ...p, recent: [nodeType, ...p.recent.filter((x) => x !== nodeType)].slice(0, 6) });
}

/** Workspace tabs: the genre's tabs in its order, then the rest (under More). */
export function tabsInView(ed: EditorState, all: readonly string[]): { main: string[]; more: string[] } {
  const g = viewGenre(ed);
  const main = g.tabs.filter((w) => all.includes(w) && shows(ed, 'tab', w));
  const pinned = all.filter((w) => !main.includes(w) && isPinned(ed, 'tab', w));
  return { main: [...main, ...pinned], more: all.filter((w) => !main.includes(w) && !pinned.includes(w)) };
}

/** What the project uses that the current view hides (so nothing is lost from sight). */
export type HiddenUse = { kind: ControlKind; id: string; what: string; where: string };
export function hiddenInUse(ed: EditorState): HiddenUse[] {
  const out: HiddenUse[] = [];
  const g = viewGenre(ed);
  if (g.features === 'all') return out;
  const node = (type: string) => type;
  for (const p of ed.store.list('logic/lg_')) {
    const lg = ed.store.get<LogicGraph>(p);
    if (!lg) continue;
    const seen = new Set<string>();
    for (const n of lg.nodes) {
      if (seen.has(n.type) || shows(ed, 'node', node(n.type))) continue;
      seen.add(n.type);
      out.push({ kind: 'node', id: n.type, what: `${KIND_NAMES.node} ${n.type}`, where: `graph ${lg.name}` });
    }
  }
  const tabUse: [string, boolean][] = [
    ['Cinematics', ed.store.list('cinematics/').some((p) => !!ed.store.get<Cinematic>(p))],
    ['World graph', ed.store.list('maps/').filter((p) => p.endsWith('/map.json')).length > 1],
    ['Logic', ed.store.list('logic/lg_').length > 0],
    ['Characters', ed.store.list('characters/').length > 0],
  ];
  for (const [tab, used] of tabUse)
    if (used && !shows(ed, 'tab', tab))
      out.push({ kind: 'tab', id: tab, what: `the ${tab} screen`, where: 'this game' });
  // P9a: health on the game's own assets and neighbours, when the view hides its section
  if (!shows(ed, 'section', 'asset.health'))
    for (const p of ed.store.list('assets/')) {
      const a = ed.store.get<{ name: string; health?: unknown }>(p);
      if (a?.health) out.push({ kind: 'section', id: 'asset.health', what: 'health', where: `asset ${a.name}` });
    }
  if (!shows(ed, 'section', 'character.harm'))
    for (const p of ed.store.list('characters/')) {
      const c = ed.store.get<{ name: string; harm?: { canBeHarmed: boolean } }>(p);
      if (c?.harm?.canBeHarmed)
        out.push({ kind: 'section', id: 'character.harm', what: '“Can be harmed”', where: `character ${c.name}` });
    }
  return out;
}

/** The project file the genre lives in (for Help and the AI). */
export const GENRE_FILE = paths.project;
