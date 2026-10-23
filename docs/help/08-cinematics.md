# Cinematics

Cinematics are directed like a film shoot: cast actors, set marks, give instructions, place and cut cameras, then add dialogue, music, sound and effects on the timeline. [Open the Director](open:Cinematics)

## A reward scene

New reward scene makes a complete example: a fade in, a title, a character walks up and speaks, three camera shots, music and a cheer. Scrub the timeline to see any moment in the camera preview.

## Cast and marks

The cast panel lists the roles (the hero or any character). Marks are spots to walk to and look at; the Marks list (left) selects one, and the panel on the right shows its Position (X across, Y up, Z along, in studs) and Facing (° — 0 looks toward +Z, 180 toward −Z), to type exact numbers. Drag a mark on the stage to move it in half studs. Record (●) makes the selected role walk where you click on the stage.

Instructions are walk, face, say, show a mood, gesture, play a clip and hold an item. **Say a line** has a **Mood**: the actor shows that face (its own faces from Characters › Face) while its mouth moves with the words; **Show a mood (face)** changes its face for a while without words. Clip, Gesture and Item show a picture of the actor for each choice; Event name lists the names the project uses, with who sends and who hears each. Every field has a **?** that says what it is and where its value comes from.

## Cameras

Orbit the stage view to frame a shot, move the playhead, then Camera from view adds a camera there. Shots cut, or blend when Blend is above zero. Cameras can look at a role.

## Tracks

Dialogue, music, sound, fades, letterbox and titles live on their own tracks. Select an item to edit it in the item inspector.

## Example: opening a treasure chest

The guided tutorial directs this 8-second scene, “Treasure chest”, with a chest a few steps from the start:

| Time | Row | Item |
| --- | --- | --- |
| 0.3 s | hero | Walk to the mark in front of the chest (it arrives facing it) |
| 2 s | hero | Play a clip: “Open chest” (reach down, lift) |
| 2.9 s | Events | Send “scene-opens-chest”: logic opens the lid and lifts the sword out |
| 3 s | Sound | “treasure”: a rising shimmer and fanfare |
| 4 s | hero | Play a clip: “Hold it up” (both arms up) |
| 4.6 s | hero | Hold an item: Sword |
| 4.6 s | Events | Send “scene-takes-sword”: logic removes the floating sword |
| 4.8 s | Post | Title card “You got the Sword!” |

The mark goes in front of the chest's lid: the tutorial names its exact X, Z and Facing, and draws a gold ring on the stage there (the step passes within 1.2 studs of the ring's middle, facing within 30°). Three camera shots frame it: wide while the hero walks, close on the chest at 2 s, on the hero at 4 s. The zone in front of the chest plays the scene once when the hero walks in. To add an item, move the playhead (click the ruler; ← and → then move it 0.1 s), press + on the row, then set it in the panel on the right.

## Triggering a scene

Anything can start a scene: a trigger zone, an asset interaction, a screen button, a gate's On arrive, a clip marker, or the Play cinematic logic node. Players can skip a scene; On cinematic done tells logic when it ends.
