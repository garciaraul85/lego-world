# LEGO World v68 → Brick Worlds editor: parity checklist (P1.9)

Every v68 control and where it lives in the Phase 1 editor (`dist/editor.html`). "v68 studio" means
**Play › Open in LEGO World v68** (toolbar: *v68 studio*): v68 runs on the current project in a frame and
closing it brings the changes back as one undo step. Those rows move into new workspaces in later phases.

| v68 control | Editor (Phase 1) | Test |
|---|---|---|
| World › environments, size, seed, mountains, Generate / Reroll | Map tab › Terrain generator (Generate, New seed) | unit `map-commands`, e2e `editor` |
| World › time of day, rain, snow cover, snowing | Map tab › Sky & weather | e2e `editor` |
| Bricks › shape, kind, color | Dock › Assets › Bricks (kind, size, palette); Inspector › Piece / Color | e2e `editor` |
| Bricks › place (ghost + click) | Brick paint tool (B), T turns the brush | e2e `editor` |
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
| Explore / play, combat, weapons, magic, powers, smash & rebuild | Play (F5): v68 runtime on the current map; Stop discards play changes | e2e `editor` (Play) |
| Character studio, roster, drawing, photo | v68 studio (Characters workspace links there) — Phase 3 | manual |
| Neighbors: talk, roles | v68 studio / Play — Phase 3 | manual |
| Routes: maps, gates, preview, travel, random connected worlds | Map select + World › Add map, World graph view (read-only); gates & connected worlds in v68 studio — Phase 2.5 | manual |
| Spawn editor | Spawn tool (P), Inspector › spawn name/position/facing, "Start the game here" | unit `map-commands` |
| Help pages | Help › Keyboard shortcuts; full Help guide — Phase 7 | — |
| Full screen | v68 studio / Play frame; editor full screen — Phase 8 (platform) | — |
| Agent tools (`document.modelContext`) | Still registered by v68 inside the v68 frame; editor agent tools from the command catalog — Phase 8 | e2e `engine-host` |

Known gaps in Phase 1 (by design): road paint lines are not drawn in the editor viewport (v68 draws them
in Play); NPCs and the player are not drawn in the editor viewport.
