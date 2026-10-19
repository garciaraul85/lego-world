import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/** P23 part 1: effects from logic — play one somewhere, or start and stop one placed on the map. */
export const EFFECTS: NodeDef[] = [
  {
    type: 'effect.play',
    kind: 'action',
    title: 'Play effect',
    category: 'Effects',
    doc: 'Plays an effect (sparks, fire, a level-up burst…) at the hero, or at an object, a neighbour or an effect placed on the map, by its name. A stream effect (fire, smoke) keeps going for its own length; for one that keeps going, place it on the map and use Start effect.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [
      {
        name: 'effect',
        kind: 'effect',
        label: 'Effect',
        help: 'A built-in effect or one of the game’s own (the Effects screen).',
      },
      {
        name: 'at',
        kind: 'string',
        label: 'Where',
        optional: true,
        help: 'Empty: at the hero. Else the name of an object, a neighbour or an effect placed on the map.',
      },
    ],
    code: { name: 'effects.play', style: 'call' },
    exec: (c, a) => c.effect?.('play', String(a.effect ?? ''), a.at ? String(a.at) : undefined),
  },
  {
    type: 'effect.start',
    kind: 'action',
    title: 'Start effect',
    category: 'Effects',
    doc: 'Starts an effect placed on the map (by its name), as if it had been switched on: a stream keeps going, a burst plays on its interval, while the hero is near.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [{ name: 'name', kind: 'string', label: 'Placed effect', help: 'Its name in the Inspector (“Torch fire”).' }],
    code: { name: 'effects.start', style: 'call' },
    exec: (c, a) => c.effect?.('on', String(a.name ?? '')),
  },
  {
    type: 'effect.stop',
    kind: 'action',
    title: 'Stop effect',
    category: 'Effects',
    doc: 'Stops an effect placed on the map (by its name): no new particles; the ones flying finish their life.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [{ name: 'name', kind: 'string', label: 'Placed effect', help: 'Its name in the Inspector (“Torch fire”).' }],
    code: { name: 'effects.stop', style: 'call' },
    exec: (c, a) => c.effect?.('off', String(a.name ?? '')),
  },
];
