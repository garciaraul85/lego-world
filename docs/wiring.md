# Scripts on objects, wiring and enemies (P9c)

## Names on placed copies

`AssetInstance.name` (optional, unique on its map, not “this” or “hero”) is set with `instance.rename`.
`PlaySession.resolveEntity` finds a copy by its own name first, then by id, then by asset name (nearest
copy). Code and wires use these names, never ids.

## Scripts on objects

A logic file with `owner: <instance id>` belongs to one placed object or neighbour. In
`LogicRuntime.drain`, an event that carries `self` (the instance it is about: interact, smash, rebuild,
damaged, defeated, locked on) starts a program in an owned file only when `self === owner`; events about
nothing (start, timers, zones, custom, variables) run every file. While a run of an owned file reads values,
the string `"this"` is that owner (`inputs` and `args`). Neighbours' events carry their instance id too
(`PlaySession.npcSelf`), and `npcByRef` accepts it.

## Wiring

`src/core/logic/wiring.ts`: a wire is an event card (`WIRE_WHEN`: used → onInteract, hit → onDamaged,
smashed → onSmash, rebuilt → onRebuildFinished, locked on → onLockedOn) with exactly one action after it
(`world.setState`, `world.despawn` or `misc.emit`) in the object's script. `addWire` makes the script if
needed, `wiresOf` lists them, `removeWire` takes one out, `wireText` says it in words. The Scene inspector's
**Name, script & wires** section (`src/editor/panels/ScriptSection.tsx`) edits them in one undo step (naming
an unnamed target first); the Scene view draws a teal line from each wired object to its targets.

## Enemies

`Character.enemy` (`src/core/combat/enemy.ts`): `power`, `type`, `reach`, `sight`, `speed`, `cooldown`,
`windup`, with presets (`ENEMY_PRESETS`: grunt, brute, swift) that also set `harm`. In Play,
`src/engine/runtime/enemies.ts` runs them: idle (wandering, v68) until the hero is within `sight`, then chase,
then a `windup` (arm raised, a red “!” drawn over the head) and the swing, which goes through
`PlaySession.damage('hero', power, type, 'n:<id>')` — so guard, parry (stuns it), dodge and stamina apply —
and `cooldown`. Enemies stop while stunned, during a cinematic, a talk or after the game is over.

## Placing neighbours

`npc.place` puts a character on a map as a neighbour (`NpcInstance`, next free `legacyId`, `npcsSaved: true`,
so v68's default neighbours no longer appear on that map); `npc.remove` takes one off.

## Health bars and stamina

`PlaySession.healthBars()` lists hurt objects and neighbours (and enemies in a fight) within 25 studs; the play
renderer draws each as two camera-facing boxes (`Marker.facing`, `turnedY`) over everything. The built-in HUD
has a stamina `bar` bound to `stamina` / `maxStamina` with `style.hideFull` (new: a bar that hides while
full; Screens › bar › Hide when full).

## Training yard

`src/core/gamegen/training-yard.ts` returns the commands that build the sample map (World › Add the Training
yard, one undo step): a floor, two training dummies (health 4, can be locked on), a cracked wall (blunt ×2,
slash ×½), a practice target wired to open the “Yard gate” door when locked on to, a treasure chest behind
the gate, a “Sparring knight” enemy (Grunt preset, drops a medal) and four signs.

## Combat course

Help › Combat course (track `combat`, `src/editor/tutorial/content/11-combat.json`): add the Training yard,
make the knight hit harder and warn longer (click-by-click lines), wire a dummy to the chest, play.
