# LEGO World v68 → Brick Worlds editor: parity checklist (P1.9, updated for P2 and P3)

Every v68 control and where it lives in the Phase 1 editor (`dist/editor.html`). "v68 studio" means
**Play › Open in LEGO World v68** (toolbar: *v68 studio*): v68 runs on the current project in a frame and
closing it brings the changes back as one undo step. Those rows move into new workspaces in later phases.

| v68 control | Editor (Phase 1) | Test |
|---|---|---|
| World › environments, size, seed, mountains, Generate / Reroll | Map tab › Terrain generator (Generate, New seed) | unit `map-commands`, e2e `editor` |
| World › time of day, rain, snow cover, snowing | Map tab › Sky & weather | e2e `editor` |
| Bricks › shape, kind, color | Dock › Assets › Bricks (kind, size, palette); Inspector › Piece / Color | e2e `editor` |
| Bricks › place (ghost + click) | Brick paint tool (B), T turns the brush | e2e `editor` |
| Generated houses, trees, cars… | Asset instances (one asset per shape, reused); Place asset tool (A), Unpack, Make asset; Asset studio | unit `worldgen-golden` (equal to v68 for 3 seeds × 11 environments), `asset-commands`, e2e `studios` |
| Bricks › select | Select tool (V): objects by group, Alt = one brick, Shift = add; Hierarchy, Find | e2e `editor` |
| Bricks › move | Move tool (W) drag; arrows / PgUp / PgDn; Inspector X/Z/Height | unit `commands` |
| Bricks › turn | Rotate tool (E), R, Inspector › Rotate 90° | unit `inspect` (rotateQuarter) |
| Bricks › duplicate | Edit › Duplicate (Ctrl D) | manual |
| Bricks › delete (refused when it supports others) | Delete / Erase tool (X); same v68 rule and message | unit `commands` |
| Undo / Redo | Toolbar, Ctrl Z / Ctrl Shift Z (CommandBus, 200 steps) | unit `commands`, e2e `editor` |
| Camera orbit, pan, zoom, top view, fit | Viewport mouse/touch, Home (fit), F (frame), Numpad 7 (top) | manual |
| Save dialog (copy code, download) | File › Save project file (.bwproj), Export LEGO World save (.json) | unit `project-files` |
| Open dialog (paste code, load file) | File › Import project or LEGO World save | unit `migrate` |
| New world | File › New project; World › Add map | unit `project-files` |
| Autosave (localStorage) | Autosave to IndexedDB (2 s, dirty files only); first run imports the v68 autosave | e2e `editor` (reload) |
| Explore: walk, run, jump, camera | Play (F5, Shift F5 from the selected spawn) on the engine runtime; v68 movement and collision modules | unit `session` (matches v68 Controller), e2e `play` |
| Smash & rebuild (melee) | Play: F smashes, hold E rebuilds; v68 support rules; debris | unit `session`, e2e `play` |
| Guns, magic, super powers, volcano | Play in v68 (F6) — engine port in a later phase | e2e `editor` (Play in v68) |
| Character studio: presets, look, gear, power | Characters workspace: v68 presets as built-in characters, look fields from v68's catalog, player character | unit `animator` (presets equal v68), e2e `studios` |
| Studio animations (yoga, exercise, fighting, sports routines) | Built-in keyframe clips (sampled exactly like v68), timeline editing, emotes on keys 1–4 in play | unit `animator`, e2e `studios` |
| Drawing (paint) and photo looks | v68 studio | manual |
| Neighbors: talk, roles | Play: NPCs walk and talk (T) with v68's NPC module; editing roles and dialogue — Phase 4 (v68 studio until then) | manual |
| Routes: maps, gates, preview, travel | World graph workspace: add/delete maps, drag spawn → spawn to connect, two-way / one-way / reverse / remove, start map, Validate routes; Play travels through gates | unit `gates`, `session`; e2e `play` |
| Random connected worlds | v68 studio (World › Generate connected worlds) | manual |
| Spawn editor | Spawn tool (P), Inspector › spawn name/position/facing, "Start the game here" | unit `map-commands` |
| Help pages | Help › Keyboard shortcuts; full Help guide — Phase 7 | — |
| Full screen | v68 studio / Play frame; editor full screen — Phase 8 (platform) | — |
| Agent tools (`document.modelContext`) | Still registered by v68 inside the v68 frame; editor agent tools from the command catalog — Phase 8 | e2e `engine-host` |

Known gaps in Phase 1 (by design): road paint lines are not drawn in the editor viewport (v68 draws them
in Play); NPCs and the player are not drawn in the editor viewport.

## As built — Phase 2

- `src/engine/runtime/runtime.ts`: fixed 60 Hz loop, at most 4 steps per frame, 0.25 s backlog; pause, single step, time scale.
- `src/engine/runtime/session.ts`: `PlaySession` built from `store.snapshot()` (never the live store), so Stop
  leaves the project byte-identical (unit + e2e). Hero movement/collision, NPCs and debris run v68's own modules
  (`src/engine/legacy/runtime-modules.ts`); smash, rebuild and gate travel are ports of v68 code. Each map keeps
  its own damage while playing. Cheats: respawn, rebuild all, teleport to a spawn, change the held item.
- `src/engine/runtime/play-renderer.ts`: chunked bricks with dirty-chunk re-upload, v68 character models and
  debris, v68 play camera, debug drawing (colliders near the hero, spawn/gate markers).
- `src/editor/play/PlayView.tsx`: play bar, keyboard/mouse/touch controls; Debug dock tab for watch values and cheats.
- `src/editor/graph/WorldGraph.tsx` + `gate.connect|update|delete`, `map.delete` commands and `validateWorld`
  (unreachable maps, no route back, blocked spawns, spawns outside the world) which also feed Problems.

Known gaps after Phase 2: melee smash uses v68's target-based hit, not the per-frame swept strike; guns, magic,
powers and the volcano still need Play in v68; touch camera is drag-only (no pinch zoom).

## As built — Phase 3

- `src/core/assets/{expand,instances,instancify}.ts`: `expandAsset` (4 rotations, sockets, state-only bricks via
  `onlyIn`), instances on maps (`instances.json`, brick ids `idBase + i`), and the generator post-pass that turns
  every v68 structure group into a shared asset + instance. `mapPieces` gives v68 and the play runtime the flat
  piece list, so the golden test compares it with v68's generator output directly.
- Commands: `asset.place|make|create|update|delete`, `instance.move|remove|setState|unpack`; brick commands act
  on whole instances (move, turn, delete) and refuse partial edits with a sentence that says how to edit them.
  Sync from v68 keeps instances whose bricks came back unchanged.
- `src/builtin/assets/*.json`: 17 structures extracted from the v68 generator plus 7 interactive props.
- Play: `interact` system (E at an interact/sign socket), `ActionRunner` (`runActions`: setState, emit, give,
  vars, wait, teleport, travel; screens/sounds/cinematics are logged until their phases), smash/rebuild settings
  per asset, `onRebuildFinished` event.
- Asset studio: scratch build plate with the editor's own tools and undo; edits save to the asset (and every copy)
  keeping brick order; states, sockets, interactions (shared `ActionListField`), smash and generator rules.
- Characters/clips as data: 58 presets and 43 routines extracted by script; `sampleParams` equals v68's
  `StudioMotion.parameters` for every routine; `Animator` (crossfade 0.15 s, emit/sound events); emotes in play.
- Character studio: look/gear panel from v68's catalog, turntable preview through v68's rig, shared `Timeline`
  (tracks, keys snapped to 1/30 s, eases, event/sound markers, curve).

Known gaps after Phase 3: v68's procedural weapon/movement clips are not keyframe data (the hero's walk, run and
attacks still use v68's rig directly); NPC behavior and dialogue editing wait for Logic (P4); voices, footsteps and
sound markers play when Audio lands (P5); paint and photo looks are still made in v68 studio.
