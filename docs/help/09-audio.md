# Audio

Games ask for named sound events, never files. [Open Audio](open:Audio)

## Sound events

Each event (smash, jump, chest, coin…) picks one of its clips at random or in order, varies the pitch, and limits how many play at once. ▶ previews it. Editing a built-in keeps a project copy.

## Import sounds

Import sounds adds your own .wav, .mp3, .ogg or .m4a files to the project (up to 20 MB each).

## The mixer

Buses group sounds (music, effects, voice, menus, ambience); faders set their volume and meters show what plays. Ducking lowers the music while someone speaks. The dock's Mixer tab works while playing.

## Map music and ambience

Each map has music and an ambience loop (Map tab). Music zones change them while the hero is inside; cinematics and title screens override them, then the map's music returns.

## Music zones

Draw a trigger zone (Z) and set its music or ambience in the zone's inspector: the music changes as the hero walks in and goes back when they leave.

## Sound emitters

The Sound emitter tool (S) places a sound in the world: a loop (a fountain) or now and then (birdsong), heard within its range.
