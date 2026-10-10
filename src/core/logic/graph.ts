import type { LogicGraph } from '../schema';
import { canConnect, inputPin, nodeDef, outputPin } from './catalog';

export type LogicNode = LogicGraph['nodes'][number];
export type Edge = LogicGraph['edges'][number];
export type GraphProblem = { node: string | null; message: string };

/** Why this wire cannot be made, or null. Used by the editor (tooltip) and the commands. */
export function edgeError(g: Pick<LogicGraph, 'nodes' | 'edges'>, e: Edge, ignoreExisting = false): string | null {
  const [fromId, fromPin, toId, toPin] = e;
  const from = g.nodes.find((n) => n.id === fromId);
  const to = g.nodes.find((n) => n.id === toId);
  if (!from || !to) return 'Both ends must be nodes of this graph.';
  if (fromId === toId) return 'A node cannot be wired to itself.';
  const out = outputPin(from.type, fromPin);
  const inp = inputPin(to.type, toPin);
  if (!out) return `${nodeDef(from.type)?.title ?? from.type} has no output “${fromPin}”.`;
  if (!inp) return `${nodeDef(to.type)?.title ?? to.type} has no input “${toPin}”.`;
  if (!canConnect(out.type, inp.type))
    return out.type === 'exec' || inp.type === 'exec'
      ? 'Flow wires (white) connect only to flow pins.'
      : `A ${out.type} can’t go into a ${inp.type} pin.`;
  if (ignoreExisting) return null;
  if (g.edges.some((x) => x[0] === fromId && x[1] === fromPin && x[2] === toId && x[3] === toPin))
    return 'These pins are already wired.';
  if (inp.type !== 'exec' && g.edges.some((x) => x[2] === toId && x[3] === toPin))
    return 'That input already has a wire. Remove it first.';
  if (out.type === 'exec' && g.edges.some((x) => x[0] === fromId && x[1] === fromPin))
    return 'A flow output goes to one place. Use a Sequence to do several things.';
  return null;
}

/** Problems that stop a graph from running (unknown nodes, bad wires, missing settings). */
export function graphProblems(g: Pick<LogicGraph, 'nodes' | 'edges'>): GraphProblem[] {
  const out: GraphProblem[] = [];
  for (const n of g.nodes) {
    const def = nodeDef(n.type);
    if (!def) {
      out.push({ node: n.id, message: `Unknown node type ${n.type}.` });
      continue;
    }
    for (const a of def.args ?? []) {
      const v = n.args?.[a.name];
      if (!a.optional && a.default === undefined && (v === undefined || v === ''))
        out.push({ node: n.id, message: `${def.title}: choose ${a.label.toLowerCase()}.` });
    }
  }
  g.edges.forEach((e, i) => {
    const rest = { nodes: g.nodes, edges: g.edges.filter((_, j) => j !== i) };
    const err = edgeError(rest, e);
    if (err) out.push({ node: e[2], message: err });
  });
  return out;
}

export const nextNodeId = (g: Pick<LogicGraph, 'nodes'>) =>
  `n${Math.max(0, ...g.nodes.map((n) => Number(n.id.slice(1)))) + 1}`;
