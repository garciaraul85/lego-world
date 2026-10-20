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

## Animation by posing

The **Poses** tab under the preview edits a clip pose by pose: you set a few poses and the motion between them is filled in. A pose is where every joint is at one moment.

1. Click **+ New** under Clips, then **Poses** under the preview.
2. With the **Playhead** at 0 s press **+ Pose here**: the first pose, standing. Drag the Playhead to the end and press **+ Pose here** again.
3. Put the Playhead in the middle and drag a joint's slider, for example **Right arm out**. A pose appears there with the arm raised; the pictures along the top show every pose.
4. Press **Play**: the arm rises and falls. **Into the next pose** sets how: **Smooth** slows in and out, **Even** keeps one speed, **Speeding up**, **Slowing down**, or **Hold, then jump** for a snap.
5. **⇆ Mirror** swaps left and right in the pose; **Copy pose** then **Paste pose** repeats one (the last pose of a loop as its first); **At** moves a pose in time; **Delete pose** takes it out.

**Keys** shows the same clip on the timeline, joint by joint. The built-in **Moves** (Walk, Run, Jump, Swing, Flinch, Breathe) are made this way: open one in Poses to see its few poses. [Posing and states course](action:help.posing)

## The animation state machine

Every character is in one **state** at a time, and the clip set for that state plays. The rules are checked from the top and the first that holds wins:

1. **Hurt** for a moment after a hit (**Hurt shows for**, 0.45 s at first),
2. **Attack** while it swings or strikes,
3. **Jump** while its feet are off the ground,
4. **Run** when it moves at **Runs from** studs a second or faster (the hero walks at 4 and runs at 7.8),
5. **Walk** when it moves slower,
6. **Idle** when it stands (the hero waits a moment first).

A state with **Built-in motion** shows the engine's own movement. Clips crossfade into each other; Hurt, Attack and Jump play their clip once each time, the others loop. With **Walk and run clips keep up with the speed** the walk and run clips play faster or slower with the speed, so the feet match the ground. **Use the built-in moves** fills the empty states with Walk, Run, Jump, Swing, Flinch and Breathe. **Try it** pretends a speed, a jump, an attack or a hit and lights the state that wins, playing its clip on the figure.

The hero, neighbours and enemies all use their own character's states. A creature with a body plan has its own movement for each state: it walks when it moves, **strikes** (lunges with its head and jaw) when it attacks and **flinches** when it is hit; **Strike** and **Flinch** on the Body tab show them.

## The character sheet

The right side of the Characters screen is the character's **sheet**, in tabs:

- **Look**: body, face, hair, clothes and gear (🎲 **Random look** makes one from a seed).
- **Body**: the minifig, or an animal or monster (below).
- **Face**: the resting face and a face for each mood (below).
- **Outfits**: sets of clothes it can wear, each with stat bonuses. **Wear** one and change the look: the changes go into the outfit, and its own look stays. Logic's **Change outfit** swaps them in Play.
- **Stats**: hearts (the player character), stamina, speed, jump, strength (hit power), defence (8% less damage a point) and a level with an experience curve. Logic's **Give experience** levels up; **On level up** reacts. The genre's simple view shows the stats its games use.
- **Moves**: a fighting style (Balanced, Swift, Heavy, Defensive) with hit power and swing speed; a neighbour fights the hero with **Fights the hero**.
- **Animations**: the clip each state plays (the animation state machine, below), and Victory on a level up. Each state's clip button opens every clip as a picture that moves while the pointer is on it; **▶** plays the clip on the big figure (**■** stops it), and picking a clip plays it too. The clip list on the left moves the same way on hover.
- **Voice**: talk pitch and blip for its lines in dialogue, footsteps and its hurt sound. **▶ Hear it talk** says a sample line letter by letter with the blip at its pitch, as in a conversation, and the figure in the preview says it with its mouth (close up); **▶** beside a sound plays just that sound.
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

**Custom…** (the last card) makes a body of your own: pick the skeleton to **Start from** (any family) and press **Make my body**. The bones show at once, ready to add, move and remove. **Skeleton**: **✏️ Edit the skeleton** turns the family into a **body plan** of your own, kept in the game, that any character can wear. Click a bone to change its name, the bone it hangs from, its role, its joint (x right, y up, z forward), its **swing** (how far it moves, in degrees) and **phase** (legs with the same phase step together). **+ Bone on …** adds a bone under the picked one, **+ Brick on …** gives it bricks, **Remove** passes its bones and bricks to its parent. **Moves by** (Walk, Fly, Swim, Slither, Hop), **Stride** and **Hover** are for the whole body. [Creatures course](action:help.bodies)

## Faces for moods

The **Face** tab shows a minifig's resting face (head shape, eyes and their colour, expression, face marks, facial hair and glasses) and a picture of its face for each mood: **Happy**, **Angry**, **Sad**, **Scared** and **Surprised**. Click a mood to see it on the preview and change its **Expression** and **Eyes**; **Default** puts it back. Dialogue lines have a mood (in a script: Tom (angry): Who left the gate open?): in Play the speaker shows that face on its figure and in the dialogue box's portrait, which is now the speaker's own head.

## Talking

When a minifig says a line its mouth moves with the words: closed for m, b and p and between words, wide open for a and o, half open for the other letters, and closed again when the line has appeared. It talks on its figure in Play, in the dialogue box's portrait, in the conversation preview and in cinematics, with the face of the line's mood. **▶ Hear it talk** on the Face tab shows a mood's face talking. Creatures with a body plan have no mouth to move.

## A character from a picture

**✨ From a picture…** (under + New character, or Assets › New character from a picture…) turns a photo, a drawing or a few words into three characters to pick from, closest first, each listing what its parts matched. With the AI builder set up, Claude looks at the picture; it only chooses settings the editor has — a body family with its sliders and colours, or the minifig's parts and colours — so **Use this one** gives an ordinary character you can keep changing, and Undo removes it. Without the AI builder the words pick the kind and the parts ("a queen with a sword and a long red scarf", "a little orange fox") and the picture gives the main colours.

The picture stays on this device: it is sent to Claude only when you press **Create**, and it is never saved in the game. Only use photos of yourself or of people who agreed; a famous character becomes an original character in brick style, not a copy. [Faces and pictures course](action:help.faces)

Every body family also has eight **presets** (Dog, Cat, Horse, Wolf… Parrot, Owl… Shark, Clownfish…) under its description in the Body tab.

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
