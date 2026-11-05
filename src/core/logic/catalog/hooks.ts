import type { NodeDef, PinDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Milestone 3b (B3): hooks — the decisions a built-in behaviour makes, which a behaviour that extends it can
 * answer itself. Each is a method (`canOpen(e) { … }`) that returns its answer; `super.canOpen(e)` is the
 * engine's own answer (e.base on the card). Not returning keeps the engine's answer.
 */
const hook = (name: string, title: string, doc: string, outputs: PinDef[], base: PinDef['type']): NodeDef => ({
  type: `event.on${name}`,
  kind: 'event',
  title,
  category: 'Hooks',
  doc,
  inputs: [],
  outputs: [EXEC_OUT, ...outputs, { name: 'base', type: base, help: 'What the engine would answer (super in code).' }],
  code: { name: name.charAt(0).toLowerCase() + name.slice(1), style: 'event' },
});

export const HOOKS: NodeDef[] = [
  hook(
    'CanUse',
    'Can it be used? (Interactable)',
    'Asked when the hero presses the Action button at it. Return false and nothing happens (its interaction does not run).',
    [{ name: 'socket', type: 'string' }],
    'bool',
  ),
  hook(
    'CanOpen',
    'Can it open? (Lock)',
    'Asked when the hero tries to open a lock. item is the key it takes, have how many the hero carries. Return true to open (a key is used up only if the hero has one), false to stay locked.',
    [
      { name: 'item', type: 'string' },
      { name: 'have', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'IsPressed',
    'Is it pressed? (Switch)',
    'Asked every step for a floor switch: weight is how much stands on it, by who (hero, block, npc, loose). Return true for down, false for up.',
    [
      { name: 'weight', type: 'number' },
      { name: 'by', type: 'string' },
    ],
    'bool',
  ),
  hook(
    'CanPush',
    'Can it be pushed? (Pushable)',
    'Asked before a push block moves: dx and dz are the way it would go (−1, 0 or 1), pulled is true when the hero pulls. Return false and it stays.',
    [
      { name: 'dx', type: 'number' },
      { name: 'dz', type: 'number' },
      { name: 'pulled', type: 'bool' },
    ],
    'bool',
  ),
  hook(
    'CanPickUp',
    'Can it be picked up? (Pickup)',
    'Asked when the hero touches a pickup. Return false and it stays where it is.',
    [
      { name: 'item', type: 'string' },
      { name: 'count', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'TakeDamage',
    'How much does a hit take? (Health)',
    'Asked when it is hit: amount is the damage after its armour and weaknesses, type the kind of hit. Return the damage it takes (0: unhurt).',
    [
      { name: 'amount', type: 'number' },
      { name: 'type', type: 'string' },
    ],
    'number',
  ),
  hook(
    'CanClimb',
    'Can it be climbed? (Climbable)',
    'Asked when the hero walks into it to climb. Return false and the hero does not take hold.',
    [],
    'bool',
  ),
];

export const RETURN: NodeDef[] = [
  {
    type: 'flow.return',
    kind: 'action',
    title: 'Answer',
    category: 'Flow',
    doc: 'Gives a hook’s answer (return in code) and ends the method: true or false, or a number for How much does a hit take.',
    inputs: [EXEC_IN, { name: 'value', type: 'any', default: true }],
    outputs: [],
    code: { name: 'return', style: 'stmt' },
    // the interpreter keeps the answer (it knows which call asked)
    exec: () => {},
  },
];
