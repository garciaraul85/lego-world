import type { NodeDef, PinType } from './types';

const bin = (
  type: string,
  title: string,
  op: string,
  doc: string,
  inT: PinType,
  outT: PinType,
  f: (a: unknown, b: unknown) => unknown,
  category = 'Math',
): NodeDef => ({
  type,
  kind: 'pure',
  title,
  category,
  doc,
  inputs: [
    { name: 'a', type: inT, default: 0 },
    { name: 'b', type: inT, default: 0 },
  ],
  outputs: [{ name: 'out', type: outT }],
  code: { name: op, style: 'expr' },
  eval: (_c, _a, i) => f(i.a, i.b),
});
const n = Number;

export const MATH: NodeDef[] = [
  bin('math.add', 'Add', '+', 'Adds two numbers: a + b.', 'number', 'number', (a, b) => n(a) + n(b)),
  bin('math.sub', 'Subtract', '-', 'Subtracts b from a: a − b.', 'number', 'number', (a, b) => n(a) - n(b)),
  bin('math.mul', 'Multiply', '*', 'Multiplies two numbers: a × b.', 'number', 'number', (a, b) => n(a) * n(b)),
  {
    type: 'math.random',
    kind: 'pure',
    title: 'Random number',
    category: 'Math',
    doc: 'A whole number from Min to Max (both included).',
    inputs: [
      { name: 'min', type: 'number', default: 1 },
      { name: 'max', type: 'number', default: 6 },
    ],
    outputs: [{ name: 'out', type: 'number' }],
    code: { name: 'random', style: 'call' },
    eval: (c, _a, i) => {
      const lo = Math.ceil(n(i.min));
      const hi = Math.floor(n(i.max));
      return lo + Math.floor(c.random() * (hi - lo + 1));
    },
  },
];

export const COMPARE: NodeDef[] = [
  bin('compare.gte', 'At least', '>=', 'True when a ≥ b.', 'any', 'bool', (a, b) => n(a) >= n(b), 'Compare'),
  bin('compare.lte', 'At most', '<=', 'True when a ≤ b.', 'any', 'bool', (a, b) => n(a) <= n(b), 'Compare'),
  bin('compare.eq', 'Equals', '===', 'True when a and b are the same.', 'any', 'bool', (a, b) => a === b, 'Compare'),
  bin('compare.and', 'And', '&&', 'True when both are true.', 'bool', 'bool', (a, b) => !!a && !!b, 'Compare'),
  bin('compare.or', 'Or', '||', 'True when either is true.', 'bool', 'bool', (a, b) => !!a || !!b, 'Compare'),
  {
    type: 'compare.not',
    kind: 'pure',
    title: 'Not',
    category: 'Compare',
    doc: 'True when the input is false.',
    inputs: [{ name: 'a', type: 'bool', default: false }],
    outputs: [{ name: 'out', type: 'bool' }],
    code: { name: '!', style: 'expr' },
    eval: (_c, _a, i) => !i.a,
  },
];
