import { area, type HelpEntry } from '../types';

const LIB = area('Screens and widgets');
const CANVAS = area('Screen canvas');
const PROPS = area('Widget properties');
const EDIT = '[aria-label^="Edit "]';

export const SCREENS: HelpEntry[] = [
  {
    id: 'screens.screen',
    screen: 'screens',
    kind: 'screen',
    name: 'Screens',
    purpose:
      'The 2D layer of the game: splash, title, HUD, pause, dialogue, game over and your own screens, built from widgets on a device canvas.',
    related: ['screens.list', 'screens.canvas', 'screens.props', 'help:screens'],
  },
  {
    id: 'screens.tabs',
    screen: 'screens',
    kind: 'view',
    name: 'Screens and Art tabs',
    purpose: 'Screens edits game screens; Art makes the backgrounds, icons and fonts they use.',
    match: [{ in: LIB, role: 'tab' }],
    related: ['art.screen'],
  },
  {
    id: 'screens.list',
    screen: 'screens',
    kind: 'list',
    name: 'Screen list',
    purpose:
      'Every screen of the game. ★ marks the first screen. Built-in screens can be changed: the project keeps its own copy and Reset brings the original back.',
    steps: ['Click a screen to open it.', '+ New makes a custom screen with a box, a title and a Close button.'],
    commands: ['screen.put'],
    match: [{ in: LIB, name: /^(\+ New$|★ )/ }, { in: `${LIB} .lib-item` }],
  },
  {
    id: 'screens.tree',
    screen: 'screens',
    kind: 'list',
    name: 'Widget tree',
    purpose:
      'The widgets of the open screen, inside their panels. Click one to select it. The order is also the order keyboard and gamepad focus follows.',
    match: [{ in: `${LIB} ${area('Widgets')}` }, { in: LIB, role: 'treeitem' }],
  },
  {
    id: 'screens.palette',
    screen: 'screens',
    kind: 'list',
    name: 'Add widget',
    purpose: 'Every widget as a small preview. Click to add it, or drag it onto the screen where you want it.',
    match: [{ sel: area('Add widget') }, { in: area('Add widget') }],
    related: ['widget.text', 'widget.button', 'widget.panel'],
  },
  {
    id: 'screens.canvas',
    screen: 'screens',
    kind: 'area',
    name: 'Screen canvas',
    purpose:
      'The screen on a device. Click a widget to select it; drag inside its box to move it, drag a handle to size it. Edges snap to other widgets and the screen (Alt: no snapping); arrows nudge.',
    match: [{ sel: CANVAS }, { in: `${CANVAS} .sc-device` }, { in: `${CANVAS} .sc-canvas` }],
  },
  {
    id: 'screens.device',
    screen: 'screens',
    kind: 'field',
    name: 'Device',
    purpose: 'The screen size to look at: desktop, laptop, phone, tablet, ultrawide, or a custom width × height.',
    match: [{ in: area('Device') }, { in: CANVAS, name: /^Custom (width|height)/ }],
  },
  {
    id: 'screens.rotate',
    screen: 'screens',
    kind: 'button',
    name: 'Rotate (sideways / upright)',
    purpose:
      'Holds the device upright (portrait). While upright, moves, sizes, anchors and styles change only the portrait layout; wide screens keep theirs.',
    match: [
      { in: CANVAS, name: /^⟳ (Sideways|Upright)/ },
      { in: CANVAS, name: 'Rotate the device' },
    ],
  },
  {
    id: 'screens.sample',
    screen: 'screens',
    kind: 'setting',
    name: 'Sample values and Over the HUD',
    purpose:
      'Sample values fills {hp}, {map.name} and other live values with examples; Over the HUD shows the screen on top of the HUD, as in the game.',
    match: [{ in: CANVAS, role: 'checkbox' }],
  },
  {
    id: 'screens.check',
    also: ['phone', 'tablet', 'fit', 'resolution', 'orientation', 'portrait', 'every size'],
    screen: 'screens',
    kind: 'button',
    name: 'Check all sizes',
    purpose:
      'Shows the screen on every device, both ways, and lists anything off screen, under a notch, overlapping or cut off. Click a problem to jump to it.',
    match: [{ in: CANVAS, name: /Check all sizes|See the screen on every device/ }, { in: area('Check all sizes') }],
  },
  {
    id: 'screens.playFirst',
    screen: 'screens',
    kind: 'button',
    name: 'Play from first screen',
    purpose: 'Plays the whole game from its first screen (Ctrl F5).',
    match: [{ in: CANVAS, name: /Play from first screen|Play the game from its first screen/ }],
  },
  {
    id: 'screens.handles',
    screen: 'screens',
    kind: 'tool',
    name: 'Move and size box',
    purpose: 'The box around the selected widget: drag inside to move, drag a handle to size. One undo step per drag.',
    match: [{ sel: '.sc-box' }],
  },
  {
    id: 'screens.preview',
    screen: 'screens',
    kind: 'view',
    name: 'Widgets on the canvas',
    purpose: 'The widgets as they look in the game. Click one to select it.',
    match: [{ in: `${CANVAS} .bw-screen` }, { in: `${CANVAS} .sc-under` }, { in: '.sc-pal-preview' }],
  },
  {
    id: 'screens.props',
    screen: 'screens',
    kind: 'area',
    name: 'Widget properties',
    purpose: 'The selected widget (or the screen itself): place, size, text, colours, pictures, font and actions.',
    match: [{ sel: PROPS }, { in: PROPS }],
  },
  {
    id: 'screens.anchor',
    screen: 'screens',
    kind: 'field',
    name: 'Anchor and offset',
    purpose:
      'Anchor pins the widget to a point of its parent (a corner, an edge or the middle) so it stays there on any screen size; the offset moves it from that point. Flow puts it in its panel’s row or column instead.',
    match: [{ in: area('Anchor') }, { in: PROPS, name: /^Offset [XY]$/ }],
  },
  {
    id: 'screens.pin',
    screen: 'screens',
    kind: 'field',
    name: 'Place next to',
    purpose:
      'Keeps the widget below, above, left or right of another widget (by its id), lined up on edges or centres with a gap. It follows when the other moves or grows.',
    match: [{ in: PROPS, name: /^(Place next to widget|Pin side|Pin align|Pin gap)/ }],
  },
  {
    id: 'screens.style',
    screen: 'screens',
    kind: 'field',
    name: 'Style',
    purpose: 'Size, font size, padding, corners, gap, colours, layout, alignment and bold.',
    match: [
      { in: PROPS, name: /^(Width|Height|Font size|Padding|Corners|Gap|Layout|Align|Bold)$/ },
      { in: PROPS, name: /^(Color|Background|Border):/ },
    ],
    related: ['shell.colorPicker'],
  },
  {
    id: 'screens.pictures',
    screen: 'screens',
    kind: 'field',
    name: 'Pictures and font',
    purpose:
      'A background picture (fill, fit or repeat), a picture for Image widgets, an icon for buttons, and the font. Each choice shows a preview.',
    match: [{ in: PROPS, name: /^(Background picture|Background fit|Picture|Icon|Font|Art…)/ }, { in: '.pv-pop' }],
    related: ['art.screen'],
  },
  {
    id: 'screens.widgetId',
    screen: 'screens',
    kind: 'field',
    name: 'Widget id, text and label',
    purpose: 'The id logic uses (Set screen text, On screen button), and the words the widget shows ({values} work).',
    match: [{ in: PROPS, name: /^(Widget id|Widget text|Widget label|Bindings)/ }],
  },
  {
    id: 'screens.flags',
    screen: 'screens',
    kind: 'setting',
    name: 'Hide when empty and Touch screens only',
    purpose:
      'Hide when empty hides a text with nothing to show; Touch screens only shows a widget only on phones and tablets.',
    match: [{ in: PROPS, name: /^(Hide when empty|Touch screens only)$/ }],
  },
  {
    id: 'screens.order',
    screen: 'screens',
    kind: 'button',
    name: 'Earlier, Later, Delete widget',
    purpose: 'Moves the widget up or down in its panel (and in focus order), or deletes it.',
    match: [{ in: PROPS, name: /^(Move earlier|Move later|Delete widget)$/ }],
  },
  {
    id: 'screens.screenProps',
    screen: 'screens',
    kind: 'field',
    name: 'Screen settings',
    purpose:
      'The screen’s name and kind, whether it pauses the game, its music, actions when shown and on Back, and Make this the first screen.',
    commands: ['screen.put', 'project.update'],
    match: [
      {
        in: PROPS,
        name: /^(Screen name|Screen kind|Pauses the game|Screen music|Make this the first screen|★ The game)/,
      },
    ],
  },
  {
    id: 'screens.reset',
    screen: 'screens',
    kind: 'button',
    name: 'Reset / Delete screen',
    purpose: 'A built-in screen goes back to its original (Reset); a custom screen is deleted.',
    commands: ['screen.delete'],
    match: [{ in: PROPS, name: /^(Reset to built-in|Delete screen)$/ }],
  },
];

export const ART: HelpEntry[] = [
  {
    id: 'art.screen',
    screen: 'art',
    kind: 'screen',
    name: 'Art',
    purpose:
      'Backgrounds, icons and fonts for your screens: import them from your computer, generate backgrounds from patterns, draw in pixels, or design a pixel font letter by letter.',
    related: ['art.library', 'art.start', 'screens.pictures'],
  },
  {
    id: 'art.library',
    screen: 'art',
    kind: 'list',
    name: 'Art library',
    purpose: 'Your backgrounds, icons and fonts, with Import, Generate, Draw and Design buttons for each kind.',
    commands: ['art.put', 'media.register'],
    match: [
      { in: `${LIB} ${area('Backgrounds')}` },
      { in: `${LIB} ${area('Icons')}` },
      { in: `${LIB} ${area('Fonts')}` },
    ],
  },
  {
    id: 'art.start',
    screen: 'art',
    kind: 'area',
    name: 'Make art',
    purpose:
      'What you can make: generate, draw or import a background; draw or import an icon; design or import a font.',
    match: [{ in: area('Make art') }],
  },
  {
    id: 'art.toolbar',
    screen: 'art',
    kind: 'area',
    name: 'Art toolbar',
    purpose:
      '← All art goes back; the name field renames it; Export saves it to your computer; Delete removes it (not while a screen uses it).',
    options: [
      ['⤒ PNG / SVG', 'a picture file (generated and drawn art)'],
      ['⤒ TTF', 'a font file you can install (designed fonts)'],
      ['⤒ Export', 'the original file (imports)'],
    ],
    commands: ['art.put', 'art.delete'],
    match: [{ in: `${EDIT} ${area('Art')}` }, { in: area('Export') }],
  },
  {
    id: 'art.pattern',
    screen: 'art',
    kind: 'area',
    name: 'Background generator',
    purpose:
      'Makes a background from a pattern (solid, gradient, glow, stripes, dots, checks, bricks, waves, grid, stars), up to four colours, an angle and a size.',
    match: [
      { in: `${EDIT} ${area('Pattern')}` },
      { in: EDIT, name: /^(Colour \d|\+ colour|− colour|Angle|Pattern size)/ },
    ],
  },
  {
    id: 'art.pixels',
    screen: 'art',
    kind: 'area',
    name: 'Pixel drawing',
    purpose:
      'Draw a picture pixel by pixel. Tools: pencil, eraser, fill, line, box and colour picker; Mirror paints both halves at once. The palette holds the colours; the sizes change the grid.',
    match: [
      { in: `${EDIT} ${area('Drawing tool')}` },
      { in: `${EDIT} ${area('Paint colour')}` },
      { in: EDIT, name: /^(Drawing:|This colour|\+ colour|\d+×\d+$|Clear$)/ },
    ],
  },
  {
    id: 'art.font',
    screen: 'art',
    kind: 'area',
    name: 'Font designer',
    purpose:
      'Design a pixel font: pick a letter, click squares to paint it, try it in the sample line. Width, height and gap shape every letter; Start over brings back the built-in letters. Export makes a real .ttf.',
    match: [
      { in: `${EDIT} [aria-label^="Letter"]` },
      { in: EDIT, name: /^(Sample text|Width|Height|Gap|Clear letter|Start over)$/ },
    ],
  },
  {
    id: 'art.image',
    screen: 'art',
    kind: 'view',
    name: 'Imported picture or font',
    purpose: 'An imported file is shown as it is; rename, export or delete it here, and use it from Pictures and font.',
  },
];
