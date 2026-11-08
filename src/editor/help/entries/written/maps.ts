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
    related: ['project.maps', 'scene.map.dungeon', 'play.quests'],
  },
  // Milestone 3b (B7a-2): quests, where to go next, and the maps in logic
  {
    id: 'logic.quest.steps',
    also: [
      'quest',
      'quests',
      'quest steps',
      'objective',
      'side quest',
      'main quest',
      'mission',
      'errand',
      'where to go next',
      'SideQuest',
      'MainQuest',
    ],
    screen: 'logic',
    kind: 'setting',
    name: 'Quest steps',
    purpose:
      'A quest is a behaviour that extends **Quest** (or **MainQuest** for the story, **SideQuest** for the rest). Its steps are written in the class — steps = [{ name: "Find 3 glowcaps", do: "get", at: "Glowcap", count: 3 }, …] — and this panel edits the same list. Each step **Says** what the quest log shows and is **Done when**: the hero **reaches** a place (a zone, an object or a character, by name), **talks to** a character, **gets** so many of an item, **beats** so many of a character, **uses** an object, or **by logic** (a script calls quest.advance()). **Goal on the maps** is where its diamond shows when tracked, if not where the step points (a get: where the item lies; empty: its pickup on the map). **On map** is the map its goal is on; Any looks on the map the hero is on first, then on every other. A goal on another map puts the diamond on the way there: the gate or travel zone that starts the shortest road through the World graph. A quest is in the game as written: nothing to attach; start it with quest.start() (its own start(e), a talk, a zone). Its hooks: canStartQuest, stepDone, goalOf; its events: questStart, questStep, questDone, questFail.',
    steps: [
      'In Logic, open **Built-in › Quests** and press **SideQuest**, then **Extend** (or write class MyQuest extends SideQuest).',
      'Press **+ Step** for each step: what it says, what finishes it, and its place, character, item or object.',
      'Start it with quest.start("this") in its start(e), then press Play and **J** for the quest log.',
    ],
    commands: ['logic.replace'],
    match: [{ in: '[data-help="logic.quest.steps"]' }],
    related: ['play.quests', 'play.map', 'logic.behaviour'],
  },
  {
    id: 'play.quests',
    also: ['quest log', 'journal', 'j key', 'track quest', 'tracking', 'objective marker', 'waypoint', 'goal arrow'],
    screen: 'play',
    kind: 'view',
    name: 'The quest log in Play',
    purpose:
      'Press **J** (or **Quests** on the pause screen, shown once a quest has begun) for the quest log; J or Esc closes it. Main quests are listed first, then side quests, then those finished or failed. The chosen quest shows the steps done (ticked off), the one it is on (with how many so far) and that more lie ahead. **Track** shows its goal as a diamond on both maps; off the map in play, an arrow at its edge points the way. **Show on the map** opens the pause map. A goal on another map says so (— in Old Well Cave) in the quest log, on the pause map and on the HUD, and the diamond and arrow show the way out toward it. The HUD says the tracked step above the map in play (the {quest.line} text; also {quest.tracked}, {quest.step} and quests.any for screens). The quest log is kept in saves.',
    steps: [
      'Press Play; a quest that starts says New quest.',
      'Press **J**, pick a quest and press **Track** or **Show on the map**.',
    ],
    related: ['logic.quest.steps', 'play.map'],
  },
  // Milestone 3b (B7a-3): a map's own behaviours, and the game's rules
  {
    id: 'scene.map.scripts',
    also: ['map script', 'map behaviour', 'MapScript', 'on enter map', 'room clear', 'foes cleared', 'level script'],
    screen: 'scene',
    kind: 'setting',
    name: 'Map › Behaviours',
    purpose:
      'This map’s own behaviours. One that extends **MapScript** (or a plain behaviour) runs while the hero is on this map: **mapEnter(e)** as the hero arrives (e.from is where it came from), **mapLeave(e)** as it goes (e.to), **foesCleared(e)** when the last foe on the map is beaten (the doors open, a chest appears), and any other event. Its own variables start again each visit: keep what must last in game variables. **+ New map script** makes one with mapEnter and foesCleared to fill in; **+ Script** attaches one you have; × takes it off. map.foesLeft() says how many foes are still here.',
    steps: [
      'Open the **Map** tab of the Inspector and find **Behaviours**.',
      'Press **+ New map script**, or pick one and press **+ Script**.',
      'Write what happens in mapEnter or foesCleared, then press Play.',
    ],
    commands: ['script.attach', 'script.detach', 'script.setField'],
    match: [{ in: '[data-help="scene.map.scripts"]' }],
    related: ['logic.gamemode', 'logic.behaviour'],
  },
  {
    id: 'logic.gamemode',
    also: [
      'game rules',
      'GameMode',
      'game over',
      'respawn',
      'retry',
      'win condition',
      'fairy',
      'extra life',
      'can save',
      'new game plus',
    ],
    screen: 'logic',
    kind: 'view',
    name: 'Game rules (GameMode)',
    purpose:
      'The rules of the whole game are a behaviour that extends **GameMode** (Logic › Built-in › Game). It is in the game as written: nothing to attach. Its hooks: **isGameOver** (return false and the hero hangs on: a fairy), **hasWon** (asked a few times a second: true finishes the game), **respawnAt** (where the hero comes back after game over: a spawn point’s name on any map, start or checkpoint), **respawnHearts** (how many hearts), **keepOnRespawn** (each item it carries: false loses it), **canSave** (false: “You can’t save here.”) and **keepOnNewGamePlus**. Its events: gameOver, respawn, gameWon, saved and loaded. Any script can call game.lose(), game.respawn() and game.setRespawn("Cave mouth").',
    steps: [
      'In Logic, open **Built-in › Game** and press **GameMode**, then **Extend**.',
      'Answer the hooks you want (return e.base keeps the engine’s answer).',
      'Press Play and run out of hearts to try it.',
    ],
    related: ['scene.map.scripts', 'play.quests'],
  },
];
