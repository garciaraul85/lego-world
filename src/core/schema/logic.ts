import { z } from 'zod';
import { id, Vec2 } from './common';

export const LogicNode = z.strictObject({
  id: z.string().regex(/^n\d+$/),
  type: z.string().regex(/^[a-z]+\.[A-Za-z]+$/),
  pos: Vec2,
  args: z.record(z.string(), z.unknown()).optional(),
});

/** logic/<graphId>.json — edges are [fromNode, fromPin, toNode, toPin] */
export const LogicGraph = z
  .strictObject({
    id: id('logic'),
    name: z.string().min(1).max(80),
    scope: z.union([z.literal('global'), id('map')]),
    nodes: z.array(LogicNode),
    edges: z.array(z.tuple([z.string(), z.string(), z.string(), z.string()])),
  })
  .superRefine((g, ctx) => {
    const ids = new Set<string>();
    g.nodes.forEach((n, i) => {
      if (ids.has(n.id)) ctx.addIssue({ code: 'custom', path: ['nodes', i, 'id'], message: `duplicate node ${n.id}` });
      ids.add(n.id);
    });
    g.edges.forEach((e, i) => {
      if (!ids.has(e[0]) || !ids.has(e[2]))
        ctx.addIssue({ code: 'custom', path: ['edges', i], message: 'edge to unknown node' });
    });
  });
export type LogicGraph = z.infer<typeof LogicGraph>;

export const VarType = z.enum(['number', 'bool', 'string']);
/** logic/variables.json */
export const Variables = z.strictObject({
  vars: z.record(
    z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
    z.strictObject({
      type: VarType,
      default: z.union([z.number(), z.boolean(), z.string()]),
      scope: z.union([z.literal('global'), id('map')]),
    }),
  ),
});
export type Variables = z.infer<typeof Variables>;
