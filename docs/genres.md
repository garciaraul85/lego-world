# Genres (P18)

Every project has a **genre** in `project.json` (`"genre": "explore"`, schema 6). The editor shows the
controls that kind of game uses; **Open** (`"open"`) shows every control. Older projects (schema 5) open as
Open and are saved upgraded.

## A genre is data

One file per genre in `src/builtin/genres/*.json`, validated by `Genre` in `src/core/genres/types.ts`:

| Field | What it is |
| --- | --- |
| `id`, `name`, `icon`, `blurb` | how it shows in the picker and on the start hub card |
| `features` | the feature tags it uses, or `"all"` (Open) |
| `level` | `simple` hides advanced controls; `advanced` shows them |
| `tabs` | workspace tabs in order; the others go under **More** |
| `nodesFirst` | logic nodes listed first in the node list (“For …”) |
| `defaults` | camera, controls and music for this kind of game (today every genre uses the explore camera and walking; racing and the others will set their own) |
| `template` | the start hub's starter game (a template id from `src/editor/start/template-list.ts`, or null for blank) |
| `tutorial`, `help` | the tutorial track and the Help page it starts from |
| `checklist` | what a finished game of this genre has (the AI builder reads it; the mascot will) |
| `readyAfter` | the phase whose systems it needs |

Adding a genre needs no code: add its file and list it in `src/builtin/genres/index.ts`.

## Every control is tagged

`src/editor/genres/controls.ts` gives every workspace tab, Scene tool, menu action, dock tab, asset filter
and logic node its feature tags and a level. `showsControl(genre, tags)` decides: a control shows when it is
`core` or the genre uses one of its features, and its level is within the genre's. A unit test fails when a
control has no tags (or tags name a control that no longer exists), so new controls are tagged as they are
made.

Features: `core`, `build`, `world`, `assets`, `characters`, `logic`, `collect`, `screens`, `cinematics`,
`audio`, `v68`, `debug`, `ai`.

## What the view does

- Workspace tabs follow the genre's order; the rest are under **More ▾** (the open one shows as a tab).
- Scene tools, menu items, the v68 buttons, dock tabs and asset filters the genre does not use are hidden.
- The logic node list shows Pinned, Recent and the genre's own nodes first, then the rest by category;
  nodes the genre hides are folded under **More nodes**, and a search finds every node.
- **Show everything** shows every control on this device without changing the game.
- A chip **“N items use hidden features”** lists what the game uses that the view hides.
- Right-click a tab, tool or node: pin it, hide it, or put it back (per device, per genre).
- Hidden controls still work in Play, by shortcut and in the command palette.

Changing the genre is `project.update { genre }`: one undo step. The AI builder's project summary names the
genre, its features and its checklist.
