# Troubleshooting

## A brick won't go there

Bricks must sit on studs of the brick below (or the ground) and never overlap. Tiles have no studs, so nothing can stand on them. Try another spot or turn the brick with T.

## I can't erase a brick

Bricks that hold others up are protected so the map never breaks. Erase the bricks on top first, or Shift-erase the whole object.

## The hero starts inside a wall

World › Validate routes lists blocked spawns. Move the spawn to open ground with the Move tool.

## A map can't be reached

Connect it with a gate in the World graph, from a map that can be reached from the start map.

## Nothing happens when I walk into a zone

Check the zone's On enter actions in its inspector, or that the logic's On enter zone node has the right zone. The Console shows log() output and the Debug tab shows variables.

## There is no sound

Browsers start audio only after a click or key press, so click the game once. Check the mixer's master and bus faders.

## Play could not start

The message names the problem; fix it (often a missing reference shown in the Problems tab) and press Play again.

## I lost my work

Projects save to this browser only. Use File › Save project file to keep a copy; clearing site data removes the browser copy.
