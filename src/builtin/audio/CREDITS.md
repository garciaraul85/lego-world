# Built-in audio pack credits

Every built-in sound effect, ambience loop and music loop in Brick Worlds is **generated** by
`src/builtin/audio/synth.ts` from the recipes in `src/builtin/audio/pack.ts`. No recorded or
downloaded audio is shipped, so the pack is original work released under **CC0 1.0**
(https://creativecommons.org/publicdomain/zero/1.0/).

The plan asked for CC0 sounds with source URLs; the build machine has no access to sound libraries,
and generating the pack keeps the single-file editor small (a few KB of recipes instead of MBs of
audio). Projects can import their own .wav/.mp3/.ogg/.m4a files in the Audio workspace.

| Media name | What it is | Source |
| --- | --- | --- |
| smash, smash2 | brick crash | generated (noise burst + thump) |
| place | brick click | generated |
| rebuild, rebuilt | rebuild tick, rebuild done chime | generated |
| jump, land, step1-3 | hero movement | generated |
| pickup, chest, door, gate | world interactions | generated |
| uiclick, uiback, uiconfirm | menu sounds | generated |
| talk1-3 | dialogue blips | generated |
| hurt, gameover, splash, victory | game feedback and stingers | generated |
| wind, lava, birds | ambience loops | generated |
| explore, night, menu, castle | music loops | generated (simple 3-track sequencer) |
