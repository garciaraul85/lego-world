import type { HelpEntry } from '../types';

/** Step 12c-2: wind (fans, the Gust leaf, pinwheels), water currents, putting fire out, things to lift and throw. */
export const WIND: HelpEntry[] = [
  {
    id: 'asset.wind',
    also: [
      'wind',
      'fan',
      'gust',
      'blow',
      'blows',
      'drag',
      'lift',
      'throw',
      'rock',
      'pot',
      'carry',
      'breaks',
      'wind temple',
    ],
    screen: 'assets',
    kind: 'setting',
    name: 'Wind and lifting (blows wind, lift and throw)',
    purpose:
      'What the asset does as a fan, and whether the hero can lift it. **Blows wind**: air leaves its front (the way it is turned) at its speed, always or in one of its states, across its width and height, as far as its reach or the first wall (it goes round a post). Its speed falls off along the way. The air pushes what it meets by **drag**, as real air does (F = ½ρ·Cd·A·v², against the thing’s mass and its friction on the ground): loose crates, bricks and bombs are blown along by the physics engine, heavy things stay put, an ice block slides off in a strong wind. The hero walks into it more slowly, leaning into it, braces against it standing, and in a strong one is blown back; on ice or in the air it drifts with it. It spins **pinwheels** (switches Turned by the wind) and blows **small flames** out (a lit torch stand, a burning stick). **Lift and throw**: Action lifts it over the hero’s head; Action again throws it (walking) or puts it down (standing). Thrown, it flies in an arc and rolls to rest; a switch it strikes is hit, and lying on a floor switch it weighs on it. **Breaks**: it breaks where it lands, dropping what it holds.',
    steps: [
      'Open the asset in the Asset studio (double-click it in Assets or the Starter pack).',
      'Under **Wind and lifting**, tick Blows wind or Lift and throw.',
      'Blows wind: set Speed, Reach, Width, Height and when it Blows (always, or in one of its states).',
      'Lift and throw: tick Breaks for a pot; Weight is what it weighs on a floor switch.',
      'Press Play and try it.',
    ],
    options: [
      [
        'Speed',
        'How fast the air leaves it (studs a second). 16: the hero leans into it. 24 and up: it blows the hero back.',
      ],
      ['Reach', 'How far it blows (studs). A wall stops it sooner.'],
      ['Width, Height', 'How big the blast is at the fan; it spreads a little as it goes.'],
      ['Blows', 'Always, or only in one of its states (a Switch fan blows while on).'],
      ['Breaks', 'Thrown or put down hard, it breaks where it lands or on what it hits, and drops its loot.'],
      ['Weight', 'What it weighs on a floor switch (the hero weighs 1).'],
    ],
    tips: [
      'A fan blowing across a gap: the hero cannot jump across into it, but can with it behind.',
      'A Switch fan turned on by a Pinwheel the hero spins with the Gust leaf.',
      'A fan next to a torch stand keeps it from staying lit: turn the fan off first.',
    ],
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.wind"]' }],
    related: ['pack.wind', 'play.windWater', 'asset.puzzle', 'asset.fireLight'],
  },
  {
    id: 'pack.wind',
    also: ['fan', 'switch fan', 'gale fan', 'pinwheel', 'rock', 'clay pot', 'gust leaf', 'wind', 'throw'],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Wind and throwing',
    purpose:
      'Ready-made pieces: a **Fan** (16 studs a second, 16 studs), a **Switch fan** that blows only while on, a **Gale fan** strong enough to blow the hero back (26 studs a second, 20 studs); a **Pinwheel** that is on while the wind turns it; a **Rock** to lift and throw, a **Clay pot** that breaks where it lands; and the **Gust leaf**, a big leaf the hero swings to blow a gust.',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Wind and throwing.',
      'Drag a piece onto the map, or click it and click the ground. A fan blows out of its front: turn it (R) to aim it.',
    ],
    commands: ['asset.place'],
    match: [{ sel: '[aria-label="Wind and throwing"]' }, { in: '[aria-label="Wind and throwing"]' }],
    related: ['asset.wind', 'play.windWater', 'pack.iceMove'],
  },
  {
    id: 'play.windWater',
    also: [
      'gust leaf',
      'korok leaf',
      'deku leaf',
      'current',
      'river',
      'put out',
      'extinguish',
      'blow out',
      'water',
      'brace',
      'thrown',
      'crystal switch',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'Wind, water and throwing in play',
    purpose:
      '**The Gust leaf**: picked up, it goes into an item button; its button takes it out (held in the hand) or puts it away; Attack swings it as a sword and blows a gust ahead for a moment (like the Korok Leaf of Breath of the Wild): light things fly, pinwheels spin, small flames go out, enemies are pushed. **Wind on the hero**: walking into a fan’s wind is slower, the hero leaning into it with an arm up; standing, it turns to face the wind and braces; past what its feet can hold it is blown back. In the air or on ice nothing holds it: it drifts. **Currents**: water flowing (a river’s current) carries the hero swimming, and pushes on its legs wading; a strong one pushes it downstream. Loose things float down it. **Putting fire out**: a burning stick dipped in water or held in a strong wind goes out; a lit bomb that falls in water fizzles out; a lit torch stand in a strong wind goes out (Set state, a switch or a timer put one out too). **Throwing**: rocks and pots are lifted with Action and thrown walking; what they strike is hit (a crystal switch turns) and a rock lying on a floor switch holds it down.',
    steps: [
      'Place a Fan, a Pinwheel and the Gust leaf (Starter pack › Wind and throwing).',
      'In Play walk into the fan’s wind, then pick up the Gust leaf, take it out with its button and swing it (F) at the pinwheel.',
      'Lift a Rock (E), walk and press E again to throw it at a Crystal switch.',
    ],
    related: ['pack.wind', 'asset.wind', 'play.tools'],
  },
];
