# LEGO World v68 → Brick Worlds editor: parity checklist (P1.9, updated for P2–P6)

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

## As built — Phase 4

- `src/core/logic/catalog/*`: 48 node types (events, flow, variables, math/compare, world, audio, screens,
  cinematics, misc, notes), each with pins, settings, doc text, code name and executor; `graph.ts` checks wires
  (types, one wire per data input, one place per flow output) with sentences the editor shows.
- `src/engine/logic/{compile,interpreter}.ts`: flat instructions per event node (call, jumpIf, gosub, wait,
  once, gate, for-each), lazy pure values, `wait` on game time, 1000-step guard naming the node,
  `onVarChanged` after the run, breakpoints. Wired into Play: start, zones (enter/exit), interact, smash,
  rebuild, timers, custom events (also from asset `emit` actions), spawn/despawn assets for the play.
- Code view: `src/core/logic/code/{print,parse}.ts` (acorn); `print(parse(print(g))) == print(g)` for fixtures
  and 200 random graphs; ids and positions kept by structure; if/else joins and once/gate followed by more
  lines round-trip through Sequence. CodeMirror 6 with lint marks and a breakpoint gutter.
- Logic workspace: graph canvas (pan, zoom, typed wires with refusal tooltips, comments, groups, minimap),
  code, split view with synced selection; variables panel; node inspector.
- Trigger zone tool (Z), zone inspector and “Add logic” hooks from zones and assets (P4.6).

Known gaps after Phase 4: hooks from screens wait for the Screens editor (P5); sounds, music, screens and
cinematics are logged until P5/P6; the editor bundle grew by about 650 KB with CodeMirror (bundled, not
lazy-loaded, because the artifact is one self-contained file).

## As built — Phase 5

- Audio engine (`src/engine/audio/`): one WebAudio graph, bus = input → fader → duck → meter → master; dB → gain
  `10^(dB/20)` (−60 dB = off); `Ducker` ramps the target bus with `setTargetAtTime` (voice lines duck music
  8 dB, stingers 6 dB); `VoicePool` holds 32 voices, steals the oldest of the same event at `maxVoices`, else
  the oldest lowest-priority voice (ambience < effects < voice/menus), refuses when everything outranks it;
  8 ms fade-ins avoid clicks. `unlock.ts` resumes the context on the first gesture (iOS/Android rule).
  Tested without a fake AudioContext: the pool, picker, director and ducker are pure classes
  (`standardized-audio-context-mock` was not needed).
- Sound events (`audio/events.json`, `SoundEventPicker`): random / sequence / shuffle (no repeat across rounds),
  pitch range, cooldown, volume, bus, 3D (distance + pan). v68 had **no audio at all**, so “every legacy sound”
  became the game's own moments: smash (or the asset's `smash.sound`), rebuild ticks and done, jump, land,
  footsteps, gate travel, talk, pickups (give), hurt, chest and door (built-in asset interactions), menu clicks.
- Built-in pack (`src/builtin/audio/`): 26 sounds, 3 ambience loops and 4 music loops **generated** from
  recipes by a small synthesizer at the AudioContext's sample rate (CC0 by construction; CREDITS.md explains
  why no downloaded CC0 files). Built-in media refs are `sha256("builtin:<name>")`, so they look like any
  other MediaRef. Project files override built-in events / music by id; built-ins stay available.
- Media import (`src/core/media/`): .wav .mp3 .ogg .m4a .png; SHA-256 via WebCrypto (sync fallback, FIPS
  vectors tested); probe by `decodeAudioData`; 20 MB / file, 200 MB / project; .ogg warns about iOS; same
  bytes → one blob. Blobs live in IndexedDB beside the files (`MediaStore`, written by autosave in the same
  batch as `media/index.json`) and travel in `.bwproj` as `media/<sha256>`.
- Music (`MusicDirector`): cinematic > **screen** > logic > zone (innermost) > map; `null` = silence;
  crossfade from `audio/music.json`; stingers. A `screen` layer was added so the title screen's music wins
  without logic. Zones got `music` and `ambience`; maps use their existing `music` / `ambience` fields.
- Emitters (`src/engine/systems/emitters.ts`, instances kind `emitter`): loop or every [min, max] s, culled
  beyond `maxDistance`; Sound emitter tool (S), “Sounds” group in the Hierarchy, inspector, range ring.
- Screens (`src/engine/ui/`): Preact renderer, 1280×720 reference, `scale = min(w/1280, h/720)`, anchors
  (pivot = anchor) + offsets, safe-area insets; widgets panel, text, image, button, hearts, bar, list,
  dialogue, minimap, slot; `{var}` bindings (hp, maxHp, hero.gear, map.name, game.name, prompt, message,
  dialogue.*, inventory, inventory.<item>, any logic variable); Set screen text by widget id; buttons play
  their sound, run `onPress` actions and fire logic's On screen button. Built-in screens: splash, title, HUD,
  pause, dialogue, game over (`src/builtin/screens/*.json`); editing one saves a project copy with its id.
- Flow (`ScreenStack`, `PlaySession`): push / pop / replace; any shown `pausesGame` screen holds the Runtime
  while the UI clock runs (splash waits, then shows the title); `entry.screen` (new projects: splash);
  Esc / Android back / gamepad Start or B run the top screen's `onBack`, else HUD → Pause → resume; hearts
  (`hp` / `maxHp`, default 3) drop when falling off the world or through logic/actions; 0 → Game over;
  Retry returns to the last spawn arrived at. Keyboard arrows and the gamepad d-pad move between buttons.
  New actions: `game` (start, resume, pause, retry, quit), `stinger`, `showScreen` with `replace`.
- Workspaces: **Audio** (event list with built-in/edited badges, event editor with clip previews, music
  states with audition, crossfade and stingers, mixer faders with live meters and ducking rules, imported
  media, where-used) and **Screens** (screens list, widget tree in focus order, canvas with Desktop 16:9 /
  Phone 19.5:9 / Tablet 4:3 frames and safe areas, sample values, “over the HUD”, widget and screen
  properties, button actions, Open in Logic). A **Mixer** dock tab edits the mix live while playing.
- World UI (`WorldUI.ts`, instances kind `ui`): sign / label / bar projected from 3D, pooled DOM, the nearest
  64 shown; World UI tool (U).
- Play in the editor: Esc is now the game's back / pause; **F5 or ■ Stop** stops Play. Ctrl F5 plays from
  the first screen.

Known gaps after Phase 5: existing projects keep their maps silent until a map music is picked (Map tab ›
Music; new projects start with “explore”); built-in screen texts are English only; images on screens need
an imported .png (no image editor); cinematic music and the cinematic action arrive with Phase 6.

## As built — Phase 6

- Schema (`src/core/schema/cinematic.ts`) made exact: typed actor items, camera items with `lookAt` (camera
  from view), typed post items (fade / letterbox / title / slowmo), event items (`emit`, `setVar`), cast `at`
  marks, and checks (every actor track has a cast member, no item after the end). Semantics in
  `docs/cinematic-tracks.md`. Clip events gained `{t, cinematic}` markers.
- Player (`src/engine/cinematic/`): `CinematicPlayer` precomputes each actor's motion (A* on a one-stud nav
  grid built from the map's bricks, 1.25-stud steps, v68 walk/run speeds and gait phase), so `frame(t)` is a
  pure function and `seek(t)` equals playing to `t` (tested); cues (music, sfx, voice blips, emit, setVar)
  fire once as the playhead passes; `skip()` returns the state cues still due. `CameraRig` eases blends
  (smoothstep), follows roles in their own frame, shakes deterministically.
- Play (`src/engine/systems/cinematic.ts`): cast neighbours and the hero are driven by the scene (AI, input,
  smash, talk, use and gates frozen), extras appear for the scene only, dialogue uses the dialogue screen,
  music takes the cinematic layer, slow motion slows neighbours and debris, Esc / B / Skip skip, `once` is
  player progress, **On cinematic done** fires at the end. The play renderer takes the rig's camera.
  Built-in gestures (wave, cheer, nod, bow, shrug, point) are clips in `src/builtin/clips/emotes.ts`.
- Director (`src/editor/workspaces/director/`): scenes list with an example reward scene, cast panel, shot
  list, stage view (orbit camera, marks to drag, camera frusta, Record: click the ground to walk the selected
  role there), camera preview with letterbox, fades, titles and dialogue, multitrack timeline (drag with 0.1 s
  and edge snapping, + adds at the playhead, waveforms on music and sound rows), item inspector, *Where used*,
  *Play in game*. Each edit is one `cinematic.put` undo step. The stage and preview redraw only when
  something changed.
- Triggers (P6.4): the `cinematic` action (with *once*) in every action list — zone enter/exit (now editable
  in the zone inspector), asset interactions, screen buttons, gate *on arrive* (World graph, gate bar) — plus
  clip markers (Character studio timeline), logic's Play / Stop cinematic, and the Dock (Assets ›
  Cinematics, Timeline tab lists what happens on the map).
- Fixed on the way: variables changed by the game (zone actions, screens, cinematics) now fire logic's **On
  variable changed** (they only did inside logic runs).

Known gaps after Phase 6: the stage's ground clicks use the spawn height (marks on hills snap to the nav
height when played); there is no per-actor path preview line on the stage; extras use v68 character looks
only.
