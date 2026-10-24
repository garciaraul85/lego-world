# Scene

The Scene workspace is where you put a map together: assets (houses, trees, chests, benches), characters, spawn points, trigger zones, sounds and signs. Bricks are not placed here one by one: they are built into assets in the [Assets screen](help:assets), and the Scene places whole assets. [Open it](open:Scene)

## Camera

Drag to orbit, right-drag or Shift-drag to pan, wheel to zoom. On touch: one finger orbits, two fingers pan and pinch. Home fits the whole map, F frames the selection, Numpad 7 looks from the top.

## Looking around

The buttons in the top-right corner of the 3D view: ◎ focuses on the selection (F), then + and − zoom (or the + and − keys) and ⟲ ⟳ turn the view around it (Alt and the arrow keys). ⤢ shows everything (Home). ⛶ makes the scene full screen (Ctrl Shift F): the menus and side panels hide so you can concentrate on building, ▤ opens the assets as a drawer to drag things in, and Esc comes back. The same buttons are in the Asset studio.

## Drawing with WebGPU or WebGL

**Draw with**, in the corner of the 3D view, picks what draws the views on this computer:

- **WebGL** — the long-standing way. It works in every browser.
- **WebGPU** — the newer way to use the graphics card. The picture is the same, except that water truly mirrors the bricks, characters and sky above it (WebGL mirrors only the sky's colours). Later it brings faster big maps.
- **Auto** — uses WebGL for now, until WebGPU has been tried on more computers.

WebGPU draws the Scene and Play, characters included. The Director's previews and the studios still use WebGL for now.

The choice is kept in this browser, not in the project. If WebGPU can't show the view on this computer, WebGL draws it instead and a message says so.

## Selecting

With the Select tool (V), click an object to select all of it (a house, a tree). Shift-click adds to the selection, G selects the whole group, Esc deselects. The Hierarchy lists every object by type (terrain, buildings, nature, spawn points, zones, sounds, signs) with a filter box; Layers and Find are next to it.

## Right-click, hover and drag

Right-click anything in the 3D view or the Hierarchy to see everything you can do to it. An object offers Duplicate, Turn, Zoom to it, and for an asset copy also Edit in the Assets screen and the Logic events (when the player uses it, when it is smashed, when it is rebuilt). Spawn points offer Play from here and Start the game here; trigger zones offer logic for walking in and out. Right-click empty ground to add an asset, a trigger zone, a spawn point, a sound or a sign right there. Help is always near the bottom of the menu and Delete is always last. Everything in a menu can be undone. On the keyboard, Shift F10 or the menu key opens the menu for the selection; the arrow keys move and Enter picks.

Hold the pointer over a tool or a card for a moment to see what it does; the ? in the tip opens its Help page. Over the 3D view, the name of the thing under the pointer follows it.

Drag an asset card from the dock straight into the 3D view: a ghost shows where it lands, and letting go places it. Clicking a card and then the ground still works too.

The dock's Effects category has every effect (fire, smoke, sparks, magic…). Point at one to see it play; **Place** puts it on the map beside where the player starts, ready to move.

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

## Lights and darkness

**Darkness** (Map tab) is how dark the map is without its lights: 0 lit by its sky as usual, 1 pitch black, the sky darkened too. A dark map shows only what its lights reach, so a dungeon or a cave is lit by its torches.

A **light** lights the bricks and characters around it, in the Scene view as in the game. Right-click the ground and pick **Add a light here**, or open the Dock's **Lights** category and press **Place** on a kind: Torch, Candle, Lamp, Crystal, Lava glow or Moonbeam. Pick it to change it in the Inspector:

- **Kind** starts it again from a preset; **Colour** and **Brightness** (0–4) set its glow.
- **Reaches** is how far it lights, in studs; a picked light shows it as a ring.
- **Flicker** makes it waver like a flame; 0 is steady.
- **Bricks cast shadows from it**: the nearest lights that cast shadows draw them: up to 4 at once on High graphics, 2 on Medium, none on Low; characters cast shadows too (a torch on a wall throws the shadows of what stands in front of it).
- **Height** lifts it; drag it in the view to move it.
- **On from the start** off: it stays dark until logic's **Light on** or the action **Switch a light on or off** switches it on by its name.

Up to 8 lights are drawn at once: the brightest near where you look. Assets that give light (the Lamp post when it is on) and effects that glow (Fire, Portal swirl) light the map too. [Lights course](action:help.lights)

**Only at night** makes a light a street lamp: it comes on as the sky gets dark and goes out at dawn (the built-in Lamp post does this).

## Fog, shadows and day and night

The Map tab sets a map's atmosphere, one undo step per change:

- **Fog** fades what is far away into its colour. **Kind** starts it from Haze, Mist, Thick fog, Ground fog, Swamp or Smoke, each shown as a picture (None keeps v68's light haze). **Starts at** and **Thickest at** are studs from the eye, **Thickness** is how much it hides at the far end, and **Colour** is its own (none: the sky's horizon). **Ground fog** lies low: thick below **Up to**, thinning above it. Characters fade into it too, and thick fog pulls the sky toward its colour.
- **Shadows' colour**: tick **Tint the shadows** to colour the light that fills them (green in a cave, warm red at sunset, cold blue in ice); **Strength** makes them brighter or darker (0: black).
- **Day and night**: while the game plays the sun moves from the **Start time** (Sky) and night falls. **A day lasts** is how many minutes a whole day takes (v68: 20); 0 stops time. **See the map at** shows any hour here in the Scene without changing the map; **Back to the start time** returns.

Logic's **Set time of day** and **Set fog** (Sky) change them while the game plays. [Atmosphere course](action:help.atmosphere)

## Water and loose things

Water fills a box on the map up to its surface; it is see-through in the Scene and in the game. Its surface ripples (a river's ripples move with its current) and mirrors what is above it: with WebGPU at Graphics quality Medium or High it is a true reflection of the bricks, characters and sky; otherwise it mirrors the sky's colours. Add it with **right-click › Add water here** or **Dock › Water › Place** (Pool, River, Lake, Sea). Pick it to change it in the Inspector:

- **Kind** — Pool, River, Lake or Sea: its colour and starting size.
- **Corner** and **Size** — where its lowest corner is and how wide, deep (up to the surface) and long it is, in studs.
- **Current** — which way it flows and how fast (studs a second, across and deep). 0, 0 is still water.
- **Colour** — a tint of your own.

An asset ticked **Loose** in the asset studio is not fixed to the map: in Play each copy falls if nothing holds it up, tips over when the hero walks into it, floats in water and drifts with the current. Smashed bricks float too. The **Water and physics course** (Help menu) walks through it.

## 3D models

Bricks make blocky things; **3D models** are smooth ones — a round lantern, a barrel, a leafy tree, a stone ring — made in a modelling tool such as Blender and saved as **glTF** (a `.glb` file, or a `.gltf` file with its data inside it). They stand on the map beside the bricks and are lit by the same sun, lights, fog and shadows, in WebGPU and WebGL.

- **Dock › 3D models** lists the built-in models (Lantern post, Barrel, Round tree, Boulder, Crystal, Toadstool, Stone ring, Vase) and the ones you imported, each with a small picture. **Place** puts one beside where the player starts; **right-click the ground › Add a 3D model here** puts the last one you placed where you clicked.
- **Import a model…** adds `.glb` or `.gltf` files to the project (up to 20 MB and 200,000 triangles each). A file that can't be used says why: one that keeps its data in other files, one compressed with Draco or meshopt, or one that isn't glTF 2.0 — export it again as one `.glb` file.
- Pick a placed model to change it in the Inspector: **Model** (which one), **Position** (the middle of its base, in studs), **Turn** (degrees about its upright axis), **Size** (1 is the size it was made at; the hero is about 4 studs tall) and **Solid in Play**.
- With **Physics** movement (Project tab), a solid model stops the hero, who can stand on it. Untick **Solid** for things to walk through, such as tall grass.

Models that animate (characters with skeletons) stand still in their rest pose for now; moving models, FBX files, and painting and sculpting come in a later milestone. The **3D models course** (Help menu) walks through it.

## Big worlds

A map holds up to **1,000,000 bricks** across a build area of ±2048 studs. The Map tab's **Big worlds** section shows the map's bricks and chunks (32 × 32 studs each):

- A map of more than 64 chunks is a **big map**. The Scene view loads the chunks around where you look, the nearest first, and the fog closes in where they end; the counter at the top of the view shows how many are loaded. Bricks whose studs are all under other bricks are drawn as plain boxes.
- **How far you see** (64–1024 studs, default 256) sets how far a big map is drawn, in the Scene and in the game.
- **Scatter** sets down many copies of one build at once around where the view looks: pick it from the pictures, set **How many** (up to 5,000) and how far **Around the view**, and press **Scatter**. Each copy stands on flat studded ground, clear of everything else, turned at random; copies that don't fit are left out, and one undo takes them all away. **Placed assets** counts them (a map holds 100,000). Copies count toward the map's 1,000,000 bricks: on a full big land Scatter sets down as many as there is room for and says the map is now full.
- **New big land** makes a map of rolling grass and hills of bricks with a flat clearing at the start: 256, 512, 1024 or 2048 studs across (2048 is about 950,000 bricks, leaving room for 50,000 more). One undo step removes it.
- In the game a big map plays the area around the hero (7 × 7 chunks): its bricks are solid and its neighbours walk about; further away they sleep until the hero comes near. Edits on a big map check the brick rules only around what changed, so placing a brick stays quick.
- Maps of more than 12,000 pieces play with ▶ Play; Play in v68 can't load them.
- A project holds up to **1,000 maps**; the Map list at the top and the Project tab's Start map find one as you type. In the game only a few maps stay loaded at once. A map that isn't loaded yet loads in small steps behind a **loading screen** (its name, its picture, a tip and real progress), so the game never freezes; the maps the current one's gates lead to load ahead a little each frame, so going there is usually instant; and a map you left comes back exactly as you left it (saves keep it too).
- The Dock shows a big asset library 120 cards at a time (**Show more** adds the next ones; searching narrows it), and asset pictures are drawn as they scroll into view.

[Big worlds course](action:help.bigworlds)

## Names, scripts and wires

Select a placed object and look under **Name, script & wires** in the Inspector.

- **Name** gives this copy its own name (“Gate switch”), so logic and wires point at exactly this copy. Without one, logic finds copies by their asset's name (the one nearest the hero).
- **+ Script on this object** makes a logic file that belongs to this copy. Its events about objects (used, hit, smashed, rebuilt, locked on) run only for this copy, and `"this"` in it means this copy. **Open script** shows it in Logic.
- **Wires** connect it to other objects without writing logic: choose **When this** (is used, is hit, is smashed, is rebuilt, is locked on), **Then** (set another object's state, remove another object, or send a custom event), the object and its state, and press **+ Wire**. A teal line joins the two objects in the view. A wire is two cards in the object's script, so Logic can add more to it (a sound, a wait, a condition). Wiring to an object without a name names it (“Treasure chest 1”).

For example, a lever that opens a gate: select the lever, choose When this **is used**, Then **set another object's state**, Object **Gate**, State **open**, + Wire.

## Hints and messages

Help text for the player belongs on the screen, not in the world. Every action list (a trigger zone's On enter, an asset's interaction, a screen button, a cinematic's events) has **Show message**: its text appears in the HUD's message line for a few seconds. The Training yard's tips are zones that show a message when the hero walks into each spot.

## Make asset

Loose bricks (the ground, or something built before bricks moved into assets) are not changed one by one in the Scene. Select them and choose Make asset (Outliner, Inspector or right-click) to turn them into a reusable asset with its own states, interactions and smash rules, then change it in the Assets screen.

## Problems

The dock's Problems tab lists issues (blocked spawns, unreachable maps, missing references) with a button to jump to each.
