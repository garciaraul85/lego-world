import { BUILTIN_ASSETS, builtinAsset } from '../builtin/assets';
import type { Command } from '../core/commands';
import { newId } from '../core/ids';
import { stableStringify } from '../core/json/stable';
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
  const rank = (a: Asset) => (a.origin === 'generated' ? 2 : a.origin === 'builtin' ? 1 : 0);
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

/** P32: two asset definitions are the same, whatever order their fields are in. */
export const sameAsset = (a: Asset | null | undefined, b: Asset | null | undefined) =>
  !!a && !!b && stableStringify(a) === stableStringify(b);

/** P32: built-in assets the project has changed (the chest after the tutorial, say). */
export function changedBuiltins(ed: EditorState): Asset[] {
  return ed.store
    .list('assets/')
    .map((p) => ed.store.get<Asset>(p)!)
    .filter((a) => a?.origin === 'builtin' && builtinAsset(a.id) && !sameAsset(a, builtinAsset(a.id)));
}

/** P32: a new asset with one red brick, the way + New asset starts one. */
export function newAssetDef(ed: EditorState): Asset {
  return {
    id: newId('asset'),
    name: `New asset ${assetLibrary(ed).length + 1}`,
    category: 'prop',
    bricks: [[0, 0, 0, 0, 0, 0, 0]],
    palette: { types: ['brick2x4'], colors: ['#d20c20'] },
    pivot: [0, 0, 0],
    footprint: [4, 2],
    sockets: [],
    states: ['default'],
    initialState: 'default',
    interactions: [],
    smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
    generator: null,
    origin: 'user',
  };
}
