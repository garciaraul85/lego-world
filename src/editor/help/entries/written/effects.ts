import { area, type HelpEntry } from '../types';

const LIB = area('Effects library');
const PREV = area('Effect preview');
const SET = area('Effect settings');

/** P23 part 1: the Effects screen, and an effect placed on a map. */
export const EFFECTS: HelpEntry[] = [
  {
    id: 'effects.screen',
    screen: 'effects',
    kind: 'screen',
    name: 'Effects',
    also: ['particles', 'fire', 'smoke', 'sparks', 'explosion', 'magic', 'vfx'],
    purpose:
      'Effects are clouds of tiny bricks, plates, tiles and studs: fire, smoke, sparks, dust, magic, confetti. Pick one on the left to see it play in the middle. Built-in effects can be copied and changed; your own have every setting on the right. Below them, **Game effects** picks which effect plays for hits and for things that happen (level up, healing, treasure, bricks breaking, an enemy beaten).',
    related: ['effects.library', 'effects.settings', 'effects.hooks', 'scene.item.effect', 'node.effect.play'],
  },
  {
    id: 'effects.library',
    screen: 'effects',
    kind: 'list',
    name: 'Effects library',
    purpose:
      '**Mine** are the effects of this game; **Built-in** come with the editor and every game can use them. Click one to preview it. **+ New effect** starts a new one from Sparks.',
    commands: ['effect.put'],
    match: [{ sel: LIB }, { in: LIB }],
  },
  {
    id: 'effects.new',
    screen: 'effects',
    kind: 'button',
    name: 'New effect',
    purpose: 'Makes a new effect of your own, a copy of Sparks named “My effect”, and opens it.',
    commands: ['effect.put'],
    match: [{ in: '[data-tour="fx-new"]' }],
  },
  {
    id: 'effects.preview',
    screen: 'effects',
    kind: 'area',
    name: 'Effect preview',
    purpose:
      'The selected effect plays here over and over on a floor of studs: a burst again a moment after it is gone, a stream for as long as it runs. Drag to turn, wheel to zoom. **▶ Play again** starts it over; **Place on the map** puts it on the open map in the Scene.',
    match: [{ sel: PREV }, { in: PREV }],
  },
  {
    id: 'effects.settings',
    screen: 'effects',
    kind: 'area',
    name: 'Effect settings',
    also: ['particle settings', 'colour over life', 'gravity', 'bounce'],
    purpose:
      'What the effect is made of (brick, plate, tile or stud), its colours (the first at birth, the last when it fades), its size, how many and how fast. **Every setting** shows the rest: burst or stream, where particles start, which way they fly and how wide, how long they live, gravity (negative: they rise), drag, and how much they bounce off bricks. A built-in effect shows **Make a copy to change it**.',
    commands: ['effect.put', 'effect.delete'],
    match: [{ sel: SET }, { in: SET }],
    related: ['effects.hooks'],
  },
  {
    id: 'effects.hooks',
    screen: 'effects',
    kind: 'setting',
    name: 'Game effects',
    also: ['hit effect', 'level up effect', 'impact'],
    purpose:
      'Which effect plays when something is hit, by its damage type (slash, fire, electric…), and when the hero levels up, heals, picks up treasure, smashes bricks or beats an enemy. **Built-in** uses the editor’s own; **None** plays nothing.',
    commands: ['project.update'],
    match: [{ in: '[data-tour="fx-hooks"]' }],
  },
  {
    id: 'scene.item.effect',
    screen: 'scene',
    kind: 'area',
    name: 'Effect properties',
    also: ['placed effect', 'torch fire', 'fountain'],
    purpose:
      'An effect placed on the map: which effect, its size (scale), a tint, how often a burst plays again (seconds, from–to), how far away it still plays, and whether it plays from the start. Logic or an action can start and stop it by its name (**effectOn**). Right-click the ground and **Add an effect here** places one.',
    commands: ['item.update', 'item.remove'],
    match: [{ in: '[data-help="scene.item.effect"]' }],
    related: ['effects.screen'],
  },
];
