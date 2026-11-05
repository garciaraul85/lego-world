import type { HelpEntry } from '../types';

/** Step 14a: how each kind of enemy fights in play. */
export const FOES: HelpEntry[] = [
  {
    id: 'play.foes',
    also: [
      'enemies',
      'enemy brains',
      'fight style',
      'kind of fighter',
      'pebblespout',
      'watcher eye',
      'cinderjaw',
      'flitterwing',
      'threadback',
      'lanternwisp',
      'howler',
      'rattlebones',
      'finspitter',
      'bounce rock',
      'reflect',
      'beam',
      'breath',
      'ghost',
      'pack',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'Enemies in play',
    purpose:
      'Each **Kind of fighter** (Characters › Fights the hero) has its own brain in play, with real physics for what it throws. Every attack has a tell you can read: a red “!” over it, a glow, and its body drawing back (a Howler crouches to spring, a sword is raised over the shoulder, a spitter throws its head back, a bat beats its wings up). The blow comes as the tell ends: guard (hold Q facing it), dodge or parry then.',
    options: [
      [
        'Pop-up (Pebblespout)',
        'waits underground with its top showing; a few studs away it comes up, spits a rock in an arc that lands where you stand and ducks. Hold the shield toward it: the rock bounces straight back, faster, and hits it twice as hard. Up close it stays down; it can be hit only while up',
      ],
      [
        'Pop-up in water (Finspitter)',
        'hides under the water and comes up to spit a fireball, which sets alight what burns where it lands; a shield stops the fireball but does not bounce it',
      ],
      [
        'Turret (Watcher Eye)',
        'stays put and sweeps its gaze; when it sees you (nothing in the way) its eye glows while it charges, then it fires a beam. A wall between you, or a shield held to it, stops the beam',
      ],
      [
        'Melee with fire (Cinderjaw)',
        'rushes you from afar; close up it roars and breathes fire from its mouth for about a second. The breath hurts and sets you alight: jump in water to put it out',
      ],
      [
        'Flyer and Swarm (Flitterwings)',
        'flutter up off the ground, circle over you and swoop down to bite, then climb again. The fire bat’s bite sets you alight, the ice bat’s freezes you a moment',
      ],
      [
        'Ambusher (Threadback)',
        'hangs high on a thread you can see; it drops on you as you walk under, knocks you aside and bites, stays on the ground a while turning slowly, then climbs back up',
      ],
      [
        'Ghost (Lanternwisp)',
        'chases you, then fades out and drifts round behind you, then fades in to strike. Faded, it cannot be hit or locked on to; through the Lens of Truth it shows as an outline and the sword hits it',
      ],
      [
        'Pack hunter (Howler)',
        'the first to see you howls and calls the others within reach; the pack circles you and only one comes in to bite at a time; a swing at one in front makes it hop back',
      ],
      [
        'Knight (Rattlebones)',
        'circles at the edge of its reach, shield toward you; a swing at its front is answered with a quick counter. Get round to its side or back',
      ],
      ['Shooter, Melee', 'a shooter keeps its distance and shoots; a plain melee enemy walks over and swings'],
    ],
    steps: [
      'Place enemies from Starter pack › Cast, or make your own in Characters › Fights the hero and pick a Kind of fighter.',
      'Press Play. Rook carries a shield: hold Q to guard toward what you face.',
    ],
    related: ['characters.enemy', 'play.lens', 'characters.harm'],
  },
];
