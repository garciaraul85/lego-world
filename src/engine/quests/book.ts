/**
 * Milestone 3b (B7a-2): the quest log of a play — the game's quests (each a behaviour extending Quest, its steps
 * written in the class), how far each has gone, which is tracked, and the counts of what the hero has done that
 * steps are about (talked to, beaten, used). Pure: the play session asks the quests' hooks, fires their events and
 * says what changed; the quest log, the maps and saves read it.
 */
import { doOf, type QuestLogSave, type QuestProgress, type QuestStepDef } from '../../core/quests/quest';

export type QuestDef = {
  /** its behaviour's logic file */
  id: string;
  /** its name (its behaviour's) */
  name: string;
  /** a main quest (the story's): listed first, tracked at once */
  main: boolean;
  steps: readonly QuestStepDef[];
  about?: string;
};

/** what the hero did that steps count (talk, beat, use) */
export type CountKind = 'talk' | 'beat' | 'use' | 'region';

const key = (s: string) => s.trim().toLowerCase();
export const countKey = (kind: string, name: string) => `${kind}:${key(name)}`;

export class QuestBook {
  private byName = new Map<string, QuestDef>();
  private byId = new Map<string, QuestDef>();
  private progress = new Map<string, QuestProgress>();
  private counts = new Map<string, number>();
  private serial = 0;
  tracked: string | null = null;

  constructor(readonly defs: readonly QuestDef[]) {
    for (const d of defs) {
      this.byName.set(key(d.name), d);
      this.byId.set(d.id, d);
    }
  }

  /** a quest by its name, its owner ("quest:<file>"), or (this, empty) the one tracked */
  find(ref: string | undefined): QuestDef | null {
    const r = String(ref ?? '').trim();
    if (r.startsWith('quest:')) return this.byId.get(r.slice(6)) ?? null;
    if (!r || key(r) === 'this') return this.tracked ? (this.byName.get(key(this.tracked)) ?? null) : null;
    return this.byName.get(key(r)) ?? null;
  }

  of(d: QuestDef): QuestProgress | null {
    return this.progress.get(key(d.name)) ?? null;
  }
  statusOf(d: QuestDef): '' | QuestProgress['status'] {
    return this.of(d)?.status ?? '';
  }
  /** the step it is on (null: not going) */
  stepOf(d: QuestDef): QuestStepDef | null {
    const p = this.of(d);
    return p?.status === 'active' ? (d.steps[p.step] ?? null) : null;
  }

  // ---------- what the hero did ----------

  note(kind: CountKind, name: string, n = 1) {
    if (!name.trim()) return;
    const k = countKey(kind, name);
    this.counts.set(k, (this.counts.get(k) ?? 0) + n);
  }
  countOf(kind: string, name: string): number {
    return this.counts.get(countKey(kind, name)) ?? 0;
  }
  /** the count a step is about (talk, beat, use: the hero's tally so far; else 0) */
  private baseOf(s: QuestStepDef | undefined): number {
    const d = s ? doOf(s) : 'script';
    return s && (d === 'talk' || d === 'beat' || d === 'use') ? this.countOf(d, s.at ?? '') : 0;
  }
  /** how many of what a step is about the hero has done since it began (get: carries, from `carried`) */
  haveOf(d: QuestDef, carried: (item: string) => number): number {
    const s = this.stepOf(d);
    if (!s) return 0;
    const k = doOf(s);
    if (k === 'get') return carried(s.at ?? '');
    if (k === 'talk' || k === 'beat' || k === 'use') return this.countOf(k, s.at ?? '') - (this.of(d)?.base ?? 0);
    return 0;
  }

  // ---------- how a quest goes ----------

  /** it starts (false: it has already been started) */
  start(d: QuestDef): boolean {
    if (this.of(d) || !d.steps.length) return false;
    this.progress.set(key(d.name), { status: 'active', step: 0, base: this.baseOf(d.steps[0]), order: ++this.serial });
    if (d.main || !this.tracked || this.statusOfName(this.tracked) !== 'active') this.tracked = d.name;
    return true;
  }
  /** put on a step (0 is its first); past its last: it is done. Returns what happened. */
  setStep(d: QuestDef, step: number): 'step' | 'done' | 'start' | null {
    let started = false;
    if (!this.of(d)) started = this.start(d);
    const p = this.of(d);
    if (!p || p.status !== 'active') return null;
    if (step >= d.steps.length) return this.finish(d) ? 'done' : null;
    p.step = Math.max(0, step);
    p.base = this.baseOf(d.steps[p.step]);
    return started ? 'start' : 'step';
  }
  advance(d: QuestDef): 'step' | 'done' | null {
    const p = this.of(d);
    if (!p || p.status !== 'active') return null;
    return this.setStep(d, p.step + 1) as 'step' | 'done' | null;
  }
  finish(d: QuestDef): boolean {
    const p = this.of(d) ?? (this.start(d) ? this.of(d) : null);
    if (!p || p.status !== 'active') return false;
    p.status = 'done';
    p.step = d.steps.length;
    this.retrack(d);
    return true;
  }
  fail(d: QuestDef): boolean {
    const p = this.of(d);
    if (!p || p.status !== 'active') return false;
    p.status = 'failed';
    this.retrack(d);
    return true;
  }
  track(d: QuestDef | null) {
    if (!d) this.tracked = null;
    else if (this.statusOf(d) === 'active') this.tracked = d.name;
  }
  private statusOfName(name: string) {
    return this.progress.get(key(name))?.status;
  }
  /** the tracked quest ended: track the next going (main quests first) */
  private retrack(d: QuestDef) {
    if (this.tracked && key(this.tracked) !== key(d.name)) return;
    this.tracked = this.going()[0]?.name ?? null;
  }

  /** the quests going, main ones first, then in the order they began */
  going(): QuestDef[] {
    return this.defs
      .filter((d) => this.statusOf(d) === 'active')
      .sort((a, b) => Number(b.main) - Number(a.main) || this.of(a)!.order - this.of(b)!.order);
  }
  /** every quest begun (going, done, failed), as the log lists them: going first */
  begun(): QuestDef[] {
    const rank = { active: 0, done: 1, failed: 2 } as const;
    return this.defs
      .filter((d) => this.of(d))
      .sort(
        (a, b) =>
          rank[this.of(a)!.status] - rank[this.of(b)!.status] ||
          Number(b.main) - Number(a.main) ||
          this.of(a)!.order - this.of(b)!.order,
      );
  }
  trackedQuest(): QuestDef | null {
    const d = this.tracked ? this.byName.get(key(this.tracked)) : undefined;
    return d && this.statusOf(d) === 'active' ? d : null;
  }

  // ---------- saves ----------

  reset() {
    this.progress.clear();
    this.counts.clear();
    this.tracked = null;
    this.serial = 0;
  }
  capture(): QuestLogSave | undefined {
    if (!this.progress.size && !this.counts.size) return undefined;
    const quests: QuestLogSave['quests'] = {};
    for (const d of this.defs) {
      const p = this.of(d);
      if (p) quests[d.name.slice(0, 80)] = { ...p };
    }
    return {
      quests,
      ...(this.tracked ? { tracked: this.tracked.slice(0, 80) } : {}),
      ...(this.counts.size ? { counts: Object.fromEntries([...this.counts].slice(0, 500)) } : {}),
    };
  }
  restore(s: QuestLogSave | undefined) {
    this.reset();
    for (const [name, p] of Object.entries(s?.quests ?? {})) {
      // a quest no longer in the game is let go
      const d = this.byName.get(key(name));
      if (!d) continue;
      this.progress.set(key(d.name), { ...p, step: Math.min(p.step, d.steps.length) });
      this.serial = Math.max(this.serial, p.order);
    }
    for (const [k, n] of Object.entries(s?.counts ?? {})) this.counts.set(k, n);
    const t = s?.tracked ? this.byName.get(key(s.tracked)) : undefined;
    this.tracked = t ? t.name : (this.going()[0]?.name ?? null);
  }
}
