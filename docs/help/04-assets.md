# Assets

Assets are reusable objects made of bricks: houses, trees, chests, doors, lamp posts, vehicles. [Open the Asset studio](open:Assets)

## The library

The dock's Assets category lists the built-in library (Buildings, Nature, Props, Structures, Vehicles, Decoration) and your own (Mine, From maps). Pick one and the Place asset tool (A) is ready: click the map to put a copy down, T turns it.

## Instances

Every placed copy is an instance of the asset, so editing the asset updates them all. Unpack turns one instance back into loose bricks you can edit on their own.

## The Asset studio

The Assets workspace is a build plate for one asset. Use the build tools above the plate to add, paint and remove its bricks. Its panels set:

- **States**: closed / open, on / off… Each state can hide, show or move bricks. "Showing state" previews them.
- **Sockets**: where the hero stands to interact.
- **Interactions**: what E does at a socket: change state, give an item, play a sound or a cinematic, send an event to logic. The chest opens its lid and sends "chest-opened".
- **Smash and rebuild**: whether F smashes it, what it drops, and whether holding E rebuilds it.
- **Generator rules**: whether the terrain generator scatters it, in which environments, how often (weight) and on what ground.
