import type { HelpEntry } from '../types';

/** P27 part 1: lights — placed lights, assets that give light, effects that glow, and a map's darkness. */
export const LIGHTS: HelpEntry[] = [
  {
    id: 'scene.item.light',
    also: [
      'light',
      'lights',
      'torch',
      'lamp',
      'lantern',
      'candle',
      'glow',
      'place a light',
      'shadow',
      'shadows',
      'flicker',
    ],
    screen: 'scene',
    kind: 'area',
    name: 'Light properties',
    purpose:
      'A light placed on the map lights the bricks and characters around it, in the Scene view and in the game. **Kind** starts it from a Torch, Candle, Lamp, Crystal, Lava glow or Moonbeam; then change its **Colour**, **Brightness**, how far it **Reaches** (studs; the ring around a picked light), its **Flicker** (a flame wavers) and whether **bricks cast shadows** from it (the nearest light that casts shadows draws them). **Height** lifts it off the ground. **On from the start** off: it stays dark until logic’s **Light on** (or the action **Switch a light on or off**) switches it on by its name.',
    steps: [
      'Right-click the ground and pick **Add a light here** (or Dock › Lights › Place).',
      'In the Inspector, pick a **Kind**, then move the sliders: the view shows the light as it changes.',
      'Drag the light in the view to move it; **Height** lifts it.',
      'Tick **Bricks cast shadows from it** for the light that matters most (a torch on a wall).',
    ],
    commands: ['item.add', 'item.update', 'item.remove'],
    match: [{ in: '[data-help="scene.item.light"]' }],
    related: ['scene.map.darkness', 'scene.dock.lights', 'asset.light', 'effects.light'],
  },
  {
    id: 'scene.dock.lights',
    also: ['lights in the dock', 'light presets', 'kinds of light'],
    screen: 'scene',
    kind: 'list',
    name: 'Lights in the dock',
    purpose:
      'Kinds of light — Torch, Candle, Lamp, Crystal, Lava glow, Moonbeam — each with its colour. **Place** puts one on the open map beside where the player starts. Below, the lights already on this map: click one to pick it.',
    commands: ['item.add'],
    match: [{ sel: '[data-tour="dock-lights"]' }, { in: '[data-tour="dock-lights"]', name: /^Place / }],
    related: ['scene.item.light'],
  },
  {
    id: 'scene.map.darkness',
    also: ['darkness', 'dark map', 'dark room', 'dungeon', 'cave', 'night', 'how dark', 'lighting'],
    screen: 'scene',
    kind: 'field',
    name: 'Darkness',
    purpose:
      'How dark this map is without its lights: 0 lit by its sky as usual, 1 pitch black. The sky darkens too. A dark map shows only what its lights reach — placed lights, assets that give light (a lamp post that is on) and effects that glow (fire, portals) — so a dungeon or a cave is lit by its torches. Logic’s **Set darkness** changes it while the game plays.',
    commands: ['map.setEnvironment'],
    match: [{ in: '[data-tour="map-darkness"]' }],
    related: ['scene.item.light', 'scene.map.mood'],
  },
  {
    id: 'asset.light',
    also: ['gives light', 'glowing asset', 'lamp asset', 'torch asset', 'asset light'],
    screen: 'assets',
    kind: 'setting',
    name: 'Gives light',
    purpose:
      'Every copy of this asset lights what is around it: a torch, a lamp, a glowing crystal. Pick the kind of light and change it like a placed light; **Across**, **Up** and **Deep** are where on the asset it shines from (the small marker on the plate). **Glows in** picks the states it is lit in (the Lamp post glows when it is on). Logic switches a copy’s light by the copy’s name; a smashed copy’s light goes out.',
    commands: ['asset.update'],
    match: [{ in: '[data-help="asset.light"]' }],
    related: ['scene.item.light'],
  },
  {
    id: 'effects.light',
    also: ['effect light', 'glowing effect', 'fire light', 'lights the area'],
    screen: 'effects',
    kind: 'setting',
    name: 'Lights the area',
    purpose:
      'An effect placed on the map can light what is around it while it plays: the built-in Fire glows orange, flickers and casts shadows; Portal swirl glows blue. A bigger copy (Size ×) lights further, and Stop effect puts its light out. Built-in effects show their light; make a copy to change it.',
    commands: ['effect.put'],
    match: [{ in: '[data-help="effects.light"]' }],
    related: ['scene.item.effect', 'scene.item.light'],
  },
];
