import { AI_COMMANDS } from '../../../core/ai/commands';
import { CATALOG, type NodeDef } from '../../../core/logic/catalog';
import { ACTIONS, MENUS } from '../../actions/registry';
import { keysFor, MAC_KEYS } from '../../platform';
import { TOOLS } from '../../shell/tools';
import { WIDGET_NAMES, WIDGET_TIPS, WIDGET_TYPES } from '../../workspaces/screens/model';
import { area, type HelpEntry } from './types';

/**
 * P32: entries made from the editor's own registries (actions, tools, logic nodes, widgets, commands), so
 * Help can't miss one and stays in step when they change. Only the "what it does" text is written here.
 */

/** What each editor action does (menus, shortcuts, the command palette). Tests fail when one is missing. */
export const ACTION_HELP: Record<string, string> = {
  'file.hub': 'Opens the Start hub: make a whole game from a few choices, or open a recent project.',
  'file.new': 'Starts a new, empty project. The current one stays saved in this browser.',
  'file.open': 'Opens a project saved in this browser.',
  'file.save': 'Saves now. The editor also saves by itself a moment after every change.',
  'file.import': 'Loads a project file (.bwproj) or a LEGO World v68 save (.json) from your computer.',
  'file.exportProject': 'Downloads the whole project as one .bwproj file, to keep or move to another computer.',
  'file.exportLegacy': 'Downloads the current map as a LEGO World v68 save (.json).',
  'file.exportGame': 'Makes a playable game file to share (coming in a later phase).',
  'edit.undo': 'Takes back the last change. Every edit, tool drag and AI step is one undo step.',
  'edit.redo': 'Puts back what Undo took back.',
  'edit.delete': 'Deletes the selection: bricks, an object, a spawn point, a zone, a sign or a sound emitter.',
  'edit.duplicate': 'Copies the selection and stacks the copy on top, so it stays connected.',
  'edit.rotate': 'Turns the selection a quarter turn around its middle.',
  'edit.selectNone': 'Clears the selection.',
  'edit.selectGroup': 'Grows the selection to the whole object the selected brick belongs to.',
  'edit.left': 'Moves the selection one stud along −X.',
  'edit.right': 'Moves the selection one stud along +X.',
  'edit.forward': 'Moves the selection one stud along −Z.',
  'edit.back': 'Moves the selection one stud along +Z.',
  'edit.up': 'Raises the selection by one plate.',
  'edit.down': 'Lowers the selection by one plate.',
  'assets.open': 'Opens the Assets screen, where assets are built from bricks and from other assets.',
  'assets.new': 'Starts a new asset with one brick and opens it on the build plate in the Assets screen.',
  'assets.resetBuiltins':
    'Puts every built-in asset you have changed (the chest, a tree…) back as it came with the engine, in one step. Undo brings your versions back.',
  'tool.select': 'Picks the Select tool: click to select, drag to orbit the view.',
  'tool.move': 'Picks the Move tool: drag the arrows to move what is selected.',
  'tool.rotate': 'Picks the Rotate tool: drag a ring to turn what is selected.',
  'tool.resize': 'Picks the Resize tool: drag a handle to make an asset, a zone or a brick bigger or smaller.',
  'tool.place':
    'Picks the Place tool. In the Scene it puts down the asset picked in the dock; on an asset’s build plate (Assets screen) it puts down bricks.',
  'tool.asset': 'Picks the Place tool with an asset: click the ground to put the asset down.',
  'tool.paint':
    'Picks Color paint on an asset’s build plate (Assets screen): click a brick to give it the brush colour. The Scene has no brick painting.',
  'tool.erase':
    'Picks Erase. In the Scene a click removes a whole object (an asset copy); on an asset’s build plate it removes one brick.',
  'tool.spawn': 'Picks the Spawn point tool: click open ground to add a place the hero can start.',
  'tool.zone': 'Picks the Trigger zone tool: drag on the ground to draw a zone logic can react to.',
  'tool.sound': 'Picks the Sound emitter tool: click the ground to place a sound that plays there.',
  'tool.ui': 'Picks the Sign tool: click the ground to put up a sign that can show live values.',
  'brush.rotate': 'Turns the brick or asset you are about to place a quarter turn.',
  'view.frame': 'Moves the camera to look at the selection.',
  'view.zoomIn': 'Moves the camera closer.',
  'view.zoomOut': 'Moves the camera further away.',
  'view.orbitLeft': 'Turns the camera left around what it looks at.',
  'view.orbitRight': 'Turns the camera right around what it looks at.',
  'view.orbitUp': 'Tilts the camera to look more from above.',
  'view.orbitDown': 'Tilts the camera to look more from the side.',
  'view.fullscreen': 'Fills the window with the 3D view; the tools stay at hand. Press again (or Esc) to go back.',
  'view.fit': 'Moves the camera so the whole map is in view.',
  'view.top': 'Looks straight down on the map.',
  'view.palette': 'Opens the command palette: type a few letters of any command and press Enter.',
  'world.addMap': 'Adds a new map to the project. Connect maps with gates in the World graph.',
  'world.trainingYard':
    'Adds the Training yard, a sample map to practise fighting: dummies to lock on to and hit, a cracked wall that blunt hits break faster, a target that opens a gate when you lock on to it (a wire, no code), a chest behind the gate and a sparring knight who fights back. One undo takes it all away.',
  'world.generate': 'Opens map generation: choose districts, mountains and a seed, then generate the terrain.',
  'world.graph': 'Opens the World graph: every map, its spawn points and the gates between them.',
  'world.validate': 'Checks every gate leads somewhere the hero can reach and lists problems.',
  'world.connected': 'Generates several connected maps at once.',
  'play.start': 'Plays the game from the start spawn of this map.',
  'play.here': 'Plays the game from the selected spawn point.',
  'play.map': 'Plays the open map from its first spawn point (for example the Training yard), not the game’s start.',
  'play.entry': 'Plays the whole game from its first screen (splash, title, then the game).',
  'play.saveNow':
    'While playing: saves the game to the slot in use, as pressing E at a save point does. Pause › Load game or the title’s Continue bring it back.',
  'play.pause': 'Pauses or resumes the running game.',
  'play.stop': 'Stops playing and goes back to editing. Nothing that happened in Play changes the project.',
  'play.v68': 'Plays the map in the original LEGO World v68 runtime (guns, magic, powers, volcano).',
  'play.legacy': 'Opens the map in LEGO World v68 itself, with its characters and neighbors.',
  'help.shortcuts': 'Shows every keyboard shortcut.',
  'help.about': 'Shows the engine version and credits.',
  'help.tutorial': 'Starts the guided tutorial: every feature, step by step, with Show me and Do it for me.',
  'help.coding': 'Starts the coding course: the logic language, one line at a time.',
  'help.combat':
    'Starts the combat course on a sandbox: add the Training yard, make an enemy hit harder, wire a dummy to a chest, then fight — Show me and Do it for me for every step.',
  'help.saving':
    'Starts the saving and progress course: how players save (Project › Saving), a checkpoint flag, a save point, an achievement, saving and Settings in Play, Continue on the title, and deleting test saves — Show me and Do it for me for every step.',
  'world.checkPlayable':
    'Checks whether the game can be finished, the way a player would meet it, without playing: every map can be reached, every gate, object to use and zone that does something can be walked to, every achievement is unlocked somewhere, every collection can be found, and something finishes the game. Findings show in Problems with a button to select each one.',
  'play.settingsMenu':
    'While playing: opens the player’s Settings screen (music and sound volume, camera speed, invert camera, text size, difficulty), as Pause › Settings does.',
  'help.guide': 'Opens Help. Press F1 (or ⌘/ on a Mac) while pointing at any control to open its own page.',
  'help.here':
    'Opens the Help page of the control under the pointer: the same as F1, for keyboards (like a Mac’s) where F1 changes the screen brightness.',
  'help.build': 'Watch a whole game being built step by step, with each stage explained.',
  'help.brix':
    'Opens Brix, the helper in the corner: ask how to do something and Brix answers from Help, links the pages and shows you where the control is. Explain tells you what any part of the editor is.',
  'help.brixCourse':
    'Starts the Meet Brix course: ask a question, follow Show me to the control, and use Explain on a button.',
  'help.sheet':
    'Starts the Character sheet course: make the player character, give him an outfit, stats, a fighting style, a victory clip and a voice, then level him up in Play.',
  'help.bodies':
    'Starts the Creatures course: turn a neighbour into a brick dog, shape him with sliders and colours, watch him walk, make his skeleton your own, add a horn and a wagging tail, then meet him in Play.',
  'help.dialogue':
    'Starts the Dialogue course: add a villager, write a conversation with a choice as a script, see it as a list and a graph, preview every branch, pick a style and talk to him in Play.',
  'help.ai': 'Opens the AI builder: describe a change, watch each step, then approve or reject it.',
};

const MENU_OF = new Map<string, string>();
for (const [menu, ids] of Object.entries(MENUS)) for (const id of ids) if (id !== '-') MENU_OF.set(id, menu);

function actionEntries(): HelpEntry[] {
  return ACTIONS.filter((a) => !a.id.startsWith('window.')).map((a) => {
    const menu = MENU_OF.get(a.id);
    return {
      id: `action.${a.id}`,
      screen: 'shell',
      kind: menu ? 'menu' : 'shortcut',
      name: a.label.replace(/…$/, ''),
      purpose: ACTION_HELP[a.id] ?? '',
      steps: [
        ...(menu ? [`Open the **${menu}** menu and choose **${a.label}**.`] : []),
        ...(a.key
          ? [
              `Or press \`${a.key}\`${MAC_KEYS[a.key] ? ` (on a Mac: \`${keysFor(MAC_KEYS[a.key]!, true)}\`)` : ''} (when you are not typing in a field).`,
            ]
          : []),
        'Or find it by name in the command palette (`Ctrl K`).',
      ],
      key: a.key,
      tips: a.later ? [`Arrives in ${a.later}.`] : undefined,
      related: ['shell.menu', 'shell.palette'],
      // shortcuts without a menu item have no control to point at; the command palette lists every action
      match: [
        ...(menu ? [{ role: 'menuitem', name: a.label.replace(/…$/, '') }] : []),
        { in: '.palette-list', name: a.label.replace(/…$/, '') },
      ],
    };
  });
}

const WS = ['Scene', 'World graph', 'Logic', 'Characters', 'Assets', 'Screens', 'Cinematics', 'Audio'];

function toolEntries(): HelpEntry[] {
  return TOOLS.filter((t) => !t.hidden).map((t) => ({
    id: `scene.tool.${t.id}`,
    screen: 'scene',
    kind: 'tool',
    name: `${t.label} tool`,
    purpose: cap(t.help.replace(/^[^:]+:\s*/, '')),
    steps: [`Click **${t.label}** in the tools on the left of the 3D view, or press \`${t.key}\`.`],
    key: t.key,
    related: ['scene.tools', 'scene.viewport'],
    match: [{ in: area('Tools'), name: t.label }],
  }));
}

const nodeName = (d: NodeDef) => d.title;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function nodeEntries(): HelpEntry[] {
  return CATALOG.map((d) => {
    const ins = d.inputs.filter((p) => p.type !== 'exec');
    const outs = d.outputs.filter((p) => p.type !== 'exec');
    const flows = d.outputs.filter((p) => p.type === 'exec').map((p) => p.label ?? p.name);
    const options: [string, string][] = [
      ...(d.args ?? []).map((a): [string, string] => [a.label, `set on the node${a.optional ? ' (optional)' : ''}`]),
      ...ins.map((p): [string, string] => [`${p.label ?? p.name} (in)`, `a ${p.type} wired in, or typed on the node`]),
      ...outs.map((p): [string, string] => [`${p.label ?? p.name} (out)`, `a ${p.type} for other nodes`]),
      ...(flows.length > 1 ? [['Goes on through', flows.join(', ')] as [string, string]] : []),
    ];
    return {
      id: `node.${d.type}`,
      screen: 'logic',
      kind: 'node',
      name: nodeName(d),
      purpose: d.doc,
      steps: [
        `In Logic, find **${d.title}** under ${d.category} in the node list on the left (or type its name in Find a node).`,
        'Click it to add it to the graph, then wire its pins to other nodes.',
        `In the code view it is written \`${d.code.name}\`.`,
      ],
      options: options.length ? options : undefined,
      related: ['logic.palette', 'logic.graph', 'help:logic-reference'],
      match: [{ in: area('Logic graphs, variables and nodes'), name: new RegExp(`^${esc(d.title)}$`) }],
      also: [d.category, d.code.name],
    };
  });
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function widgetEntries(): HelpEntry[] {
  return WIDGET_TYPES.map((t) => ({
    id: `widget.${t}`,
    screen: 'screens',
    kind: 'widget',
    name: `${WIDGET_NAMES[t]} widget`,
    purpose: `${WIDGET_TIPS[t]}.`,
    steps: [
      `In Screens, click **${WIDGET_NAMES[t]}** under Add, or drag its card onto the screen where it should go.`,
      'Drag it on the canvas to move it; drag a handle to size it.',
      'Change its text, colours, pictures and font in Properties on the right.',
    ],
    related: ['screens.palette', 'screens.canvas', 'screens.props'],
    match: [{ in: area('Add widget'), name: `Add ${WIDGET_NAMES[t]}` }],
  }));
}

/** Commands the AI builder can't run (files, media, art) still get a line in Help. */
const MORE_COMMANDS: Record<string, string> = {
  'file.put': 'Writes one project file (used by import and the editor itself, never by the AI).',
  'file.delete': 'Deletes one project file (used by the editor itself, never by the AI).',
  'media.register': 'Adds an imported sound, picture or font to the project media list.',
  'media.remove': 'Removes an imported media file the project no longer uses.',
  'art.put': 'Adds or changes a background, icon or font (Screens → Art).',
  'art.delete': 'Deletes a background, icon or font no screen uses.',
};

function commandEntries(types: readonly string[]): HelpEntry[] {
  const ai = new Map(AI_COMMANDS.map((c) => [c.type, c]));
  return types.map((t) => {
    const c = ai.get(t);
    return {
      id: `command.${t}`,
      screen: 'shell',
      kind: 'command',
      name: t,
      purpose: c?.doc ?? MORE_COMMANDS[t] ?? '',
      steps: [
        'Every change in the editor runs commands like this one; each run is one undo step.',
        c
          ? `The AI builder can run it too (shown in ${c.workspace}), always as a preview you approve.`
          : 'Only the editor runs it; the AI builder cannot.',
      ],
      related: ['action.help.ai'],
    };
  });
}

function workspaceEntries(): HelpEntry[] {
  return WS.map((w, i) => ({
    id: `shell.ws.${w.toLowerCase().replace(/ /g, '-')}`,
    screen: 'shell',
    kind: 'button',
    name: `${w} workspace tab`,
    purpose: `Opens the ${w} workspace.`,
    steps: [`Click **${w}** in the workspace tabs at the top, or press \`${i + 1}\`, or use Window → ${w}.`],
    related: [`guide:${guideOf(w)}`],
    match: [
      { in: area('Workspaces'), name: new RegExp(`^${esc(w)}$`) },
      { role: 'menuitem', name: new RegExp(`^${esc(w)} \\d$`) },
    ],
  }));
}
const guideOf = (w: string) => (w === 'World graph' ? 'world' : w.toLowerCase());

/** Every generated entry; `commandTypes` comes from the command bus so new commands show up by themselves. */
export function generatedEntries(commandTypes: readonly string[]): HelpEntry[] {
  return [
    ...actionEntries(),
    ...workspaceEntries(),
    ...toolEntries(),
    ...nodeEntries(),
    ...widgetEntries(),
    ...commandEntries(commandTypes),
  ];
}
