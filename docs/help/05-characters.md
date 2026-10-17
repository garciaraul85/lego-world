# Characters and animation

The Characters workspace dresses minifigures and animates them. [Open it](open:Characters)

## A new character

Start from one of v68's presets (New character from a preset). The copy is yours; presets stay as they are.

## The look

Change hair, face, outfit, colors and gear in the properties; the preview updates at once and each change is one undo step. Each choice (Hat, Hair, Shirt…) is a button with a small picture of what the character wears now: click it and a panel of pictures opens, showing your character wearing each option (a close-up of the head for hats and hair, of the legs for pants and shoes). Click a picture to wear it. Colors are color boxes.

## The player character

One character is the hero the player controls. Make player character (or Project tab › Hero) picks it. Other characters are neighbours the hero can talk to (T).


## Can be harmed

A character that lives on a map as a neighbour can be harmed only when **Can be harmed** is on (Character properties › Health). Then it has hit points, armour and what each kind of hit does, like an object, and at zero it leaves the play, leaves an item and sends an event. Villagers have it off: hits do nothing to them.

## Animation clips

Clips are keyframe animations on a timeline: a lane per joint, keys you drag in time, and markers that send events, play sounds or start cinematics. + New under Clips makes your own. The built-in Gestures group holds the emotes that keys 1–4 play in Play.

## Animating a clip, step by step

1. Open your clip (Clips › Mine). Its timeline is under the preview.
2. In the timeline tools, open “+ Track…” and pick a joint, for example “Right arm · z”. A lane appears; it is selected, so the preview rings the right arm and names it. Click any track's name to see which part it moves.
3. Click the lanes to move the playhead to a time, then click “◆ Key”. A key ◆ appears on the selected lane at the playhead.
4. Click the key to select it. Under the lanes, type its time in “at” or its value in “value” and press Enter. The selected lane shows each key's value next to it.
5. Press Play (top right of the preview) to watch the clip loop. Length (in the timeline tools) sets how long the clip is: type a number of seconds and press Enter.
