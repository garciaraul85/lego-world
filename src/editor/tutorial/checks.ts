import type { Command } from '../../core/commands';
import { type Asset, type Cinematic, type Clip, paths, type Screen } from '../../core/schema';
import { assetLibrary } from '../assets';
import type { EditorState } from '../state';
import { CODING_TESTS } from './coding';

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
  // P32: the Character studio's clip, one click at a time
  clipOpen: (ed) => !!openClip(ed),
  clipTrack: (ed, a) => !!clipTrack(ed, a as TrackArg),
  clipTime: (ed, a) => {
    const { t, within = 0.2 } = a as { t: number; within?: number };
    return Math.abs(ed.clipTime.value - t) <= within;
  },
  clipKey: (ed, a) => {
    const { t, within = 0.2, atLeast } = a as TrackArg & { t: number; within?: number; atLeast?: number };
    return !!clipTrack(ed, a as TrackArg)?.keys.some(
      (k) => Math.abs(k[0] - t) <= within && (atLeast === undefined || k[1] >= atLeast),
    );
  },
  clipPlaying: (ed) => ed.clipPlaying.value && !!openClip(ed),
  studioAssetIs: (ed, a) => {
    const id = ed.studioAsset.value;
    return (
      !!id &&
      (ed.store.get<Asset>(paths.asset(id))?.name ?? assetLibrary(ed).find((x) => x.asset.id === id)?.asset.name) === a
    );
  },
  // P32: an asset's interactions
  assetActions: (ed, a) => {
    const { name, atLeast } = a as { name: string; atLeast: number };
    return projectAsset(ed, name)?.interactions.some((i) => i.do.length >= atLeast) ?? false;
  },
  assetDoes: (ed, a) => {
    const { name, does } = a as { name: string; does: string };
    return projectAsset(ed, name)?.interactions.some((i) => i.do.some((x) => x.do === does)) ?? false;
  },
  ...CODING_TESTS,
};

type TrackArg = { bone: string; prop: string };
function openClip(ed: EditorState): Clip | null {
  const id = ed.studioClip.value;
  return id ? (ed.store.get<Clip>(paths.clip(id)) ?? null) : null;
}
const clipTrack = (ed: EditorState, a: TrackArg) =>
  openClip(ed)?.tracks.find((t) => t.bone === a.bone && t.prop === a.prop) ?? null;
const projectAsset = (ed: EditorState, name: string) =>
  ed.store
    .list('assets/')
    .map((p) => ed.store.get<Asset>(p)!)
    .find((x) => x?.name === name) ?? null;

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
