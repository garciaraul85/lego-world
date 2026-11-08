import type { HelpEntry } from '../types';

/** Milestone 3b (B7a-1): the pause map, the map in play, their looks and what they track. */
export const MAPS: HelpEntry[] = [
  {
    id: 'project.maps',
    also: [
      'map',
      'maps',
      'pause map',
      'world map',
      'minimap',
      'map in play',
      'parchment',
      'sea chart',
      'contour',
      'room plan',
      'grid of screens',
      'compass ring',
      'fog of war',
      'map style',
      'map look',
    ],
    screen: 'scene',
    kind: 'setting',
    name: 'Maps',
    purpose:
      'How the game’s maps look. **The pause map** opens with M (or Map on the pause screen) and holds the game. Pick its type, each after a Zelda game: a **Grid of screens** filled in as you go, a painted **Parchment**, a **Sea chart** in lettered squares, a **Contour** map with height lines, or a **Room plan** (a dungeon floor by floor). Dungeons have their own pause map, the room plan by default. **The map in play** is the HUD’s Minimap: **Square** (north up), **Round with compass** (it can turn with the camera), **Grid of screens**, or **None**. Each type has its own colours, frame, icons and fog, and you can change any of them. **Markers** choose what shows: chests (opened ones greyed), small keys and the boss key, the boss (crossed out once beaten), locked doors, ways out (zones that travel to another map), region names (zones with Show its name on the maps), people and foes, the player’s pins and stamps, and where to go next. A map can choose its own in its Map tab.',
    steps: [
      'Open the **Project** tab of the Inspector and find **Maps**.',
      'Pick a type for the pause map, the dungeon map and the map in play; the previews show the start map in it.',
      'Change its colours, frame, icons, fog and markers, then press Play and M.',
    ],
    commands: ['project.update'],
    match: [{ in: '[data-help="project.maps"]' }],
    related: ['scene.map.look', 'scene.map.dungeon', 'play.map'],
  },
  {
    id: 'scene.map.look',
    also: ['map look', 'this map’s map', 'map override'],
    screen: 'scene',
    kind: 'setting',
    name: 'Map › Maps',
    purpose:
      'This map’s own pause map and map in play, over the game’s (Project › Maps). A dungeon uses the game’s dungeon map (a room plan) unless you choose here.',
    steps: [
      'Open the **Map** tab of the Inspector and find **Maps**.',
      'Pick a pause map or a map in play for this map, or The game’s.',
    ],
    commands: ['map.setLook'],
    match: [{ in: '[data-help="scene.map.look"]' }],
    related: ['project.maps'],
  },
  {
    id: 'play.map',
    also: ['open the map', 'm key', 'pins', 'stamps', 'mark the map', 'floors', 'where have I been'],
    screen: 'play',
    kind: 'view',
    name: 'The map in Play',
    purpose:
      'Press **M** (or Map on the pause screen) for the pause map; M or Esc closes it. It fills in where you have been. In a dungeon it shows the floor you are on, with the others down the side to look at, and below it the small keys, boss key, map and compass you have found there. The Dungeon map shows the whole dungeon, and the Compass shows its chests, keys and boss. **Pins:** pick a stamp (star, heart, flag, cross, skull, chest, eye, leaf), type a note if you like, and click the map; right-click (or Shift-click) takes one up. Pins are kept in saves.',
    steps: [
      'Press Play, walk about, then press **M**.',
      'Pick a stamp and click the map to put down a pin; right-click to take it up.',
    ],
    related: ['project.maps', 'scene.map.dungeon'],
  },
];
