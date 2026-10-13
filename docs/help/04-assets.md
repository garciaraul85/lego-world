# Assets

Assets are reusable objects made of bricks: houses, trees, chests, doors, lamp posts, vehicles. [Open the Asset studio](open:Assets)

## The library

The dock's Assets category lists the built-in library (Buildings, Nature, Props, Structures, Vehicles, Decoration) and your own (Mine, From maps). Pick one and Place (B) is ready with it: click the map to put a copy down, or drag the card straight in; T turns it.

## Instances

Every placed copy is an instance of the asset, so editing the asset updates them all. Unpack turns one instance back into loose bricks you can edit on their own.

## The Asset studio

The Assets workspace is a build plate for one asset. Use the build tools above the plate to add, paint and remove its bricks. Its panels set:

- **States**: closed / open, on / off… Each state can hide, show or move bricks. "Showing state" previews them.
- **Sockets**: where the hero stands to interact.
- **Interactions**: what E does at a socket: change state, give an item, play a sound or a cinematic, send an event to logic. The chest opens its lid and sends "chest-opened".
- **Smash and rebuild**: whether F smashes it, what it drops, and whether holding E rebuilds it.
- **Generator rules**: whether the terrain generator scatters it, in which environments, how often (weight) and on what ground.

## Turned parts

Some things lean or tilt: a crooked roof, a branch, a wheel on its side. In the Asset studio, select those bricks (Alt-click picks single bricks, Shift-click adds more), then use Rotate (E): the red ring turns them about X, the green about Y, the blue about Z, in 15° steps. Resize (Q) on several bricks sizes them the same way. They become a part of the asset, listed under Turned parts on the right, and every placed copy shows them turned, also when the copy itself is turned. Straighten puts them back. For the brick rules a part keeps its straight place, so nothing that was built on it is left floating; nothing new can be built on a turned part.

The piece button above the build plate shows the brick you are building with; click it to pick the kind and size from pictures, and pick the color next to it.
