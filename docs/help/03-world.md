# World graph, spawns, zones and gates

A game is a set of maps joined by gates. [Open the World graph](open:World graph)

## Spawn points

Spawn points are where the hero starts or arrives. The Spawn point tool (P) adds one where you click, facing the way the camera looks. The Project tab picks the game's start map and spawn; Shift F5 plays from the selected spawn.

## Trigger zones

The Trigger zone tool (Z) draws a box on the map. When the hero walks in or out, its On enter and On exit actions run: give an item, set a variable, play a sound or a cinematic, show a screen, change state. Logic hears them as On enter zone / On exit zone. A zone can also change the music or play an ambience while the hero is inside (a music zone).

## Maps

The World graph shows every map as a box with its spawn points as ports. + Add map makes a new one; generate its terrain in the Map tab.

## Gates

Drag from a spawn's port on one map to a spawn's port on another to connect them. Click a gate to make it one-way or two-way, reverse it, or give it On arrive actions such as playing a cinematic when the hero comes through.

## Validate routes

World › Validate routes checks that every map can be reached from the start map, that there is a way back, and that every spawn stands on open ground inside the map. Issues go to the Problems tab.

## A map from a picture (or words)

World › **New map from a picture or words…** makes a whole new map: "a snowy mountain village at night with a lighthouse, three red houses, a blacksmith and two guards", "a pirate island at sunset with a ship and palm trees", "a big desert with a pyramid". The words give:

- **the land**: forest, jungle, prairie, mountains, volcanoes, desert, beach and sea, highway, castle grounds (a town or village is open land with its houses; a city has skyscrapers), and its size;
- **the sky**: day, noon, evening or night; rain or snow; mist, fog, swamp or smoke;
- **the buildings**, each built from bricks as an asset from a picture is, with how many ("three red houses");
- **the people**, each made as a character from a picture is, body shape and drawings too ("a blacksmith with a long beard", "two guards").

**Create** shows three: as described, the same on other land, and bigger. **Make this map** builds it — the land, the arrival on open ground, the buildings on level spots the hero can walk to, the people near them — and opens it. It is one step: Undo takes the whole map away. A building that finds no room is listed in a notice; more than three buildings make the land bigger. Connect the new map to your others with a gate in the World graph. With only a picture, its main colours suggest the land; with the AI builder set up, Claude reads the whole picture.
