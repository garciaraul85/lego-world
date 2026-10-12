# Engine mocks: every screen of the rewritten engine

These are clickable mocks of the full engine. They follow the "Simple by design" rules from the plan: everything works by drag, drop, left click and right click; each screen shows a few simple fields with "More" for the rest; everything can be undone.

Use them as the spec for the rewrite. Each screen lists the engine systems it needs, so the build order in the plan maps directly onto these files.

## Files

- `screens/*.dc.html`: the 35 screens plus two shared parts (`Nav`, `Sub`). `canvas.json` lays them out on one board.
- `src/*.html`: source for most screens. `python3 build.py <Name> …` assembles `src/<Name>.html` into `screens/<Name>.dc.html` and adds the shared header, sidebar, sub-tabs, menu, toast and helpers (`H.*`).
- `check.cjs <Name> …`: renders each screen once and reports missing bindings.
- `fuzz.cjs <Name> …`: clicks every handler once and reports runtime errors.

## Shared interaction rules (all screens)

| Gesture | Does |
|---|---|
| Left click | Select. The inspector or side panel shows only a few simple fields. |
| Drag from a library or palette | Place the thing, or attach it when dropped onto an object (scripts, effects, sounds, clothes, body parts, actions). |
| Drag an object | Move it, snapping to a grid. |
| Right click | Context menu with everything you can do to that thing; Help and Delete are always last. |
| Hover | Tip with name, kind and a "?" that opens its Help entry. |
| Undo | Header button plus the toast after destructive actions. |
| Ask Brix | Every screen; Brix uses only engine commands and shows each step before doing it. |

## Screens

Sidebar: Scene, Build, World, Logic, Cast, Animate, Scenes, Talk, Audio, Screens, Gear, Game, then Play, Learn, Help, Brix at the bottom. Sub-tabs group related screens under one sidebar item.

| Screen | File | What the user does | Engine systems it needs |
|---|---|---|---|
| Home | Main | Pick a genre, open recent, tell Brix | Project store, genre profiles |
| Scene | Scene | Drag assets/characters/lights/effects/scripts in; move; right-click; inspector | Entity store, command bus, snapping, selection, undo stack, library catalog |
| Triggers | Trigger | Draw zones; set When / Who / Only if / Then; once, visible | Trigger volumes, condition evaluator, variables, events |
| Build puzzles | Puzzle | Pick what a pile becomes; choices or steps; glow style; build time; needs | Buildable piles, build animation, `pile.built` event |
| Lighting | Lighting | Mood, time of day, fog, shadows, drag lights; world size, view distance | Lights, day cycle, fog, shadows, chunk streaming |
| Build (bricks) | Build | Paint bricks, fill, erase; "Make it…" flags; custom brick shapes | Brick grid, asset save, brick catalog |
| Effects | Effects | Presets, colours, sliders, shape, direction, when it plays | Particle system, effect assets |
| Starter packs | Packs | Browse by genre, untick parts, add to game | Asset pack import, sample levels |
| World | World | Drag door dots between maps, set start, lock doors | Map graph, doors and portals, locks |
| Logic (rules) | Logic | When/If/Then sentences with chips; drag actions; scripts library | Rule engine, actions, variables, script assets |
| Wiring | Wiring | Wire switches, gates, timers to doors; car and knight boards | Signal graph (AND/OR/NOT/timer/counter), component ports |
| Quests | Quests | Step types dragged in, reorder, optional, hints, rewards, HUD preview | Quest system, objectives, quest log |
| Character | Character | Kind, colours, drag clothes on, body shape, photo | Character model, rig, clothing slots |
| Face | Face | Eyes, brows, mouth, nose, extras; expressions; blink, lip sync | Face decals or rig, expression states |
| From a photo | Photo | Drop a photo, see detected features, pick a match | Image analysis (AI), part matcher |
| Skeleton | Skeleton | Templates (two legs to spider); drag joints; add/mirror bones; drop body parts | Skeleton/rig editor, part attachment |
| Brain | Brain | Moods with "goes to … when …"; senses sliders; drag the player to test | AI state machine, perception (sight cone, hearing) |
| Animate | Animate | Drag joints to pose; keys on a timeline; presets; mirror | Keyframe animation, rig, clips |
| Cutscenes | Cutscene | Record a path by dragging; clips you move and stretch; split; shots | Timeline, camera shots, recorded paths |
| Dialogue | Dialogue | Chat bubbles, inline edit, reorder, conditions, choices, styles | Dialogue graph, conditions, text box styles |
| Audio | Audio | Drag sounds onto things; music moods; mix | Audio emitters, music states, mixer |
| Screens | Screens | Drag HUD parts, snap, looks, scripts on parts; pause, loading, game over, credits, title | UI layout system, data binding, screen flow |
| Items & combat | Items | Weapons and tools; per-move hit power; abilities; ammo; fight style; lock-on, block, parry | Item system, hitboxes, damage, projectiles, targeting |
| Enemies & bosses | Enemies | Health, weak spots, damage, drops, hurt-by; boss phase markers; breakables | Health and damage, weak spots, loot tables, boss phases |
| Vehicles | Vehicles | Horse, car, kart, tank, plane, drone, boat, submarine; feel sliders; test drive | Vehicle physics, mount/seat system, terrain kinds |
| Genre & playbook | Genre | Pick one of 35 genres; Brix's checklist; Simplest / Just my genre / Open everything; camera | Genre profiles, UI visibility, playbook data |
| Moves & water | Moves | Turn moves on, watch them, tune; pool, river, sea, lava; air meter | Character controller, swimming, diving, currents |
| Racing & sports | Racing | Paint track pieces, rotate, laps, racers; sports rules and teams | Track pieces, checkpoints, race manager, sports rules |
| Accessibility | Access | Text size, colour help, contrast, subtitles, speed, aim help, one button; checks | Settings layer, subtitles, remapping, accessibility checks |
| Save & versions | Save | Autosave, versions, go back, name; how players save; what's remembered | Project history, player save system |
| Share | Share | Cover, name, tags, checks, who can play, remix, link | Publishing, export |
| Play | Play | Play for real; start here, can't lose, slow motion, save moment, variables; "Can it be finished?" | Play session, test tools, solvability checks |
| Help | Help | Search every element; picture with callouts, steps, options; "For the AI" view | Help registry (one entry per element, with its commands) |
| Learn | Tutorial | Course per screen; watch a ghost cursor, then do it and get checked | Tutorial runner, overlays, step checks |
| Brix | Brix | Ask, see a plan, approve each step, undo; "Show me how" or "Do it for me" | Brix agent limited to the command bus and help registry |

## What the mocks fake

Data is in-memory, the photo match and Brix replies are scripted, and the game views are 2D stand-ins for the 3D engine. The interactions, panels, words and options are the real spec.
