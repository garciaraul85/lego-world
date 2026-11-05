import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Milestone 3b (B1): behaviours — what a script attached to things reads and changes on its own copy: its fields
 * (the settings the Inspector shows) and its own variables, `this.name` in code. Each attached copy keeps its own.
 * The interpreter runs these itself (it knows which copy a run belongs to).
 */
const NAME = [
  {
    name: 'name',
    kind: 'field' as const,
    label: 'Field or own variable',
    help: 'One of this behaviour’s fields (its settings in the Inspector) or its own variables (left, under Fields). Each copy it is attached to has its own.',
  },
];

export const SELF_EVENTS: NodeDef[] = [
  {
    type: 'event.onUpdate',
    kind: 'event',
    title: 'On update',
    category: 'Events',
    doc: 'Runs every game step (60 times a second) for each thing the behaviour is attached to. dt is the seconds since the last step. Keep it short: a long update slows the game.',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'dt', type: 'number' }],
    code: { name: 'update', style: 'event' },
  },
];

export const SELF: NodeDef[] = [
  {
    type: 'self.get',
    kind: 'pure',
    title: 'Get field',
    category: 'This object',
    doc: 'The value of one of this behaviour’s fields or own variables, on the copy that runs it (this.name in code).',
    inputs: [],
    outputs: [{ name: 'value', type: 'any' }],
    args: NAME,
    code: { name: 'this', style: 'expr' },
    // the interpreter reads the copy's own value (it knows which copy the run belongs to)
    eval: () => undefined,
  },
  {
    type: 'self.set',
    kind: 'action',
    title: 'Set field',
    category: 'This object',
    doc: 'Gives one of this behaviour’s fields or own variables a new value, on this copy only (this.name = … in code).',
    inputs: [EXEC_IN, { name: 'value', type: 'any', default: 0 }],
    outputs: [EXEC_OUT],
    args: NAME,
    code: { name: 'this', style: 'stmt' },
    // the interpreter changes the copy's own value (it knows which copy the run belongs to)
    exec: () => {},
  },
  {
    type: 'self.add',
    kind: 'action',
    title: 'Add to field',
    category: 'This object',
    doc: 'Adds an amount to a number field or own variable, on this copy only (this.name += … in code).',
    inputs: [EXEC_IN, { name: 'amount', type: 'number', default: 1 }],
    outputs: [EXEC_OUT],
    args: NAME,
    code: { name: 'this', style: 'stmt' },
    // the interpreter changes the copy's own value (it knows which copy the run belongs to)
    exec: () => {},
  },
];
