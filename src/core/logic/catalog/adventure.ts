import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Step 11, 4c: what the adventure script templates need: a message on screen, counting and taking the hero's
 * items (a shop, a key door), a character that follows the hero (an escort), and a character put on the map in
 * play (a wave of enemies).
 */
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const ADVENTURE: NodeDef[] = [
  {
    type: 'misc.say',
    kind: 'action',
    title: 'Show message',
    category: 'Misc',
    doc: 'Shows a line of text in the middle of the screen for a few seconds (“It’s locked.”, “3 left!”). Text can be wired in, so it can show a variable.',
    inputs: [
      EXEC_IN,
      { name: 'text', type: 'any', default: 'Hello!', help: 'What it says.' },
      { name: 'seconds', type: 'number', default: 2, help: 'How long it stays (0.5 to 10 seconds).' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'say', style: 'call' },
    exec: (c, _a, i) =>
      c.say?.(
        typeof i.text === 'string' ? i.text : String(i.text ?? ''),
        Math.min(10, Math.max(0.5, num(i.seconds, 2))),
      ),
  },
  {
    type: 'items.count',
    kind: 'pure',
    title: 'Count items',
    category: 'World',
    doc: 'How many of an item the hero carries (coin, Key, Bomb…), by the name it was given with.',
    inputs: [{ name: 'item', type: 'string', default: 'coin', help: 'The item’s name in the inventory.' }],
    outputs: [{ name: 'out', type: 'number' }],
    code: { name: 'items.count', style: 'call' },
    eval: (c, _a, i) => c.count?.(String(i.item ?? '')) ?? 0,
  },
  {
    type: 'items.take',
    kind: 'action',
    title: 'Take items',
    category: 'World',
    doc: 'Takes items from the hero (paying a shopkeeper, using up a key). Never below zero: check with Count items first.',
    inputs: [
      EXEC_IN,
      { name: 'item', type: 'string', default: 'coin', help: 'The item’s name in the inventory.' },
      { name: 'count', type: 'number', default: 1, help: 'How many to take.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'items.take', style: 'call' },
    exec: (c, _a, i) => c.take?.(String(i.item ?? ''), Math.max(0, Math.round(num(i.count, 1)))),
  },
  {
    type: 'character.follow',
    kind: 'action',
    title: 'Follow the hero',
    category: 'Characters',
    doc: 'A character walks after the hero and keeps close (an escort, a lost kid, a companion); it catches up if left far behind. Off: it stops where it is and goes back to its own routine.',
    inputs: [EXEC_IN, { name: 'on', type: 'bool', default: true, help: 'On: follow. Off: stop following.' }],
    outputs: [EXEC_OUT],
    args: [
      {
        name: 'who',
        kind: 'string',
        label: 'Character',
        help: 'A character’s name (the nearest one of that name).',
      },
    ],
    code: { name: 'character.follow', style: 'call' },
    exec: (c, a, i) => c.follow?.(String(a.who ?? ''), i.on !== false),
  },
  {
    type: 'character.spawn',
    kind: 'action',
    title: 'Spawn character',
    category: 'Characters',
    doc: 'Puts a character on the map while the game plays, at a spawn point (a wave of enemies, a visitor). It acts like any character placed there: an enemy fights, a neighbour wanders and talks. It is gone the next time the game starts.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT, { name: 'entity', type: 'entity' }],
    args: [
      {
        name: 'character',
        kind: 'string',
        label: 'Character',
        help: 'The character’s name (one of the game’s, or one of the starter pack’s).',
      },
      {
        name: 'at',
        kind: 'spawn',
        label: 'At spawn',
        help: 'A spawn point on the current map (Scene › Spawn tool).',
      },
    ],
    code: { name: 'character.spawn', style: 'call' },
    exec: (c, a) => {
      c.spawnCharacter?.(String(a.character ?? ''), String(a.at ?? ''));
    },
  },
];
