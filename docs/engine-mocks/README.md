# Engine mocks: every screen of the rewritten engine

These are clickable mocks of the full engine. They follow the "Simple by design" rules from the plan: everything works by drag, drop, left click and right click; each screen shows a few simple fields with "More" for the rest; everything can be undone.

Use them as the spec for the rewrite. Each screen lists the engine systems it needs, so the build order in the plan maps directly onto these files.

## Files

- `screens/*.dc.html`: the 47 screens plus two shared parts (`Nav`, `Sub`). `canvas.json` lays them out on four pages (Make, Characters and story, Gear and game, Play help and Brix) so only one page loads at a time.
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

Sidebar: Scene, Build, World, Logic, Cast, Animate, Scenes, Talk, Audio, Screens, Gear, Game, then Play, Learn, Help, Brix at the bottom. Sub-tabs group related screens under one sidebar item (`Sub.dc.html` lists the groups).

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
| Logic (rules and scripts) | Logic | Rules as sentences, graph or code; breakpoints and step-through; script library with settings fields | Rule engine, logic graph, code view, debugger, script components |
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
| Generator | Generator | Pick a recipe, land, size, difficulty and seed; watch it build step by step; skip steps | Generator recipes, terrain styles (P16) |
| My library | Library | Saved assets, characters, bricks, clips, effects, scripts, body plans; drag into this game; pack files | Personal library across projects (P24) |
| States and library | States | Clip per state, speed blending, layers, automatic motion, clip library by genre | Animation state machine, layers, retargeting (P23) |
| Menus | Menus | Inventory, equipment, item wheel, map, save slots, settings, endings, chapter cards, level complete, high scores | Game flow screens and menu widgets (P21) |
| Money & shops | Shops | Currencies, pickup values, wallet size; shop stock by drag; prices by right-click; try buying | Currencies, wallet, shop screen (P11, P21) |
| Controls & cameras | Controls | Remap keys (press to set, clashes in red); camera per map; shooting feel; 1–4 players, split screen | Input actions, camera modes, FPS settings, local multiplayer (P15) |
| RPG & progression | Battles | Turn-based demo battle and party; stat curves by level; skill tree; balance check by room | Battle system, stats/XP, skills, balancing tools (P15, P22, P28) |
| Stretch genres | Stretch | City lots with money over time; farm plots over days; rhythm beat map | Simulation, day cycles and crops, beat maps (P20) |
| Achievements | Progress | Achievements with conditions; collectibles per room; what 100% means; time and best scores | Progress tracking (P26) |
| Gallery & teamwork | Gallery | Browse, play, remix (credits the original), report; edit together with comments; parental settings | Gallery, remix, teamwork, safety (P30) |
| Your media | Media | Drop or choose pictures, sounds, music and videos; size, resolution and length checks; game size budget; who made it (unknown blocks sharing); what it's used as | Media import, transcoding and shrinking, licence tracking, package budget |
| Translations | Translate | Languages with progress; every line by screen; missing / check me / done; AI fill marked for review; preview with fit warnings; plural, right-to-left and font rules; translator file | String table generated from dialogue, screens, quests and items; locale runtime |
| Play | Play | Play for real; start here, can't lose, slow motion, save moment, variables; "Can it be finished?" | Play session, test tools, solvability checks |
| Help | Help | Search every element; picture with callouts, steps, options; "For the AI" view | Help registry (one entry per element, with its commands) |
| Learn | Tutorial | Course per screen; watch a ghost cursor, then do it and get checked | Tutorial runner, overlays, step checks |
| Brix | Brix | Ask, see a plan, approve each step, undo; "Show me how" or "Do it for me" | Brix agent limited to the command bus and help registry |

## What the mocks fake

Data is in-memory, the photo match and Brix replies are scripted, and the game views are 2D stand-ins for the 3D engine. The interactions, panels, words and options are the real spec.
