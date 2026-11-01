# Assets

Assets are reusable objects made of bricks, and of other assets: houses, trees, chests, doors, lamp posts, vehicles, a whole street. The Assets screen is where bricks are put down one by one; the Scene places whole assets. [Open the Asset studio](open:Assets)

## The library

The dock's Assets category lists the built-in library (Buildings, Nature, Props, Structures, Vehicles, Decoration) and your own (Mine, From maps). Pick one and Place (B) is ready with it: click the map to put a copy down, or drag the card straight in; press T to turn it a quarter turn before you put it down.

## Instances

Every placed copy is an instance of the asset, so editing the asset updates them all. Select a copy in the Scene and go to the Assets screen (or press Edit in the Assets screen) and that asset opens, ready to change.

## The Asset studio

The Assets workspace is a build plate for one asset. The Asset library on the left has two tabs:

- **Assets**: click one to open it. Drag one onto the build plate (or press **+** on its row) to build a copy of it into the open asset: a tower with a chest on top, a garden bench from a bench and a flower bush. The copy is picked up as one, so Move (W) puts it where you want it. It is a copy: changing the other asset later does not change this one, and its sockets and interactions stay with the original.
- **Bricks**: every piece and colour. Click a piece and then the plate (Place bricks, B), or drag the piece straight onto the plate; T turns it first.

The build tools above the plate move, turn, paint and remove bricks.

Changing an asset changes every copy placed in the world. If a copy would then run into something on its map (a bigger chest next to a wall), the change is not saved: the plate goes straight back to the saved asset and a message names the map. Move that copy to open ground in the Scene and try again, or press **Keep it as a new asset** to keep your change as a separate asset. A built-in asset you have changed (the chest, a tree) is marked “· changed” in the library and shows **Reset to built-in** in its properties; **Assets › Reset changed built-in assets** puts them all back at once. Your own assets show **Reset to when I opened it**. Undo brings your version back either way.

Its panels set:

- **States**: closed / open, on / off… Each state can hide, show or move bricks. "Showing state" previews them.
- **Sockets**: where the hero stands to interact.
- **Interactions**: what E does at a socket: change state, give an item, play a sound or a cinematic, send an event to logic. The chest opens its lid and sends "chest-opened". Send event picks from the events the project already uses (so the logic that listens spells it the same way), or New event… to type a new one; ▶ next to a sound or music plays it so you can hear what you picked.
- **Smash and rebuild**: whether F smashes it, what it drops, and whether holding E rebuilds it.
- **Generator rules**: whether the terrain generator scatters it, in which environments, how often (weight) and on what ground.

## Build helpers: mirror, fill and stamp

Above the build plate, beside the brush:

- **⇆ Mirror X** and **⇅ Mirror Z**: everything you do happens on both sides of a blue line across the plate — each brick you place (its copy shows see-through first), paint or erase. The line starts at the middle of the asset; **−** and **+** move it half a stud at a time. If the other side is blocked, only this side is placed and a tag says so. With both on, a brick is copied to all four corners.
- **🪣 Fill**: the Paint tool paints every brick of the clicked colour that is joined to it (side by side or stacked). Shift+click fills once without turning Fill on.
- **⧉ Stamp** (Ctrl C, then Ctrl V): copies the selected bricks; each click of the Place tool puts another copy down where you point, going up until it fits (with the mirror, if one is on). **Stop** or Escape ends it.

## Custom bricks

The Asset library's **Bricks** tab › **Custom** › **New brick…** opens the **brick editor**, for brick shapes the game doesn't have:

- **Shape**: a slope (studs along its back), an inverted slope, a curve (a quarter-round top), a round brick, a cone, a dome, an arch (a round hole through it, 3 studs wide or more) or a wedge (cut on a slant). Round bricks, cones and domes are as deep as they are wide.
- **Height**: a brick, a plate or a tile; **Wide** and **Deep**: 1 to 8 studs; **Studs**: on its flat top, or none.
- The preview turns (drag) and zooms (scroll).

A saved brick goes into your brush and the Custom group: place it, turn it (T) and paint it like any brick, in assets and maps. It keeps its shape in Play; Play in v68 shows the plain brick of that size. Press **✎** on it to change it, and every brick of it follows. Once bricks of it are used, its height and size stay (**Save a copy** makes another size) and it can't be deleted. A game holds up to 64 custom bricks; the AI builder makes them with `brick.put`.

## Turn it into

**Turn it into**, under the asset's name: **💥 Breakable** (smashed in Play), **📦 Pushable** (loose: it falls, tips over when pushed and floats) and **🐾 A creature** — a new character that walks on a four-legged skeleton wearing the asset's bricks, opened in Characters › Body to change.

## Turned parts

Some things lean or tilt: a crooked roof, a branch, a wheel on its side. In the Asset studio, select those bricks (Alt-click picks single bricks, Shift-click adds more), then use Rotate (E): the red ring turns them about X, the green about Y, the blue about Z, in 15° steps. Resize (Q) on several bricks sizes them the same way. They become a part of the asset, listed under Turned parts on the right, and every placed copy shows them turned, also when the copy itself is turned. Straighten puts them back. For the brick rules a part keeps its straight place, so nothing that was built on it is left floating; nothing new can be built on a turned part.

## Moving parts

**In one click:** select the bricks that move and pick a kind in **Selected bricks → a door, a drawbridge…**: **Door** (swings on its side), **Drawbridge** (stands up when closed, lowers to open), **Lid** (lifts at the front), **Lever** (tips over), **Gate** (slides up, a portcullis) or **Trapdoor** (drops open). The asset gets two states (closed and open; off and on for a lever), the part its hinge and pose, and **E** in Play opens and closes it (unless the asset already says what E does). A part's own **Move like** turns it into another kind. Everything stays editable in its pose rows.

A part can also move between the asset's states: the treasure chest's lid swings open, a door turns on its hinge, the built-in Sword rises out of a chest. Each moving part has a pose in every state (a turn in degrees about X, Y and Z, and a move in studs) and a hinge it turns around; every placed copy eases from one pose to the next when its state changes, over the seconds you set.

1. Select the bricks that move (the lid), then click **Selected bricks → moving part** under Parts (right). A part that is already turned has a **Moves** button instead.
2. Pick a state above the plate (for example **open**) and type its pose: **turn x°** −105 lifts a lid up and back.
3. In **Turns around** pick the hinge: **Back bottom edge** for a lid, **Left/Right bottom edge** for a door, **Its middle** to spin in place.
4. Set **seconds**. Pick each state above the plate to see the part there; in Play it eases between them.

An asset made only of moving parts floats when logic puts it in the world with **Spawn item at object**: it is drawn but does not have to fit among the bricks, so a sword can rise out of a closed-looking chest.

The piece button above the build plate shows the brick you are building with; click it to pick the kind and size from pictures, and pick the color next to it.

## Gives light

Tick **Gives light** in the Asset studio and every copy of the asset lights what is around it: a torch, a lamp, a glowing crystal. Pick the kind of light and change it as you would a placed light; **Across**, **Up** and **Deep** are where on the asset it shines from (the small marker on the plate). **Glows in** picks the states it is lit in: the built-in Lamp post glows when it is **on**. Logic switches a copy's light by the copy's name, and a smashed copy's light goes out.

## Loose

Tick **Loose** in the Asset studio and every copy of the asset is moved by the physics engine in Play: it falls if nothing holds it up, tips over and slides when the hero walks into it, floats in water and drifts with a river's current. Leave it off for buildings, trees and anything that should stay put. Loose copies still break when smashed.

## Puzzle: push blocks, switches, locks and pickups

The **Puzzle** section of the Asset studio says what the asset does in a puzzle. Each is one tick.

- **Push block**: in Play the hero holds Action (**Grab**) and walks into it, leans in with both hands on it, and it slides one step square along the floor (its own size, or the **Step** you set). It stops at walls, other blocks and edges, steps up onto a switch and holds it down. With **Can be pulled**, the hero holds Action (the button shows **Grab**) and steps back to drag it, sitting back as it pulls. While held, arrows on the floor and a HUD line show which key pushes and which pulls. It slides smoothly, about a stud every quarter second, with the hero walking along. Walking into it without Grab climbs on top of it. (A character sheet can set its own **Push**, **Pull** and **Climb** clips.)
- **Switch**: its first two states are off and on (the Floor switch's are up and down). **Stepped on**: weight presses it — the hero, neighbours and enemies, push blocks and loose crates the physics engine moves (**Held down by** chooses who counts; **Needs weight** how much: the hero or a neighbour 1, a crate 1 to 3 by size, a push block 3), and its pad sinks a plate with what stands on it; **Hit** by a sword, an arrow, a boomerang or a bomb (tick the kinds it answers to; none ticked: any hit; it never breaks), or **Pressed** with Action at its interact socket (a lever). It **Stays on**, is on only while **Held down**, is **Timed** (it ticks, faster near the end, and goes back after its seconds) or **Flips each time**.
- **Lock**: its first two states are locked and open. Action at its interact socket opens it when the hero has the key: **a small key** found on this map (used up), **the boss key** (kept), or **an item** you name (used up unless **Kept**).
- **Pickup**: the hero touches it and it is gone: a **Small key**, **Boss key**, **Dungeon map** or **Compass** (they belong to the map where they are found), a **Heart** (it heals), or any item for the inventory.

A switch or lock on an asset with one state gets an off and on (locked and open) pair of states; draw what each state shows with **Only in this state**. Logic hears them all: **On switch** (with To: on or off), **On pushed**, **On unlocked** and **On picked up**. The **Switch opens a gate** template (Logic › From a template…) opens a gate when any switch turns on and shuts it when a held or timed one goes off.

## Fire and light: burns, beams and mirrors

**Climbable** (Puzzle section): the hero walking into it holds on and climbs it like a ladder — forward up, back down, over the top onto it or what is beyond; Jump lets go. Vines and the Ladder are climbable.

The **Fire and light** section of the Asset studio, under Puzzle:

- **Burns**: a torch's flame, a fire hit, a bomb's blast or a burning thing touching it sets it alight. It burns for its seconds (flames and a crackle) and is gone for good (saves remember). With **Spreads**, it sets burnable things touching it alight too. Logic hears **On burned**.
- **Shines a beam**: a beam of light runs straight out of its front (the way the placed copy is turned: T), at the **Height** you set, up to its **Reach**, in one state (**Shines**) or always, in its own **Colour**. It stops at the first solid thing.
- **Grows bombs**: a plant with a bomb on top (its states: grown, picked). Action picks the bomb up, lit; once it has gone off another grows: **Always**, **Only after a miss** (the blast hit nothing, so a puzzle can be tried again until it is solved) or **Never**.
- **Flame**: a fire effect burns on it, always or only in one state (a torch stand's flame while it is lit), at the **Height** and **Size** you set. It is only a picture; fire, a torch or a bomb is what burns things.
- **Mirror**: a beam reaching it goes on from its middle a quarter turn to one side or the other, as it leans: its first state one way, its second the other (two states are added). With **Turns when pushed**, the hero holds it (Grab, Action held) and pushes it round where it stands. Anything else in the beam stops it: the hero, a neighbour, a bomb, a loose crate (the physics engine's moving things).

A **light sensor** is a switch **Lit by a beam** (Puzzle › Switch): it turns on when a beam reaches it and, if Held, off again when the beam goes. A **torch stand** is a switch **Hit** by **Fire**: a torch's flame lights it.

## Health: things that take several hits

Without health, one hit smashes an asset (when **Can be smashed** is on). With **Health** (Asset properties, under Smash) it takes several hits first:

- **Make breakable** gives it health in one click: 2 hits like a crate, 1 like a pot, 5 like a door, or only explosions like a stone wall.
- **Hit points**: how much damage it takes. Bare hands or a hammer do 1 per hit, a sword 2, a sledgehammer 3.
- **Armour** is taken off every hit; a hit weaker than it does nothing.
- **Hits by type**: for slash, blunt, pierce, fire, explosive and electric hits, choose normal, weak ×2, half or immune.
- **At zero**: break into bricks, leave an item (an asset by name put where it was, or an inventory item given to the hero) and send an event.

In Play, each hit says how much is left (“Wooden crate: 1 of 2 left”), and logic's **On damaged** and **On defeated** run. The built-in **Wooden crate** takes 2 hits.

## After it breaks

The Smash section's **After it breaks** decides what becomes of an asset once it breaks in play:

- **Rebuildable**: its bricks wait until the hero rebuilds it (hold E), as in v68.
- **Gone for good**: its loose bricks fade after a moment; only a note that it broke is kept, so saves stay small.
- **Comes back**: it is whole again after **Comes back after** seconds (not while the hero stands there), or, at 0, when the player comes back to the map. Good for crates, pots and rocks.
- **Leaves rubble**: a few of its bricks stay on the ground as scenery; the rest fade.

At most 220 loose bricks fly about at once, and a map remembers at most 2,000 breaks: past that, the oldest that need not be rebuilt are cleared (kept only as brick ids in saves). Characters that can be harmed have **Comes back** too (Characters › Behaviour › Can be harmed): they return healed at their home.

## An asset from a picture (or words)

**✨ From a picture…** (under + New asset in the Assets screen, or Assets › New asset from a picture or words…) makes an asset from a photo, a drawing or a few words: "a red brick house with a blue door, two floors and a chimney", "a big stone castle", "a pirate ship with black sails", "a lighthouse", "a yellow bus", "a fountain". It knows houses, cottages, shops, barns, towers, castles, skyscrapers, lighthouses, windmills, temples, pyramids, tents and huts; bridges, walls, fences, gates, arches, wells, fountains and statues; trees, bushes and rocks; cars, trucks, buses, trains, carts, boats, ships and planes; benches, tables, beds, crates, barrels, chests, lamps, signs, market stalls and thrones. The words set its size (tiny, small, big, huge), floors ("three floors"), roof (flat, pointed, dome, battlements), features (chimney, flag, windows, balcony, awning, sign, columns, sails, cannons) and the colour of each part ("a red roof", "a blue door", "white walls").

**Create** shows three, each a picture of its bricks: as said, colours the other way round, and bigger. **Use this one** adds it to the game and opens it in the Asset studio, where every brick can be changed; **Use and place on the map** also puts it on a flat free spot near the start. Every brick rests on studs, by the game's brick rules. With the AI builder set up, Claude looks at the picture and chooses the settings; the editor always builds the bricks. A famous building or vehicle becomes an original one in brick style.

**🔍 Preview** on a match (or a click on its picture) shows it big: drag to turn it, scroll to zoom, and pick each of its states. **Use this one** from there adds it; **◀ Back to the matches** or Escape goes back.
