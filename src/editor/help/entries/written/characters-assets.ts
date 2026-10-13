import { area, type HelpEntry } from '../types';

const CLIPS = area('Characters and clips');
const CPROPS = area('Character properties');
const ALIB = area('Asset library');
const BUILD = area('Build tools');
const APROPS = area('Asset properties');

const LOOK =
  /^(Height|Gender|Head|Hair|Face|Eyes|Expression|Facial Hair|Glasses|Hat|Costume|Outfit|Shirt|Pants|Dress|Hero Cut|Swimwear|Underwear|Lingerie|Pattern|Shoes|Gloves|Back|Cape|Scarf|Neck|Ears|Wrist|Belt)$/;
const COLOURS = /^(Skin|Hair|Eye|Glasses|Hat|Shirt|Pants|Dress|Shoe|Accent|Glove|Accessory) color$/;

export const CHARACTERS: HelpEntry[] = [
  {
    id: 'characters.screen',
    screen: 'characters',
    kind: 'screen',
    name: 'Characters',
    purpose:
      'The Character studio: make the hero and the other people of the game, dress them, give them things to hold and powers, and preview their animations.',
    related: ['characters.list', 'characters.preview', 'characters.look'],
  },
  {
    id: 'characters.list',
    screen: 'characters',
    kind: 'area',
    name: 'Characters and clips',
    purpose:
      'Your characters, and the animation clips you can preview on them (exercises, sports, martial arts, emotes).',
    steps: ['Click a character to edit it.', 'Click a clip to watch the character do it.'],
    match: [{ sel: CLIPS }, { in: `${CLIPS} .lib-item` }],
  },
  {
    id: 'characters.new',
    screen: 'characters',
    kind: 'button',
    name: 'New character',
    purpose: 'Makes a new character: + New starts from the default; the preset list starts from a ready-made look.',
    commands: ['character.create'],
    match: [{ in: CLIPS, name: /^(\+ New|New character from a preset)/ }],
  },
  {
    id: 'characters.clip',
    screen: 'characters',
    kind: 'list',
    name: 'Animation clips',
    purpose: 'Movements the character can do. Click one to play it in the preview; Standing stops.',
    commands: ['clip.create', 'clip.update', 'clip.delete'],
    match: [
      { in: CLIPS, role: 'option' },
      { in: CLIPS, name: 'Standing' },
    ],
  },
  {
    id: 'characters.preview',
    screen: 'characters',
    kind: 'view',
    name: 'Character preview',
    purpose: 'The character in 3D. Drag to turn it; Turntable spins it slowly so you see every side.',
    match: [{ in: area('Character preview and timeline') }],
  },
  {
    id: 'characters.props',
    screen: 'characters',
    kind: 'area',
    name: 'Character properties',
    purpose: 'Everything about the selected character: name, whether it is the hero, and how it looks.',
    commands: ['character.update', 'character.delete'],
    match: [{ sel: CPROPS }, { in: CPROPS }],
  },
  {
    id: 'characters.name',
    screen: 'characters',
    kind: 'field',
    name: 'Character name',
    purpose: 'How the editor, cinematics and dialogue call this character.',
    match: [{ in: CPROPS, name: 'Character name' }],
  },
  {
    id: 'characters.player',
    screen: 'characters',
    kind: 'button',
    name: 'Make player character',
    purpose: 'Makes this character the hero the player controls in Play.',
    commands: ['project.update'],
    match: [
      { in: CPROPS, name: 'Make player character' },
      { in: CPROPS, name: /^(Player character|★)/ },
    ],
  },
  {
    id: 'characters.look',
    screen: 'characters',
    kind: 'field',
    name: 'Look',
    purpose:
      'Body, face, hair, clothes and accessories. Each list changes one part; the preview updates as you choose. Outfit decides which clothing lists show.',
    match: [{ in: CPROPS, role: 'combobox', name: LOOK }],
  },
  {
    id: 'characters.colors',
    screen: 'characters',
    kind: 'field',
    name: 'Colours',
    purpose: 'The colour of each part: skin, hair, eyes, clothes, shoes, gloves, accessories and the accent colour.',
    match: [{ in: CPROPS, name: COLOURS }],
  },
  {
    id: 'characters.gear',
    screen: 'characters',
    kind: 'field',
    name: 'Held item, power and spell',
    purpose: 'What the character holds (hammer, sword, torch…), its super power, and its spell, used in Play.',
    match: [{ in: CPROPS, role: 'combobox', name: /^(Held|Power|Spell)$/ }],
  },
];

export const ASSETS: HelpEntry[] = [
  {
    id: 'assets.screen',
    screen: 'assets',
    kind: 'screen',
    name: 'Assets',
    purpose:
      'The Asset studio: build reusable objects (houses, trees, chests, doors) from bricks on a build plate, give them states, sockets and interactions, and place copies anywhere. Changing an asset changes every copy.',
    related: ['assets.library', 'assets.plate', 'assets.props'],
  },
  {
    id: 'assets.library',
    screen: 'assets',
    kind: 'area',
    name: 'Asset library',
    purpose: 'Every asset: built-in ones and your own, with how many pieces each has. Click one to open it.',
    match: [{ sel: ALIB }, { in: ALIB, role: 'option' }],
  },
  {
    id: 'assets.new',
    screen: 'assets',
    kind: 'button',
    name: 'New asset',
    purpose: 'Starts a new, empty asset on the build plate.',
    commands: ['asset.create'],
    match: [{ in: ALIB, name: '+ New asset' }],
  },
  {
    id: 'assets.find',
    screen: 'assets',
    kind: 'field',
    name: 'Find an asset',
    purpose: 'Shows only assets whose name contains what you type.',
    match: [{ in: ALIB, name: 'Find an asset' }],
  },
  {
    id: 'assets.plate',
    screen: 'assets',
    kind: 'area',
    name: 'Build plate',
    purpose:
      'Where the asset is built, brick by brick, with the same tools as the Scene. Built-in assets open as a copy you can change.',
    match: [{ sel: area('Asset build plate') }, { in: area('Asset build plate'), role: 'canvas' }],
    related: ['assets.tools', 'scene.viewport'],
  },
  {
    id: 'assets.tools',
    screen: 'assets',
    kind: 'area',
    name: 'Build tools',
    purpose:
      'Select, Move, Rotate, Resize one brick, Place bricks, Color paint, Erase, and Put socket (where the hero stands to use the asset). Undo and Redo, the piece and the colour are here too.',
    match: [{ sel: BUILD }],
    related: ['scene.tool.select', 'scene.tool.place'],
  },
  {
    id: 'assets.tool',
    screen: 'assets',
    kind: 'tool',
    name: 'Studio tools',
    purpose: 'The same tools as in the Scene, working on the asset: pick one and click or drag on the build plate.',
    options: [
      ['Select (V)', 'click a brick or a part'],
      ['Move (W) / Rotate (E)', 'drag the arrows or rings; parts turn freely'],
      ['Resize one brick (Q)', 'drag a handle to change a brick to another real size'],
      ['Place bricks (B)', 'click to add the piece shown next to the tools'],
      ['Color paint (C) / Erase (X)', 'recolour or remove bricks'],
      ['Put socket (P)', 'puts the selected socket where you click'],
    ],
    match: [
      {
        in: BUILD,
        name: /^(Select|Move|Rotate|Resize one brick|Place bricks|Color paint|Erase|Put the selected socket)/,
      },
    ],
  },
  {
    id: 'assets.piece',
    screen: 'assets',
    kind: 'field',
    name: 'Piece and colour',
    purpose:
      'The piece Place bricks puts down (click to choose a shape and size, with pictures) and the brush colour (Any colour… for any colour).',
    match: [{ in: BUILD, name: /^Piece:/ }, { in: `${BUILD} ${area('Brick colors')}` }, { in: '.brush-pop' }],
    related: ['scene.bricks.size', 'scene.bricks.colors'],
  },
  {
    id: 'assets.undo',
    screen: 'assets',
    kind: 'button',
    name: 'Undo / Redo (studio)',
    purpose: 'Takes back or puts back the last change to the asset.',
    match: [{ in: BUILD, role: 'button', name: /^(Undo|Redo)$/ }],
  },
  {
    id: 'assets.view',
    screen: 'assets',
    kind: 'area',
    name: 'Plate view controls',
    purpose: 'Focus, zoom, turn and fit the camera on the build plate.',
    related: ['scene.view'],
  },
  {
    id: 'assets.props',
    screen: 'assets',
    kind: 'area',
    name: 'Asset properties',
    purpose:
      'The open asset: its name and kind, states, sockets and interactions, whether it can be smashed and rebuilt, and whether maps place it when generated.',
    commands: ['asset.update', 'asset.delete'],
    match: [{ sel: APROPS }, { in: APROPS }],
  },
  {
    id: 'assets.name',
    screen: 'assets',
    kind: 'field',
    name: 'Asset name and kind',
    purpose: 'Its name in lists, and its kind (building, prop, nature…) used by filters and map generation.',
    match: [{ in: APROPS, name: /^(Asset name|Kind)/ }],
  },
  {
    id: 'assets.test',
    screen: 'assets',
    kind: 'button',
    name: 'Test in world',
    purpose: 'Places a copy in front of the hero and starts Play, to try the asset at once.',
    match: [{ in: APROPS, name: 'Test in world' }],
  },
  {
    id: 'assets.states',
    screen: 'assets',
    kind: 'field',
    name: 'States',
    purpose:
      'Different looks of one asset (a chest closed and open, a door shut and open). Logic and interactions switch between them.',
    steps: ['Type a name in New state name and press Add.', 'Pick the state and change the bricks for it.'],
    match: [{ in: APROPS, name: /^(New state name|Add)$/ }, { in: `${APROPS} .states *` }],
    related: ['node.world.setState'],
  },
  {
    id: 'assets.sockets',
    also: ['door', 'chest', 'open', 'press E', 'use', 'interact'],
    screen: 'assets',
    kind: 'field',
    name: 'Sockets and interactions',
    purpose:
      'A socket is a spot where the hero can use the asset (press E). An interaction says what happens: switch state, give an item, play a sound, send an event.',
    steps: [
      'Press + Socket, then Put socket (P) and click where it goes.',
      'Press + Interaction and choose what it does.',
    ],
    match: [{ in: APROPS, name: /^(\+ Socket|\+ Interaction|Add a socket first)/ }],
    related: ['node.event.onInteract'],
  },
  {
    id: 'assets.smash',
    screen: 'assets',
    kind: 'setting',
    name: 'Smash, rebuild and generation',
    purpose:
      'Can be smashed: the hero breaks it in Play (studs fly out). Can be rebuilt: holding E builds it back. Place copies when a map is generated: map generation sprinkles it around.',
    match: [{ in: APROPS, role: 'checkbox' }],
  },
  {
    id: 'assets.delete',
    screen: 'assets',
    kind: 'button',
    name: 'Delete asset',
    purpose: 'Deletes the asset. Remove or unpack its placed copies first.',
    commands: ['asset.delete'],
    match: [{ in: APROPS, name: /^(Delete|Remove or unpack the placed copies first)/ }],
  },
];
