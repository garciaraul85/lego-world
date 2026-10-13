import { area, type HelpEntry } from '../types';

const LIB = area('Logic graphs, variables and nodes');
const ED = area('Logic editor');

export const WORLD: HelpEntry[] = [
  {
    id: 'world.screen',
    screen: 'world',
    kind: 'screen',
    name: 'World graph',
    purpose:
      'Every map of the game as a card with its spawn points, and the gates that take the hero from one map to another.',
    related: ['world.graph', 'world.addMap', 'world.gate'],
  },
  {
    id: 'world.graph',
    screen: 'world',
    kind: 'area',
    name: 'Maps, spawn points and gates',
    purpose: 'The cards are maps; the dots on them are spawn points; the arrows between dots are gates.',
    steps: [
      'Click a map card to open that map in the Scene.',
      'Drag from a spawn dot to a spawn on another map to make a gate.',
      'Click a gate arrow to change or delete it.',
    ],
    commands: ['gate.connect', 'gate.update', 'gate.delete'],
    match: [{ in: area('Maps, spawn points and gates') }, { sel: area('Maps, spawn points and gates') }],
  },
  {
    id: 'world.map',
    screen: 'world',
    kind: 'button',
    name: 'Map card',
    purpose: 'One map. Click to edit it in the Scene; its spawn points are the dots along the card.',
    match: [{ in: area('Maps, spawn points and gates'), name: /^Map / }],
    related: ['shell.map'],
  },
  {
    id: 'world.gate',
    also: ['connect', 'maps', 'portal', 'door to another map', 'travel'],
    screen: 'world',
    kind: 'button',
    name: 'Gate',
    purpose:
      'A way from a spawn point on one map to a spawn point on another (a door, a path, a portal). In Play the hero travels when walking into it.',
    steps: ['Drag from a spawn dot (Start a gate from…) to a spawn dot on another map.'],
    commands: ['gate.connect', 'gate.update', 'gate.delete'],
    match: [{ in: area('Maps, spawn points and gates'), name: /^(Start a gate|Gate)/ }],
    related: ['action.world.validate'],
  },
  {
    id: 'world.addMap',
    screen: 'world',
    kind: 'button',
    name: 'Add map',
    purpose: 'Adds a new map to the game; generate its terrain in the Scene → Map tab.',
    commands: ['map.create'],
    match: [{ in: area('World graph tools') }],
    related: ['scene.map.generate'],
  },
];

export const LOGIC: HelpEntry[] = [
  {
    id: 'logic.screen',
    screen: 'logic',
    kind: 'screen',
    name: 'Logic',
    purpose:
      'The rules of the game as graphs of nodes: an event (the hero enters a zone, a button is pressed…) runs a chain of actions (open a door, give coins, show a screen). The same logic can be read and written as code.',
    related: ['logic.library', 'logic.graph', 'logic.palette', 'help:logic-reference'],
  },
  {
    id: 'logic.library',
    screen: 'logic',
    kind: 'area',
    name: 'Graphs, variables and nodes',
    purpose: 'The left panel: your logic graphs, the game variables, and every node you can add.',
    match: [{ sel: LIB }],
  },
  {
    id: 'logic.graphs',
    screen: 'logic',
    kind: 'list',
    name: 'Logic graphs',
    purpose: 'Each graph is a set of rules. Click one to open it; + New makes another; the bin deletes one.',
    commands: ['logic.create', 'logic.delete'],
    match: [{ in: `${LIB} .lib-item` }, { in: LIB, name: /^\+ New$/ }],
  },
  {
    id: 'logic.vars',
    also: ['score', 'keep', 'count', 'remember', 'flag'],
    screen: 'logic',
    kind: 'field',
    name: 'Variables',
    purpose:
      'Game variables: numbers, true/false or text the game remembers while playing (score, keys, doorOpen). Logic reads and changes them; screens show them as {name}.',
    steps: ['Type a name in New variable name and press Add.', 'Pick its type and starting value.'],
    commands: ['logic.setVariable'],
    match: [{ in: LIB, name: /^(New variable name|Add variable)$/ }, { in: `${LIB} .lg-var` }],
  },
  {
    id: 'logic.palette',
    screen: 'logic',
    kind: 'list',
    name: 'Node list',
    purpose:
      'Every node, by kind: events start a chain, flow nodes decide what runs next, actions change the game, values compute numbers and true/false.',
    steps: ['Type in Find a node to narrow the list.', 'Click a node (or drag it) to add it to the graph.'],
    match: [{ in: LIB, name: 'Find a node' }],
    related: ['help:logic-reference'],
  },
  {
    id: 'logic.editor',
    screen: 'logic',
    kind: 'area',
    name: 'Logic editor',
    purpose: 'The open graph: its name, Graph / Code / Split views, Play & trace, and the canvas or code.',
    match: [{ sel: ED }],
  },
  {
    id: 'logic.name',
    screen: 'logic',
    kind: 'field',
    name: 'Graph name',
    purpose: 'The name of the open graph.',
    commands: ['logic.replace'],
    match: [{ in: ED, name: 'Graph name' }],
  },
  {
    id: 'logic.views',
    screen: 'logic',
    kind: 'view',
    name: 'Graph, Code and Split',
    purpose:
      'Graph shows nodes and wires; Code shows the same rules as code you can type; Split shows both side by side and keeps them in step.',
    match: [{ in: area('View'), name: /^(Graph|Code|Split)$/ }],
    related: ['help:coding'],
  },
  {
    id: 'logic.trace',
    screen: 'logic',
    kind: 'button',
    name: 'Play & trace',
    purpose:
      'Plays the game and lights up each node as it runs, so you can see which rules fire. F9 on a node sets a breakpoint that pauses there.',
    match: [{ in: ED, name: /Play & trace/ }],
  },
  {
    id: 'logic.graph',
    screen: 'logic',
    kind: 'area',
    name: 'Graph canvas',
    purpose:
      'Nodes and the wires between them. White wires carry “then do this”; coloured wires carry values. Drag nodes to arrange them.',
    steps: [
      'Drag from an output pin to an input pin to wire them.',
      'Click a node to select it; Delete removes it.',
      'Drag the background to pan, wheel to zoom.',
    ],
    commands: [
      'logic.addNode',
      'logic.moveNodes',
      'logic.connect',
      'logic.disconnect',
      'logic.setArgs',
      'logic.removeNodes',
    ],
    match: [{ sel: area('Logic graph') }, { in: area('Logic graph') }],
  },
  {
    id: 'logic.inspector',
    screen: 'logic',
    kind: 'area',
    name: 'Node inspector',
    purpose:
      'The selected node: what it does, its settings (which zone, which variable, how many seconds…) and its breakpoint.',
    commands: ['logic.setArgs'],
    match: [{ sel: area('Node inspector') }, { in: area('Node inspector') }],
  },
  {
    id: 'logic.code',
    screen: 'logic',
    kind: 'area',
    name: 'Code view',
    purpose:
      'The open graph written as code, e.g. on("start", () => { log("hi") }). Edit it and the graph follows; errors show under the line.',
    match: [{ sel: '.lg-code' }, { in: '.lg-code' }],
    related: ['help:coding'],
  },
];
