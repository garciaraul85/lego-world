import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/** Flow nodes are run by the interpreter (they decide where execution goes). */
export const FLOW: NodeDef[] = [
  {
    type: 'flow.branch',
    kind: 'flow',
    title: 'Branch',
    category: 'Flow',
    doc: 'Goes on through True when the condition holds, otherwise through False.',
    inputs: [EXEC_IN, { name: 'cond', type: 'bool', default: false }],
    outputs: [
      { name: 'true', type: 'exec' },
      { name: 'false', type: 'exec' },
    ],
    code: { name: 'if', style: 'stmt' },
  },
  {
    type: 'flow.sequence',
    kind: 'flow',
    title: 'Sequence',
    category: 'Flow',
    doc: 'Runs First, then Second, then Third.',
    inputs: [EXEC_IN],
    outputs: [
      { name: 'a', type: 'exec', label: 'First' },
      { name: 'b', type: 'exec', label: 'Second' },
      { name: 'c', type: 'exec', label: 'Third' },
    ],
    code: { name: 'sequence', style: 'stmt' },
  },
  {
    type: 'flow.wait',
    kind: 'flow',
    title: 'Wait',
    category: 'Flow',
    doc: 'Pauses this run for some seconds of game time, then goes on.',
    inputs: [EXEC_IN, { name: 'seconds', type: 'number', default: 1 }],
    outputs: [EXEC_OUT],
    code: { name: 'wait', style: 'stmt' },
  },
  {
    type: 'flow.once',
    kind: 'flow',
    title: 'Once',
    category: 'Flow',
    doc: 'Lets execution through the first time only (per play).',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    code: { name: 'once', style: 'stmt' },
  },
  {
    type: 'flow.forEachInZone',
    kind: 'flow',
    title: 'For each in zone',
    category: 'Flow',
    doc: 'Runs Body once for each thing inside the zone (the hero and placed assets), then Done.',
    inputs: [EXEC_IN],
    outputs: [
      { name: 'body', type: 'exec', label: 'Body' },
      { name: 'item', type: 'entity' },
      { name: 'done', type: 'exec', label: 'Done' },
    ],
    args: [{ name: 'zone', kind: 'zone', label: 'Zone' }],
    code: { name: 'forEachInZone', style: 'stmt' },
  },
  {
    type: 'flow.gate',
    kind: 'flow',
    title: 'Gate',
    category: 'Flow',
    doc: 'Lets execution through only while open. Open and Close change it; gates with the same name share one state.',
    inputs: [EXEC_IN, { name: 'open', type: 'exec' }, { name: 'close', type: 'exec' }],
    outputs: [EXEC_OUT],
    args: [
      { name: 'name', kind: 'string', label: 'Name', default: 'gate' },
      { name: 'startOpen', kind: 'bool', label: 'Starts open', default: true },
    ],
    code: { name: 'gate', style: 'stmt' },
  },
];
