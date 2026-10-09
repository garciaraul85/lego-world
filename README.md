# LEGO World & Character Builder

A dependency-free WebGL app for procedural LEGO-style worlds, editable minifigures, and third-person exploration.

Open `dist/index.html` in a browser with WebGL. No installation or build service is required.

## Connected maps

Open World → Maps & connections. Select environments and use Add map to create another map, or Copy map to duplicate the selected map. A project supports 16 maps, each with its own terrain, sky/weather, player position, NPCs and smashed objects; character appearances are shared. Generate replaces only the selected map. Save/Open and device autosave include the entire collection, while older single-world saves open as Map 1.

Random connected worlds creates 2–15 additional maps in one batch, subject to the 16-map project limit. Leave Network seed blank for a surprise, or enter a seed to reproduce the same terrain, weather, NPCs and routes. Use selected environments restricts the pool to the environment checkboxes; otherwise all environments are eligible. Map size follows the World size selector. Maps receive shuffled primary environments, unique terrain seeds, varied skies/weather and safe Crossroads spawn points. A spanning tree and occasional extra routes connect every generated map to the selected existing spawn with travel in both directions. Generation opens a preview; existing maps stay intact, and Undo removes the entire batch. `node tests/random-worlds.cjs` covers reachability, seed reproduction, native controls, safe travel, capacity, project persistence and atomic undo.

Every map starts with an Arrival point. Add named spawn points and use Place on map to tap open terrain, or Use player position to reuse the explorer's location. Choose another map and arrival point, enable Travel both ways for a return route, and connect. The network cards and connection rows preview either endpoint in 3D; Return goes back, and Explore from spawn tests the arrival.

Connected points glow cyan. While exploring, walk within the gate and press G or tap Travel. Gates with multiple nearby connections offer a destination selector. Arrivals check the complete character rig against scenery and neighbors, move old edge points inside the boundary, and recover blocked or destroyed arrival ground using nearby or alternate supported ground. Travel renders the destination immediately and suppresses immediate return travel. On touchscreens it activates when pressed, so running cannot move out of range before release. `node tests/travel.cjs` checks a formerly failing saved edge gate, destination render batches/sky/HUD, safe arrival and touch press/release. Removing a point or map also removes its connections; Undo restores the change. `node tests/maps.cjs` checks persistence, compatibility, validation, preview, routes, travel and collection undo.

## Character studio

Choose Characters, edit a preset or create a custom character, then select Explore. The collection stores up to 24 editable characters. Appearance, clothes, colors, expressions, hats and gear update the 3D preview immediately. Save / Open exports or restores the full project, including the character collection, player position and smashed objects. Version 1–3 projects remain supported. Female profiles include editable breast size and rounded, natural or angular contours on the toy torso.

The model uses chamfered molded edges, tapered arm segments, rounded hip joints, smoother head and hair meshes, a hollow head stud and two-sided cape/wings. The torso widens toward the hips, shoulder joints connect to the torso, hand size matches the proportions, and short hair has a shaped fringe. Elbow and knee hinges separate upper arms/forearms and thighs/shins. Walking, running, jumping and smashing bend the joints; clothing and prints split at each hinge, shoes follow the shin and held items stay intact in the hand. A supporting foot stays planted during grounded movement. Jumps blend through reaching arms, tucked knees at the apex, extended legs during descent, and a planted landing crouch. A short edge grace period and buffered jump input make jumps more forgiving. Unarmed hits close both hands, keep the elbow tucked, drive the knuckles straight forward and retract into guard without a sideways sweep. Hits use restrained body motion and recovery. Held tools follow a controlled outward arc and stay clear of the head and torso; objects break at contact, and leaving exploration or respawning cancels a pending hit. Prints use the same surface coordinates in both the drawing editor and the 3D preview.

Height in Appearance offers Very short (70%), Short (85%), Regular (100%), Taller than average (112%), and Tall (125%). The whole articulated figure and equipment scale together; collision boxes, effects, projectiles, and preview framing follow the chosen height. Heights save with characters and neighbors. Existing characters default to Regular.

## Building scale

New city worlds use larger street districts, 10 × 8 stud houses, and 8 × 10 stud skyscrapers with 6–10 storeys. Rooms have 7.2 studs of headroom and four-stud entrances. Castles have larger courtyards, towers, gates, and halls. All buildings remain editable and destructible brick assemblies. Existing worlds retain their pieces and boundaries; use World → Generate to create the larger buildings, or Undo to restore the previous world. Layout versions preserve both old and new district dimensions when saving or importing.

Forest trees now have 12–18 brick trunk layers and eight-stud canopies; rainforest trees have 20–28 trunk layers, and beach palms have 12–18 layers and broad fronds. Regenerate an existing world to use the larger trees.

The sky projects the sun, moon, stars, and clouds from world directions using the actual camera orientation and lens. Sun and moon orbit over a twenty-minute sandbox day, with lighting and sky colors following their elevation. The time-of-day selector sets the starting time. Roads use seamless asphalt surfaces and clipped paint for lane markings; markings have no collision or brick pieces. Saved highway marking tiles remain in the save data but render and collide as paint.

## Artwork and photos

Draw on parts opens a pen/eraser canvas for each character part and its six sides. The canvas shows the actual part colors and patterns beneath your ink, including facial prints and clothing detail. Select a part, draw, undo strokes, clear one side or import an image. Erase and Clear reveal the original asset appearance. Strokes update the 3D character during drawing. Completed strokes are backed up automatically, and Done commits any unfinished stroke, saves the character and confirms the result. Transparent PNG artwork follows the part in 3D and is included in project exports. Missing accessories are added when chosen for painting.

From a photo processes PNG, JPEG or WebP locally. Crop to a person to transfer a palette and stylized face, clothes, shoes and selected gear prints, or crop one item and apply it to a chosen part. Select matching outfit, hair and accessory shapes; the importer does not infer 3D geometry from photos. Images stay on the device. Large artwork can exceed browser storage; Save downloads a project that includes the artwork.

Random neighbors spawn safely around each world and wander nearby. Approach a neighbor and press T or Talk. Select a topic or type a question about the world, weather, controls or rebuilding. Dialogue is generated locally from preset responses. Saved projects retain the neighbors.

## Controls

- WASD or arrows: walk relative to the camera.
- Shift: run.
- Space: jump.
- F: smash an object within reach.
- Hold E: rebuild nearby smashed pieces into their original assembly.
- Drag: orbit the camera; wheel or pinch: zoom.
- T: talk to a nearby neighbor.
- G: travel through a nearby connected spawn point.
- Escape: close conversation or exit exploration.

On touchscreens, use the directional pad and Run, Jump, Smash, and Hold to rebuild buttons. Hold Run while pressing Jump for a running jump; the buttons accept separate touch pointers. Respawn returns the character to a safe point. Foundations are protected; above-ground pieces can break. Loose bricks keep falling and bouncing until they rest flat on the ground or another brick. They continue settling outside exploration and after loading a saved world, and fall again if their support is smashed. Rebuilding rejects new edits that obstruct the original assembly.

## Source and checks

`world-generator.js` generates connected brick worlds. `character-catalog.js` defines validated editable assets and presets. `character-model.js` builds and animates minifigure geometry. `game-physics.js` handles collision and movement. `character-game.js` connects the studio and gameplay to the existing editor. `character-art.js` and `character-art-ui.js` provide paint atlases and local photo processing. `npc-world.js` and `npc-ui.js` provide wandering neighbors and dialogue. `builder.js` hosts the renderer, editor and project storage.

After editing source files, run `python assemble.py` to update the self-contained app, then remove `dist/app-check.js` after a syntax check. Tree, celestial-camera and road checks: `node tests/trees-sky-roads.cjs`. Scale and entrance checks: `node tests/scale-and-buildings.cjs`. Functional checks: `node tests/world.cjs` `node tests/characters.cjs`, `node tests/art-and-neighbors.cjs` `node tests/art-inputs.cjs` `node tests/joints.cjs` `node tests/debris.cjs` and `node tests/actions.cjs`. The checks exercise the application's public action tools, geometry generation, project compatibility, physics, destruction and exact restoration.

Independent LEGO-style builder; not an official LEGO product.

Weapon combat
- Equip from the Explore weapon selector or Accessories → Held item. Medieval: club, mace, war hammer, sword, battle axe, flintlock pistol and musket. Modern: baton, bat, crowbar, sledgehammer, handgun, revolver, SMG, rifle and shotgun. Existing hammer, wrench and shovel also have swing animations.
- F / Attack strikes or fires; hold F / Fire for the SMG and rifle. R / Reload refills a firearm from unlimited sandbox reserves. Run and Jump remain independent touch controls. While standing with a firearm, drag the camera to face the shot direction.
- Joint-connected windup, impact and recovery; supported long-gun stance, recoil, slide/pump cycling, and hand/magazine reload movement. Projectiles use swept first-hit collision, including barrel obstruction and terrain, and expire at world borders. Destruction restores exact original pieces through the existing rebuild system. Ammunition is per character and weapon during the session; equipment remains in saved character profiles.
- `node tests/weapons.cjs` checks weapon rigs, hit timing, occlusion, range, ammo/reload and independent touch actions.
