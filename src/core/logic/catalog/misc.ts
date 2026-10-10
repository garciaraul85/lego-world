import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

export const MISC: NodeDef[] = [
  {
    type: 'misc.log',
    kind: 'action',
    title: 'Log',
    category: 'Misc',
    doc: 'Writes a value to the console (handy while testing).',
    inputs: [EXEC_IN, { name: 'value', type: 'any', default: 'hello' }],
    outputs: [EXEC_OUT],
    code: { name: 'log', style: 'call' },
    exec: (c, _a, i) => c.log(typeof i.value === 'string' ? i.value : JSON.stringify(i.value)),
  },
  {
    type: 'misc.emit',
    kind: 'action',
    title: 'Send event',
    category: 'Misc',
    doc: 'Sends a custom event that “On custom event” nodes react to.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [{ name: 'event', kind: 'event', label: 'Event name' }],
    code: { name: 'emit', style: 'call' },
    exec: (c, a) => c.emit(String(a.event)),
  },
  {
    type: 'note.comment',
    kind: 'note',
    title: 'Comment',
    category: 'Notes',
    doc: 'A note on the canvas. It does nothing when the game runs.',
    inputs: [],
    outputs: [],
    args: [{ name: 'text', kind: 'string', label: 'Text', default: 'Note' }],
    code: { name: '//', style: 'stmt' },
  },
  {
    type: 'note.group',
    kind: 'note',
    title: 'Group',
    category: 'Notes',
    doc: 'A labelled frame to group nodes on the canvas.',
    inputs: [],
    outputs: [],
    args: [
      { name: 'title', kind: 'string', label: 'Title', default: 'Group' },
      { name: 'w', kind: 'number', label: 'Width', default: 480 },
      { name: 'h', kind: 'number', label: 'Height', default: 260 },
    ],
    code: { name: '//', style: 'stmt' },
  },
];
