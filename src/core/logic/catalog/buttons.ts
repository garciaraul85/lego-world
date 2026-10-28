import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Step 11b part 1: the game's buttons in logic. The Action button runs On action pressed with what it did (Talk,
 * Open, Read, Jump, or a label logic set); an item button runs On item used with the item in it. Set action label
 * gives the Action button something new to do here (Pray, Pull rope); Put item in slot fills an item button.
 */
export const BUTTON_EVENTS: NodeDef[] = [
  {
    type: 'event.onActionPressed',
    kind: 'event',
    title: 'On action pressed',
    category: 'Events',
    doc: 'Runs when the player presses the Action button, with what it did (Talk, Open, Read, Jump, or a label set by Set action label). Leave the action empty to react to every press.',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'action', type: 'string', help: 'What the Action button did: its label.' }],
    args: [
      {
        name: 'action',
        kind: 'string',
        label: 'Action',
        optional: true,
        help: 'The label the Action button showed (Pray, Open, Talk…). Empty: any press.',
      },
    ],
    code: { name: 'actionPressed', style: 'event' },
  },
  {
    type: 'event.onItemUsed',
    kind: 'event',
    title: 'On item used',
    category: 'Events',
    doc: 'Runs when the player presses an item button with an item in it (and has at least one). Leave the item empty to react to every item.',
    inputs: [],
    outputs: [
      EXEC_OUT,
      { name: 'item', type: 'string', help: 'The item used.' },
      { name: 'slot', type: 'number', help: 'The item button (1 to 4).' },
    ],
    args: [
      {
        name: 'item',
        kind: 'string',
        label: 'Item',
        optional: true,
        help: 'The item’s name in the inventory (Bow, Bomb…). Empty: any item.',
      },
    ],
    code: { name: 'itemUsed', style: 'event' },
  },
];

export const BUTTONS: NodeDef[] = [
  {
    type: 'controls.setActionLabel',
    kind: 'action',
    title: 'Set action label',
    category: 'World',
    doc: 'Gives the Action button something to do here: it shows this label (when nothing more important fits) and pressing it runs On action pressed with it. An empty label takes it away.',
    inputs: [
      EXEC_IN,
      {
        name: 'label',
        type: 'string',
        default: 'Pray',
        help: 'What the Action button shows and does (Pray, Pull rope, Ring the bell). Empty: none.',
      },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'controls.setActionLabel', style: 'call' },
    exec: (c, _a, i) => c.buttons?.('label', String(i.label ?? '')),
  },
  {
    type: 'items.putInSlot',
    kind: 'action',
    title: 'Put item in slot',
    category: 'World',
    doc: 'Puts an item in one of the item buttons (as the player does in the item menu). It leaves any other button it was in.',
    inputs: [
      EXEC_IN,
      { name: 'item', type: 'string', default: 'Bow', help: 'The item’s name in the inventory.' },
      { name: 'slot', type: 'number', default: 1, help: 'The item button, 1 to 4.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'items.putInSlot', style: 'call' },
    exec: (c, _a, i) => c.buttons?.('equip', String(i.item ?? ''), Number(i.slot ?? 1)),
  },
];
