# Play and debug

Play runs your game right here on the new engine. Nothing that happens while playing changes the project.

## Starting

F5 plays from the start spawn, Shift F5 from the selected spawn, Ctrl F5 from the first screen (splash, title). Play in v68 opens the project in the original LEGO World v68 runtime.

## Controls

WASD or the arrows move, Space jumps, Shift runs, F attacks, hold E to rebuild, E uses chests and doors, T talks to neighbours, 1–4 play emotes. Drag to look around. Esc opens the pause menu. On touch screens, on-screen arrows and buttons do the same.

## Fighting

| Do | Key | Touch |
|---|---|---|
| Light attack | tap F | smash button |
| Heavy attack (slower, hits harder, knocks back) | Shift F | |
| Charged attack (double power) | hold F, let go | hold smash |
| Spin attack (hits all around) | hold F longer, let go | |
| Jump attack / plunge (hits all around on landing) | F in the air, rising / falling | |
| Guard | hold Q | Guard (hold) |
| Shield bash (stuns) | F while guarding with a shield | |
| Dodge roll (can't be hurt at its start) | C | Roll |
| Lock on / next target | Z / Tab | Lock |
| Side hop / back flip (while locked on) | Space + left or right / Space + back | |

**Guarding.** Give the hero a shield (Character studio → Gear & powers → **Off hand**). Holding Q raises it: hits from the front are blocked and cost stamina; raising it just before a hit **parries** it (no stamina, and a neighbour that swung is stunned). When stamina runs out the guard breaks and the hero staggers for a moment; stamina comes back when the guard is down. Without a shield the hero still defends, but half of each hit gets through and blocks cost more stamina. Hits from behind are never blocked. The hero walks slowly while guarding or charging.

**Lock-on.** Z picks the nearest neighbour that can be harmed (or object with health) in front of the camera, within 14 studs. The hero keeps facing it and the camera turns to look past the hero at it; a red marker shows it. Tab picks the next one; Z again, a defeat, or walking more than 20 studs away lets go.

The `stamina` and `maxStamina` variables hold the guard's stamina, for a HUD bar.


## Hits and health

F swings what the hero holds. Bare hands, a hammer or a wrench hit for 1 (blunt), a sword for 2 (slash), a war hammer for 2.5 and a sledgehammer for 3 (blunt), a torch for 1 (fire). Things with health lose some with each hit and break at zero; things without health break at the first hit, as before. Neighbours are only hurt when their character has **Can be harmed** on. The hero's health is its hearts (the hp variable): falling off the world, or logic's **Damage**, takes them; **Heal** gives them back.

## The play bar

Pause (F6) freezes the game, Step (Shift F6) advances one frame, and 0.25× to 2× change the speed.

## Debug

The dock's Debug tab shows live values (position, variables, items, screens, audio) and cheats like Respawn and Rebuild all. The Profiler tab shows frame times.

## Stopping

Stop (F5 or ■ Stop) returns to the editor exactly as it was before you pressed Play.
