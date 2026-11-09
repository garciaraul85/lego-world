import { hook } from './hooks';
import type { NodeDef } from './types';
import { EXEC_OUT } from './types';

/**
 * Milestone 3b (B6): items and projectiles — the decisions of Item, Projectile and the built-in items (Bow,
 * Boomerang, Lens of Truth…) that a behaviour extending them, on the hero, can make itself. Each is asked only of
 * the behaviours about that item (a Bow behaviour is not asked about the Boomerang).
 */
export const ITEM_HOOKS: NodeDef[] = [
  hook(
    'CanUseItem',
    'Can it be used now? (Item)',
    'Asked as the hero presses an item’s button: item is its name, slot its button. Return false and nothing happens.',
    [
      { name: 'item', type: 'string' },
      { name: 'slot', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'UseItem',
    'It is used (Item)',
    'Runs as the hero uses the item (item, slot): what it does goes here. Return false to keep the engine’s own use (the bow coming out, the boots going on) from running.',
    [
      { name: 'item', type: 'string' },
      { name: 'slot', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'MagicCost',
    'How much magic? (Item)',
    'Asked as an item is used: how much magic it takes (the Lens of Truth: each second it is up). Without enough, it is not used. base is the engine’s (0 for most items).',
    [{ name: 'item', type: 'string' }],
    'number',
  ),
  hook(
    'ShotSpeed',
    'How fast does it fly? (Projectile)',
    'Asked as an arrow, a seed, a nut or a boomerang leaves the hand: its speed in studs a second.',
    [
      { name: 'item', type: 'string' },
      { name: 'speed', type: 'number' },
    ],
    'number',
  ),
  hook(
    'ShotPower',
    'How hard does it hit? (Projectile)',
    'Asked as a shot strikes a foe or an object: power is how hard, type its damage type (pierce, blunt, fire, ice, stun).',
    [
      { name: 'item', type: 'string' },
      { name: 'power', type: 'number' },
      { name: 'type', type: 'string' },
    ],
    'number',
  ),
  hook(
    'Hits',
    'Does it harm what it struck? (Projectile)',
    'Runs as a shot strikes something: target is the character’s name or the object’s. Do something here (a sound, a message); return false and it does no harm.',
    [
      { name: 'item', type: 'string' },
      { name: 'target', type: 'string' },
    ],
    'bool',
  ),
];

export const ITEM_EVENTS: NodeDef[] = [
  {
    type: 'event.onMagicEmpty',
    kind: 'event',
    title: 'On magic empty',
    category: 'Events',
    doc: 'Runs when the hero’s magic runs out as an item uses it (item: which one; the Lens of Truth goes down).',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'item', type: 'string' }],
    code: { name: 'magicEmpty', style: 'event' },
  },
];
