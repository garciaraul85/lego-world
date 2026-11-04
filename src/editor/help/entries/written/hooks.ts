import type { HelpEntry } from '../types';

/** Step 13b: the hook line, the grapple rope and the magnet glove; what the hook catches on and what is metal. */
export const HOOKS: HelpEntry[] = [
  {
    id: 'pack.hooks',
    also: [
      'hook line',
      'hookshot',
      'longshot',
      'clawshot',
      'grapple',
      'rope',
      'magnet',
      'magnesis',
      'hook target',
      'swing beam',
      'iron crate',
      'light crate',
    ],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Hook and magnet',
    purpose:
      'Ready-made pieces: the **Hook line** (a hookshot: 16 studs), the **Grapple rope** (to hang and swing from: 18 studs), the **Magnet glove** (lifts metal: 14 studs); a **Hook target** (a stone post with a gold ring the hook catches on: put it up on a wall), a **Swing beam** (a tall frame whose beam the rope catches on), a **Light crate** (loose and light: the hook line pulls it to you) and an **Iron crate** (loose, metal and heavy: the magnet glove lifts it).',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Hook and magnet.',
      'Drag a piece onto the map, or click it and click the ground. Placed on top of a wall, a Hook target sits on it.',
    ],
    commands: ['asset.place'],
    match: [{ sel: '[aria-label="Hook and magnet"]' }, { in: '[aria-label="Hook and magnet"]' }],
    related: ['play.hooks', 'asset.hook', 'pack.shots'],
  },
  {
    id: 'asset.hook',
    also: ['hook', 'metal', 'iron', 'magnet', 'catches', 'hookshot target'],
    screen: 'assets',
    kind: 'setting',
    name: 'The hook catches on it, Metal',
    purpose:
      '**The hook catches on it**: the hook line and the grapple rope hold on to it (a target, a ring, a beam). The hook line pulls the hero to it; the rope holds the hero hanging from it, if it is over the hero. Wood (anything that burns), ladders and vines catch anyway; stone does not. **Metal**: it is iron: a loose one is the magnet glove’s to lift, and it is heavy (2.5 times as dense as water: it sinks, and the hook line will not pull it).',
    steps: [
      'Open the asset in the Asset studio.',
      'Under **Wind and lifting**, tick The hook catches on it, or Metal.',
    ],
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.hook"]' }],
    related: ['pack.hooks', 'play.hooks', 'asset.wind'],
  },
  {
    id: 'play.hooks',
    also: [
      'hook line',
      'hookshot',
      'pull',
      'rope',
      'swing',
      'pendulum',
      'climb rope',
      'let go',
      'magnet glove',
      'lift metal',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'The hook line, the rope and the magnet glove in play',
    purpose:
      '**The hook line**: its item button takes it out. Hold Attack to aim (the hero stands; dots show the line, the mark green where it will catch; the move keys turn and tilt the aim), let go to shoot. The chain flies straight out. Where it catches, the two ends pull together and **the lighter one moves**: the hero (6) is pulled to a hook target or wood, held up by the chain, and climbs onto the ledge there if there is one; a light loose thing (a Light crate, 3.8) is pulled to the hero; a key or heart it touches comes back on the hook. On stone it clinks and comes back; a foe it hits is stunned. **The grapple rope**: aimed the same way at something over the hero, it holds the hero on the rope, a pendulum: the move keys push the swing (time the pushes with it), with Shift held forward and back climb the rope and let it out, Jump lets go and the hero flies on with the swing’s speed. **The magnet glove**: hold Attack at a metal loose thing: it rises and floats ahead (a spring to a point in front, the glove holding its weight; a heavy thing lags). Forward and back move it out and in, left and right turn. Let go and it falls: dropped on a floor switch, it holds it down.',
    steps: [
      'Place the Hook line, a Smooth wall and a Hook target on it (Starter pack › Hook and magnet).',
      'In Play take out the hook line (J), face the target, hold F and let go.',
      'Hang from a Swing beam with the Grapple rope; lift an Iron crate with the Magnet glove.',
    ],
    related: ['pack.hooks', 'asset.hook', 'play.shots'],
  },
];
