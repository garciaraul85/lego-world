import type { HelpEntry } from '../types';

/** Step 13a: the bow (plain, fire and ice arrows), the slingshot, stun nuts, the boomerang and targets. */
export const SHOTS: HelpEntry[] = [
  {
    id: 'pack.shots',
    also: [
      'bow',
      'arrow',
      'arrows',
      'quiver',
      'fire arrows',
      'ice arrows',
      'slingshot',
      'seeds',
      'stun nut',
      'deku nut',
      'boomerang',
      'whirl boomerang',
      'gale boomerang',
      'eye target',
      'archery target',
      'ice floe',
    ],
    screen: 'scene',
    kind: 'list',
    name: 'Starter pack › Bow and boomerang',
    purpose:
      'Ready-made pieces to shoot and throw: the **Bow** (taken, it comes with 10 arrows), a **Quiver** of 10 Arrows, **Fire arrows** and **Ice arrows** (5 each), the **Slingshot** (with 20 seeds) and a **Seed bag**, **Stun nuts** (3), the **Boomerang** and the **Whirl boomerang**; an **Eye target** (an arrow or a seed in its eye turns it on for good, as Zelda’s eye switches), an **Archery target** (on for a few seconds when hit; a fire arrow burns it) and the **Ice floe** an ice arrow freezes on water.',
    steps: [
      'Open **Starter pack** in the bottom dock and scroll to Bow and boomerang.',
      'Drag a piece onto the map, or click it and click the ground. Turn an Eye target (R) so its eye faces where the hero will shoot from.',
      'Wire a target to a gate with logic (On switch).',
    ],
    commands: ['asset.place'],
    match: [{ sel: '[aria-label="Bow and boomerang"]' }, { in: '[aria-label="Bow and boomerang"]' }],
    related: ['play.shots', 'pack.wind', 'pack.fireLight'],
  },
  {
    id: 'play.shots',
    also: [
      'shoot',
      'aim',
      'draw',
      'bow',
      'arrow',
      'fire arrow',
      'ice arrow',
      'slingshot',
      'boomerang',
      'stun nut',
      'trajectory',
      'arc',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'Shooting and throwing in play',
    purpose:
      '**The bow**: its item button takes it out in the left hand (the Fire arrows’ or Ice arrows’ button takes it out with those). Hold Attack to draw: the hero stands side-on, the camera comes in over the shoulder, and dots show where the arrow will fly and a mark where it comes down. The aim finds a target in front by itself (a foe, a switch, a torch stand, the water for an ice arrow, or what is locked on to) and takes the arc that hits it; the move keys turn the aim (left, right) and tilt it (forward up, back down). The longer the draw, the faster the arrow (up to 50 studs a second). Let go to shoot. **Arrows are physics**: each is a body in the physics engine that falls as it flies and is slowed by the air, against the wind (a fan blows it off course); it floats in water. Striking squarely and fast it sticks in (a loose crate is pushed by it); at a slant it glances off. A plain arrow shot through a flame catches fire; a **fire arrow** lights torch stands, burns what burns and melts ice, and water puts it out. An **ice arrow** freezes water where it goes in (a floe to stand on, which melts after a while), puts small flames out and freezes a foe for a moment. **The slingshot** draws quicker and shoots seeds that hit and break (a stun, little harm). **A stun nut** is thrown at once and bursts in a flash that stuns foes near it that can see it. **The boomerang** is thrown at once at the target in front (or as far as it goes): it curves out, stuns foes, hits switches, turns back at a wall and comes back to the hand, bringing a pickup it touches (a key, a heart). The **whirl boomerang** carries a little whirlwind that spins pinwheels and blows small flames out.',
    steps: [
      'Place the Bow and an Eye target (Starter pack › Bow and boomerang).',
      'In Play walk over the bow, press its item button (J), face the target and hold F; let go to shoot.',
      'Throw the Boomerang with its item button at a Crystal switch.',
    ],
    related: ['pack.shots', 'play.windWater', 'play.tools'],
  },
];
