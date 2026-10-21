import { DRIFT_INFO, DRIFTS, GRADE_INFO, GRADES } from '../../../core/effects/screen';
import { newId } from '../../../core/ids';
import { FOG_PRESET, FOG_PRESETS } from '../../../core/lighting/atmosphere';
import type { ArgKind, NodeDef, PinType } from '../../../core/logic/catalog';
import { NAME_KINDS, type NameKind, namedThings } from '../../../core/logic/code/names';
import { type Asset, type LogicGraph, paths, TIMES, type Variables } from '../../../core/schema';
import type { EditorState } from '../../state';

export const NODE_W = 200;
export const HEAD = 26;
export const ROW = 22;

export const CAT_COLOR: Record<string, string> = {
  Events: '#4fd1c5',
  Flow: '#c792ea',
  Variables: '#f2b632',
  Math: '#82aaff',
  Compare: '#82aaff',
  World: '#79b44c',
  Audio: '#c3e88d',
  Screens: '#f78c6c',
  Cinematics: '#e990b3',
  Misc: '#9aa4b2',
  Notes: '#ffd277',
  Health: '#ff8a7a',
};

export const PIN_COLOR: Record<PinType, string> = {
  exec: '#e6eaf0',
  bool: '#f78c6c',
  number: '#82aaff',
  string: '#c3e88d',
  entity: '#4fd1c5',
  asset: '#4fd1c5',
  character: '#4fd1c5',
  map: '#4fd1c5',
  screen: '#f78c6c',
  cinematic: '#e990b3',
  sound: '#c3e88d',
  music: '#c3e88d',
  any: '#9aa4b2',
};

/** Rows a node draws: inputs on the left, outputs on the right, one row each. */
export function nodeRows(def: NodeDef) {
  return Math.max(def.inputs.length, def.outputs.length, 1);
}
export function nodeHeight(def: NodeDef, hasSummary: boolean) {
  return HEAD + nodeRows(def) * ROW + (hasSummary ? 18 : 0) + 8;
}
export function pinPos(
  n: LogicGraph['nodes'][number],
  def: NodeDef,
  pin: string,
  side: 'in' | 'out',
): [number, number] {
  const list = side === 'in' ? def.inputs : def.outputs;
  const i = Math.max(
    0,
    list.findIndex((p) => p.name === pin),
  );
  return [n.pos[0] + (side === 'in' ? 0 : NODE_W), n.pos[1] + HEAD + 4 + i * ROW + ROW / 2];
}

export const graphs = (ed: EditorState) =>
  ed.store
    .list('logic/')
    .filter((p) => /\/lg_[0-9a-z]{10}\.json$/.test(p))
    .map((p) => ed.store.get<LogicGraph>(p)!)
    .sort((a, b) => a.name.localeCompare(b.name));

export const variables = (ed: EditorState) => ed.store.get<Variables>(paths.variables)?.vars ?? {};

/**
 * Choices for an arg editor (zones, assets, spawns, sounds, music, screens, scenes…), labelled for people. P9b.1:
 * every setting that names something is picked from a list; the value stays the id.
 */
export function argChoices(ed: EditorState, kind: ArgKind): { value: string; label: string; note?: string }[] | null {
  if (kind === 'var') return Object.keys(variables(ed)).map((v) => ({ value: v, label: v }));
  if (kind === 'asset')
    return ed.store
      .list('assets/')
      .map((p) => ed.store.get<Asset>(p)!)
      .filter((a) => a.origin !== 'generated' || a.sockets.length)
      .map((a) => ({ value: a.id, label: a.name }));
  // P23 part 2: a screen mood's colour grade and what drifts across
  if (kind === 'grade') return GRADES.map((g) => ({ value: g, label: GRADE_INFO[g].label }));
  if (kind === 'drift') return DRIFTS.map((d) => ({ value: d, label: DRIFT_INFO[d] }));
  // P27 part 2: a time of day, and a fog
  if (kind === 'time') return TIMES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }));
  if (kind === 'fog')
    return [
      { value: 'map', label: 'The map’s own' },
      { value: 'none', label: 'None' },
      ...FOG_PRESETS.map((f) => ({ value: f, label: FOG_PRESET[f].name, note: FOG_PRESET[f].about })),
    ];
  if (!(NAME_KINDS as readonly string[]).includes(kind)) return null;
  const all = namedThings(ed.store)[kind as NameKind];
  const maps = all.length && (kind === 'zone' || kind === 'spawn');
  return all.map((t) => ({
    value: t.id,
    label: maps ? `${t.name} · ${t.note.replace(/^.* on /, '').split(' · ')[0]}` : t.name,
    note: t.note,
  }));
}

/** P9c: who a script belongs to: the placed object's own name, else its asset's name, and its map */
export function ownerOf(ed: EditorState, owner: string | undefined): { name: string; map: string } | null {
  if (!owner) return null;
  for (const p of ed.store.list('maps/')) {
    if (!p.endsWith('/instances.json')) continue;
    const item = ed.store
      .get<{ items: { id: string; kind: string; name?: string; asset?: string; character?: string }[] }>(p)
      ?.items.find((i) => i.id === owner);
    if (!item) continue;
    const map = p.split('/')[1]!;
    if (item.name) return { name: item.name, map };
    if (item.asset) return { name: ed.store.get<Asset>(paths.asset(item.asset))?.name ?? 'an object', map };
    if (item.character)
      return { name: ed.store.get<{ name: string }>(paths.character(item.character))?.name ?? 'a neighbour', map };
    return { name: 'an object', map };
  }
  return { name: 'a removed object', map: '' };
}

/** A new graph with one event node (P4.6 "Open in Logic"). */
export function newGraph(name: string, event?: { type: string; args?: Record<string, unknown> }): LogicGraph {
  return {
    id: newId('logic'),
    name,
    scope: 'global',
    nodes: event ? [{ id: 'n1', type: event.type, pos: [40, 60], ...(event.args ? { args: event.args } : {}) }] : [],
    edges: [],
  };
}
