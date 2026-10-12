# Scene

The Scene workspace is where you build a map. [Open it](open:Scene)

## Camera

Drag to orbit, right-drag or Shift-drag to pan, wheel to zoom. On touch: one finger orbits, two fingers pan and pinch. Home fits the whole map, F frames the selection, Numpad 7 looks from the top.

## Looking around

The buttons in the top-right corner of the 3D view: ◎ focuses on the selection (F), then + and − zoom (or the + and − keys) and ⟲ ⟳ turn the view around it (Alt and the arrow keys). ⤢ shows everything (Home). ⛶ makes the scene full screen (Ctrl Shift F): the menus and side panels hide so you can concentrate on building, ▤ opens the assets as a drawer to drag things in, and Esc comes back. The same buttons are in the Asset studio.

## Selecting

With the Select tool (V), click an object to select all of it (a house, a tree). Alt-click selects a single brick, Shift-click adds to the selection, G selects the whole group, Esc deselects. The Hierarchy lists every object by type (terrain, buildings, nature, spawn points, zones, sounds, signs) with a filter box; Layers and Find are next to it.

## Right-click, hover and drag

Right-click anything in the 3D view or the Hierarchy to see everything you can do to it. An object offers Duplicate, Turn, Zoom to it, and for an asset copy also Edit in Asset studio, Unpack and the Logic events (when the player uses it, when it is smashed, when it is rebuilt). Spawn points offer Play from here and Start the game here; trigger zones offer logic for walking in and out. Right-click empty ground to add an asset, a trigger zone, a spawn point, a sound or a sign right there. Help is always near the bottom of the menu and Delete is always last. Everything in a menu can be undone. On the keyboard, Shift F10 or the menu key opens the menu for the selection; the arrow keys move and Enter picks.

Hold the pointer over a tool or a card for a moment to see what it does; the ? in the tip opens its Help page. Over the 3D view, the name of the thing under the pointer follows it.

Drag an asset card from the dock straight into the 3D view: a ghost shows where it lands, and letting go places it. Clicking a card and then the ground still works too.

## Moving, turning and resizing

Pick what you want to do in the toolbar, like in other 3D tools, and the selection shows handles for it:

- **Move (W)**: three arrows. Drag the red one to move along X, the green one to move up and down, the blue one to move along Z. Bricks move by whole studs, and up and down by plates. You can also drag the object itself to slide it across the ground.
- **Rotate (E)**: rings around the object. A whole asset (a house, a tree, a car) gets three rings and turns freely: red about X, green about Y, blue about Z, in 15° steps. Loose bricks and spawn points get the green ring and turn in quarter turns. R turns the selection once.
- **Resize (Q)**: square handles on the sides and top. A whole asset grows freely in 5% steps: a side makes it wider or deeper (from the middle), the top makes it taller, and the white corner grows it evenly; the Inspector shows its size in percent and Reset size puts it back. On a trigger zone the handles move that side. On a single brick they snap to real LEGO sizes (1×2, 2×4, 2×8…), and the top handle switches between a plate and a brick.

A turned or resized asset is a free object: it can lean into the ground or a neighbour, nothing is built on top of it, and in Play things bump into it as if it stood straight at its normal size. The Inspector shows its X, Y and Z angles (you can type them), and Straighten (also in the right-click menu) puts it back on the brick grid. Turning it a whole quarter about Y with no lean also puts it back on the grid. Unpack works once it is straight and normal size, because loose bricks always stand studs-up at their real size. LEGO World v68 saves show it straight.

While you drag, a ghost shows the result and a label shows how far it went. If the spot is not allowed, the ghost turns red and the label says why (for example, pieces would overlap or float); letting go there changes nothing and tells you why. Letting go makes one change you can undo. Spots where bricks would float or overlap are refused, so the map always keeps v68's rules. The arrow keys and Page Up / Page Down still nudge the selection, Ctrl D duplicates and Delete removes it.

## Place, Color paint and Erase

Place (B) puts down whatever you picked in the dock: a brick (Bricks: pick its shape and color) or an asset (Assets: a house, a tree, a chest). Click the ground, or drag a card straight into the scene; T turns it. The tool hint says what you are placing. Color paint (C) recolors the brick you click. Erase (X) removes it (Shift removes the whole object); bricks that hold others up are protected. Any #rrggbb color is allowed; v68's Play in v68 and the legacy export use the nearest of v68's 18 colors.

## Terrain generator

Map tab › Terrain generator: tick environments (forest, city, prairie, mountains, volcanoes and more), choose a size and Generate. New seed rolls a different world. Generated houses, trees and cars become asset instances you can move, smash and edit.

## Sky, weather and lighting

The Map tab also sets the time of day, sky and weather, the map's music and ambience loop.

## Make asset

Select loose bricks and choose Make asset to turn them into a reusable asset with its own states, interactions and smash rules.

## Problems

The dock's Problems tab lists issues (blocked spawns, unreachable maps, missing references) with a button to jump to each.
