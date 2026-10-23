import { z } from 'zod';

/**
 * P26: saving. A save is the player's progress in one game: where the hero is, what they carry, the game's
 * variables, and what changed on every map they visited (opened chests, smashed walls, beaten enemies,
 * removed or added objects). It is player data: never written into the project.
 *
 * Saves are kept by a SaveStore (the browser's storage in the editor and the player). They stay usable after
 * the maker edits the game: anything a save names that is no longer there is skipped.
 */

/** how the player saves: anywhere (Pause › Save), only at save points, or only by checkpoints (autosave) */
export const SAVE_MODES = ['anywhere', 'savePoints', 'checkpoints'] as const;
export type SaveMode = (typeof SAVE_MODES)[number];

export const SAVE_MODE_LABEL: Record<SaveMode, string> = {
  anywhere: 'Save anywhere (Pause › Save game)',
  savePoints: 'Only at save points',
  checkpoints: 'Only by checkpoints (autosave)',
};

export const Saving = z.strictObject({
  mode: z.enum(SAVE_MODES),
  /** save slots the player can pick from (Pause › Save game, Load game) */
  slots: z.number().int().min(1).max(3),
  /** save on its own when the hero touches a checkpoint or goes through a gate */
  autosave: z.boolean(),
});
export type Saving = z.infer<typeof Saving>;

export const DEFAULT_SAVING: Saving = { mode: 'anywhere', slots: 3, autosave: true };

/** the autosave slot (Continue picks the newest of it and the player's slots) */
export const AUTO_SLOT = 0;
export const slotName = (slot: number) => (slot === AUTO_SLOT ? 'Autosave' : `Slot ${slot}`);

const Json = z.unknown();
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** where a smashed brick was, so a save finds the same brick after the maker edits the map */
const PieceMark = z.tuple([z.number().int(), z.number(), z.number(), z.number()]);

export const MapSave = z.strictObject({
  /** placed objects that changed state, by instance id */
  states: z.record(z.string(), z.string()),
  /** placed objects removed in play (despawned, or broken at zero health) */
  removed: z.array(z.string()),
  /** objects added in play (spawned, dropped), in the order they appeared */
  spawned: z.array(
    z.strictObject({
      id: z.string(),
      asset: z.string(),
      pos: Vec3,
      rot: z.number().int(),
      idBase: z.number().int(),
      state: z.string(),
    }),
  ),
  /** smashed bricks not rebuilt: one group per smash, each brick as [id, x, y, z] */
  broken: z.array(z.array(PieceMark)),
  /** neighbours: where they stand, and the ones beaten (gone for this play) */
  npcs: z.record(z.string(), z.strictObject({ x: z.number(), y: z.number(), z: z.number(), heading: z.number() })),
  npcsGone: z.array(z.number().int()),
  /** P27 part 3d: bricks of broken things gone for good, beyond those still remembered as breaks (ids only) */
  gone: z.array(z.number().int()).optional(),
});
export type MapSave = z.infer<typeof MapSave>;

export const SaveGame = z.strictObject({
  format: z.literal('brickworlds-save'),
  v: z.literal(1),
  /** the game's project id: a save only loads into its own game */
  game: z.string(),
  slot: z.number().int().min(0).max(3),
  savedAt: z.string(),
  /** seconds played in total */
  playTime: z.number().min(0),
  /** what the slot list shows: the map's name */
  label: z.string(),
  map: z.string(),
  hero: z.strictObject({ pos: Vec3, heading: z.number(), held: z.string().optional(), offHand: z.string().optional() }),
  /** where Retry and a fall put the hero back */
  checkpoint: z.strictObject({
    map: z.string(),
    spawn: z.string().nullable(),
    pos: Vec3.optional(),
    heading: z.number().optional(),
  }),
  vars: z.record(z.string(), Json),
  inventory: z.record(z.string(), z.number()),
  /** health of everything hurt: hero, i:<instance>, n:<neighbour> */
  health: z.record(z.string(), z.number()),
  /** cinematics marked Once that were already shown */
  seen: z.array(z.string()),
  maps: z.record(z.string(), MapSave),
});
export type SaveGame = z.infer<typeof SaveGame>;

/** the slot list's line for a save: “Slot 1 · Training yard · 3 min” */
export function slotLine(slot: number, save: SaveGame | null): string {
  if (!save) return `${slotName(slot)} · empty`;
  const m = Math.floor(save.playTime / 60);
  return `${slotName(slot)} · ${save.label} · ${m < 1 ? 'under a minute' : `${m} min`}`;
}

/** Where saves are kept. The engine only talks to this; the editor and the player give it browser storage. */
export interface SaveStore {
  read(game: string, slot: number): SaveGame | null;
  write(save: SaveGame): void;
  remove(game: string, slot: number): void;
  /** P26: the player's record of this game (achievements, best scores, settings); null: none yet */
  readPlayer(game: string): unknown;
  writePlayer(game: string, record: unknown): void;
  removePlayer(game: string): void;
}

/** Saves kept for this page only (tests, and storage that is not allowed). */
export class MemorySaveStore implements SaveStore {
  private readonly all = new Map<string, SaveGame>();
  read(game: string, slot: number) {
    return this.all.get(`${game}:${slot}`) ?? null;
  }
  write(save: SaveGame) {
    this.all.set(`${save.game}:${save.slot}`, structuredClone(save));
  }
  remove(game: string, slot: number) {
    this.all.delete(`${game}:${slot}`);
  }
  private readonly players = new Map<string, unknown>();
  readPlayer(game: string) {
    return this.players.get(game) ?? null;
  }
  writePlayer(game: string, record: unknown) {
    this.players.set(game, structuredClone(record));
  }
  removePlayer(game: string) {
    this.players.delete(game);
  }
}

/** a stored save, checked (a broken or foreign one reads as no save) */
export function parseSave(raw: unknown): SaveGame | null {
  const r = SaveGame.safeParse(raw);
  return r.success ? r.data : null;
}

/** every slot's save of a game (autosave first) */
export function allSaves(store: SaveStore, game: string): SaveGame[] {
  const out: SaveGame[] = [];
  for (let s = 0; s <= 3; s++) {
    const g = store.read(game, s);
    if (g) out.push(g);
  }
  return out;
}

/** the save Continue loads: the newest one */
export function newestSave(store: SaveStore, game: string): SaveGame | null {
  return allSaves(store, game).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
}
