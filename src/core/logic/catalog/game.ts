import { hook } from './hooks';
import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Milestone 3b (B7a-3): the game's rules (a behaviour extending GameMode) and a map's own behaviour (MapScript):
 * their hooks, their events, and the nodes to lose, come back, and set where the hero comes back.
 */
const str = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));

export const GAME_HOOKS: NodeDef[] = [
  hook(
    'IsGameOver',
    'Is it game over? (GameMode)',
    'Asked as the hero’s hearts run out (cause: hearts) or a script ends the game (cause: logic). Return false and it is not: the hero hangs on with at least one heart (heal it here: a fairy in a bottle).',
    [{ name: 'cause', type: 'string' }],
    'bool',
  ),
  hook(
    'HasWon',
    'Has the game been won? (GameMode)',
    'Asked a few times a second. Return true and the game is finished (as Finish game does): every boss beaten, the main quest done, a score reached.',
    [],
    'bool',
  ),
  hook(
    'RespawnAt',
    'Where does the hero come back? (GameMode)',
    'Asked as the hero comes back after game over (Retry): a spawn point’s name (on any map), start (where the game begins) or checkpoint (base: where it last was set). A dungeon can send the hero back to its entrance.',
    [{ name: 'map', type: 'string', help: 'The map the hero was on.' }],
    'string',
  ),
  hook(
    'RespawnHearts',
    'How many hearts back? (GameMode)',
    'Asked as the hero comes back after game over: how many hearts it has (base: all of them; 3 is the classic).',
    [{ name: 'max', type: 'number' }],
    'number',
  ),
  hook(
    'KeepOnRespawn',
    'Keep this item? (GameMode)',
    'Asked about each item the hero carries as it comes back after game over (item, count). Return false and it is lost (half its money, its bombs).',
    [
      { name: 'item', type: 'string' },
      { name: 'count', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'CanSave',
    'Can it save now? (GameMode)',
    'Asked as the game is saved (a save point, the pause screen, Save game; slot 0 is the autosave). Return false and it is not: “You can’t save here.” (not in a boss fight, not in a dungeon).',
    [{ name: 'slot', type: 'number' }],
    'bool',
  ),
  hook(
    'KeepOnNewGamePlus',
    'Keep this in new game plus? (GameMode)',
    'Asked about each item (kind: item) and game variable (kind: var) as new game plus begins. base is what Project › Progress › New game plus says.',
    [
      { name: 'kind', type: 'string' },
      { name: 'name', type: 'string' },
    ],
    'bool',
  ),
];

const ev = (
  type: string,
  title: string,
  doc: string,
  outputs: NodeDef['outputs'] = [],
  args?: NodeDef['args'],
): NodeDef => ({
  type,
  kind: 'event',
  title,
  category: 'Events',
  doc,
  inputs: [],
  outputs: [EXEC_OUT, ...outputs],
  ...(args ? { args } : {}),
  code: { name: type.charAt(8).toLowerCase() + type.slice(9), style: 'event' },
});
const MAP_ARG = [
  {
    name: 'map',
    kind: 'string' as const,
    label: 'Map',
    optional: true,
    help: 'Only for this map (its name). Empty: any map. In a map’s own behaviour it is only ever that map.',
  },
];

export const GAME_EVENTS: NodeDef[] = [
  ev(
    'event.onGameOver',
    'On game over',
    'Runs as the game is over (the Game over screen shows): cause is hearts or logic.',
    [{ name: 'cause', type: 'string' }],
  ),
  ev(
    'event.onRespawn',
    'On respawn',
    'Runs as the hero comes back after game over (Retry), where it came back (map, at).',
    [
      { name: 'map', type: 'string' },
      { name: 'at', type: 'string' },
    ],
  ),
  ev('event.onGameWon', 'On game won', 'Runs as the game is finished (won): Finish game, or GameMode’s hasWon.'),
  ev('event.onSaved', 'On saved', 'Runs after the game is saved (slot 0 is the autosave).', [
    { name: 'slot', type: 'number' },
  ]),
  ev('event.onLoaded', 'On loaded', 'Runs after a save is loaded (slot 0 is the autosave).', [
    { name: 'slot', type: 'number' },
  ]),
  ev(
    'event.onMapEnter',
    'On map enter',
    'Runs as the hero arrives on a map (and on the first map as play starts): from is the map it came from ("" at the start).',
    [
      { name: 'map', type: 'string' },
      { name: 'from', type: 'string' },
    ],
    MAP_ARG,
  ),
  ev(
    'event.onMapLeave',
    'On map leave',
    'Runs as the hero leaves a map, before it goes: to is the map it goes to.',
    [
      { name: 'map', type: 'string' },
      { name: 'to', type: 'string' },
    ],
    MAP_ARG,
  ),
  ev(
    'event.onFoesCleared',
    'On foes cleared',
    'Runs when the last foe on the map is beaten (a room cleared: the doors open, a chest appears).',
    [{ name: 'map', type: 'string' }],
    MAP_ARG,
  ),
];

export const GAME: NodeDef[] = [
  {
    type: 'game.lose',
    kind: 'action',
    title: 'Game over',
    category: 'Saving',
    doc: 'Ends the game now (the Game over screen shows, Retry brings the hero back), unless GameMode’s isGameOver says no.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    code: { name: 'game.lose', style: 'call' },
    exec: (c) => c.game?.('lose'),
  },
  {
    type: 'game.respawn',
    kind: 'action',
    title: 'Respawn',
    category: 'Saving',
    doc: 'Brings the hero back now, as Retry after game over does (where GameMode’s respawnAt says, with its hearts).',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    code: { name: 'game.respawn', style: 'call' },
    exec: (c) => c.game?.('respawn'),
  },
  {
    type: 'game.setRespawn',
    kind: 'action',
    title: 'Set respawn point',
    category: 'Saving',
    doc: 'From now on, Retry (after game over) brings the hero back to this spawn point (on any map), or where it stands (here).',
    inputs: [
      EXEC_IN,
      { name: 'at', type: 'string', default: 'here', help: 'A spawn point’s name (on any map), or here.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'game.setRespawn', style: 'call' },
    exec: (c, _a, i) => c.game?.('setRespawn', str(i.at)),
  },
  {
    type: 'map.foesLeft',
    kind: 'pure',
    title: 'Foes left',
    category: 'Maps',
    doc: 'How many foes are still on the map the hero is on (beaten ones are gone).',
    inputs: [],
    outputs: [{ name: 'out', type: 'number' }],
    code: { name: 'map.foesLeft', style: 'call' },
    eval: (c) => c.foesLeft?.() ?? 0,
  },
];
