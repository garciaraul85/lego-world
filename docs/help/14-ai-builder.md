# AI builder

The AI builder (✦ in the toolbar, Ctrl I) turns a request in plain words into a change to your game — and shows you exactly what it will do before anything is kept. [Open it](action:help.ai)

## What it can and can't do

It works only through the engine's own commands, the same ones the editor uses when you click: maps, bricks, spawns, zones, gates, assets, characters, logic, screens, cinematics and audio. It never changes the engine itself, writes files directly, or fetches anything from the internet; sounds must come from the built-in pack or media you imported. Pick a scope (Whole game, Map, Logic…) to limit what it may touch.

## Plan, check, review

You describe the change; the AI reads your project, writes a plan of steps, and the editor checks the plan with a dry run. If the engine refuses something, the AI gets the reason and fixes the plan (up to three times). You see each tool it uses as it works.

## Show me, step by step

Each step has a title, what it does and how you would do it yourself. **Show me step N** moves the demo pointer to the step's workspace and makes the change live in the real editor (logic it writes opens in Split view, so you see the code and the graph). **Back** takes the step out again; **Show all** plays the rest. Files that change lists every file with a line diff.

## Accept or reject

Untick steps you don't want. **Accept** keeps the chosen steps as one undo step named "AI: …" (Ctrl Z takes it all back). **Reject** leaves the project exactly as it was; **Regenerate** asks again. A plan that removes more than half of a map's bricks needs an extra tick to accept.

## Who answers, and cost

Inside a Claude artifact, Claude answers on your own Claude plan — no key needed; you are asked once to allow it. Elsewhere, add your own Anthropic API key in ⚙ settings: it is stored only in this browser, never in your project, exports or logs, and sent only to api.anthropic.com. Each request shows its token use, and a daily soft cap (settings) asks before going over.

## Limits

At most 12 steps and 2,000 commands per plan, and 5 MB of changed files.
