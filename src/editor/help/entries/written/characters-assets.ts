import { area, type HelpEntry } from '../types';

const CLIPS = area('Characters and clips');
const CPROPS = area('Character properties');
const ALIB = area('Asset library');
const BUILD = area('Build tools');
const APROPS = area('Asset properties');

/** P32: each look choice is a picture button named "<Choice>: <what it is now>" */
/** P9a */
const HARM = '[data-tour="char-harm"]';
const LOOK =
  /^(Height|Gender|Head|Hair|Face|Eyes|Expression|Facial Hair|Glasses|Hat|Costume|Outfit|Shirt|Pants|Dress|Hero Cut|Swimwear|Underwear|Lingerie|Pattern|Shoes|Gloves|Back|Cape|Scarf|Neck|Ears|Wrist|Belt): /;
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
    match: [
      { in: CLIPS, name: /^(\+ New|New character from a preset|Close the presets)/ },
      { in: area('New character from a preset') },
    ],
  },
  {
    id: 'characters.clip',
    screen: 'characters',
    kind: 'list',
    name: 'Animation clips',
    purpose:
      'Movements the character can do, each with a small picture of its strongest pose. Click one to play it in the preview; Standing stops.',
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
    purpose:
      'The character in 3D, with the open clip’s timeline under it. Drag to turn it; Turntable spins it slowly so you see every side. Click a track’s name in the timeline (or one of its keys ◆): the preview rings that body part and names it, and the track’s lane shows the value of each key next to it.',
    steps: [
      'Click a clip on the left; its timeline opens under the preview.',
      'Click “+ Track…” to add a track: a picture of the character for each track shows which joint it moves and how (an arm’s x reaches forward, its z raises it out to the side). Click a picture to add that track: its first key, at 0 s, is where that joint is when the character just stands.',
      'Click the lanes to move the playhead; then ← and → move it 0.1 s, to reach an exact time.',
      'Click a track name (for example “Right arm · z”): the right arm is ringed in the preview.',
      'Click a key ◆ on that lane: its time (“at”) and value show under the lanes. Type a new value and press Enter.',
      'Type a new Length (seconds) in the timeline tools and press Enter to make the clip longer or shorter. Untick Loop for a clip that plays once and holds its last pose.',
      '⇆ Mirror copies the selected track to the other side (Right arm → Left arm), mirrored, so both sides move together.',
    ],
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
    purpose:
      'How the editor, cinematics and dialogue call this character. With one of your own clips open, “Clip name” below names the clip as the clip list, cinematics (Play a clip) and emotes show it.',
    also: ['clip name', 'rename clip'],
    match: [{ in: CPROPS, name: /^(Character name|Clip name)$/ }],
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
    id: 'characters.harm',
    also: ['can be harmed', 'enemy', 'hurt', 'health', 'villager', 'neighbour hp'],
    screen: 'characters',
    kind: 'area',
    name: 'Can be harmed',
    purpose:
      'Whether the hero’s hits hurt this character when it is a neighbour on a map. Off (villagers): hits do nothing. On: it has health like an object — hit points, armour, what each kind of hit does — and at zero it leaves the play, leaves an item and sends an event. The player character’s health is its hearts.',
    related: ['assets.health', 'node.event.onDefeated'],
    match: [{ in: HARM }],
  },
  {
    id: 'characters.enemy',
    also: ['enemy', 'foe', 'monster', 'fight', 'attack the hero', 'make enemy', 'grunt', 'brute'],
    screen: 'characters',
    kind: 'area',
    name: 'Fights the hero',
    purpose:
      'Makes this character an enemy. As a neighbour on a map it wanders until it sees the hero, then walks over, raises its arm (a red “!” over its head: guard, dodge or parry now) and swings. **Make enemy** starts from a preset (Grunt, Brute, Swift) and turns on Can be harmed with its health; then change any number. × stops it fighting.',
    options: [
      ['Hits for', 'hearts its swing takes (a shield blocks it from the front)'],
      ['Reach', 'how close the hero must be for it to swing, in studs'],
      ['Sees the hero within', 'how far away it notices the hero, in studs'],
      ['Walking speed', '1 is a neighbour’s normal walk'],
      ['Seconds between swings', 'how long it waits after a swing'],
      ['Warning before a swing', 'how long the red “!” shows before the swing lands'],
    ],
    commands: ['character.update'],
    match: [{ in: '[data-tour="char-enemy"]' }],
    related: ['characters.harm', 'play.view'],
  },
  {
    id: 'characters.dialogue',
    also: ['dialogue', 'conversation', 'talk', 'lines', 'choices', 'branching', 'script', 'npc talk', 'what they say'],
    screen: 'characters',
    kind: 'area',
    name: 'Dialogue',
    purpose:
      'Conversations: what characters say. A conversation has sections; each is a list of steps played in order — a **line** (who says it, their mood, the text), a **choice** (options the player picks, each going to a section, the end, or on), **actions** (set or add to a variable, give an item, play a cinematic, unlock an achievement…), **likes** (how much the speaker likes the hero) and **jumps**. Any step or option can have an **if**: it only plays when the condition holds. **List** edits it like a chat script, **Graph** shows sections as boxes with arrows, **Script** is plain text for writers; all three are the same conversation.',
    steps: [
      'In Characters, open the **Dialogue** tab (or pick a conversation under Conversations on the left; + New writes one for the open character).',
      'Press **+ Line** and choose who says it and their mood, then type the text. Write {gems} or {hero.name} to show a value.',
      'Press **+ Choice** for options the player picks; set each option’s → to a section (or the end). **+ Section** adds a place to go.',
      'Press **+ if** on a step or an option and write a condition, like gems >= 50 or quest.sword is done or has key.',
      'Press **▶ Preview** and try it, with the values set on the side (talks, likes, variables, items).',
      'Add the conversation to the character’s **Talk** list (Properties on the right) so talking to them plays it.',
    ],
    options: [
      [
        'Conditions',
        'gems >= 50 · quest.sword is done · has key · talks > 0 (talked before) · likes >= 20 · time is night · chance 25% · door.state is open · and, or, not',
      ],
      [
        'Script',
        '== section · Who (mood): line · * option [if …] -> section · > set / add / give / like / cinematic / achieve / message · -> end',
      ],
      [
        'Style',
        'the game’s style (Project › Dialogue), or its own: Adventure, Classic RPG, Visual novel, Speech bubbles, Cinematic, Chat, Sign, Narrator',
      ],
      [
        'Checks',
        '⚠ lists sections nothing jumps to, jumps to sections that do not exist, conditions with mistakes and deleted speakers',
      ],
    ],
    tips: [
      'In Play, T or E talks; Enter, Space or a click moves on; 1–6 or the arrows pick an option. Esc or walking away ends it.',
      'Logic: Start conversation, On choice made and On conversation end (category Dialogue and Events).',
    ],
    commands: ['dialogue.put', 'dialogue.delete'],
    match: [{ sel: '.dlg-editor' }, { in: '.dlg-editor' }],
    related: ['characters.talk', 'scene.dialogue', 'scene.item.talk'],
  },
  {
    id: 'characters.talk',
    also: ['talk list', 'which conversation', 'barks', 'name colour', 'first meeting', 'after the quest'],
    screen: 'characters',
    kind: 'area',
    name: 'Talk and barks',
    purpose:
      'Which conversation plays when the hero talks to this character: the list is read from the top and the first conversation whose condition holds plays (an empty condition always does) — first meeting, during the quest, after it, at night, if the hero carries the key… **Barks** are short lines it says when the hero walks past. **Name colour** colours its name in dialogue boxes.',
    steps: [
      'Pick a conversation in **+ Add a conversation…** (or New conversation…).',
      'Write a condition beside it, like quest.sword is done or talks = 0. Leave the last one empty so something always plays.',
      '↑ moves a conversation earlier: put the most specific ones first.',
    ],
    commands: ['character.update'],
    match: [{ in: '[data-tour="char-talk"]' }],
    related: ['characters.dialogue'],
  },
  {
    id: 'characters.look',
    screen: 'characters',
    kind: 'field',
    name: 'Look',
    purpose:
      'Body, face, hair, clothes and accessories. Each choice is a button showing a small picture of what the character wears now; click it to open a panel of pictures of your character wearing each option (close-ups of the head for hats and hair, of the legs for shoes), then click one. The preview updates at once. Outfit decides which clothing choices show.',
    steps: ['Click a choice’s button (for example “Hat”).', 'Click a picture in the panel that opens.'],
    match: [
      { in: CPROPS, role: 'button', name: LOOK },
      { in: CPROPS, role: 'option' },
    ],
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
    name: 'Held item, off hand, power and spell',
    also: ['shield', 'off hand', 'guard', 'block'],
    purpose:
      'What the character holds (hammer, sword, torch…), what is in its other hand (a shield, or nothing), its super power, and its spell, used in Play. With a shield the hero guards (hold Q): hits from the front are blocked for some stamina, and raising it just before a hit parries it. Without one the hero still defends, but half of each hit gets through.',
    match: [{ in: CPROPS, role: 'button', name: /^(Held|Off hand|Power|Spell): / }],
    related: ['play.view', 'characters.harm'],
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
    id: 'assets.lockOn',
    also: ['lock on', 'target', 'z-target', 'puzzle', 'switch'],
    screen: 'assets',
    kind: 'field',
    name: 'Can be locked on',
    purpose:
      'Whether the hero can lock on to copies of this asset with Z in Play (a yellow arrow shows over it when it is close and in front; locked on, a red one). Things with health always can; turn it on for anything else — a switch to hit, a target in a puzzle. Logic’s On locked on runs when it happens.',
    commands: ['asset.update'],
    related: ['node.event.onLockedOn', 'play.view'],
    match: [{ in: '[data-tour="asset-lock-on"]' }],
  },
  {
    id: 'assets.checkpoint',
    also: ['checkpoint', 'respawn point', 'flag', 'autosave', 'save point'],
    screen: 'assets',
    kind: 'field',
    name: 'Checkpoint',
    purpose:
      'Makes copies of this asset checkpoints. In Play, when the hero touches one, Retry (after game over) and falls off the world bring the hero back there, and the game autosaves (when Autosave is on in Project › Saving). The asset shows its last state once touched — the built-in Checkpoint flag goes from down to up — and other checkpoints on the map go back to their first state.',
    tips: [
      'The built-in Save point is the other half: its interaction is Save, so E next to it saves the game.',
      'Give a checkpoint two states (down, up) with bricks that show only in one, so players see it was touched.',
    ],
    commands: ['asset.update'],
    related: ['scene.saving', 'node.game.setCheckpoint'],
    match: [{ in: '[data-tour="asset-checkpoint"]' }],
  },
  {
    id: 'assets.health',
    also: ['breakable', 'hit points', 'hp', 'takes hits', 'armour', 'armor', 'resistance', 'damage', 'crate', 'loot'],
    screen: 'assets',
    kind: 'area',
    name: 'Health',
    purpose:
      'How much it takes to break the asset. Without health one hit smashes it (when it can be smashed). With health it takes several hits; armour is taken off every hit; each kind of hit (slash, blunt, pierce, fire, explosive, electric) can be normal, weak (double), half or immune; at zero it breaks into bricks, leaves an item and sends an event.',
    steps: [
      'Pick how it breaks in **Make breakable**: 2 hits like a crate, 1 like a pot, 5 like a door, or only explosions like a stone wall.',
      'Change the **hit points** and **armour**, and what each kind of hit does.',
      'Under **At zero**, choose whether it breaks into bricks, what it leaves (an asset by name, or an inventory item) and an event to send.',
      'Press Play and hit it with F: it says how much is left, and On damaged / On defeated run in logic.',
    ],
    options: [
      ['hit points', 'a hit with bare hands or a hammer does 1, a sword 2, a sledgehammer 3'],
      ['armour', 'taken off every hit: a hit weaker than it does nothing'],
      ['hits by type', 'normal, weak ×2, half or immune, for each damage type'],
      ['leaves', 'an asset put where it was, or an item given to the hero'],
    ],
    commands: ['asset.update'],
    related: ['node.event.onDamaged', 'node.event.onDefeated', 'node.health.damage'],
    match: [{ in: '[data-tour="asset-health-sec"]' }],
  },
  {
    id: 'assets.parts',
    also: [
      'moving part',
      'animate an asset',
      'lid',
      'hinge',
      'door swings',
      'drawbridge',
      'rise',
      'pose',
      'turned part',
    ],
    screen: 'assets',
    kind: 'area',
    name: 'Parts and moving parts',
    purpose:
      'Groups of the asset’s bricks drawn turned or sized (a leaning roof), or moving between the asset’s states: a chest lid that swings open, a door, a sword that rises. A moving part has a pose in each state — a turn in degrees about X, Y and Z around a hinge, and a move in studs — and every placed copy eases to the new pose when its state changes (seconds sets how long).',
    steps: [
      'Select the bricks that move on the plate (a lid), then click “Selected bricks → moving part”.',
      'Pick a state above the plate (for example “open”) and type its turn: −105 in “turn x°” swings a lid up.',
      'In “Turns around” pick where it turns: the back bottom edge for a lid, a side edge for a door, its middle to spin.',
      'Set “seconds” for how long the move takes. Pick each state above the plate to see the part there.',
    ],
    tips: [
      'An asset made only of moving parts floats when logic puts it in the world (Spawn item at object): it does not have to fit among the bricks, like the Sword rising out of a chest.',
    ],
    commands: ['asset.update'],
    match: [{ sel: '[data-tour="asset-parts"]' }, { in: '[data-tour="asset-parts"]' }],
    related: ['assets.plate', 'assets.props'],
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
