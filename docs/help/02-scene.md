# Scene

The Scene workspace is where you put a map together: assets (houses, trees, chests, benches), characters, spawn points, trigger zones, sounds and signs. Bricks are not placed here one by one: they are built into assets in the [Assets screen](help:assets), and the Scene places whole assets. [Open it](open:Scene)

## Camera

Drag to orbit, right-drag or Shift-drag to pan, wheel to zoom. On touch: one finger orbits, two fingers pan and pinch. Home fits the whole map, F frames the selection, Numpad 7 looks from the top.

## Looking around

The buttons in the top-right corner of the 3D view: ◎ focuses on the selection (F), then + and − zoom (or the + and − keys) and ⟲ ⟳ turn the view around it (Alt and the arrow keys). ⤢ shows everything (Home). ⛶ makes the scene full screen (Ctrl Shift F): the menus and side panels hide so you can concentrate on building, ▤ opens the assets as a drawer to drag things in, and Esc comes back. The same buttons are in the Asset studio.

## Selecting

With the Select tool (V), click an object to select all of it (a house, a tree). Shift-click adds to the selection, G selects the whole group, Esc deselects. The Hierarchy lists every object by type (terrain, buildings, nature, spawn points, zones, sounds, signs) with a filter box; Layers and Find are next to it.

## Right-click, hover and drag

Right-click anything in the 3D view or the Hierarchy to see everything you can do to it. An object offers Duplicate, Turn, Zoom to it, and for an asset copy also Edit in the Assets screen and the Logic events (when the player uses it, when it is smashed, when it is rebuilt). Spawn points offer Play from here and Start the game here; trigger zones offer logic for walking in and out. Right-click empty ground to add an asset, a trigger zone, a spawn point, a sound or a sign right there. Help is always near the bottom of the menu and Delete is always last. Everything in a menu can be undone. On the keyboard, Shift F10 or the menu key opens the menu for the selection; the arrow keys move and Enter picks.

Hold the pointer over a tool or a card for a moment to see what it does; the ? in the tip opens its Help page. Over the 3D view, the name of the thing under the pointer follows it.

Drag an asset card from the dock straight into the 3D view: a ghost shows where it lands, and letting go places it. Clicking a card and then the ground still works too.

## Moving, turning and resizing

Pick what you want to do in the toolbar, like in other 3D tools, and the selection shows handles for it:

- **Move (W)**: three arrows. Drag the red one to move along X, the green one to move up and down, the blue one to move along Z. Things move by whole studs, and up and down by plates. You can also drag the object itself to slide it across the ground.
- **Rotate (E)**: rings around the object. A whole asset (a house, a tree, a car) gets three rings and turns freely: red about X, green about Y, blue about Z, in 15° steps. Spawn points get the green ring and turn in quarter turns. R turns the selection once.
- **Resize (Q)**: square handles on the sides and top. A whole asset grows freely in 5% steps: a side makes it wider or deeper (from the middle), the top makes it taller, and the white corner grows it evenly; the Inspector shows its size in percent and Reset size puts it back. On a trigger zone the handles move that side.

A turned or resized asset is a free object: it can lean into the ground or a neighbour, nothing is built on top of it, and in Play things bump into it as if it stood straight at its normal size. The Inspector shows its X, Y and Z angles (you can type them), and Straighten (also in the right-click menu) puts it back on the brick grid. Turning it a whole quarter about Y with no lean also puts it back on the grid. LEGO World v68 saves show it straight.

While you drag, a ghost shows the result and a label shows how far it went. If the spot is not allowed, the ghost turns red and the label says why (for example, pieces would overlap or float); letting go there changes nothing and tells you why. Letting go makes one change you can undo. Spots where bricks would float or overlap are refused, so the map always keeps v68's rules. The arrow keys and Page Up / Page Down still nudge the selection, Ctrl D duplicates and Delete removes it.

## Place and Erase

Place (B) puts down the asset you picked in the dock (Assets: a house, a tree, a chest). Click the ground, or drag a card straight into the scene; press T to turn it a quarter turn before you put it down. The tool hint says what you are placing. Erase (X) removes the whole object you click; things that hold others up are protected.

To change the bricks or colours of something, double-click its card in the dock, or select it and press Edit in the Assets screen: the asset opens on its build plate, and every copy in the world changes with it.

## Terrain generator

Map tab › Terrain generator: tick environments (forest, city, prairie, mountains, volcanoes and more), choose a size and Generate. New seed rolls a different world. Generated houses, trees and cars become asset instances you can move, smash and edit.

## Sky, weather and lighting

The Map tab also sets the time of day, sky and weather, the map's music and ambience loop.

## Names, scripts and wires

Select a placed object and look under **Name, script & wires** in the Inspector.

- **Name** gives this copy its own name (“Gate switch”), so logic and wires point at exactly this copy. Without one, logic finds copies by their asset's name (the one nearest the hero).
- **+ Script on this object** makes a logic file that belongs to this copy. Its events about objects (used, hit, smashed, rebuilt, locked on) run only for this copy, and `"this"` in it means this copy. **Open script** shows it in Logic.
- **Wires** connect it to other objects without writing logic: choose **When this** (is used, is hit, is smashed, is rebuilt, is locked on), **Then** (set another object's state, remove another object, or send a custom event), the object and its state, and press **+ Wire**. A teal line joins the two objects in the view. A wire is two cards in the object's script, so Logic can add more to it (a sound, a wait, a condition). Wiring to an object without a name names it (“Treasure chest 1”).

For example, a lever that opens a gate: select the lever, choose When this **is used**, Then **set another object's state**, Object **Gate**, State **open**, + Wire.

## Make asset

Loose bricks (the ground, or something built before bricks moved into assets) are not changed one by one in the Scene. Select them and choose Make asset (Outliner, Inspector or right-click) to turn them into a reusable asset with its own states, interactions and smash rules, then change it in the Assets screen.

## Problems

The dock's Problems tab lists issues (blocked spawns, unreachable maps, missing references) with a button to jump to each.
