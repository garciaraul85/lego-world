import { nodeDef } from '../../../core/logic/catalog';
import { type Asset, type Instances, type LogicGraph, type MapDoc, paths, type Variables } from '../../../core/schema';
import { assetLibrary } from '../../assets';
import type { Choice } from '../../components/ChoiceOrText';
import type { EditorState } from '../../state';

/**
 * P32: what a logic field can refer to — so a name is picked from what the project really has, and a typed
 * one can be checked (an object that is not placed, a state the asset does not have).
 */

/** Every map's placed objects, by their asset's name: “Treasure chest — placed on Practice map”. */
export function placedObjects(ed: EditorState): Choice[] {
  const where = new Map<string, Map<string, number>>();
  for (const p of ed.store.list('maps/')) {
    if (!p.endsWith('/map.json')) continue;
    const m = ed.store.get<MapDoc>(p)!;
    for (const i of ed.store.get<Instances>(paths.instances(m.id))?.items ?? []) {
      if (i.kind !== 'asset') continue;
      const a = assetByRef(ed, i.asset);
      if (!a) continue;
      const maps = where.get(a.name) ?? new Map<string, number>();
      maps.set(m.name, (maps.get(m.name) ?? 0) + 1);
      where.set(a.name, maps);
    }
  }
  return [...where]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, maps]) => ({
      value: name,
      label: name,
      note: `placed on ${[...maps].map(([m, n]) => (n > 1 ? `${m} (${n} copies)` : m)).join(', ')}`,
    }));
}

/** An asset by id or by name (the project's own first, then the built-in library). */
export function assetByRef(ed: EditorState, ref: string): Asset | null {
  const lib = assetLibrary(ed).map((x) => x.asset);
  return lib.find((a) => a.id === ref) ?? lib.find((a) => a.name.toLowerCase() === ref.trim().toLowerCase()) ?? null;
}

/** Every asset's name, for “what to put there” fields. */
export function assetNames(ed: EditorState): Choice[] {
  const seen = new Set<string>();
  const out: Choice[] = [];
  for (const { asset, inProject } of assetLibrary(ed)) {
    if (seen.has(asset.name)) continue;
    seen.add(asset.name);
    out.push({ value: asset.name, label: asset.name, note: inProject ? 'in this game' : 'built-in' });
  }
  return out;
}

/** An asset's states, for Set state's “state” field. */
export function statesOf(asset: Asset | null): Choice[] {
  return (asset?.states ?? []).map((s) => ({
    value: s,
    label: s,
    note: s === asset!.initialState ? `${asset!.name} starts in this state` : `a state of ${asset!.name}`,
  }));
}

/**
 * The asset a node's object input points at: a name or id typed on the node, or — when it is wired from
 * Spawn item at object — the item that node puts down (its typed name, or the starting value of the variable
 * wired into it).
 */
export function assetOfInput(ed: EditorState, g: LogicGraph, node: string, pin: string): Asset | null {
  const n = g.nodes.find((x) => x.id === node);
  const edge = g.edges.find((e) => e[2] === node && e[3] === pin);
  if (!edge) {
    const v = n?.args?.[pin];
    return typeof v === 'string' && v ? assetByRef(ed, v) : null;
  }
  const src = g.nodes.find((x) => x.id === edge[0]);
  if (src?.type !== 'world.spawnNear') return null;
  const itemEdge = g.edges.find((e) => e[2] === src.id && e[3] === 'item');
  if (!itemEdge) return assetByRef(ed, String(src.args?.item ?? 'Sword'));
  const v = g.nodes.find((x) => x.id === itemEdge[0]);
  if (v?.type === 'var.get') {
    const def = ed.store.get<Variables>(paths.variables)?.vars[String(v.args?.var)];
    return typeof def?.default === 'string' ? assetByRef(ed, def.default) : null;
  }
  return null;
}

/** Where a variable is used: graphs that read or change it, screens that show it, scenes that set it. */
export function variableUses(ed: EditorState, name: string): string[] {
  const out: string[] = [];
  for (const p of ed.store.list('logic/lg_')) {
    const g = ed.store.get<LogicGraph>(p)!;
    if (g.nodes.some((n) => n.type.startsWith('var.') && n.args?.var === name)) out.push(`graph ${g.name}`);
  }
  for (const p of ed.store.list('screens/')) {
    const s = ed.store.get<{ name?: string }>(p);
    if (JSON.stringify(s).includes(`{${name}}`)) out.push(`screen ${s?.name ?? p.slice(8, -5)}`);
  }
  for (const p of ed.store.list('cinematics/')) {
    const c = ed.store.get<{ name: string }>(p)!;
    if (JSON.stringify(c).includes(`"setVar":"${name}"`)) out.push(`scene ${c.name}`);
  }
  return out;
}

/**
 * What is wrong with the name typed into one node value (an object that is not placed, a state the asset does
 * not have, an asset that does not exist) — or null. Wired values and values without a list are not checked.
 */
export function nameProblem(ed: EditorState, g: LogicGraph, nodeId: string, pin: string): string | null {
  const n = g.nodes.find((x) => x.id === nodeId);
  const def = n && nodeDef(n.type);
  const p = def?.inputs.find((x) => x.name === pin);
  if (!n || !p?.pick || g.edges.some((e) => e[2] === nodeId && e[3] === pin)) return null;
  const v = n.args?.[pin] ?? p.default;
  const text = typeof v === 'string' ? v.trim() : '';
  if (!text) return null;
  if (p.pick.kind === 'object')
    return placedObjects(ed).some((o) => o.value.toLowerCase() === text.toLowerCase()) || /^ins_/.test(text)
      ? null
      : `No placed object is called “${text}”: place one on a map (Scene › Assets dock), or pick one from the list.`;
  if (p.pick.kind === 'asset')
    return assetByRef(ed, text) ? null : `No asset is called “${text}” (Assets screen › Asset library).`;
  if (p.pick.kind === 'state') {
    const target = assetOfInput(ed, g, nodeId, p.pick.of);
    return target && !target.states.includes(text)
      ? `${target.name} has no state “${text}” (it has: ${target.states.join(', ')}).`
      : null;
  }
  return null;
}

/** Every name problem in a graph, for the graph's problem list. */
export function nameProblems(ed: EditorState, g: LogicGraph): { node: string; message: string }[] {
  const out: { node: string; message: string }[] = [];
  for (const n of g.nodes)
    for (const p of nodeDef(n.type)?.inputs ?? []) {
      const m = p.pick && nameProblem(ed, g, n.id, p.name);
      if (m) out.push({ node: n.id, message: `${nodeDef(n.type)!.title}: ${m}` });
    }
  return out;
}
