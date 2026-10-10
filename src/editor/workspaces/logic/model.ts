import { newId } from '../../../core/ids';
import type { ArgKind, NodeDef, PinType } from '../../../core/logic/catalog';
import { type Asset, type Gates, type LogicGraph, type MapDoc, paths, type Variables } from '../../../core/schema';
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

/** Choices for an arg editor (zones, assets, spawns...), labelled for people. */
export function argChoices(ed: EditorState, kind: ArgKind): { value: string; label: string }[] | null {
  const maps = (ed.store.get<Gates>(paths.gates)?.mapOrder ?? [])
    .map((id) => ed.store.get<MapDoc>(paths.map(id))!)
    .filter(Boolean);
  switch (kind) {
    case 'var':
      return Object.keys(variables(ed)).map((v) => ({ value: v, label: v }));
    case 'zone':
      return maps.flatMap((m) => m.zones.map((z) => ({ value: z.id, label: `${z.tags[0] ?? 'Zone'} · ${m.name}` })));
    case 'spawn':
      return maps.flatMap((m) => m.spawns.map((s) => ({ value: s.id, label: `${s.name} · ${m.name}` })));
    case 'map':
      return maps.map((m) => ({ value: m.id, label: m.name }));
    case 'asset':
      return ed.store
        .list('assets/')
        .map((p) => ed.store.get<Asset>(p)!)
        .filter((a) => a.origin !== 'generated' || a.sockets.length)
        .map((a) => ({ value: a.id, label: a.name }));
    default:
      return null;
  }
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
