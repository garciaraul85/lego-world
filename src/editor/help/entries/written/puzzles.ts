import type { HelpEntry } from '../types';

/** Step 12a: puzzles — push blocks, switches, locks and keys, pickups, dungeons. */
export const PUZZLES: HelpEntry[] = [
  {
    id: 'asset.puzzle',
    also: [
      'puzzle',
      'push block',
      'pull',
      'grab',
      'climb',
      'ledge',
      'switch',
      'floor switch',
      'pressure plate',
      'crystal switch',
      'lever',
      'timed switch',
      'lock',
      'small key',
      'boss key',
      'big key',
      'key',
      'pickup',
      'collectible',
      'zelda',
    ],
    screen: 'assets',
    kind: 'setting',
    name: 'Puzzle (push block, switch, lock, pickup)',
    purpose:
      'What the asset does in a puzzle. A **push block** slides square along the floor when the hero holds Action (Grab) and walks into it, and back when the hero holds Grab and steps back; walked into without Grab, it is climbed. A **switch** turns on when stepped on, hit or pressed, and stays on, stays only while held down, goes back after some seconds, or flips each time. A **lock** opens with a key: a small key (used up), the boss key (kept) or any item. A **pickup** is taken when the hero touches it. Each is one tick in the Asset studio; logic hears them with On switch, On pushed, On unlocked and On picked up.',
    steps: [
      'Open the asset in the Asset studio (double-click it in Assets or the Starter pack).',
      'Under **Puzzle**, tick what it is: Push block, Switch, Lock or Pickup.',
      'Choose the details: Can be pulled and the step; how a switch is used and how long it stays on (and which hits work: Slash, Pierce, Stun, Explosive…); the key a lock wants; the item a pickup gives.',
      'A switch’s first two states are off and on, a lock’s locked and open: one with a single state gets the pair added. Give a lock (or a lever) an interact socket where the hero uses it.',
      'Press Play and try it.',
    ],
    options: [
      [
        'Push block',
        'Hold Action (Grab) at it: arrows on the floor show the two ways (yellow: push, blue: pull) and the HUD says which key does which (“▲ W push · ▼ S pull”). Walk into it: the hero leans in, hands on it, and it slides its own size (or the studs you set) square along the floor, the hero walking behind. It stops at walls and other blocks, steps up onto a switch and holds it down, and stays on a switch until you let go of the stick and push again. Can be pulled: hold Grab and step back; the hero sits back and pulls. Walking into it without Grab climbs on top. A character sheet can set its own Push, Pull and Climb clips.',
      ],
      [
        'Stepped on',
        'Weight presses it: the hero, neighbours and enemies, push blocks and loose things the physics engine moves (a crate). Needs weight is how much must stand on it: the hero or a neighbour weighs 1, a crate 1 to 3 by its size, a push block 3. Its pad sinks a plate when pressed, and what stands on it sinks with it. Held down by: anyone or anything, the hero only, or blocks and loose things only.',
      ],
      [
        'Hit',
        'A sword swing, an arrow, a boomerang or a bomb flips it; tick the kinds of hit it answers to (none ticked: any hit). It is never broken.',
      ],
      ['Pressed', 'The hero presses Action (E) at its interact socket (a lever).'],
      [
        'Stays on · Held down only · Timed · Flips each time',
        'How long it stays on. A timed switch ticks, faster near the end.',
      ],
      [
        'Lock',
        'A door that opens when the hero presses E with its key: a small key found on this map (used up), the boss key (kept), or an item you name (used up unless Kept).',
      ],
      [
        'Pickup',
        'Small key, Boss key, Dungeon map and Compass belong to the map where they are found; a Heart heals; anything else goes into the inventory.',
      ],
    ],
    tips: [
      'Switch opens a gate (Logic › From a template…) opens and shuts a gate with any switch.',
      'Put a Small key in a Small chest (it gives one when opened) or leave one on the floor.',
      'A Weight switch is down only while something stands on it: push a block onto it to keep a gate open.',
      'Any placed object up to about two bricks high (a push block, a crate, a chest) is climbed by walking into it for a moment.',
    ],
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.puzzle"]' }],
    related: ['scene.map.dungeon', 'pack.puzzles', 'node.event.onSwitch', 'node.event.onUnlocked'],
  },
  {
    id: 'scene.map.dungeon',
    also: ['dungeon', 'dungeon map', 'compass', 'fog of war', 'minimap', 'small keys', 'temple', 'labyrinth'],
    screen: 'scene',
    kind: 'setting',
    name: 'Dungeon',
    purpose:
      'Makes the map a dungeon. Its small keys, boss key, map and compass belong to it: keys found here open only its own doors. In Play its minimap shows only where the hero has been until the **Dungeon map** is picked up here, and the **Compass** marks the chests not yet opened and the boss. The HUD shows the small keys (🗝) while the hero is here.',
    steps: [
      'Click empty ground (or nothing) so the Inspector shows the map, then open the Map settings.',
      'Tick **This map is a dungeon**.',
      'Place the Small key, Boss key, Dungeon map and Compass pickups, locked doors and the Boss door from Starter pack › Puzzle pieces.',
    ],
    tips: [
      'The line under the box counts the locks, keys, switches and blocks on the map, and warns when there are more locks than keys.',
    ],
    commands: ['map.setDungeon'],
    match: [{ in: '[data-help="scene.map.dungeon"]' }],
    related: ['asset.puzzle', 'pack.puzzles'],
  },
  {
    id: 'pack.puzzles',
    also: ['puzzle pieces', 'puzzle', 'switch', 'key', 'door', 'block', 'lever', 'crystal', 'chest'],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Puzzle pieces',
    purpose:
      'Ready-made puzzle pieces: the **Push block** (pushes and pulls), the **Floor switch** (stays down), the **Weight switch** (down only while something is on it), the **Timer switch** (back up after 10 s), the **Crystal switch** (hit it to flip it), the **Lever** (Action), the **Locked door** (a small key), the **Boss door** (the boss key), the **Small key**, **Boss key**, **Dungeon map** and **Compass** pickups, and a **Small chest** with a small key in it.',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Puzzle pieces.',
      'Drag a piece onto the map, or click it and click the ground (T turns it).',
      'Wire a switch to a gate with Logic › From a template… › Switch opens a gate, or write On switch in Logic.',
    ],
    commands: ['asset.place'],
    match: [{ sel: '[aria-label="Puzzle pieces"]' }, { in: '[aria-label="Puzzle pieces"]' }],
    related: ['asset.puzzle', 'scene.map.dungeon', 'scene.dock.pack'],
  },
];
