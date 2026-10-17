import { DAMAGE_TYPES } from '../../combat/damage';
import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * P9a: health. Events when something is hurt or reaches zero; actions that hurt, heal or protect the hero,
 * a placed object (by its asset's name: the copy nearest the hero) or a neighbour (by name).
 */
const WHO =
  'Who: hero, a placed object (pick it, or type its asset’s name: the copy nearest the hero), or a neighbour’s name. Wire one in from another node’s target.';
const TYPES = `The damage type: ${DAMAGE_TYPES.join(', ')}. The target’s resistances decide how much gets through (a stone wall only takes explosive).`;

const healthEvent = (name: 'Damaged' | 'Defeated', title: string, doc: string): NodeDef => ({
  type: `event.on${name}`,
  kind: 'event',
  title,
  category: 'Events',
  doc,
  inputs: [],
  outputs: [
    EXEC_OUT,
    { name: 'target', type: 'entity' },
    ...(name === 'Damaged'
      ? [
          { name: 'amount', type: 'number' as const },
          { name: 'hp', type: 'number' as const, label: 'hp left' },
        ]
      : []),
  ],
  args: [
    {
      name: 'asset',
      kind: 'asset',
      label: 'Asset',
      optional: true,
      help: 'Only for copies of this asset (empty: anything with health — objects, neighbours, the hero).',
    },
  ],
  code: { name: name.toLowerCase(), style: 'event' },
});

export const HEALTH_EVENTS: NodeDef[] = [
  healthEvent(
    'Damaged',
    'On damaged',
    'Runs when something with health is hurt and still has some left: the hero, a neighbour that can be harmed, or an object with health.',
  ),
  healthEvent(
    'Defeated',
    'On defeated',
    'Runs when something with health reaches zero (after it breaks, drops its item and sends its event).',
  ),
];

export const HEALTH: NodeDef[] = [
  {
    type: 'health.damage',
    kind: 'action',
    title: 'Damage',
    category: 'Health',
    doc: 'Hurts the hero, a placed object or a neighbour, as a hit of this power and type would (armour and resistances count).',
    inputs: [
      EXEC_IN,
      { name: 'target', type: 'entity', default: 'hero', pick: { kind: 'object' }, help: WHO },
      { name: 'amount', type: 'number', default: 1, help: 'The hit’s power (a sword hit is 2, bare hands 1).' },
      { name: 'type', type: 'string', default: 'blunt', help: TYPES },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'health.damage', style: 'call' },
    exec: (c, _a, i) => c.damage(String(i.target ?? 'hero'), Number(i.amount ?? 1), String(i.type ?? 'blunt')),
  },
  {
    type: 'health.heal',
    kind: 'action',
    title: 'Heal',
    category: 'Health',
    doc: 'Gives health back, never above its maximum (the hero: hearts).',
    inputs: [
      EXEC_IN,
      { name: 'target', type: 'entity', default: 'hero', pick: { kind: 'object' }, help: WHO },
      { name: 'amount', type: 'number', default: 1, help: 'How much health to give back.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'health.heal', style: 'call' },
    exec: (c, _a, i) => c.heal(String(i.target ?? 'hero'), Number(i.amount ?? 1)),
  },
  {
    type: 'health.setInvulnerable',
    kind: 'action',
    title: 'Set invulnerable',
    category: 'Health',
    doc: 'Nothing can hurt it while on (a shield spell, a cutscene, a boss between phases); off makes it take damage again.',
    inputs: [
      EXEC_IN,
      { name: 'target', type: 'entity', default: 'hero', pick: { kind: 'object' }, help: WHO },
      { name: 'on', type: 'bool', default: true, help: 'On: no damage. Off: takes damage again.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'health.setInvulnerable', style: 'call' },
    exec: (c, _a, i) => c.setInvulnerable(String(i.target ?? 'hero'), i.on !== false),
  },
];
