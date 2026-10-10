import { nodeDef } from '../../logic/catalog';
import { type Edge, edgeError, type LogicNode, nextNodeId } from '../../logic/graph';
import type { ProjectStore } from '../../project/store';
import { LogicGraph, paths, Variables } from '../../schema';
import type { CommandHandler } from '../types';

const path = (id: string) => `logic/${id}.json`;
const get = (store: ProjectStore, id: string) => store.get<LogicGraph>(path(id)) ?? null;
const missing = (store: ProjectStore, id: string) => (get(store, id) ? null : 'That logic graph does not exist.');
const put = (store: ProjectStore, g: LogicGraph) => store.put(path(g.id), g);
const invalid = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : `Not valid: ${r.error?.issues[0]?.message}`;

export const createLogic: CommandHandler<{ graph: LogicGraph }> = {
  label: (p) => `New logic ${p.graph.name}`,
  validate: (store, p) =>
    invalid(LogicGraph.safeParse(p.graph)) ?? (get(store, p.graph.id) ? 'That graph already exists.' : null),
  apply: (store, p) => put(store, p.graph),
};

/** Whole-graph replace: rename, the code view's parsed result, paste. */
export const replaceLogic: CommandHandler<{ graph: LogicGraph }> = {
  label: (p) => `Edit logic ${p.graph.name}`,
  validate: (store, p) => missing(store, p.graph.id) ?? invalid(LogicGraph.safeParse(p.graph)),
  apply: (store, p) => put(store, p.graph),
};

export const deleteLogic: CommandHandler<{ graph: string }> = {
  label: () => 'Delete logic graph',
  validate: (store, p) => missing(store, p.graph),
  apply: (store, p) => store.remove(path(p.graph)),
};

export const addNode: CommandHandler<{ graph: string; node: Omit<LogicNode, 'id'> & { id?: string } }> = {
  label: (p) => `Add ${nodeDef(p.node.type)?.title ?? 'node'}`,
  validate(store, p) {
    const g = get(store, p.graph);
    if (!g) return 'That logic graph does not exist.';
    if (!nodeDef(p.node.type)) return `Unknown node type ${p.node.type}.`;
    if (p.node.id && g.nodes.some((n) => n.id === p.node.id)) return 'A node with that id already exists.';
    return g.nodes.length >= 2000 ? 'A graph can have 2,000 nodes.' : null;
  },
  apply(store, p) {
    const g = get(store, p.graph)!;
    const node = { ...p.node, id: p.node.id ?? nextNodeId(g) } as LogicNode;
    put(store, { ...g, nodes: [...g.nodes, node] });
  },
};

export const removeNodes: CommandHandler<{ graph: string; nodes: string[] }> = {
  label: (p) => (p.nodes.length === 1 ? 'Remove node' : `Remove ${p.nodes.length} nodes`),
  validate: (store, p) => missing(store, p.graph),
  apply(store, p) {
    const g = get(store, p.graph)!;
    const gone = new Set(p.nodes);
    put(store, {
      ...g,
      nodes: g.nodes.filter((n) => !gone.has(n.id)),
      edges: g.edges.filter((e) => !gone.has(e[0]) && !gone.has(e[2])),
    });
  },
};

export const moveNodes: CommandHandler<{ graph: string; moves: { id: string; pos: [number, number] }[] }> = {
  label: (p) => (p.moves.length === 1 ? 'Move node' : `Move ${p.moves.length} nodes`),
  validate: (store, p) =>
    missing(store, p.graph) ??
    (p.moves.every((m) => m.pos.every(Number.isFinite)) ? null : 'Positions must be numbers.'),
  apply(store, p) {
    const g = get(store, p.graph)!;
    const at = new Map(p.moves.map((m) => [m.id, m.pos.map(Math.round) as [number, number]]));
    put(store, { ...g, nodes: g.nodes.map((n) => (at.has(n.id) ? { ...n, pos: at.get(n.id)! } : n)) });
  },
};

export const connect: CommandHandler<{ graph: string; edge: Edge }> = {
  label: () => 'Connect',
  validate: (store, p) => missing(store, p.graph) ?? edgeError(get(store, p.graph)!, p.edge),
  apply(store, p) {
    const g = get(store, p.graph)!;
    put(store, { ...g, edges: [...g.edges, p.edge] });
  },
};

export const disconnect: CommandHandler<{ graph: string; edge: Edge }> = {
  label: () => 'Disconnect',
  validate: (store, p) =>
    missing(store, p.graph) ??
    (get(store, p.graph)!.edges.some((e) => e.join('|') === p.edge.join('|')) ? null : 'That wire does not exist.'),
  apply(store, p) {
    const g = get(store, p.graph)!;
    put(store, { ...g, edges: g.edges.filter((e) => e.join('|') !== p.edge.join('|')) });
  },
};

export const setArgs: CommandHandler<{ graph: string; node: string; args: Record<string, unknown> }> = {
  label: () => 'Edit node',
  validate: (store, p) =>
    missing(store, p.graph) ?? (get(store, p.graph)!.nodes.some((n) => n.id === p.node) ? null : 'Node not found.'),
  apply(store, p) {
    const g = get(store, p.graph)!;
    put(store, {
      ...g,
      nodes: g.nodes.map((n) => {
        if (n.id !== p.node) return n;
        const args = { ...(n.args ?? {}), ...p.args };
        for (const k of Object.keys(args)) if (args[k] === undefined) delete args[k];
        return { ...n, args };
      }),
    });
  },
};

type VarDef = Variables['vars'][string];
/** Declares, changes or (with def null) removes a game variable. */
export const setVariable: CommandHandler<{ name: string; def: VarDef | null; rename?: string }> = {
  label: (p) => (p.def ? `Variable ${p.rename ?? p.name}` : `Remove variable ${p.name}`),
  validate(store, p) {
    const cur = store.get<Variables>(paths.variables) ?? { vars: {} };
    if (!p.def && !cur.vars[p.name]) return 'That variable does not exist.';
    const next = buildVars(cur, p);
    return invalid(Variables.safeParse(next));
  },
  apply(store, p) {
    store.put(paths.variables, buildVars(store.get<Variables>(paths.variables) ?? { vars: {} }, p));
  },
};

function buildVars(cur: Variables, p: { name: string; def: VarDef | null; rename?: string }): Variables {
  const vars = { ...cur.vars };
  delete vars[p.name];
  if (p.def) vars[p.rename ?? p.name] = p.def;
  return { vars };
}
