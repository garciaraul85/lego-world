import type { HelpEntry } from '../types';

/** Step 13c: the hover boots, the Lens of Truth, hidden and fake things, and the magic meter. */
export const LENS: HelpEntry[] = [
  {
    id: 'pack.lens',
    also: [
      'hover boots',
      'lens of truth',
      'lens',
      'magic jar',
      'big magic jar',
      'pit gap',
      'invisible bridge',
      'invisible platform',
      'fake wall',
      'fake floor',
      'stone alcove',
      'hidden chest',
    ],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Boots and Lens',
    purpose:
      'Ready-made pieces: the **Hover boots** (worn, they float you level in the air for a moment when you walk off an edge), the **Lens of Truth** (shows hidden things, sees through fake ones; it comes with a magic meter), a **Magic jar** (12 magic) and a **Big magic jar** (all of it); a **Pit gap** (two stone ledges with a 6-stud gap: float across it), an **Invisible bridge** (fills a Pit gap’s gap: solid, but seen only through the Lens), a **Fake wall** and a **Fake floor** (they look solid but are not), a **Stone alcove** (three walls round a little room: a Fake wall fits its open front) and a **Hidden chest** (seen only through the Lens; a Big magic jar inside).',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Boots and Lens.',
      'Drag a piece onto the map, or click it and click the ground. Put an Invisible bridge in a Pit gap’s gap, a Fake wall in a Stone alcove’s front.',
    ],
    commands: ['asset.place'],
    match: [{ sel: '[aria-label="Boots and Lens"]' }, { in: '[aria-label="Boots and Lens"]' }],
    related: ['play.lens', 'asset.lens', 'project.magic', 'pack.hooks'],
  },
  {
    id: 'asset.lens',
    also: ['hidden', 'invisible', 'fake', 'fake wall', 'fake floor', 'secret', 'see-through', 'lens of truth'],
    screen: 'assets',
    kind: 'setting',
    name: 'Hidden, Fake',
    purpose:
      '**Hidden (the Lens of Truth shows it)**: unseen in play until the hero looks through the Lens, where it shows faintly. It is still solid and works as ever: an invisible platform to walk on, a hidden chest that opens if found, a hidden door. **Fake (looks solid, isn’t)**: the hero, and everything else, walks or falls straight through it; through the Lens it looks see-through. A fake wall hides a way on; a fake floor over a gap is a trap.',
    steps: ['Open the asset in the Asset studio.', 'Under **Wind and lifting**, tick Hidden, or Fake.'],
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.lens"]' }],
    related: ['pack.lens', 'play.lens', 'asset.hook'],
  },
  {
    id: 'play.lens',
    also: ['hover boots', 'hover', 'float', 'lens of truth', 'lens', 'magic', 'slide', 'slippery', 'invisible'],
    screen: 'scene',
    kind: 'setting',
    name: 'The hover boots and the Lens of Truth in play',
    purpose:
      '**The hover boots**: their item button puts them on (silver, with little wings) or takes them off. On the ground they are ordinary shoes (walk, run, jump as ever). Walk off an edge and they hold you level in the air for a second and a half while your legs paddle; a jump does not float. Floating, the feet hardly push on the air (no harder than 0.16 g, as on ice): you sail on with the speed you had (at walking speed about 6 studs, running about 11) and can only steer and slow a little; then you fall as ever, still carried on. In water they do not float. **The Lens of Truth**: its item button holds it up to the eye (or puts it down). The view turns purple inside a dark ring; hidden things show and fake ones go see-through. It takes 4 magic a second while it is up, and goes down when the meter runs dry.',
    steps: [
      'Place the Hover boots and a Pit gap (Starter pack › Boots and Lens).',
      'In Play put the boots on (J), climb onto a ledge and walk off it toward the other.',
      'Pick up the Lens of Truth and press its button (K) near a Fake wall or an Invisible bridge.',
    ],
    related: ['pack.lens', 'asset.lens', 'project.magic', 'play.hooks'],
  },
  {
    id: 'project.magic',
    also: ['magic', 'magic meter', 'mana', 'mp', 'magic jar', 'maxMagic', 'hasMagic'],
    screen: 'scene',
    kind: 'setting',
    name: 'Magic',
    purpose:
      'The magic meter, as in Zelda. The hero has none until it gets something that uses magic (the Lens of Truth) or picks up a magic jar; then a green **Magic** bar shows under the hearts, full. The Lens takes 4 a second while it is up; a **Magic jar** gives back 12, a **Big magic jar** fills it. **The game has magic** off: items that use magic need none, and no meter shows. **Full meter**: how much it holds (48, as Ocarina’s first meter). Logic sees the variables **magic**, **maxMagic** and **hasMagic**: Set or Add variable changes them, and screens can show {magic} of {maxMagic}.',
    steps: [
      'Open the **Project** tab of the Inspector and find **Magic**.',
      'Tick or untick The game has magic, and set Full meter.',
    ],
    commands: ['project.update'],
    match: [{ in: '[data-help="project.magic"]' }],
    related: ['play.lens', 'project.swimming'],
  },
];
