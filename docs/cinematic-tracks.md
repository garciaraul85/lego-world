# Cinematic tracks (P6.1)

A cinematic is `cinematics/<cin_id>.json` (schema: `src/core/schema/cinematic.ts`). The player
(`src/engine/cinematic/CinematicPlayer.ts`) and the Director (`src/editor/workspaces/director/`)
both follow this page. Times are seconds from the start of the scene; every item has `t`.

## The scene

| Field | Meaning |
| --- | --- |
| `map` | The map the scene happens on. If the hero is elsewhere, Play travels there first. |
| `length` | Seconds; the scene ends (and **On cinematic done** fires) at `length`. |
| `skippable` | Esc / Android back / gamepad B / the Skip button skip to the end. |
| `letterbox` | Black bars at the start (the post track can switch them later). |
| `hideHud` | Hide the HUD while the scene plays (dialogue still shows). |
| `cast[]` | `{role, actor, at?}`; `actor` is `$hero` (the current player character) or a character id. A character that has a neighbour on the map drives that neighbour; otherwise it appears only for the scene. `at` is the mark it starts on (default: where it is, or the first mark). |
| `marks[]` | `{id, pos, yaw}`: spots actors walk to, cameras look at. `yaw` uses v68 heading (facing `(sin yaw, cos yaw)`). |

## Track items

| Track | Item | Behaviour |
| --- | --- | --- |
| actor | `moveTo {mark, speed: walk\|run\|teleport}` | Path-finds on the nav grid (one cell per stud, steps up to 1.25 studs, no corner cutting) at 4 (walk) or 7.8 (run) studs/s — v68's speeds — and arrives facing the mark's yaw. A later `moveTo` of the same role cuts it where it got to. `teleport` is instant. No path: straight line. |
| actor | `face {target \| yaw}` | Turns to a role or mark (or a yaw) once standing; while walking the actor faces where it walks. |
| actor | `play {clip, loop?}` | Plays a keyframe clip from its start; `loop` (default: the clip's own) holds until the role's next play/emote/move. Moving cancels it. |
| actor | `say {text, dur, voice?}` | Shows the line in the dialogue box for `dur` s (the newest line wins) and plays voice blips (`voice`, default the built-in *talk* sound) every 0.14 s, about one per 5 letters. |
| actor | `emote {kind}` | A built-in gesture: wave, cheer, nod, bow, shrug, point. |
| actor | `equip {item}` / `hide` / `show` | Held item for the scene / invisible / visible again. |
| camera | `{shot, pos?, look?, lookAt?, follow?, offset?, fov, blend, shake?}` | `blend = 0` cuts; otherwise eases (smoothstep) from the previous shot over `blend` s. `follow` keeps the eye at the role's position + `offset` in the role's frame (x right, y up, z ahead); `look` aims at a role (head height) or a mark; `lookAt` at a point. `fov` in degrees (default 50). `shake` in studs. |
| music | `{music, fade}` / `{stop: true, fade}` | Sets the cinematic music layer (the highest priority in the MusicDirector); the layer is cleared when the scene ends, so the map / zone music returns. |
| sfx | `{event, role?, pos?}` | Plays a sound event at a role or a point. |
| post | `{fade: in\|out, dur, color?}` | Fades from / to a colour (default black). |
| post | `{letterbox: bool}` | Switches the bars. |
| post | `{title, sub?, dur}` | A title card (0.4 s fade in and out). |
| post | `{slowmo: 0.1–1, dur}` | The world outside the cast (neighbours, debris) runs slower. |
| event | `{emit}` | Fires logic's **On custom event**. |
| event | `{setVar, value}` | Sets a game variable (logic sees **On variable changed**). |

## Rules

- **Deterministic.** Everything visible is a pure function of `t` (`frame(t)`); `seek(t)` shows the
  same frame as playing to `t` (tested). One-shot items (music, sfx, voice blips, events) fire when
  the playhead passes them during play, never while scrubbing.
- **Cast members are frozen** for physics, input and neighbour AI while the scene plays; actors not in
  the cast keep simulating. The hero cannot smash, talk, use or travel during a scene.
- **Skip** jumps to `length`: actors take their final positions, and the state cues still due fire
  (music, `emit`, `setVar`); sounds and voice blips do not.
- **Once.** `{do: 'cinematic', once: true}` (and the logic node's *Only once*) plays a scene once per
  playthrough; this is player progress, never written to the project.
- **Triggers.** The `cinematic` action works in zone enter/exit lists, asset interactions, screen
  buttons, gate *on arrive* lists (World graph), character clip markers, and logic's **Play
  cinematic** node. The Director's *Where used* lists all of them.
