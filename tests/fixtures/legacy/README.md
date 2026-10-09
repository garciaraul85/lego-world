# Legacy fixtures (LEGO World v68)

Frozen inputs for proving the engine keeps v68 behavior. **Never edit these to make a test pass**; a card that
needs new ones regenerates them with the script named below and says so in its PR.

| File | Made by | sha256 |
|---|---|---|
| index.v68.html | copy of dist/index.html at commit b10789c (assemble.py output) | 5be67e35d0c549d497c007358f846ae884112e4be593feeaf4d0d293d0a16721 |
| club-clearance-poses.v68.json | scripts/fixtures/club-clearance-poses.cjs (replaces the suite's old `git show 2a9fc8f…`, a commit not in this repo) | 320f4b68426ccf51d949706e1153f622963858709da44d26230391ede32d549b |
| save-v1.json | scripts/fixtures/legacy-saves.cjs — hand-written, pieces without ids (v68 still loads it) | 0a9ff61e0b20e5af122c10b0999561525be269cccc66c451547fe226278b75cf |
| save-v2.json | same — v1 plus environment | 872410a84f7249b0b08f133a3e24ca35f4a555020a87a8fc493824aa2a7f530d |
| save-v3.json | same — ids and a grouped tower | c70c4a75fbd939f06b16f7bb1a0c009175598edc3f1d0c796f76735fb4170717 |
| save-v4.json | same — real v68 app driven through its agent tools: forest+city map (seed 418811) with a smashed object, edited hero, NPCs, a second Prairie map (seed 372, active) and a two-way gate | 8bf3812025ebe0e5ca9a9110395449f239c3ada876baa27713f7996aa65a9732 |

v4 layout reminder: the top level is the **active** map's build; `maps.maps[i].build` holds every other map's build.
