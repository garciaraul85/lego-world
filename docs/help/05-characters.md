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

## Fights the hero

**Make enemy** turns a neighbour into a foe: pick Grunt (3 hits, slow swings), Brute (tough, armoured, hits hard) or Swift (fragile and fast). It switches on Can be harmed with that health and fills in how it fights: **Hits for** (hearts per swing), **Reach**, **Sees the hero within**, **Walking speed**, **Seconds between swings** and **Warning before a swing**. In Play it wanders until it sees the hero, walks over, raises its arm with a red “!” over its head, then swings. Guard (hold Q) to block from the front, raise the guard just before the swing to parry it (it is stunned), or dodge-roll (C). × stops it fighting.

## Animation clips

Clips are keyframe animations on a timeline: a lane per joint, keys you drag in time, and markers that send events, play sounds or start cinematics. + New under Clips makes your own. The built-in Gestures group holds the emotes that keys 1–4 play in Play.

## Animating a clip, step by step

1. Open your clip (Clips › Mine). Its timeline is under the preview.
2. In the timeline tools, open “+ Track…” and pick a joint, for example “Right arm · z”. A lane appears; it is selected, so the preview rings the right arm and names it. Click any track's name to see which part it moves.
3. Click the lanes to move the playhead to a time, then click “◆ Key”. A key ◆ appears on the selected lane at the playhead.
4. Click the key to select it. Under the lanes, type its time in “at” or its value in “value” and press Enter. The selected lane shows each key's value next to it.
5. Press Play (top right of the preview) to watch the clip loop. Length (in the timeline tools) sets how long the clip is: type a number of seconds and press Enter.

## The character sheet

The right side of the Characters screen is the character's **sheet**, in tabs:

- **Look**: body, face, hair, clothes and gear (🎲 **Random look** makes one from a seed).
- **Body**: the minifig, or an animal or monster (below).
- **Outfits**: sets of clothes it can wear, each with stat bonuses. **Wear** one and change the look: the changes go into the outfit, and its own look stays. Logic's **Change outfit** swaps them in Play.
- **Stats**: hearts (the player character), stamina, speed, jump, strength (hit power), defence (8% less damage a point) and a level with an experience curve. Logic's **Give experience** levels up; **On level up** reacts. The genre's simple view shows the stats its games use.
- **Moves**: a fighting style (Balanced, Swift, Heavy, Defensive) with hit power and swing speed; a neighbour fights the hero with **Fights the hero**.
- **Animations**: the clip for idle (standing still), victory (a level up) and hurt; walk, run, jump and attack are kept for the animation state machine (P23).
- **Voice**: talk pitch and blip for its lines in dialogue, footsteps and its hurt sound.
- **Dialogue**: its Talk list and barks (below).
- **Behaviour**: what kind of character it is, whether it walks around or stands still where it was put, the role buttons (Knight, Ranger, Wizard, Shopkeeper, Brute, Boss) that fill in a sheet, and the **party**: playable characters the player switches between with H.

**Try** (above the preview) plays a move on the character without leaving the sheet. Characters made before the sheet keep their look; every tab starts from the defaults. [Character sheet course](action:help.sheet)

## Bodies: animals, monsters and skeletons of your own

A character is a minifig unless the **Body** tab says otherwise. Pick a **family** and it becomes a creature made of bricks:

- **Four legs** (dogs, cats, horses) walks with a diagonal step; **Dragon** adds a long neck and tail, horns and wings, and flies.
- **Bird** hovers and flaps; **Fish** floats and swims, bending from head to tail fin; **Serpent** slithers.
- **Spider**, **Insect** and **Robot walker** step on eight or six legs with knees; **Slime** hops.

The sliders (Size, Leg length, Neck, Tail length, Wing span, Head size, Build) change its bricks and bones; the four colours (Main, Accent, Belly, Eyes) paint them. Nobody animates a body by hand: each **bone** has a role — a leg steps, a wing flaps, a spine bends, a tail sways, a jaw opens — so **▶ Walk** (Fly, Swim, Slither, Hop) shows it moving, and in Play it moves the same way as it goes. **Show the skeleton** draws the bones.

**Built from bricks**: build a creature in the Asset studio and choose it in **Brick build**; each brick follows the bone it is nearest to. To move a brick to another bone, pick the bone in **Paint onto** and click the brick in the preview. **Auto-attach** puts them all back on their nearest bones.

**Skeleton**: **✏️ Edit the skeleton** turns the family into a **body plan** of your own, kept in the game, that any character can wear. Click a bone to change its name, the bone it hangs from, its role, its joint (x right, y up, z forward), its **swing** (how far it moves, in degrees) and **phase** (legs with the same phase step together). **+ Bone on …** adds a bone under the picked one, **+ Brick on …** gives it bricks, **Remove** passes its bones and bricks to its parent. **Moves by** (Walk, Fly, Swim, Slither, Hop), **Stride** and **Hover** are for the whole body. [Creatures course](action:help.bodies)

## Dialogue: what characters say

Open the **Dialogue** tab at the top of the Characters screen. A **conversation** is a few sections; each is a list of steps played in order:

- a **line**: who says it (a character, a name, or the narrator), their mood, and the text — write {gems} or {hero.name} to show a value;
- a **choice**: options the player picks; each goes to a section, to the end, or carries on;
- **actions**: set or add to a variable, give an item, play a cinematic, unlock an achievement, show a message, start another conversation;
- **likes**: how much the speaker likes the hero goes up or down (−100 to 100);
- a **jump** to another section, or to the end.

Any step or option can have an **if**: it only plays when the condition holds. Conditions read like words: `gems >= 50`, `quest.sword is done`, `has key`, `talks > 0` (talked to them before), `likes >= 20`, `time is night`, `chance 25%`, `door.state is open`, joined with `and`, `or` and `not`. An option whose condition fails is hidden, or shown greyed out when you tick **grey**.

**List** edits a conversation like a chat script; **Graph** shows its sections as boxes with arrows; **Script** is plain text for writers, kept in step with the other two:

```
== start
[if talks > 0] Old Tom (happy): Back again?
Old Tom: Welcome, traveller!
* What bridge? -> bridge
* Buy a map [if gems >= 5] [grey] -> map
* Bye! -> end

== map
> add gems -5
> give map
Old Tom: Here you go.
```

**▶ Preview** plays it beside the editor, with the values its conditions read set on the side, so you can try every branch. **⚠** lists what can never play or is broken: sections nothing jumps to, jumps to missing sections, conditions with mistakes, deleted speakers.

## Talk, barks and where conversations start

A character's **Talk** list (Properties, right) says which conversation plays when the hero talks to them: the first whose condition holds — first meeting, during a quest, after it, at night, when the hero carries the key. Leave the last one without a condition so something always plays. **Barks** are short lines a neighbour says when the hero walks past.

Conversations also start from a **sign** (select it, **Read with E**: it reads in the Sign style), from an object's interaction or a screen button (the action **Start conversation**), and from logic (**Start conversation**; react with **On choice made** and **On conversation end**). The look of every conversation is set in **Project › Dialogue**: [Dialogue style](help:e/scene.dialogue).

In Play: T or E talks; Enter, Space or a click moves on (a line still appearing shows whole first); 1–6, or the arrows and Enter, pick an option; Esc or walking away ends it. [Dialogue course](action:help.dialogue)
