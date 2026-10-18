import { z } from 'zod';

/**
 * P26 part 2: progress — what a game counts toward finishing it, and what each player keeps between plays.
 *
 * The maker sets it up in the project (game/progress.json): achievements, collections (an item and how many
 * there are), best scores (a variable, higher or lower is better), and new game plus. What a player has
 * earned (achievements unlocked, best scores, times finished) and their own settings live in their player
 * record in the browser, beside their saves — never in the project.
 */

const Name = z.string().min(1).max(60);

export const Achievement = z.strictObject({
  /** a short id logic uses (“first-chest”) */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  name: Name,
  description: z.string().max(160),
  /** hidden: shown as “???” until unlocked */
  hidden: z.boolean().optional(),
});
export type Achievement = z.infer<typeof Achievement>;

export const Collection = z.strictObject({
  /** the inventory item counted (“coin”) */
  item: z.string().min(1).max(40),
  label: Name,
  /** how many there are in the game */
  total: z.number().int().min(1).max(9999),
});
export type Collection = z.infer<typeof Collection>;

export const Best = z.strictObject({
  /** the variable whose best value is kept (“score”, “lapTime”) */
  var: z.string().min(1).max(40),
  label: Name,
  better: z.enum(['higher', 'lower']),
});
export type Best = z.infer<typeof Best>;

export const ProgressDoc = z.strictObject({
  achievements: z.array(Achievement).max(100),
  collections: z.array(Collection).max(20),
  bests: z.array(Best).max(10),
  newGamePlus: z.strictObject({
    enabled: z.boolean(),
    /** the items carried over into the new game */
    keepItems: z.boolean(),
    /** variables carried over (“level”, “maxHp”) */
    keepVars: z.array(z.string().min(1).max(40)).max(20),
  }),
});
export type ProgressDoc = z.infer<typeof ProgressDoc>;

export const EMPTY_PROGRESS: ProgressDoc = {
  achievements: [],
  collections: [],
  bests: [],
  newGamePlus: { enabled: false, keepItems: true, keepVars: [] },
};

/** P26: the player's own settings (per game, kept with their saves) */
export const PlayerSettings = z.strictObject({
  /** 0–100 */
  music: z.number().min(0).max(100),
  sounds: z.number().min(0).max(100),
  invertY: z.boolean(),
  /** camera turn speed, 50–200 % */
  cameraSpeed: z.number().min(50).max(200),
  textSize: z.enum(['normal', 'large']),
  /** story: half damage; hard: double */
  difficulty: z.enum(['story', 'normal', 'hard']),
});
export type PlayerSettings = z.infer<typeof PlayerSettings>;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  music: 80,
  sounds: 100,
  invertY: false,
  cameraSpeed: 100,
  textSize: 'normal',
  difficulty: 'normal',
};

export const DIFFICULTY_DAMAGE: Record<PlayerSettings['difficulty'], number> = { story: 0.5, normal: 1, hard: 2 };

/** what a player keeps between plays of one game */
export const PlayerRecord = z.strictObject({
  format: z.literal('brickworlds-player'),
  v: z.literal(1),
  game: z.string(),
  /** achievement id → when it was unlocked */
  achievements: z.record(z.string(), z.string()),
  /** variable → best value */
  bests: z.record(z.string(), z.number()),
  /** times the game was finished (new game plus counts from here) */
  finished: z.number().int().min(0),
  settings: PlayerSettings,
});
export type PlayerRecord = z.infer<typeof PlayerRecord>;

export const newPlayer = (game: string): PlayerRecord => ({
  format: 'brickworlds-player',
  v: 1,
  game,
  achievements: {},
  bests: {},
  finished: 0,
  settings: { ...DEFAULT_PLAYER_SETTINGS },
});

/** a stored player record, checked (a broken one reads as a new player; unknown settings get defaults) */
export function parsePlayer(raw: unknown, game: string): PlayerRecord {
  const base = newPlayer(game);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PlayerRecord>;
  const settings = PlayerSettings.safeParse({ ...DEFAULT_PLAYER_SETTINGS, ...(r.settings ?? {}) });
  const rec = PlayerRecord.safeParse({ ...base, ...r, settings: settings.success ? settings.data : base.settings });
  return rec.success && rec.data.game === game ? rec.data : base;
}

/** is `v` a new best for this kind of score? */
export const isBetter = (b: Best, v: number, old: number | undefined) =>
  old === undefined || (b.better === 'higher' ? v > old : v < old);

/**
 * Completion, 0–100: each collection counts by how much of it was found, and the achievements together count
 * as one more part. Nothing to count: 0.
 */
export function completion(p: ProgressDoc, found: (item: string) => number, unlocked: (id: string) => boolean): number {
  const parts: number[] = p.collections.map((c) => Math.min(1, found(c.item) / c.total));
  if (p.achievements.length) parts.push(p.achievements.filter((a) => unlocked(a.id)).length / p.achievements.length);
  if (!parts.length) return 0;
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

/** “1:05:09” or “12:30” */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
