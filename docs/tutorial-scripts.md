# Tutorial steps as scripts

A tutorial step that takes more than one click is written as numbered **lines**. Each line is one
instruction a person reads, the UI actions that carry it out, and one check that proves it happened.
The same lines are used by:

- the tutorial card (the numbered "Click by click" list, ticked one line at a time);
- **Show me** (the pointer goes to each control, says what it does, performs it, then everything is undone for "My turn");
- **Do it for me** (the same actions without the pointer);
- AI plans, which run the same kind of script against the editor's UI.

The AI never edits the engine's code or the project's files (manifest, maps, assets, logic) directly.
It writes a plan in this shape, shows it, and on approval runs it through the UI. A line whose check
fails stops the run there, with the reason.

## A line

```json
{
  "text": "In the timeline tools (the bar just under the preview), open the drop-down “+ Track…” and pick “Right arm · z”. A lane named “Right arm · z” appears with a key ◆ at 0 s (value 0).",
  "do": [
    {
      "choose": "[aria-label=\"Timeline tools\"] select[aria-label=\"Add a track\"]",
      "value": "Right arm · z",
      "say": "Open “+ Track…” in the timeline toolbar and pick “Right arm · z”."
    }
  ],
  "check": { "kind": "state", "test": "clipTrack", "args": { "bone": "rightArm", "prop": "z" } }
}
```

| Field | Rule |
| --- | --- |
| `text` | Name each control exactly as it reads on screen, in quotes. Say where it is (panel, side, above or below what). Say what changes after the click. Up to 320 characters. No vague words such as "set it up" or "adjust as needed". |
| `do` | The actions, in the order a person makes them (see below). Optional only on a line that just points (`show`). |
| `check` | Required on every line that acts. It passes only when the line's result is really there. |

A step has at most 10 lines. When any line has `do`, the step's `doItForMe` is left empty and the
step is done when every line is ticked (the step's own `check` is then not used).

## Actions

| Action | What it does | Example |
| --- | --- | --- |
| `click` | Clicks the control the selector finds. Fails if it is not on screen. | `{"click": "[data-tour=\"clip-play\"]"}` |
| `choose` | Picks `value` (option value or its visible text) in a drop-down list. | `{"choose": "select[aria-label=\"Action\"]", "value": "give"}` |
| `fill` | Types `value` into a text box and confirms it, as pressing Enter does. | `{"fill": ".tl-foot label:nth-of-type(2) input", "value": "2.6"}` |
| `show` | Points at a control without using it (scrolls it into view). | `{"show": "[aria-label=\"Build tools\"]"}` |
| `fn` | A named doer from `src/editor/tutorial/doers.ts`, for what a selector cannot reach (a click at a place on the 3D plate, a time on the timeline). | `{"fn": "seekClip", "args": {"t": 1}}` |

Every action can carry `say`: what Show me says while its pointer is on the control.

Selectors name controls by stable hooks: `data-tour`, `aria-label`, `title` or `role`. A unit test
(`tests/unit/tutorial-targets.test.ts`) fails when a line names a hook the editor does not render, uses
an unknown doer, or acts without a check.

## Checks

| Kind | Passes when | Example |
| --- | --- | --- |
| `state` | A named test in `src/editor/tutorial/checks.ts` returns true | `{"kind":"state","test":"assetDoes","args":{"name":"Treasure chest","does":"give"}}` |
| `command` | A matching command ran (any source while a script runs) | `{"kind":"command","type":"asset.create"}` |
| `dom` | An element is on screen | `{"kind":"dom","selector":"[data-tour=\"asset-interactions\"] .interaction"}` |
| `play` | Something happened in Play | `{"kind":"play","event":"running"}` |

State tests available for lines include `workspace`, `rightTab`, `dockTab`, `menuOpen`,
`hasSelection`, `clipOpen`, `clipTrack`, `clipTime`, `clipKey`, `clipPlaying`, `studioAssetIs`,
`assetActions`, `assetDoes`, `characterNamed` and `characterWears`. Add a test there when a new kind of result needs checking; never
check by looking at pixels.

## Writing a new scripted step

1. Do the task by hand and write down every click: the control's visible name, where it is, and what changes.
2. For each click, find its hook in the source (`data-tour`, `aria-label`, `title`). If it has none, add one to the control.
3. Pick the check that proves the click worked; add a state test if none fits.
4. Run `npx vitest run tests/unit/tutorial-targets.test.ts`, then try Show me and Do it for me in the editor.

Scripted steps today: `assets.interact` (Interactions), `assets.build` (Build a new asset),
`chars.look` (Change the look) and `chars.animate` (Animate the clip).

## Hooks a script can use

| Hook | Control |
| --- | --- |
| `[data-tour="char-name"]` | Character studio › Name |
| `[data-tour="pick-<choice>"]`, e.g. `pick-hat` | a look choice's picture button (Hat, Hair, Shirt…) |
| `[data-tour="pick-<choice>-list"] [data-value="<option>"]` | one picture in that choice's open panel |
| `[data-tour="clip-length"]` | timeline tools › Length |
| `[data-tour="key-time"]`, `[data-tour="key-value"]` | the selected key's “at” and “value” boxes |
| `[data-tour="clip-play"]` | the clip's Play / Pause button |

Text boxes keep what is typed while the screen redraws and take it on Enter (or when the box loses
focus), so `fill` works the same as a person typing.
