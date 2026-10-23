import { area, type HelpEntry } from '../types';

const LIB = area('Effects library');
const PREV = area('Effect preview');
const SET = area('Effect settings');
const SLIB = area('Screen effects library');
const SPREV = area('Screen effect preview');
const SSET = area('Screen effect settings');

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
  {
    id: 'effects.tabs',
    screen: 'effects',
    kind: 'view',
    name: 'Particles and Screen',
    also: ['screen effects tab', 'particles tab'],
    purpose:
      '**Particles** are effects in the world, made of tiny bricks (fire, sparks, smoke). **Screen** effects change the whole view: the camera shakes, the screen flashes or fades, the game freezes for a split second or runs in slow motion.',
    match: [{ in: area('Kind of effect') }],
  },
  {
    id: 'effects.screen.library',
    screen: 'effects',
    kind: 'list',
    name: 'Screen effects library',
    also: ['camera shake', 'screen shake', 'flash', 'hit-stop', 'slow motion', 'fade to black', 'earthquake'],
    purpose:
      'Every screen effect: **Mine** are this game’s own, **Built-in** come with the editor (Small shake, Big shake, Rumble, Earthquake, White, Red and Gold flash, Hit-stop, Big hit, Slow motion, Finishing blow, Fade to black, Fade from black, Blink, Knocked out, Heavy landing). Each picture plays the effect while the pointer is over it. **+ New screen effect** starts from Big hit.',
    commands: ['screenEffect.put'],
    match: [{ sel: SLIB }, { in: SLIB }],
    related: ['effects.screen.settings', 'effects.screen.hooks', 'node.screen.effect'],
  },
  {
    id: 'effects.screen.preview',
    screen: 'effects',
    kind: 'area',
    name: 'Screen effect preview',
    purpose:
      'The selected screen effect plays over and over on a little scene. The ball rolls at the game’s speed: it stops during a hit-stop and slows in slow motion. **As with Reduce motion** shows what players see with that setting on; **▶ Play again** starts it over.',
    match: [{ sel: SPREV }, { in: SPREV }],
  },
  {
    id: 'effects.screen.settings',
    screen: 'effects',
    kind: 'area',
    name: 'Screen effect settings',
    also: ['shake strength', 'flash colour', 'fade out', 'freeze frame'],
    purpose:
      'Tick what the effect does; one effect can do several at once. **Shake**: how strong (studs) and how long; Slow rumble for earthquakes. **Flash**: a colour, how strong and how long. **Fade**: out to a colour (it stays until a fade in), in from a colour, or out and back in. **Hit-stop**: how long the game freezes. **Slow motion**: how slow and how long. A built-in screen effect shows **Make a copy to change it**.',
    commands: ['screenEffect.put', 'screenEffect.delete'],
    match: [{ sel: SSET }, { in: SSET }],
    related: ['effects.screen.hooks'],
  },
  {
    id: 'effects.screen.hooks',
    screen: 'effects',
    kind: 'setting',
    name: 'Game screen effects',
    also: ['hurt flash', 'low health', 'red edges', 'big hit shake'],
    purpose:
      'Which screen effect plays when the hero is hurt or beaten, lands a charged hit, levels up, beats an enemy, lands from high up, or breaks bricks. **Built-in** uses the editor’s own; **None** plays nothing. **Red edges when the hero is low on health** pulses red at the edges of the screen while the hero has a quarter of its hearts or less.',
    commands: ['project.update'],
    match: [{ in: '[data-tour="sfx-hooks"]' }],
  },
  {
    id: 'scene.map.mood',
    screen: 'scene',
    kind: 'setting',
    name: 'Screen mood',
    also: ['colour grade', 'vignette', 'rain overlay', 'night filter', 'fog', 'atmosphere', 'old film'],
    purpose:
      'How this map feels in the game: **Colour** lays a grade over the whole view (warm, cold, night, dream, old film, black and white, toxic), **Dark edges** darkens the corners, and **Drifting** sends rain streaks, snow, fog, dust, embers or leaves across the screen (**How much** sets how many). The HUD is never coloured. While **Show it over the Scene view** is ticked you see the mood as you build. Logic’s **Set screen mood** changes it while the game plays.',
    commands: ['map.setEnvironment'],
    match: [{ in: '[data-tour="map-mood"]' }],
    related: ['node.screen.mood', 'effects.screen.library'],
  },
];
