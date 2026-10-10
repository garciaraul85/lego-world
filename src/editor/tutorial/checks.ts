import type { Command } from '../../core/commands';
import { type Cinematic, paths, type Screen } from '../../core/schema';
import { assetLibrary } from '../assets';
import type { EditorState } from '../state';

/** Named tests for `state` checks (P7.3). They read the editor; none of them changes anything. */
export const STATE_TESTS: Record<string, (ed: EditorState, args: unknown) => boolean> = {
  menuOpen: (ed, a) => ed.menu.value === a,
  paletteOpen: (ed) => ed.palette.value,
  rightTab: (ed, a) => ed.right.value === a,
  dockTab: (ed, a) => ed.dock.value === a,
  workspace: (ed, a) => ed.workspace.value === a,
  hasSelection: (ed) => ed.selection.value.size > 0,
  canRedo: (ed) => ed.bus.canRedo(),
  logicView: (ed, a) => ed.logicView.value === a,
  exported: (ed) => ed.exports.value > 0,
  assetBrush: (ed, a) => {
    const id = ed.assetBrush.value.asset;
    return !!id && assetLibrary(ed).some((x) => x.asset.id === id && x.asset.name === a);
  },
  hudShows: (ed, a) => {
    for (const p of ed.store.list('screens/')) {
      const s = ed.store.get<Screen>(p)!;
      if (s.kind === 'hud' && JSON.stringify(s.root).includes(String(a))) return true;
    }
    return false;
  },
  cinematicShots: (ed, a) =>
    ed.store
      .list('cinematics/')
      .some(
        (p) => (ed.store.get<Cinematic>(p)!.tracks.find((t) => t.kind === 'camera')?.items.length ?? 0) >= Number(a),
      ),
  projectHas: (ed, a) => ed.store.has(paths.cinematic(String(a))),
};

/** true when `payload` has every field of `where` (deep, arrays compared as sets of items) */
export function matches(payload: unknown, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  for (const [k, v] of Object.entries(where)) {
    const got = p[k];
    if (Array.isArray(v)) {
      if (!Array.isArray(got) || !v.every((x) => got.some((g) => JSON.stringify(g) === JSON.stringify(x))))
        return false;
    } else if (v && typeof v === 'object') {
      if (!matches(got, v as Record<string, unknown>)) return false;
    } else if (got !== v) return false;
  }
  return true;
}

export function commandMatches(cmds: readonly Command[], type: string, where?: Record<string, unknown>) {
  return cmds.some((c) => c.type === type && matches(c.payload, where));
}
