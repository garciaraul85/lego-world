import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

const OBJ =
  'An object placed on a map: type the asset’s name (the copy nearest the hero is used) or pick it from the list of assets placed on your maps. Its name is the asset’s Name in the Assets screen.';

export const WORLD: NodeDef[] = [
  {
    type: 'world.spawn',
    kind: 'action',
    title: 'Spawn asset',
    category: 'World',
    doc: 'Puts a copy of an asset at a spawn point of the current map.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT, { name: 'entity', type: 'entity' }],
    args: [
      { name: 'asset', kind: 'asset', label: 'Asset', help: 'The asset to place, from the Asset library.' },
      {
        name: 'at',
        kind: 'spawn',
        label: 'At spawn',
        help: 'A spawn point placed on the current map (Scene › Spawn tool); the list shows them.',
      },
    ],
    code: { name: 'world.spawn', style: 'call' },
    exec: (c, a) => {
      c.spawn(String(a.asset), String(a.at));
    },
  },
  {
    type: 'world.spawnNear',
    kind: 'action',
    title: 'Spawn item at object',
    category: 'World',
    doc: 'Puts a copy of an asset at an object’s item spot (a chest’s inside, a table’s top), turned like the object. Item: the asset’s name or id, so a variable can choose it. Object: a placed asset’s id or its name (the copy nearest the hero). Its output is the new copy, for Set state.',
    inputs: [
      EXEC_IN,
      {
        name: 'item',
        type: 'string',
        default: 'Sword',
        pick: { kind: 'asset' },
        help: 'The asset to put there, by its name in the Assets screen (Sword, Mushroom…). Wire a Get variable here to let a variable choose it.',
      },
      {
        name: 'near',
        type: 'entity',
        label: 'object',
        default: 'Treasure chest',
        pick: { kind: 'object' },
        help: `${OBJ} The item appears at its item spot (a socket of kind “spawn”, like inside a chest), or on top of it.`,
      },
    ],
    outputs: [EXEC_OUT, { name: 'entity', type: 'entity' }],
    code: { name: 'world.spawnNear', style: 'call' },
    exec: (c, _a, i) => {
      c.spawnNear(String(i.item), String(i.near));
    },
  },
  {
    type: 'world.despawn',
    kind: 'action',
    title: 'Remove',
    category: 'World',
    doc: 'Removes a placed asset from the world for this play (an id, or an asset name: the copy nearest the hero).',
    inputs: [
      EXEC_IN,
      {
        name: 'target',
        type: 'entity',
        default: '',
        pick: { kind: 'object' },
        help: OBJ,
      },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'world.despawn', style: 'call' },
    exec: (c, _a, i) => c.despawn(String(i.target)),
  },
  {
    type: 'world.setState',
    kind: 'action',
    title: 'Set state',
    category: 'World',
    doc: 'Switches a placed asset to one of its states (a chest open, a lamp off). Target: an id, or an asset name (the copy nearest the hero). Moving parts ease to the new state.',
    inputs: [
      EXEC_IN,
      {
        name: 'target',
        type: 'entity',
        default: '',
        pick: { kind: 'object' },
        help: OBJ,
      },
      {
        name: 'state',
        type: 'string',
        default: 'open',
        pick: { kind: 'state', of: 'target' },
        help: 'One of the target asset’s states, as listed under States in the Assets screen (the Treasure chest has “closed” and “open”; the Sword has “in” and “out”). Its moving parts ease to the new state.',
      },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'world.setState', style: 'call' },
    exec: (c, _a, i) => c.setState(i.target ? String(i.target) : null, String(i.state)),
  },
  {
    type: 'world.teleport',
    kind: 'action',
    title: 'Teleport hero',
    category: 'World',
    doc: 'Moves the hero to a spawn point on this map.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [{ name: 'spawn', kind: 'spawn', label: 'Spawn' }],
    code: { name: 'world.teleport', style: 'call' },
    exec: (c, a) => c.teleport(String(a.spawn)),
  },
  {
    type: 'world.travel',
    kind: 'action',
    title: 'Travel',
    category: 'World',
    doc: 'Takes the hero to another map, at one of its spawn points.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [
      { name: 'map', kind: 'map', label: 'Map' },
      { name: 'spawn', kind: 'spawn', label: 'Spawn' },
    ],
    code: { name: 'world.travel', style: 'call' },
    exec: (c, a) => c.travel(String(a.map), String(a.spawn)),
  },
  {
    type: 'world.give',
    kind: 'action',
    title: 'Give item',
    category: 'World',
    doc: 'Adds items to the hero’s inventory.',
    inputs: [
      EXEC_IN,
      {
        name: 'item',
        type: 'string',
        default: 'coin',
        help: 'The name of the item in the hero’s inventory: any word (coin, key, Sword). Screens show it with {inventory}; logic counts it by the same name.',
      },
      { name: 'count', type: 'number', default: 1, help: 'How many to add.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'world.give', style: 'call' },
    exec: (c, _a, i) => c.give(String(i.item), Number(i.count ?? 1)),
  },
];
