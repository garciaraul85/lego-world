import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

const VAR = [{ name: 'var', kind: 'var' as const, label: 'Variable' }];

export const VARS: NodeDef[] = [
  {
    type: 'var.get',
    kind: 'pure',
    title: 'Get variable',
    category: 'Variables',
    doc: 'The current value of a game variable.',
    inputs: [],
    outputs: [{ name: 'value', type: 'any' }],
    args: VAR,
    code: { name: 'vars', style: 'expr' },
    eval: (ctx, a) => ctx.getVar(String(a.var)),
  },
  {
    type: 'var.set',
    kind: 'action',
    title: 'Set variable',
    category: 'Variables',
    doc: 'Gives a game variable a new value.',
    inputs: [EXEC_IN, { name: 'value', type: 'any', default: 0 }],
    outputs: [EXEC_OUT],
    args: VAR,
    code: { name: 'vars', style: 'stmt' },
    exec: (ctx, a, i) => ctx.setVar(String(a.var), i.value),
  },
  {
    type: 'var.add',
    kind: 'action',
    title: 'Add to variable',
    category: 'Variables',
    doc: 'Adds an amount to a number variable (use a negative amount to subtract).',
    inputs: [EXEC_IN, { name: 'amount', type: 'number', default: 1 }],
    outputs: [EXEC_OUT],
    args: VAR,
    code: { name: 'vars', style: 'stmt' },
    exec: (ctx, a, i) => ctx.setVar(String(a.var), Number(ctx.getVar(String(a.var)) ?? 0) + Number(i.amount ?? 0)),
  },
];
