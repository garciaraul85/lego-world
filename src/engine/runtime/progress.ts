import {
  clockText,
  completion,
  DIFFICULTY_DAMAGE,
  EMPTY_PROGRESS,
  isBetter,
  type PlayerRecord,
  type PlayerSettings,
  type ProgressDoc,
  parsePlayer,
} from '../../core/save/progress';
import type { SaveStore } from '../../core/save/save';
import { paths } from '../../core/schema';

/** the session as progress sees it (structural, so this file does not import the session) */
export interface ProgressHost {
  readonly snapshot: { get(path: string): unknown };
  readonly project: { id: string };
  readonly saves: SaveStore;
  readonly logic: { vars: Map<string, unknown>; fire(e: { type: string; match?: Record<string, unknown> }): void };
  readonly inventory: Map<string, number>;
  playTime(): number;
  say(msg: string, seconds?: number): void;
  emit(kind: 'info', msg: string): void;
}

/** the settings the player can change, in the order the Settings screen lists them, with the values they step through */
export const SETTING_STEPS: { [K in keyof PlayerSettings]: readonly PlayerSettings[K][] } = {
  music: [0, 20, 40, 60, 80, 100],
  sounds: [0, 20, 40, 60, 80, 100],
  invertY: [false, true],
  cameraSpeed: [50, 75, 100, 150, 200],
  textSize: ['normal', 'large'],
  difficulty: ['story', 'normal', 'hard'],
};

const SETTING_LABEL: Record<keyof PlayerSettings, (v: never) => string> = {
  music: (v: number) => `Music volume: ${v}%`,
  sounds: (v: number) => `Sound volume: ${v}%`,
  invertY: (v: boolean) => `Invert camera up/down: ${v ? 'on' : 'off'}`,
  cameraSpeed: (v: number) => `Camera speed: ${v}%`,
  textSize: (v: string) => `Text size: ${v === 'large' ? 'large' : 'normal'}`,
  difficulty: (v: string) =>
    `Difficulty: ${v === 'story' ? 'story (half damage)' : v === 'hard' ? 'hard (double damage)' : 'normal'}`,
} as never;

export const isSettingKey = (k: string): k is keyof PlayerSettings => k in SETTING_STEPS;

/**
 * P26 part 2: a player's progress in one game — achievements unlocked, best scores, times finished, and their
 * settings. It is kept in the player's record (beside their saves), so it lasts across saves and new games.
 */
export class PlayerProgress {
  readonly doc: ProgressDoc;
  record: PlayerRecord;
  /** called after a setting changes (the session applies volumes; the play view reads the camera ones) */
  onSettings: ((s: PlayerSettings) => void) | null = null;

  constructor(private readonly h: ProgressHost) {
    this.doc = (h.snapshot.get(paths.progress) as ProgressDoc | undefined) ?? EMPTY_PROGRESS;
    this.record = parsePlayer(h.saves.readPlayer(h.project.id), h.project.id);
  }

  get settings(): PlayerSettings {
    return this.record.settings;
  }

  /** the damage taken by the hero, scaled by the player's difficulty */
  damage(n: number): number {
    return n * DIFFICULTY_DAMAGE[this.settings.difficulty];
  }

  private write() {
    this.h.saves.writePlayer(this.h.project.id, this.record);
  }

  unlocked(id: string): boolean {
    return id in this.record.achievements;
  }

  /** Unlocks an achievement (once): a 🏆 message and logic's On achievement. */
  unlock(id: string): boolean {
    const a = this.doc.achievements.find((x) => x.id === id);
    if (!a) {
      this.h.emit('info', `Achievement “${id}”: there is none with that id (Project › Progress).`);
      return false;
    }
    if (this.unlocked(id)) return false;
    this.record.achievements[id] = new Date().toISOString();
    this.write();
    this.h.emit('info', `Achievement unlocked: ${a.name}`);
    this.h.say(`🏆 ${a.name}`, 3);
    this.h.logic.fire({ type: 'event.onAchievement', match: { achievement: id } });
    return true;
  }

  /** best scores: a higher-is-better score is kept as soon as it is beaten; lower-is-better ones when the game is finished */
  stepBests(finished = false) {
    let changed = false;
    for (const b of this.doc.bests) {
      if (b.better === 'lower' && !finished) continue;
      const v = Number(this.h.logic.vars.get(b.var));
      if (!Number.isFinite(v)) continue;
      if (isBetter(b, v, this.record.bests[b.var])) {
        this.record.bests[b.var] = v;
        changed = true;
      }
    }
    if (changed) this.write();
  }

  /** the game was finished: counted (new game plus becomes possible) and best scores kept */
  finish() {
    this.stepBests(true);
    this.record.finished++;
    this.write();
  }

  /** a setting steps to its next value (Settings screen buttons), or is set to `value` */
  setSetting(key: keyof PlayerSettings, value?: unknown) {
    const steps = SETTING_STEPS[key] as readonly unknown[];
    const cur = this.settings[key];
    const next = value !== undefined && steps.includes(value) ? value : steps[(steps.indexOf(cur) + 1) % steps.length];
    (this.record.settings as Record<string, unknown>)[key] = next;
    this.write();
    this.onSettings?.(this.settings);
  }

  percent(): number {
    return completion(
      this.doc,
      (item) => this.h.inventory.get(item) ?? 0,
      (id) => this.unlocked(id),
    );
  }

  /** {progress.…}, {achievements.…}, {collection.<item>}, {best.<var>} and {settings.…} for screens */
  value(name: string): unknown {
    if (name === 'progress.percent') return this.percent();
    if (name === 'progress.time') return clockText(this.h.playTime());
    if (name === 'progress.finished') return this.record.finished;
    if (name === 'progress.canPlus') return this.doc.newGamePlus.enabled && this.record.finished > 0;
    if (name === 'achievements.unlocked') return this.doc.achievements.filter((a) => this.unlocked(a.id)).length;
    if (name === 'achievements.total') return this.doc.achievements.length;
    if (name === 'achievements.list')
      return this.doc.achievements.map((a) =>
        this.unlocked(a.id)
          ? `🏆 ${a.name} — ${a.description}`
          : a.hidden
            ? '🔒 ???'
            : `🔒 ${a.name} — ${a.description}`,
      );
    if (name === 'collections.list')
      return this.doc.collections.map(
        (c) => `${c.label}: ${Math.min(c.total, this.h.inventory.get(c.item) ?? 0)} / ${c.total}`,
      );
    if (name === 'bests.list') return this.doc.bests.map((b) => `${b.label}: ${this.record.bests[b.var] ?? '—'}`);
    if (name.startsWith('collection.')) {
      const c = this.doc.collections.find((x) => x.item === name.slice(11));
      return c ? `${Math.min(c.total, this.h.inventory.get(c.item) ?? 0)} / ${c.total}` : undefined;
    }
    if (name.startsWith('best.')) return this.record.bests[name.slice(5)];
    if (name.startsWith('settings.')) {
      const k = name.slice(9);
      if (!isSettingKey(k)) return undefined;
      return (SETTING_LABEL[k] as (v: unknown) => string)(this.settings[k]);
    }
    return undefined;
  }
}
