import { z } from 'zod';
import { PhaseDef } from '../combat/enemy';
import { id, Vec2 } from './common';

export const LogicNode = z.strictObject({
  id: z.string().regex(/^n\d+$/),
  type: z.string().regex(/^[a-z]+\.[A-Za-z]+$/),
  pos: Vec2,
  args: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Milestone 3b (B1): a behaviour's public field — shown in the Inspector wherever the behaviour is attached, with
 * this label, help and range; each attachment (an asset, a character, one placed copy) can set its own value.
 */
export const FieldType = z.enum([
  'number',
  'bool',
  'string',
  'asset',
  'character',
  'item',
  'sound',
  'effect',
  'zone',
  'object',
  'event',
]);
export type FieldType = z.infer<typeof FieldType>;
const ident = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
  .max(40);
export const FieldValue = z.union([z.number(), z.boolean(), z.string().max(200)]);
export type FieldValue = z.infer<typeof FieldValue>;
export const BehaviourField = z.strictObject({
  name: ident,
  type: FieldType,
  default: FieldValue,
  label: z.string().min(1).max(60),
  help: z.string().max(300).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type BehaviourField = z.infer<typeof BehaviourField>;

/**
 * Milestone 3b (B1): a logic file that is a behaviour — a script you attach to things (Unity's components). Its
 * fields are its settings; `vars` are its own variables (each attached copy keeps its own: this.name in code), with
 * their starting values; `extends` names what it builds on (a built-in behaviour, from B3).
 */
export const BehaviourDef = z.strictObject({
  fields: z.array(BehaviourField).max(40),
  vars: z.record(ident, FieldValue).optional(),
  extends: z.string().max(60).optional(),
  about: z.string().max(400).optional(),
  /** Milestone 3b (14a-2): a boss's phases, written in its class (one extending PhasedBoss, WeakPointBoss…) */
  phases: z.array(PhaseDef).max(5).optional(),
});
export type BehaviourDef = z.infer<typeof BehaviourDef>;

/** Milestone 3b (B1): a behaviour attached to an asset, a character or one placed copy, with its field values */
export const ScriptAttachment = z.strictObject({
  use: id('logic'),
  fields: z.record(ident, FieldValue).optional(),
  /** on one placed copy: the behaviour its asset or character has is switched off here */
  off: z.boolean().optional(),
});
export type ScriptAttachment = z.infer<typeof ScriptAttachment>;
export const ScriptAttachments = z.array(ScriptAttachment).max(16);

/** logic/<graphId>.json — edges are [fromNode, fromPin, toNode, toPin] */
export const LogicGraph = z
  .strictObject({
    id: id('logic'),
    name: z.string().min(1).max(80),
    scope: z.union([z.literal('global'), id('map')]),
    /**
     * P9c: a script on one placed object or neighbour (its instance id). Its events about objects (used, hit,
     * smashed, rebuilt, locked on…) run only for that one, and "this" in it means that one.
     */
    owner: id('instance').optional(),
    /** Milestone 3b (B1): this file is a behaviour (attached to things, with fields and its own variables) */
    behaviour: BehaviourDef.optional(),
    nodes: z.array(LogicNode),
    edges: z.array(z.tuple([z.string(), z.string(), z.string(), z.string()])),
  })
  .superRefine((g, ctx) => {
    if (g.behaviour) {
      const names = new Set<string>();
      g.behaviour.fields.forEach((f, i) => {
        if (names.has(f.name))
          ctx.addIssue({
            code: 'custom',
            path: ['behaviour', 'fields', i, 'name'],
            message: `two fields named ${f.name}`,
          });
        names.add(f.name);
      });
      for (const v of Object.keys(g.behaviour.vars ?? {}))
        if (names.has(v))
          ctx.addIssue({ code: 'custom', path: ['behaviour', 'vars', v], message: `${v} is already a field` });
      if (g.owner) ctx.addIssue({ code: 'custom', path: ['owner'], message: 'a behaviour is attached, not owned' });
    }
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
