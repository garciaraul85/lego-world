import { MINI_TYPES, PAUSE_TYPES } from '../../maps/look';
import { STAMPS } from '../../maps/notes';
import { hook } from './hooks';
import type { NodeDef, PinDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Milestone 3b (B7a-2): quests and the maps in logic. A quest (a behaviour extending Quest) is started, moved on
 * and finished by these; its own decisions are its hooks, and its events tell everyone (a neighbour, a door, a
 * logic file) how it goes. The maps: open them, change their look, put down and take up marks, show a map whole;
 * a behaviour extending GameMap decides what they show.
 */
const QUEST: PinDef = {
  name: 'quest',
  type: 'string',
  default: 'this',
  help: 'The quest’s name (its behaviour’s). In a quest’s own class, this means that quest; empty: the quest being tracked.',
};
const str = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

const questOut: PinDef[] = [
  { name: 'quest', type: 'string' },
  { name: 'step', type: 'number', help: 'The step it is on now (1 is its first).' },
  { name: 'stepName', type: 'string', help: 'What the quest log says for that step.' },
];
const questEvent = (name: string, title: string, doc: string): NodeDef => ({
  type: `event.on${name}`,
  kind: 'event',
  title,
  category: 'Events',
  doc,
  inputs: [],
  outputs: [EXEC_OUT, ...questOut],
  args: [
    {
      name: 'quest',
      kind: 'string',
      label: 'Quest',
      optional: true,
      help: 'Only for this quest (its behaviour’s name). Empty: any quest. In a quest’s own class it is only ever that quest.',
    },
  ],
  code: { name: name.charAt(0).toLowerCase() + name.slice(1), style: 'event' },
});

export const QUEST_HOOKS: NodeDef[] = [
  hook(
    'CanStartQuest',
    'Can it start now? (Quest)',
    'Asked as quest.start() is called for this quest. Return false and it does not start (not yet: the hero is too young, the bridge is down).',
    [{ name: 'quest', type: 'string' }],
    'bool',
  ),
  hook(
    'StepDone',
    'Is the step done? (Quest)',
    'Asked a few times a second about the step the quest is on: do and at are the step’s, have how many the hero has of it (get, beat), count how many it needs. base is the engine’s answer. Return true to move on.',
    [
      { name: 'quest', type: 'string' },
      { name: 'step', type: 'number' },
      { name: 'stepName', type: 'string' },
      { name: 'do', type: 'string' },
      { name: 'at', type: 'string' },
      { name: 'have', type: 'number' },
      { name: 'count', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'GoalOf',
    'Where is the goal? (Quest)',
    'Asked for the step the quest is on while it is tracked: where its goal shows on both maps — a zone, an object or a character, by name, or hero. Return "" for no goal on the maps.',
    [
      { name: 'quest', type: 'string' },
      { name: 'step', type: 'number' },
      { name: 'stepName', type: 'string' },
      { name: 'at', type: 'string' },
    ],
    'string',
  ),
];

export const QUEST_EVENTS: NodeDef[] = [
  questEvent('QuestStart', 'On quest start', 'Runs when a quest starts (its first step is the one it is on).'),
  questEvent(
    'QuestStep',
    'On quest step',
    'Runs when a quest moves on to its next step (step is the new one; its stepName what the quest log says).',
  ),
  questEvent('QuestDone', 'On quest done', 'Runs when a quest is finished: its last step done, or quest.finish().'),
  questEvent(
    'QuestFail',
    'On quest failed',
    'Runs when a quest fails (quest.fail()): it stays in the log, crossed out.',
  ),
];

const questAction = (op: 'start' | 'advance' | 'finish' | 'fail' | 'track', title: string, doc: string): NodeDef => ({
  type: `quest.${op}`,
  kind: 'action',
  title,
  category: 'Quests',
  doc,
  inputs: [EXEC_IN, QUEST],
  outputs: [EXEC_OUT],
  code: { name: `quest.${op}`, style: 'call' },
  exec: (c, _a, i) => c.quest?.(op, str(i.quest)),
});

const questRead = (
  what: 'step' | 'status' | 'isActive' | 'isDone' | 'goalMap',
  title: string,
  doc: string,
  out: PinDef['type'],
): NodeDef => ({
  type: `quest.${what}`,
  kind: 'pure',
  title,
  category: 'Quests',
  doc,
  inputs: [QUEST],
  outputs: [{ name: 'out', type: out }],
  code: { name: `quest.${what}`, style: 'call' },
  eval: (c, _a, i) => c.questRead?.(what, str(i.quest)) ?? (out === 'bool' ? false : out === 'number' ? 0 : ''),
});

export const QUESTS: NodeDef[] = [
  questAction(
    'start',
    'Start quest',
    'Starts a quest (once: one already going, finished or failed is left as it is). It goes in the quest log, and is tracked if it is a main quest or nothing else is.',
  ),
  questAction(
    'advance',
    'Next quest step',
    'Moves a quest on to its next step (a step done by logic: do "script"); after its last step, the quest is done.',
  ),
  {
    type: 'quest.setStep',
    kind: 'action',
    title: 'Set quest step',
    category: 'Quests',
    doc: 'Puts a quest on one of its steps (1 is its first): to skip ahead, or go back. A quest not going yet starts.',
    inputs: [EXEC_IN, QUEST, { name: 'step', type: 'number', default: 1, help: 'The step’s number (1 is the first).' }],
    outputs: [EXEC_OUT],
    code: { name: 'quest.setStep', style: 'call' },
    exec: (c, _a, i) => c.quest?.('step', str(i.quest), Math.round(num(i.step, 1))),
  },
  questAction('finish', 'Finish quest', 'Finishes a quest now, whatever step it is on.'),
  questAction(
    'fail',
    'Fail quest',
    'A quest fails (the escort was lost, time ran out): it stays in the log, crossed out.',
  ),
  questAction(
    'track',
    'Track quest',
    'Tracks a quest: its goal shows on both maps (with an arrow at the edge of the map in play when it is off it).',
  ),
  questRead('step', 'Quest step', 'The step a quest is on (1 is its first); 0 if it has not started.', 'number'),
  questRead('status', 'Quest status', 'How a quest stands: "" (not started), "active", "done" or "failed".', 'string'),
  questRead('isActive', 'Quest is going', 'True while a quest is going (started, not done or failed).', 'bool'),
  questRead('isDone', 'Quest is done', 'True once a quest is finished.', 'bool'),
  // v141: goals on other maps
  questRead(
    'goalMap',
    'Quest goal’s map',
    'The name of the map the step a quest is on has its goal on ("" when it has none, or none is known). When it is not the map the hero is on, the maps show the way there.',
    'string',
  ),
];

// ---------- the maps ----------

export const MAP_HOOKS: NodeDef[] = [
  hook(
    'CanOpenMap',
    'Can the map open? (GameMap)',
    'Asked as the player opens the pause map (M, or Map on the pause screen). Return false and it stays shut (no map in this dungeon yet).',
    [],
    'bool',
  ),
  hook(
    'ShowMarker',
    'Does this marker show? (GameMap)',
    'Asked about each marker on the maps: kind (chest, key, boss-key, boss, door, boss-door, exit, name, person, foe, pin, goal), its label and whether it is done (a chest opened, a boss beaten). Return false to hide it.',
    [
      { name: 'kind', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'done', type: 'bool' },
    ],
    'bool',
  ),
  hook(
    'MarkerLabel',
    'What does the marker say? (GameMap)',
    'Asked about each marker’s name on the maps (a region, a way out, a pin’s note, a boss): return other words, or "" for none.',
    [
      { name: 'kind', type: 'string' },
      { name: 'label', type: 'string' },
    ],
    'string',
  ),
];

export const MAP_EVENTS: NodeDef[] = [
  {
    type: 'event.onMapOpen',
    kind: 'event',
    title: 'On map open',
    category: 'Events',
    doc: 'Runs when the pause map opens (the game holds while it is open).',
    inputs: [],
    outputs: [EXEC_OUT],
    code: { name: 'mapOpen', style: 'event' },
  },
  {
    type: 'event.onMapClose',
    kind: 'event',
    title: 'On map close',
    category: 'Events',
    doc: 'Runs when the pause map closes.',
    inputs: [],
    outputs: [EXEC_OUT],
    code: { name: 'mapClose', style: 'event' },
  },
  {
    type: 'event.onMapPin',
    kind: 'event',
    title: 'On map pin',
    category: 'Events',
    doc: 'Runs when the player puts a pin on the pause map: where (x, z in studs), its stamp and its note.',
    inputs: [],
    outputs: [
      EXEC_OUT,
      { name: 'x', type: 'number' },
      { name: 'z', type: 'number' },
      { name: 'stamp', type: 'string' },
      { name: 'label', type: 'string' },
    ],
    code: { name: 'mapPin', style: 'event' },
  },
  {
    type: 'event.onRegionSeen',
    kind: 'event',
    title: 'On region seen',
    category: 'Events',
    doc: 'Runs the first time in a play the hero comes into a region (a zone marked “Show its name on the maps”).',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'region', type: 'string' }],
    args: [
      {
        name: 'region',
        kind: 'string',
        label: 'Region',
        optional: true,
        help: 'Only for this region (its name). Empty: any region.',
      },
    ],
    code: { name: 'regionSeen', style: 'event' },
  },
];

export const MAPS: NodeDef[] = [
  {
    type: 'map.open',
    kind: 'action',
    title: 'Open the map',
    category: 'Maps',
    doc: 'Opens the pause map (the game holds while it is open), or closes it.',
    inputs: [EXEC_IN, { name: 'on', type: 'bool', default: true, help: 'On: open it. Off: close it.' }],
    outputs: [EXEC_OUT],
    code: { name: 'map.open', style: 'call' },
    exec: (c, _a, i) => c.mapOp?.(i.on === false ? 'close' : 'open'),
  },
  {
    type: 'map.setLook',
    kind: 'action',
    title: 'Set map look',
    category: 'Maps',
    doc: 'Changes the maps’ looks while the game plays (a sea chart once the hero has a boat; no map in play in a dark cave). Empty keeps the look it has; "default" goes back to the game’s (Project › Maps).',
    inputs: [
      EXEC_IN,
      {
        name: 'pause',
        type: 'string',
        default: '',
        help: `The pause map’s type: ${PAUSE_TYPES.join(', ')}; empty: keep; default: the game’s.`,
      },
      {
        name: 'mini',
        type: 'string',
        default: '',
        help: `The map in play: ${MINI_TYPES.join(', ')}; empty: keep; default: the game’s.`,
      },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'map.setLook', style: 'call' },
    exec: (c, _a, i) => c.mapOp?.('look', str(i.pause), str(i.mini)),
  },
  {
    type: 'map.mark',
    kind: 'action',
    title: 'Mark the map',
    category: 'Maps',
    doc: 'Puts a mark on the maps where something is (a stamp and a note, like a pin the player puts down): a treasure a neighbour told of, a cave to come back to. One of the same note is moved there.',
    inputs: [
      EXEC_IN,
      {
        name: 'at',
        type: 'string',
        default: 'hero',
        help: 'Where: hero, an object (its asset’s name), a character’s name or a zone’s name.',
      },
      { name: 'stamp', type: 'string', default: 'star', help: `Its stamp: ${STAMPS.join(', ')}.` },
      { name: 'label', type: 'string', default: '', help: 'Its note (what it says on the pause map).' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'map.mark', style: 'call' },
    exec: (c, _a, i) => c.mapOp?.('mark', str(i.at), str(i.stamp), str(i.label)),
  },
  {
    type: 'map.unmark',
    kind: 'action',
    title: 'Take a mark off',
    category: 'Maps',
    doc: 'Takes the marks with this note off the maps (put down by Mark the map, or by the player).',
    inputs: [EXEC_IN, { name: 'label', type: 'string', default: '', help: 'The note of the marks to take off.' }],
    outputs: [EXEC_OUT],
    code: { name: 'map.unmark', style: 'call' },
    exec: (c, _a, i) => c.mapOp?.('unmark', str(i.label)),
  },
  {
    type: 'map.reveal',
    kind: 'action',
    title: 'Reveal the map',
    category: 'Maps',
    doc: 'Shows the whole of the map the hero is on, as if it had been everywhere (a lookout tower, a map bought from a shop); off hides again what it has not seen.',
    inputs: [
      EXEC_IN,
      { name: 'on', type: 'bool', default: true, help: 'On: show it all. Off: only where it has been.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'map.reveal', style: 'call' },
    exec: (c, _a, i) => c.mapOp?.(i.on === false ? 'hide' : 'reveal'),
  },
  {
    type: 'map.isOpen',
    kind: 'pure',
    title: 'Map is open',
    category: 'Maps',
    doc: 'True while the pause map is open.',
    inputs: [],
    outputs: [{ name: 'out', type: 'bool' }],
    code: { name: 'map.isOpen', style: 'call' },
    eval: (c) => c.mapRead?.() ?? false,
  },
];
