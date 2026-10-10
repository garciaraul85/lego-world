import { BUILTIN_ASSETS, builtinAsset } from '../builtin/assets';
import type { Command } from '../core/commands';
import { type Asset, paths } from '../core/schema';
import type { EditorState } from './state';

/** A project asset, or a built-in one not copied into the project yet. */
export function resolveAsset(ed: EditorState, id: string | null): Asset | null {
  if (!id) return null;
  return ed.store.get<Asset>(paths.asset(id)) ?? builtinAsset(id);
}

/** Project assets first (user, then generated), then built-ins the project does not have yet. */
export function assetLibrary(ed: EditorState): { asset: Asset; inProject: boolean }[] {
  const own = ed.store.list('assets/').map((p) => ed.store.get<Asset>(p)!);
  const have = new Set(own.map((a) => a.id));
  const rank = (a: Asset) => (a.origin === 'user' ? 0 : a.origin === 'builtin' ? 1 : 2);
  return [
    ...own
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .map((asset) => ({ asset, inProject: true })),
    ...BUILTIN_ASSETS.filter((a) => !have.has(a.id)).map((asset) => ({ asset, inProject: false })),
  ];
}

/** Commands that place an asset, copying a built-in into the project first when needed. */
export function placeCommands(ed: EditorState, id: string, pos: [number, number, number], rot: number): Command[] {
  const cmds: Command[] = [];
  if (!ed.store.has(paths.asset(id))) {
    const b = builtinAsset(id);
    if (b) cmds.push({ type: 'asset.create', payload: { asset: b } });
  }
  cmds.push({ type: 'asset.place', payload: { map: ed.mapId.value, asset: id, pos, rot } });
  return cmds;
}
