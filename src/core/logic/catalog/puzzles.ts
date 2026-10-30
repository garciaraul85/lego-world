import type { NodeDef } from './types';
import { EXEC_OUT } from './types';

/**
 * Step 12a: puzzles in logic. A switch turning on or off, a block pushed or pulled, a lock opened and a thing
 * picked up each run an event; the switch, door and pickup parts do their own work, so most puzzles need only
 * these to open a gate or play a sound. Give and Count items work with the small key, boss key, map and compass
 * (they count the ones found on this map).
 */
const asset = (help: string) => ({ name: 'asset', kind: 'asset' as const, label: 'Asset', optional: true, help });

export const PUZZLE_EVENTS: NodeDef[] = [
  {
    type: 'event.onSwitch',
    kind: 'event',
    title: 'On switch',
    category: 'Events',
    doc: 'Runs when a switch turns on or off: stepped on (by the hero or a block), hit, pressed, let go (a held switch) or when its time runs out (a timed switch). Leave the asset empty for every switch, and To empty for both ways.',
    inputs: [],
    outputs: [
      EXEC_OUT,
      { name: 'target', type: 'entity', help: 'The switch.' },
      { name: 'on', type: 'bool', help: 'True when it turned on.' },
    ],
    args: [
      asset('The switch (Floor switch, Crystal switch…). Empty: any switch.'),
      {
        name: 'to',
        kind: 'string',
        label: 'To',
        optional: true,
        help: 'on or off. Empty: both.',
      },
    ],
    code: { name: 'switch', style: 'event' },
  },
  {
    type: 'event.onPushed',
    kind: 'event',
    title: 'On pushed',
    category: 'Events',
    doc: 'Runs when a push block stops after the hero pushed or pulled it one step.',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'target', type: 'entity', help: 'The block.' }],
    args: [asset('The block. Empty: any block.')],
    code: { name: 'pushed', style: 'event' },
  },
  {
    type: 'event.onUnlocked',
    kind: 'event',
    title: 'On unlocked',
    category: 'Events',
    doc: 'Runs when the hero opens a lock with its key (a small key is used up; the boss key is kept).',
    inputs: [],
    outputs: [
      EXEC_OUT,
      { name: 'target', type: 'entity', help: 'The door.' },
      { name: 'key', type: 'string', help: 'The key used.' },
    ],
    args: [asset('The door. Empty: any lock.')],
    code: { name: 'unlocked', style: 'event' },
  },
  {
    type: 'event.onPickedUp',
    kind: 'event',
    title: 'On picked up',
    category: 'Events',
    doc: 'Runs when the hero touches a pickup (a key, the map, the compass, a heart…) and takes it.',
    inputs: [],
    outputs: [
      EXEC_OUT,
      { name: 'item', type: 'string', help: 'The item picked up.' },
      { name: 'count', type: 'number', help: 'How many.' },
    ],
    args: [
      {
        name: 'item',
        kind: 'string',
        label: 'Item',
        optional: true,
        help: 'The item (Small key, Compass…). Empty: anything.',
      },
    ],
    code: { name: 'pickedUp', style: 'event' },
  },
];
