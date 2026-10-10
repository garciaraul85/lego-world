# Scene

The Scene workspace is where you build a map. [Open it](open:Scene)

## Camera

Drag to orbit, right-drag or Shift-drag to pan, wheel to zoom. On touch: one finger orbits, two fingers pan and pinch. Home fits the whole map, F frames the selection, Numpad 7 looks from the top.

## Selecting

With the Select tool (V), click an object to select all of it (a house, a tree). Alt-click selects a single brick, Shift-click adds to the selection, G selects the whole group, Esc deselects. The Hierarchy lists every object by type (terrain, buildings, nature, spawn points, zones, sounds, signs) with a filter box; Layers and Find are next to it.

## Moving and turning

Move (W) and Rotate (E) work on the selection; the arrow keys and Page Up / Page Down nudge it, R turns it, Ctrl D duplicates and Delete removes it. Bricks that would float or overlap are refused, so the map always keeps v68's rules.

## Brick paint, Color paint and Erase

Brick paint (B) places the brush brick where you click: pick its shape and color in the dock's Assets › Bricks; T turns it. Color paint (C) recolors the brick you click. Erase (X) removes it (Shift removes the whole object); bricks that hold others up are protected. Any #rrggbb color is allowed; v68's Play in v68 and the legacy export use the nearest of v68's 18 colors.

## Terrain generator

Map tab › Terrain generator: tick environments (forest, city, prairie, mountains, volcanoes and more), choose a size and Generate. New seed rolls a different world. Generated houses, trees and cars become asset instances you can move, smash and edit.

## Sky, weather and lighting

The Map tab also sets the time of day, sky and weather, the map's music and ambience loop.

## Make asset

Select loose bricks and choose Make asset to turn them into a reusable asset with its own states, interactions and smash rules.

## Problems

The dock's Problems tab lists issues (blocked spawns, unreachable maps, missing references) with a button to jump to each.
