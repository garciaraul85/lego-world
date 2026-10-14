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

Changing an asset changes every copy placed in the world. If a copy would then run into something on its map (a bigger chest next to a wall), the change is not saved: the plate goes straight back to the saved asset and a message names the map. Move that copy to open ground in the Scene and try again, or press **Keep it as a new asset** to keep your change as a separate asset. A built-in asset you have changed (the chest, a tree) shows **Reset to built-in** in its properties, to put it back as it came with the engine.

Its panels set:

- **States**: closed / open, on / off… Each state can hide, show or move bricks. "Showing state" previews them.
- **Sockets**: where the hero stands to interact.
- **Interactions**: what E does at a socket: change state, give an item, play a sound or a cinematic, send an event to logic. The chest opens its lid and sends "chest-opened". Send event picks from the events the project already uses (so the logic that listens spells it the same way), or New event… to type a new one; ▶ next to a sound or music plays it so you can hear what you picked.
- **Smash and rebuild**: whether F smashes it, what it drops, and whether holding E rebuilds it.
- **Generator rules**: whether the terrain generator scatters it, in which environments, how often (weight) and on what ground.

## Turned parts

Some things lean or tilt: a crooked roof, a branch, a wheel on its side. In the Asset studio, select those bricks (Alt-click picks single bricks, Shift-click adds more), then use Rotate (E): the red ring turns them about X, the green about Y, the blue about Z, in 15° steps. Resize (Q) on several bricks sizes them the same way. They become a part of the asset, listed under Turned parts on the right, and every placed copy shows them turned, also when the copy itself is turned. Straighten puts them back. For the brick rules a part keeps its straight place, so nothing that was built on it is left floating; nothing new can be built on a turned part.

The piece button above the build plate shows the brick you are building with; click it to pick the kind and size from pictures, and pick the color next to it.
