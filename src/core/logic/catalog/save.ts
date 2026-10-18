import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

const SLOT_HELP =
  'Which save slot (1 to 3, up to the slots set in Game settings › Saving). Empty: the slot the player is using (the one they last saved to or loaded).';

const act = (type: string, title: string, doc: string, args: NodeDef['args'], run: NodeDef['exec']): NodeDef => ({
  type,
  kind: 'action',
  title,
  category: 'Saving',
  doc,
  inputs: [EXEC_IN],
  outputs: [EXEC_OUT],
  args,
  code: { name: type, style: 'call' },
  ...(run ? { exec: run } : {}),
});

/** P26: saving from logic — save to a slot, load one, and set where Retry and falls bring the hero back. */
export const SAVE: NodeDef[] = [
  act(
    'game.save',
    'Save game',
    'Saves the game to a slot: where the hero is, what they carry, variables, and everything changed on the maps they visited. Use it for a save point, or after a big moment.',
    [{ name: 'slot', kind: 'number', label: 'Slot', optional: true, help: SLOT_HELP }],
    (c, a) => c.saving?.('save', a.slot === undefined || a.slot === '' ? undefined : Number(a.slot)),
  ),
  act(
    'game.load',
    'Load game',
    'Loads a saved game: the maps, the hero and everything carried come back as they were saved. Empty slot: the newest save.',
    [
      {
        name: 'slot',
        kind: 'number',
        label: 'Slot',
        optional: true,
        help: 'Which save slot (0 is the autosave). Empty: the newest save of any slot.',
      },
    ],
    (c, a) => c.saving?.('load', a.slot === undefined || a.slot === '' ? undefined : Number(a.slot)),
  ),
  act(
    'game.setCheckpoint',
    'Set checkpoint',
    'From now on, Retry (after game over) and falling off the world bring the hero back to where they stand now.',
    [],
    (c) => c.saving?.('checkpoint', undefined),
  ),
];
