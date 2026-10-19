import type { ScreenGuide } from '../types';

/**
 * P32 screen guides: one per screen, with a labelled picture (areas numbered in this order), what each area
 * is for (its entry), and the five things people do there most.
 */
export const GUIDES: ScreenGuide[] = [
  {
    screen: 'shell',
    intro:
      'The editor window is the same in every workspace: menus and workspace tabs along the top, Undo, Play and the AI builder on the right, and the status line at the bottom.',
    areas: ['shell.menu', 'shell.workspaces', 'shell.play', 'shell.ai', 'shell.status'],
    top: [
      ['Switch to another workspace', 'shell.workspaces'],
      ['Play the game and stop again', 'shell.play'],
      ['Undo a change', 'shell.undo'],
      ['Ask the AI builder to make a change', 'shell.ai'],
      ['Find any command by name', 'shell.palette'],
    ],
  },
  {
    screen: 'scene',
    intro:
      'The Scene is where you put a map together in 3D: assets, characters, spawn points, trigger zones, sounds and signs. Tools are on the left of the view, everything on the map is in the Outliner, things to place are in the dock below, and the properties of what is selected are on the right. Bricks are built into assets in the Assets screen.',
    areas: ['scene.outliner', 'scene.tools', 'scene.viewport', 'scene.view', 'scene.dock', 'scene.inspector'],
    top: [
      ['Place assets', 'scene.tool.place'],
      ['Select, move and turn things', 'scene.tool.move'],
      ['Generate a new landscape', 'scene.map.generate'],
      ['Add a spawn point or a trigger zone', 'scene.tool.zone'],
      ['Change the time of day and weather', 'scene.map.sky'],
    ],
  },
  {
    screen: 'world',
    intro: 'The World graph shows every map of the game and the gates that take the hero from one to another.',
    areas: ['world.addMap', 'world.graph'],
    top: [
      ['Add a map', 'world.addMap'],
      ['Connect two maps with a gate', 'world.gate'],
      ['Open a map in the Scene', 'world.map'],
      ['Check every gate leads somewhere', 'action.world.validate'],
      ['Pick which map you edit', 'shell.map'],
    ],
  },
  {
    screen: 'logic',
    intro:
      'Logic holds the rules of the game. Graphs, variables and every node are on the left; the open graph (or its code) in the middle; the selected node on the right.',
    areas: ['logic.library', 'logic.editor', 'logic.graph', 'logic.inspector'],
    top: [
      ['Make a new rule', 'logic.graphs'],
      ['Add a node and wire it', 'logic.palette'],
      ['Keep a score or a flag in a variable', 'logic.vars'],
      ['Write the rule as code', 'logic.views'],
      ['Watch rules run while playing', 'logic.trace'],
    ],
  },
  {
    screen: 'characters',
    intro:
      'The Character studio: characters and animation clips on the left, a 3D preview in the middle, and everything about the character on the right.',
    areas: ['characters.list', 'characters.preview', 'characters.props'],
    top: [
      ['Make a new character', 'characters.new'],
      ['Change how it looks', 'characters.look'],
      ['Pick its colours', 'characters.colors'],
      ['Make it the hero', 'characters.player'],
      ['Watch it move', 'characters.clip'],
    ],
  },
  {
    screen: 'assets',
    intro:
      'The Asset studio is where bricks are built into assets: every asset and every brick on the left, the build plate with its tools in the middle, and the asset’s states, sockets and settings on the right. Assets can be built from bricks and from other assets.',
    areas: ['assets.library', 'assets.tools', 'assets.plate', 'assets.props'],
    top: [
      ['Make a new asset', 'assets.new'],
      ['Build it brick by brick', 'assets.bricks'],
      ['Build another asset into it', 'assets.reuse'],
      ['Give it states (open, closed)', 'assets.states'],
      ['Say what happens when the hero uses it', 'assets.sockets'],
    ],
  },
  {
    screen: 'screens',
    intro:
      'Screens holds the game’s 2D screens: the list, widget tree and widget palette on the left, the screen on a device in the middle, and the selected widget’s properties on the right.',
    areas: ['screens.list', 'screens.palette', 'screens.canvas', 'screens.props'],
    top: [
      ['Add a widget', 'screens.palette'],
      ['Move and size it on the screen', 'screens.handles'],
      ['Check every device and both ways', 'screens.check'],
      ['Place one widget next to another', 'screens.pin'],
      ['Use a picture or a font', 'screens.pictures'],
    ],
  },
  {
    screen: 'art',
    intro:
      'The Art tab makes the backgrounds, icons and fonts screens use: your art on the left, and in the middle what you can make or the one you opened.',
    areas: ['art.library', 'art.start'],
    top: [
      ['Generate a background', 'art.pattern'],
      ['Draw an icon', 'art.pixels'],
      ['Design a font', 'art.font'],
      ['Import a picture or a font', 'art.library'],
      ['Export it to your computer', 'art.toolbar'],
    ],
  },
  {
    screen: 'cinematics',
    intro:
      'The Director makes short scenes: scenes, cast and shots on the left, the stage, camera preview and timeline in the middle, the selected block on the right.',
    areas: ['cinematics.list', 'cinematics.tools', 'cinematics.stage', 'cinematics.timeline', 'cinematics.item'],
    top: [
      ['Start a new scene', 'cinematics.new'],
      ['Cast the characters', 'cinematics.cast'],
      ['Add what happens on the timeline', 'cinematics.timeline'],
      ['Set up camera shots', 'cinematics.shots'],
      ['Play it in the game', 'cinematics.tools'],
    ],
  },
  {
    screen: 'audio',
    intro:
      'Audio holds every sound and music: the list on the left, the selected sound, music or mixer in the middle, and where it is used on the right.',
    areas: ['audio.list', 'audio.event', 'audio.uses'],
    top: [
      ['Change a sound', 'audio.event'],
      ['Import your own sounds', 'audio.import'],
      ['Set up music layers', 'audio.music'],
      ['Balance the volumes', 'audio.mixer'],
      ['Use music on a map', 'audio.uses'],
    ],
  },
  {
    screen: 'effects',
    intro:
      'Effects are clouds of tiny bricks: the library on the left, the selected effect playing in the middle, and its settings on the right, with which effects this game plays for hits and events below them.',
    areas: ['effects.library', 'effects.preview', 'effects.settings'],
    top: [
      ['Make a new effect', 'effects.new'],
      ['Change how an effect looks', 'effects.settings'],
      ['Pick the effects for hits and level up', 'effects.hooks'],
      ['Put an effect on a map', 'scene.item.effect'],
      ['Play an effect from logic', 'node.effect.play'],
    ],
  },
  {
    screen: 'play',
    intro:
      'Play runs the game inside the editor. The Play bar pauses, steps and changes speed; the dock has the console, profiler and cheats; Stop goes back exactly to where you were.',
    areas: ['play.bar', 'play.view', 'play.cheats'],
    top: [
      ['Play and stop', 'shell.play'],
      ['Pause or slow the game down', 'play.bar'],
      ['Teleport or respawn while testing', 'play.cheats'],
      ['Play from the first screen', 'action.play.entry'],
      ['Play from a chosen spawn point', 'action.play.here'],
    ],
  },
];
