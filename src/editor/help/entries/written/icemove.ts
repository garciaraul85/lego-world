import type { HelpEntry } from '../types';

/** Step 12c: ice (slippery floors, sliding blocks, ice that melts), moving platforms and lifts, and climbing anything. */
export const ICE_MOVE: HelpEntry[] = [
  {
    id: 'asset.iceMove',
    also: [
      'ice',
      'icy',
      'slippery',
      'slide',
      'sliding block',
      'ice block',
      'melt',
      'moving platform',
      'platform',
      'lift',
      'elevator',
      'not climbable',
      'zelda',
    ],
    screen: 'assets',
    kind: 'setting',
    name: 'Ice, moving and climbing (ice, moves, not climbable)',
    purpose:
      'What the asset does as ice, as a moving platform, and for climbing. **Ice**: a **slippery floor** (the hero speeds up and slows down slowly on it and slides on after letting go, like the icy floors of Ocarina of Time); a push block of ice **slides when pushed**, on by itself until something stops it; and it **melts** with fire (a torch, a burning stick, a bomb’s blast: it steams for its seconds, then is gone for good), with fire or a beam of light, or never. A swing does nothing to ice. **Moves**: it travels from its place to the far end and back, easing in and out and waiting at each end; whoever stands on it rides along (straight up makes a lift). With **Only when on** it runs only in its second state. **Not climbable**: with Project › Climbing set to Anything, the hero cannot climb it.',
    steps: [
      'Open the asset in the Asset studio (double-click it in Assets or the Starter pack).',
      'Under **Ice, moving and climbing**, tick Ice, Moves or Not climbable.',
      'Ice: Slippery floor, Slides when pushed (a Push block only: Puzzle section), what it Melts with, and how long it takes.',
      'Moves: the far end (studs Across, Up and Deep from its place), how long it takes, how long it waits at each end, and Only when on.',
      'In the Scene view a line shows a moving platform’s path, with its outline at the far end.',
      'Press Play and try it.',
    ],
    options: [
      [
        'Slippery floor',
        'Standing on it the hero slides: slow to get going, slow to stop. Leave it on for floors, off for ice walls.',
      ],
      [
        'Slides when pushed',
        'Held (Grab) and pushed, the block slides on by itself (the hero stays where it pushed from) until a wall, a block or an edge stops it.',
      ],
      ['Melts with', 'Fire; Fire or a beam of light (a Sun crest’s beam, turned onto it with mirrors); or Nothing.'],
      [
        'Moves',
        'From its place to the far end and back, forever (or only while on), carrying the hero standing on it.',
      ],
      [
        'Only when on',
        'It runs only in its second state: logic’s Set state, Switch opens a gate, or Light all the torches can turn it on.',
      ],
      [
        'Not climbable',
        'With Climbing: Anything, walls of it cannot be climbed (the hero says “Too smooth to climb.”).',
      ],
    ],
    tips: [
      'An ice wall across a passage with a Sun crest and a mirror nearby: turn the mirror to melt the way through.',
      'A Switch lift with Light all the torches: the lift runs once every torch stand burns, like the Forest Temple’s lift.',
    ],
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.iceMove"]' }],
    related: ['pack.iceMove', 'project.climbing', 'asset.puzzle', 'asset.fireLight'],
  },
  {
    id: 'pack.iceMove',
    also: [
      'ice',
      'icy floor',
      'ice block',
      'ice wall',
      'moving platform',
      'lift',
      'switch lift',
      'rock face',
      'smooth wall',
    ],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Ice, platforms and climbing',
    purpose:
      'Ready-made pieces: an **Icy floor** to slide on; an **Ice block** that slides on when pushed; an **Ice wall** that fire or a beam of light melts; a **Moving platform** that goes 8 studs and back; a **Lift** that goes up 6 studs and down again, and a **Switch lift** that only runs while it is on; a **Rock face** to climb and a **Smooth wall** that cannot be climbed (with Project › Climbing: Anything).',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Ice, platforms and climbing.',
      'Drag a piece onto the map, or click it and click the ground.',
      'Change where a platform goes in the Asset studio (Moves): the Scene view shows its path.',
    ],
    commands: ['asset.place'],
    match: [
      { sel: '[aria-label="Ice, platforms and climbing"]' },
      { in: '[aria-label="Ice, platforms and climbing"]' },
    ],
    related: ['asset.iceMove', 'project.climbing', 'pack.puzzles'],
  },
  {
    id: 'project.climbing',
    also: [
      'climbing',
      'climb',
      'climb walls',
      'stamina',
      'stamina wheel',
      'climb jump',
      'breath of the wild',
      'ladders',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'Climbing',
    purpose:
      'What the hero climbs. **Ladders and vines only** (like Ocarina of Time): walls stop the hero, though it still climbs onto low ledges. **Anything, with stamina** (like Breath of the Wild): walk into almost any wall and keep walking to hold on; W climbs up, S down (off at the bottom), A and D move along it. Climbing uses stamina (a little holding still); the stamina bar shows while it is not full. **Space** is a climb jump: a quick hop up for a quarter of the stamina; Space while pulling back lets go. Out of stamina the hero lets go and falls. At the top it pulls itself up over the edge. Ladders and vines cost no stamina; assets ticked **Not climbable** cannot be climbed.',
    steps: [
      'Open the **Project** tab of the Inspector.',
      'Pick **Climbing**: Ladders and vines only, or Anything, with stamina.',
      'Press ▶ Play and walk into a tall wall (Starter pack › Rock face).',
    ],
    commands: ['project.update'],
    match: [{ in: '[data-help="project.climbing"]' }],
    related: ['asset.iceMove', 'pack.iceMove', 'project.movement'],
  },
];
