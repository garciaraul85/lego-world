# Play and debug

Play runs your game right here on the new engine. Nothing that happens while playing changes the project.

## Starting

F5 plays from the start spawn, Play › Play this map plays the open map from its first spawn (the Training yard, a map you are testing), Shift F5 from the selected spawn, Ctrl F5 from the first screen (splash, title). Play in v68 opens the project in the original LEGO World v68 runtime.

## Controls

WASD or the arrows move, Space jumps, Shift runs, F attacks, hold E to rebuild, E uses chests and doors, T talks to neighbours, 1–4 play emotes. Drag to look around. Esc opens the pause menu. On touch screens, on-screen arrows and buttons do the same.

## Fighting

| Do | Key | Touch |
|---|---|---|
| Light attack | tap F | smash button |
| Heavy attack (slower, hits harder, knocks back) | Shift F | |
| Charged attack (double power) | hold F, let go | hold smash |
| Spin attack (hits all around; you can keep walking) | hold F longer, let go | |
| Jump attack / plunge (hits all around on landing) | F in the air, rising / falling | |
| Guard | hold Q | Guard (hold) |
| Shield bash (stuns) | F while guarding with a shield | |
| Dodge roll the way the hero faces (can't be hurt at its start) | C | Roll |
| Lock on / next target / let go | Z (each press: the next target; after the last, let go) | Lock |
| Side hop / back flip (while locked on) | Space + left or right / Space + back | |

**Guarding.** Give the hero a shield (Character studio → Gear & powers → **Off hand**). Holding Q raises it: hits from the front are blocked and cost stamina; raising it just before a hit **parries** it (no stamina, and a neighbour that swung is stunned). When stamina runs out the guard breaks and the hero staggers for a moment; stamina comes back when the guard is down. Without a shield the hero still defends, but half of each hit gets through and blocks cost more stamina. Hits from behind are never blocked. The hero walks slowly while guarding or charging.

**Lock-on.** When something you can lock on to is in front of the camera and within 14 studs, a yellow arrow bobs over it: Z locks on to it. That is any neighbour (a foe to fight, or someone to talk to: locked on to a neighbour, T talks to them straight away, however far they are within the lock), an object with health, or an asset with **Can be locked on** (Asset studio, under Health — for puzzles). Locked on, the arrow turns red, the hero keeps facing the target and the camera turns to look past the hero at it. With several targets in range, each Z moves to the next one (Tab too); after the last one, Z lets go of everything, and the next Z starts again from the first. A defeat, or walking more than 16 studs away, also lets go, and the arrow disappears out of range. Logic's **On locked on** runs each time.

The `stamina` and `maxStamina` variables hold the guard's stamina, for a HUD bar.


## Hits and health

F swings what the hero holds. Bare hands, a hammer or a wrench hit for 1 (blunt), a sword for 2 (slash), a war hammer for 2.5 and a sledgehammer for 3 (blunt), a torch for 1 (fire). Things with health lose some with each hit and break at zero; things without health break at the first hit, as before. Neighbours are only hurt when their character has **Can be harmed** on. The hero's health is its hearts (the hp variable): falling off the world, or logic's **Damage**, takes them; **Heal** gives them back.

## Health bars and stamina

A bar over a thing shows its health once it has been hurt (green, then yellow, then red), and over an enemy for as long as it fights. The HUD's stamina bar (under the hearts) shows while you guard and fills back up when you stop; it hides when full.

## Enemies

A neighbour whose character **fights the hero** (Character studio) wanders until it sees you, walks over, raises its arm with a red **!** over its head, then swings. Guard (Q) to block from the front, raise the guard just as it swings to parry (it is stunned), or roll (C). The **Training yard** (World › Add the Training yard, then Play › Play this map) has one to practise on, on a small fenced field with a hill to jump from, boulders, trees and three dummies.

## Rebuilding

Smashed things that can be rebuilt show where they go back: their bricks float there as faint see-through ghosts (they never hide the hero or a neighbour). A ring on the ground just outside them, with a bobbing arrow over it, shows exactly where to stand; it is always on your side of the broken thing. Step into the ring: it turns green, the arrow goes, and the HUD says **Hold E · Rebuild**. Hold E and the ghost bricks fill in one by one until it is whole again.

## The play bar

Pause (F6) freezes the game, Step (Shift F6) advances one frame, and 0.25× to 2× change the speed.

## Graphics quality

How good the game looks, and how hard it works the computer, comes in three levels:

- **Low**: 2 lights, no shadows, half of a big map's view distance, 600 particles, plain studs close by. For phones and old computers.
- **Medium**: 4 lights with shadows, three quarters of the view distance, 1,200 particles.
- **High**: 8 lights, sharper shadows, the full view distance, 2,000 particles.

**Project › Graphics quality** sets what players start with. **Auto** picks a level from the device (phones Low, strong computers High) and steps down a level while the game runs slowly; the line under it says what Auto picks on this computer. Players change it in the game's **Settings** (Graphics: auto, low, medium, high), and a screen button can do the same with the **Change a player setting** action.

To see a level while building, pick it in **Quality** beside ▶ Play (**Quality: game's** plays at the game's own setting). It can change while playing, and the **Debug** tab shows the level, its lights and particles. The levels are estimates for a mid-range PC at High until they are measured on real devices.

## Debug

The dock's Debug tab shows live values (position, variables, items, screens, audio) and cheats like Respawn and Rebuild all. The Profiler tab shows frame times.

## Stopping

Stop (F5 or ■ Stop) returns to the editor exactly as it was before you pressed Play.
