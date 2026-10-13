# Screens and HUD

Screens are the 2D layer over the game: splash, title, HUD, pause, dialogue, game over, and your own. [Open Screens](open:Screens)

## Built-in screens

Edit a built-in and the project keeps its own copy; Reset brings the original back. The Project tab picks the first screen Ctrl F5 starts from.

## Widgets

The Add cards show a small preview of each widget: click one to add it, or drag it onto the screen where you want it. The tree on the left is also the order keyboard and gamepad focus follow.

## Move and size on the screen

Like assets in the 3D view: the selected widget gets a box. Drag inside it to move, drag one of the 8 handles to size it. Edges and centres snap to other widgets and to the screen (pink guide lines), otherwise to an 8 px grid; hold Alt for no snapping. Arrow keys nudge by 1 (Shift: 8). Each drag is one undo step.

## Place next to another widget

Like Android constraints: Place next to keeps a widget below, above, left or right of another (by its id), lined up on edges or centres with a gap. It follows when the other one moves, grows or changes text. A chip on the canvas shows the pin.

## Live values

Write {name} in a text to show a value while playing: {hp}, {map.name}, {inventory.coin}, or any logic variable such as {score}.

## Buttons

A button's actions run when it is pressed: show or hide a screen, play a cinematic, start or resume the game, or send On screen button to logic.

## Every screen size and both ways

Screens are laid out at 1280×720 and scaled to fit; tall (portrait) screens use 720×1280. Anchors keep a widget on its edge. Pick a device or type a Custom size, and Rotate to see it held upright; the hatched strips are safe areas (notches, rounded corners).

While upright, moves, sizes, anchors and styles you change only apply to tall screens (the portrait layout); Use the normal layout forgets them. Check all sizes shows the screen on every device both ways and lists anything off screen, under a notch, overlapping or cut off; click a problem to jump to it.

## Colours

Colour fields open a picker: a shade square, hue and see-through sliders, hex, your recent colours, the brick colours and an eyedropper.

## Art: backgrounds, icons and fonts

The Art tab (next to Screens) holds your pictures and fonts:

- **Backgrounds**: Import a picture from your computer (.png .jpg .webp .svg), Generate one from a pattern (gradient, glow, stripes, dots, checks, bricks, waves, grid, stars) and colours, or Draw one in pixels.
- **Icons**: Import or Draw them with pencil, eraser, fill, line, box, colour picker and mirror.
- **Fonts**: Import a font (.ttf .otf .woff .woff2) or Design a pixel font letter by letter; Try it shows it at once.

Export saves them back to your computer: PNG or SVG for pictures, the original file for imports, and TTF for designed fonts. Use them in Properties → Pictures and font, where every choice is shown as a preview card (the picture itself, each fit with your picture, "Aa" in each font): a background picture (fill, fit or repeat), a picture for Image widgets, an icon for buttons, and the font for text. Art in use can't be deleted.

## Signs in the world

The Sign tool (U) in the Scene puts signs above the ground in the 3D world; their text can show {values} too. Signs live in the world; the HUD, title, splash, pause and other screens are made here in Screens.
