import type { HelpEntry } from '../types';

/** Step 12b: fire and light — burnable things, torch stands, bombs, the Torch, beams, mirrors and light sensors. */
export const FIRE_LIGHT: HelpEntry[] = [
  {
    id: 'asset.fireLight',
    also: [
      'fire',
      'burn',
      'burnable',
      'vines',
      'barricade',
      'web',
      'beam',
      'light beam',
      'laser',
      'mirror',
      'reflect',
      'flame',
      'sun',
      'light sensor',
      'zelda',
    ],
    screen: 'assets',
    kind: 'setting',
    name: 'Fire and light (burns, beam, flame, mirror)',
    purpose:
      'What the asset does with fire and light. **Burns**: a torch’s flame, a fire hit, a bomb’s blast or a burning thing touching it sets it alight; it burns for some seconds and is gone for good. **Shines a beam**: a beam of light runs straight out of its front until something stops it. **Flame**: a fire effect burns on it, always or in one state (a lit torch stand). **Mirror**: it turns a beam a quarter turn, and Action turns it. (A light sensor is a switch **Lit by a beam**, and a torch stand a switch **Hit** by **Fire**: both in the Puzzle section.)',
    steps: [
      'Open the asset in the Asset studio (double-click it in Assets or the Starter pack).',
      'Under **Fire and light**, tick what it does: Burns, Shines a beam, Flame, or Mirror.',
      'Burns: how many seconds it burns, and whether it Spreads to burnable things touching it.',
      'Shines a beam: in which state it shines (or always), how far it reaches, its height and its colour. The beam comes out of its front: turn the placed copy (T) to aim it.',
      'Flame: in which state it burns (or always), its height and its size.',
      'Mirror: two states lean one way and the other (draw each with Only in this state); give it an interact socket for Action.',
      'Press Play and try it.',
    ],
    options: [
      [
        'Burns',
        'Caught by fire, it burns (flames, a crackle) for its seconds and is gone; saves remember. Logic hears On burned.',
      ],
      [
        'Spreads',
        'While it burns it sets burnable things touching it alight: a row of vines burns from one end to the other.',
      ],
      [
        'Shines a beam',
        'Straight out of its front (the way the copy is turned), at the height you set, up to its reach. It stops at the first solid thing; nothing goes through walls.',
      ],
      [
        'Flame',
        'A fire effect (not bricks) on the placed copy, in its state or always: a torch stand’s flame while lit. Only a picture: it does not burn things.',
      ],
      [
        'Mirror',
        'A beam reaching it goes on from its middle a quarter turn to one side or the other, as it leans. Turned with Action (or by logic’s Set state), it sends the beam the other way.',
      ],
    ],
    tips: [
      'Make a mirror a Push block too, and the hero can move it into the beam.',
      'A light sensor that stays on only while lit (Held) shuts its gate again when the beam leaves it.',
      'Switch opens a gate (Logic › From a template…) works with a light sensor or a torch stand as the switch; Light all the torches opens a gate when every torch stand burns.',
    ],
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.fireLight"]' }],
    related: ['pack.fireLight', 'play.tools', 'asset.puzzle', 'node.event.onBurned'],
  },
  {
    id: 'pack.fireLight',
    also: [
      'fire and light',
      'vines',
      'torch stand',
      'bomb',
      'bomb bag',
      'torch',
      'sun crest',
      'mirror',
      'light sensor',
    ],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Fire and light',
    purpose:
      'Ready-made pieces: **Vines**, a **Wooden barricade** and a **Spider web** that burn away; a **Torch stand** that fire lights and a **Timed torch** that goes out again after 12 s; a **Bomb bag** (five Bombs) and a **Hand torch** (the Torch) for the hero to pick up; a **Sun crest** that shines a beam, a **Mirror** to turn it, and a **Light sensor** that turns on while a beam reaches it.',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Fire and light.',
      'Drag a piece onto the map, or click it and click the ground (T turns it: aim a Sun crest this way).',
      'Wire a torch stand or a light sensor to a gate with Logic › From a template… › Switch opens a gate, or light all the torches with Light all the torches.',
    ],
    commands: ['asset.place'],
    match: [{ sel: '[aria-label="Fire and light"]' }, { in: '[aria-label="Fire and light"]' }],
    related: ['asset.fireLight', 'play.tools', 'pack.puzzles'],
  },
  {
    id: 'play.tools',
    also: ['bomb', 'bombs', 'torch', 'item button', 'use item', 'blow up', 'explosion', 'light a torch'],
    screen: 'scene',
    kind: 'setting',
    name: 'Bombs and the Torch',
    purpose:
      'Two items do something by themselves when the hero uses them (an item button: J, K…). A **Bomb** is put down in front of the hero, lit: it fizzes, blinks red and goes off after 2.5 seconds. Its blast breaks a cracked wall (anything only explosions break), flips switches that answer explosions, sets burnable things alight, hurts enemies in it, and costs the hero a heart if too close. The **Torch** waves a flame in front of the hero: burnable things catch, torch stands light, and enemies that fear fire are hurt. Picked up (a Bomb bag, a Hand torch, or Give item), each goes into an empty item button. Logic hears them as well (On item used).',
    steps: [
      'Place a Bomb bag or a Hand torch (Starter pack › Fire and light), or give the item with logic.',
      'In Play, walk over it: its item button shows it.',
      'Press that button (J or K) facing what you want to burn or blow up; step back from a bomb.',
    ],
    tips: ['A hero holding a torch (its character’s held item: Torch) burns things with its attack too.'],
    related: ['pack.fireLight', 'asset.fireLight'],
  },
];
