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
      'The Asset studio: build reusable objects (houses, trees, chests, doors) from bricks and from other assets on a build plate, give them states, sockets and interactions, and place copies anywhere in the Scene. Changing an asset changes every copy. This is the only place bricks are put down one by one.',
    related: ['assets.library', 'assets.plate', 'assets.props'],
  },
  {
    id: 'assets.library',
    screen: 'assets',
    kind: 'area',
    name: 'Asset library',
    purpose:
      'Every asset: built-in ones and your own, with how many pieces each has. Click one to open it on the build plate. Drag one onto the plate to build a copy of it into the open asset (a tower with a chest on top, a street of houses).',
    also: ['reuse', 'combine', 'nest', 'asset inside an asset'],
    steps: [
      'Click an asset to open it.',
      'To use it inside another asset: open that one, then drag this row onto the build plate (or press + on the row).',
    ],
    match: [{ sel: ALIB }, { in: ALIB, role: 'option' }],
  },
  {
    id: 'assets.reuse',
    also: ['reuse', 'combine', 'nest', 'extend', 'asset in asset', 'add an asset'],
    screen: 'assets',
    kind: 'button',
    name: 'Build an asset into this one (+)',
    purpose:
      'Builds a copy of another asset into the open one, next to its bricks. Its bricks (and turned parts) become part of this asset, picked up as one so Move (W) can put them where you want.',
    steps: [
      'Open the asset you want to add to.',
      'Press + on another asset’s row, or drag the row onto the build plate where it should go.',
      'Drag it into place with Move (W); Undo takes it out again.',
    ],
    tips: [
      'It is a copy: changing the other asset later does not change this one. Its sockets and interactions stay with the original.',
    ],
    commands: ['bricks.place', 'asset.update'],
    match: [{ in: ALIB, name: /^Build .+ into / }],
    related: ['assets.library', 'assets.plate'],
  },
  {
    id: 'assets.saveProblem',
    also: ['not saved', 'pieces overlap', 'cannot place brick', 'brick disappears'],
    screen: 'assets',
    kind: 'area',
    name: 'Not saved',
    purpose:
      'Shows when a change to the asset could not be saved, and why. Changing an asset changes every copy placed in the world, so if a copy would then run into something on its map, the change is taken back (the plate goes back to the saved asset).',
    steps: [
      'Read why: it names the map where a copy is in the way.',
      'Move that copy to open ground in the Scene and try again, or press Keep it as a new asset to keep your change as a separate asset.',
      'OK closes the message.',
    ],
    related: ['assets.plate', 'scene.tool.move'],
  },
  {
    id: 'assets.reset',
    also: ['messed up', 'broken asset', 'start over', 'original', 'restore'],
    screen: 'assets',
    kind: 'button',
    name: 'Reset to built-in',
    purpose:
      'Shows on a built-in asset (the chest, a tree, a house) you have changed. It puts it back as it came with the engine; every placed copy changes back too. Undo brings your version back.',
    commands: ['asset.update'],
    related: ['assets.plate', 'assets.saveProblem'],
  },
  {
    id: 'assets.libtabs',
    screen: 'assets',
    kind: 'view',
    name: 'Assets and Bricks tabs',
    purpose:
      'Assets lists every asset (open one, or build it into the open one); Bricks has every piece and colour to build with, by clicking or dragging onto the plate.',
    match: [{ in: ALIB, role: 'tab' }],
    related: ['assets.library', 'assets.bricks'],
  },
  {
    id: 'assets.bricks',
    also: ['place a brick', 'add bricks', 'pieces', 'brick'],
    screen: 'assets',
    kind: 'list',
    name: 'Bricks to build with',
    purpose:
      'Every piece (brick, plate or tile, in every size) and the colours. Click a piece, then click the build plate with Place bricks (B); or drag the piece straight onto the plate.',
    steps: [
      'Open the Bricks tab of the Asset library.',
      'Click a piece and a colour.',
      'Click the build plate where it goes, or drag the piece there. T turns it a quarter turn first.',
    ],
    match: [{ sel: '.plate-bricks' }],
    related: ['assets.bricks.kind', 'assets.bricks.size', 'assets.bricks.colors'],
  },
  {
    id: 'assets.bricks.kind',
    screen: 'assets',
    kind: 'field',
    name: 'Piece kind',
    purpose: 'Brick (full height), Plate (a third of a brick high) or Tile (flat, no studs on top).',
    match: [{ in: area('Piece kind') }],
    related: ['assets.bricks.size', 'assets.tool'],
  },
  {
    id: 'assets.bricks.size',
    screen: 'assets',
    kind: 'list',
    name: 'Piece sizes',
    purpose: 'The piece Place bricks puts down, shown as a picture with its size in studs.',
    steps: ['Click a size: Place bricks is picked for you.', 'Click the build plate, or drag the card onto the plate.'],
    match: [{ in: area('Piece sizes'), role: 'option' }, { in: area('Piece sizes') }],
    related: ['assets.tool', 'assets.bricks.colors'],
  },
  {
    id: 'assets.bricks.colors',
    also: ['colour of a brick', 'color of a brick', 'recolour', 'recolor', 'paint a brick'],
    screen: 'assets',
    kind: 'list',
    name: 'Brick colours',
    purpose:
      'The brush colour for placing and painting bricks. The last swatch, Any colour…, opens a picker for any colour at all.',
    steps: ['Click a colour.', 'Place bricks with it, or use Color paint (C) to recolour bricks.'],
    tips: ['Play shows the exact colour; v68 exports use the nearest of its 18 colours.'],
    match: [{ in: area('Brick colors') }],
    related: ['assets.tool', 'shell.colorPicker'],
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
      'Where the asset is built, brick by brick, and where other assets are built into it. Built-in assets open as a copy you can change. Drop bricks or assets from the library on the left straight onto it.',
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
    related: ['assets.bricks.size', 'assets.bricks.colors'],
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
