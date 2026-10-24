import type { HelpEntry } from '../types';

/** Milestone 2b, 10b: the physics core — water on the map and loose objects. */
export const PHYSICS: HelpEntry[] = [
  {
    id: 'scene.item.water',
    also: [
      'water',
      'pool',
      'river',
      'lake',
      'sea',
      'float',
      'floating',
      'buoyancy',
      'current',
      'flow',
      'add water',
      'swim',
    ],
    screen: 'scene',
    kind: 'area',
    name: 'Water properties',
    purpose:
      'Water fills a box on the map up to its surface, drawn as see-through water in the Scene and in the game. Its surface ripples (a river’s ripples move with its **Current**) and mirrors what is above it: drawn with WebGPU at Graphics quality Medium or High, a true reflection of the bricks, characters and sky; otherwise the sky’s colours. In Play, **loose objects** and smashed bricks float in it, slow down in it and drift with its **Current**. **Kind** (Pool, River, Lake, Sea) sets its colour; **Corner** is its lowest corner and **Size** its width, depth up to the surface and length, in studs; **Current** is which way it flows and how fast (studs a second, across and deep; 0, 0 is still); **Colour** tints it.',
    steps: [
      'Right-click the ground and pick **Add water here** (or Dock › Water › Place): a pool appears.',
      'In the Inspector, pick a **Kind** and change its **Size** so it fills the hole or the river bed.',
      'For a river, set a **Current** (3, 0 flows along X).',
      'Make an asset **Loose** in the asset studio, place it in the water and press Play: it floats.',
    ],
    commands: ['item.add', 'item.update', 'item.remove'],
    match: [{ in: '[data-help="scene.item.water"]' }],
    related: ['asset.loose'],
  },
  {
    id: 'scene.dock.water',
    also: ['water in the dock', 'place a pool', 'place a river', 'kinds of water'],
    screen: 'scene',
    kind: 'list',
    name: 'Water in the dock',
    purpose:
      'Kinds of water — Pool, River, Lake, Sea — each with its starting size (a river flows). **Place** puts one on the open map beside where the player starts. Below, the water already on this map: click one to pick it.',
    commands: ['item.add'],
    match: [{ sel: '[data-tour="dock-water"]' }, { in: '[data-tour="dock-water"]', name: /^Place / }],
    related: ['scene.item.water'],
  },
  {
    id: 'project.movement',
    also: [
      'movement',
      'hero movement',
      'physics movement',
      'classic movement',
      'character controller',
      'ride',
      'stand on a crate',
      'snag',
      'stuck on walls',
      'push',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'Movement',
    purpose:
      'How the hero moves. **Classic (v68)** is the original walking: it stops dead at bricks in the way. **Physics** walks the hero with the physics engine: the same speeds and the same jump, but it slides along walls and corners instead of snagging, steps up a plate, pushes **loose** things, stands on them and rides them (a crate floating down a river carries the hero). New projects start with Physics; projects made before it (and imported v68 builds) keep Classic. Characters other than the hero still walk the classic way.',
    steps: [
      'Open the **Project** tab of the Inspector.',
      'Pick **Movement**: Classic (v68) or Physics.',
      'Press ▶ Play and walk into a loose crate, jump on it, or ride one down a river.',
    ],
    commands: ['project.update'],
    match: [{ in: '[data-help="project.movement"]' }],
    related: ['asset.loose', 'scene.item.water', 'project.quality'],
  },
  {
    id: 'asset.loose',
    also: ['loose', 'physics', 'push', 'tip over', 'falls', 'fall over', 'rigid body', 'movable object', 'crate'],
    screen: 'assets',
    kind: 'setting',
    name: 'Loose',
    purpose:
      'A loose asset is not fixed to the map: in Play every copy is a body the physics engine moves. It falls if nothing holds it up, tips over and slides when the hero walks into it, floats in water and drifts with a river’s current. Leave it off for buildings, trees and anything that should stay put. Loose copies still break when smashed.',
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.loose"]' }],
    related: ['scene.item.water', 'project.movement'],
  },
];
