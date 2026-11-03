# Play and debug

Play runs your game right here on the new engine. Nothing that happens while playing changes the project.

## Starting

F5 plays from the start spawn, Play › Play this map plays the open map from its first spawn (the Training yard, a map you are testing), Shift F5 from the selected spawn, Ctrl F5 from the first screen (splash, title). Play in v68 opens the project in the original LEGO World v68 runtime.

## Controls

WASD or the arrows move, Shift runs, F attacks. Drag to look around. Esc opens the pause menu.

The game's buttons work like Zelda's: no action has a fixed key. The buttons in the bottom corner show what each one does right now.

- **Action** (E) does whatever fits where the hero stands: **Talk** to a neighbour close by and in front, **Open** a chest or a door (whatever the thing's prompt says), **Read** a sign, **Rebuild** (hold), **Dive** or **Swim up** in deep water (hold), and **Jump** when nothing else fits (Classic layout). The first that fits wins.
- **Item buttons** (J, K, L, ;) use the item the player put in each. Put an item in a button from the item menu (I, or Pause › Items): pick an item, then the button. Logic hears it with **On item used**.
- **Jump** (Space) in the Modern layout; **Guard** Q, **Roll** C, **Lock on** Z, the **item wheel** R.

**Project › Controls** picks the layout: **Ocarina** (Attack, Action and 3 item buttons, no jump button), **Classic** (2 item buttons, Action jumps), **Modern** (a Jump button, 2 item buttons and an item wheel) or **Custom** (how many item buttons, and where jumping is). Click a key there and press another to change it for the game; a key already used moves over. Each button can also have a gamepad button. Players change their own keys in the game's **Settings › Controls**; theirs are kept on their device.

A gamepad works too: the left stick moves, and the buttons follow Project › Controls (A is Action, X Attack). On touch screens, on-screen arrows and the same buttons show.

## Swimming

Water deeper than about half the hero's height is swum (**Project › Swimming**, on in new games). The hero floats with its head out and swims with the move keys (the **Swim** clip; **Tread** when still). The Action button says **Dive**: hold it to go down. Under water it says **Swim up**; let go and the hero drifts back up. Under the surface the view turns blue and the HUD's **Air** bar counts down from **Breath** seconds; with no air left the hero loses a heart every 2 seconds until it comes up, and air comes back quickly above water. Jump at the surface or swim into a low shore to climb out. A river's current carries swimmers, and shallower water only slows walking. With **Hero can swim** off, the hero sinks and walks along the bottom as before. Logic reads the variables `air`, `maxAir`, `underwater` and `swimming`. The **Swimming course** (Help menu) dives for a chest at the bottom of a pool.

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

Each enemy has its weaknesses (Character studio › Health): some kinds of hit hurt more, some sides are blocked (a shield in front clangs: hit it from behind, or plunge from above), some hits stun it. A heart it leaves heals you at once. The starter pack's enemies show the ideas: a sentinel only bombs can break, a spider with an armoured front, bats a boomerang stuns.

A neighbour whose character **fights the hero** (Character studio) wanders until it sees you, walks over, raises its arm with a red **!** over its head, then swings. Guard (Q) to block from the front, raise the guard just as it swings to parry (it is stunned), or roll (C). The **Training yard** (World › Add the Training yard, then Play › Play this map) has one to practise on, on a small fenced field with a hill to jump from, boulders, trees and three dummies.

## Puzzles

Walk up to a **push block**, hold Action (**Grab**) and walk into it: the hero leans in and it slides one step, with the hero walking behind it. Hold Grab and step back to pull one that can be pulled. While you hold it, arrows on the floor show the two ways (yellow beyond it: push; blue behind you: pull) and the HUD says which key does which, as the camera turns. A block that comes to rest on a switch stays there while you keep pushing: let go of the stick and push again to move it on. Walking into a block, or any placed object up to about two bricks high (a crate, a chest), **without** Grab climbs on top of it. **Floor switches** go down under weight — you, a neighbour, a push block or a loose crate — and their pad sinks a plate with whatever stands on it; a **weight switch** needs something heavy (a push block, not you alone) and comes back up when it goes, so push a block onto it; a **timer switch** ticks and goes back after its seconds. Hit a **crystal switch** with your sword (later an arrow, a boomerang or a bomb) to flip it, and pull a **lever** with Action. A **locked door** opens with Action when you carry a small key from this place (it is used up); the **boss door** wants the boss key. Walk over a key, the dungeon map or the compass to pick it up.

## Fire, bombs and light

Items that work by themselves from an item button: a **Bomb**'s button lifts one, lit, and the hero holds it up in front of its face in both hands (it fizzes and blinks red, and goes off 4 seconds after it was lit). Then **Action** throws it if you are walking (the button says Throw: it flies in an arc, thuds against a wall and rolls a little), or puts it down in front of you if you stand still (Put down). The bomb's button does the same. A lit bomb lying nearby is picked up again with Action; one held too long goes off in your hands. A **Bomb flower** grows a bomb to pick with Action; after a miss it grows another. A **Branch** is a stick: walk over it and the hero bends down for it and holds it in the right hand (its item button puts it away and takes it out). Attack swings it with the sword's swing; a plain stick breaks on anything hard. Hold its end up into a fire (a **Burning torch**'s flame, a lit torch stand, something burning) and it catches by itself; it burns for 10 seconds and is gone. Touched or swung at **vines** it sets them alight and burns up with them, a swing that hits anything uses it up, and touched to an unlit **torch stand** it lights it. Its flame always goes with it. The hands hold one thing at a time: picking up a bomb puts the stick away. A swing never knocks down burnable things (vines, a web, a barricade): only fire gets rid of them, and they burn with flames all over. The blast breaks a **cracked wall**, flips switches that answer explosions, sets burnable things alight and hurts enemies in it; stand too close and you lose a heart. The **Torch** waves a flame in front of you: **vines**, a **wooden barricade** or a **spider web** catch and burn away (setting the ones touching them alight), and a **torch stand** lights (a **timed torch** goes out again after 12 seconds). Walk over a **Bomb bag** (five bombs) or a **Hand torch** and it goes into an empty item button. A **sun crest** shines a beam of light straight ahead; a **mirror** turns it a quarter turn (hold Action (Grab) at the mirror and push: the hero shoves it round to lean the other way, where it stands), and a **light sensor** lights up while the beam reaches it. Anything in the beam stops it: you, a neighbour, a bomb, a loose crate.

Walk into **vines** or a **ladder** and keep walking to climb it: forward climbs up, back climbs down (off at the bottom), and at the top the hero climbs over onto it or onto what is beyond; Jump lets go.

**Ice**: on an **icy floor** the hero moves by friction, as on real ice: its feet slip if they push too hard, so it is slow to get going, to turn and to stop, and when you let go it glides on, arms out for balance, slowing a little at a time. Hold an **ice block** (Action, Grab) and push: it is shoved off and slides on by itself, far on ice and not so far on the ground, until it stops or something stops it. **Ice walls** melt with fire (the Torch, a burning stick, a bomb) and, if they are made to, with a beam of light; a sword does nothing to them.

**Moving platforms** go back and forth (or up and down, a **lift**), waiting at each end; stand on one and you ride along. A **Switch lift** only runs while it is on.

**Climbing**: with **Project › Climbing: Anything, with stamina** (like Breath of the Wild), walk into almost any wall and keep walking to hold on: W climbs up, S down (off at the bottom), A and D move left and right along it (as the hero faces the wall). Climbing uses stamina (a little while holding still), shown by the stamina bar; **Space** is a climb jump (a quick hop up for a quarter of the stamina), and Space while pulling back lets go. Out of stamina you let go and fall; when its hands reach the top the hero pulls itself up over the edge, its hands on the edge all the way (hang, pull up, a knee onto the top, stand). Ladders and vines cost no stamina, and walls marked Not climbable say “Too smooth to climb.” With **Ladders and vines only** (the default, like Ocarina of Time) walls stop you.

## Rebuilding

Smashed bricks are real physical pieces: they fly off, tumble, bounce off the bricks around them, stack and come to rest, and the hero pushes them aside when walking through. In water they float and drift with its current, as loose objects do (see Scene › Water and loose things).

Smashed things that can be rebuilt show where they go back: their bricks float there as faint see-through ghosts (they never hide the hero or a neighbour). A ring on the ground just outside them, with a bobbing arrow over it, shows exactly where to stand; it is always on your side of the broken thing. Step into the ring: it turns green, the arrow goes, and the HUD says **Hold E · Rebuild**. Hold E and the ghost bricks fill in one by one until it is whole again.

## Movement

**Project › Movement** picks how the hero moves:

- **Classic (v68)** — the original walking. The hero stops dead at bricks in the way and can't stand on loose things.
- **Physics** — the physics engine walks the hero, with the same speeds and the same jump. The hero slides along walls and corners instead of snagging, steps up a plate, and pushes loose things over. It can also stand on them and ride them: jump onto a crate floating down a river and it carries the hero along.

New projects start with **Physics**; projects made before it, and imported v68 builds, keep **Classic**. Other characters still walk the classic way. The **Water and physics course** (Help menu) tries both.

## The play bar

Pause (F6) freezes the game, Step (Shift F6) advances one frame, and 0.25× to 2× change the speed.

## Graphics quality

How good the game looks, and how hard it works the computer, comes in three levels:

- **Low**: 2 lights, no shadows, half of a big map's view distance, 600 particles, plain studs close by. For phones and old computers.
- **Medium**: 4 lights, 2 of them casting shadows, three quarters of the view distance, 1,200 particles.
- **High**: 8 lights, 4 of them casting sharper shadows, the full view distance, 2,000 particles.

**Project › Graphics quality** sets what players start with. **Auto** picks a level from the device (phones Low, strong computers High) and steps down a level while the game runs slowly; the line under it says what Auto picks on this computer. Players change it in the game's **Settings** (Graphics: auto, low, medium, high), and a screen button can do the same with the **Change a player setting** action.

To see a level while building, press ▶ Play and pick it in **Quality** on the Play bar (**Quality: game's** plays at the game's own setting). It changes at once, and the **Debug** tab shows the level, its lights and particles. The levels are estimates for a mid-range PC at High until they are measured on real devices.

## Debug

The dock's Debug tab shows live values (position, variables, items, screens, audio) and cheats like Respawn and Rebuild all. The Profiler tab shows frame times.

## Stopping

Stop (F5 or ■ Stop) returns to the editor exactly as it was before you pressed Play.
