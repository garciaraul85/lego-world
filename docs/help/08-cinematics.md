# Cinematics

Cinematics are directed like a film shoot: cast actors, set marks, give instructions, place and cut cameras, then add dialogue, music, sound and effects on the timeline. [Open the Director](open:Cinematics)

## A reward scene

New reward scene makes a complete example: a fade in, a title, a character walks up and speaks, three camera shots, music and a cheer. Scrub the timeline to see any moment in the camera preview.

## Cast and marks

The cast panel lists the roles (the hero or any character). Each role has marks to walk to and instructions (walk, look at, emote, say). Record (●) makes the selected role walk where you click on the stage.

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
| 2.9 s | Events | Send “open-chest”: logic opens the lid and lifts the sword out |
| 3 s | Sound | “treasure”: a rising shimmer and fanfare |
| 4 s | hero | Play a clip: “Hold it up” (both arms up) |
| 4.6 s | hero | Hold an item: Sword |
| 4.6 s | Events | Send “take-sword”: logic removes the floating sword |
| 4.8 s | Post | Title card “You got the Sword!” |

Three camera shots frame it: wide while the hero walks, close on the chest at 2 s, on the hero at 4 s. The zone in front of the chest plays the scene once when the hero walks in. To add an item, move the playhead (click the ruler), press + on the row, then set it in the panel on the right.

## Triggering a scene

Anything can start a scene: a trigger zone, an asset interaction, a screen button, a gate's On arrive, a clip marker, or the Play cinematic logic node. Players can skip a scene; On cinematic done tells logic when it ends.
