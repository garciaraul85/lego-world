import type { Mixer } from '../../core/schema';

export type DuckRamp = { target: string; db: number; timeConstant: number };

/**
 * Ducking (P5.1): while a trigger is active (a voice line, a stinger) its rules pull the target bus
 * down by `amount` dB; the engine ramps the bus duck gain with setTargetAtTime(attack / release).
 */
export class Ducker {
  private active = new Map<string, number>();

  constructor(private rules: Mixer['duck']) {}

  setRules(rules: Mixer['duck']) {
    this.rules = rules;
  }

  /** a trigger starts (counted, so overlapping voice lines keep the duck) */
  begin(when: string): DuckRamp[] {
    const n = (this.active.get(when) ?? 0) + 1;
    this.active.set(when, n);
    return n === 1 ? this.ramps(when, 'attack') : [];
  }

  end(when: string): DuckRamp[] {
    const n = (this.active.get(when) ?? 0) - 1;
    if (n > 0) {
      this.active.set(when, n);
      return [];
    }
    this.active.delete(when);
    return this.ramps(when, 'release');
  }

  /** total duck of a bus in dB from every active trigger (negative) */
  duckDb(bus: string): number {
    let db = 0;
    for (const r of this.rules) if (r.target === bus && this.active.has(r.when)) db = Math.min(db, r.amount);
    return db;
  }

  isActive(when: string) {
    return this.active.has(when);
  }

  private ramps(when: string, phase: 'attack' | 'release'): DuckRamp[] {
    return this.rules
      .filter((r) => r.when === when)
      .map((r) => ({ target: r.target, db: this.duckDb(r.target), timeConstant: Math.max(0.001, r[phase] / 3) }));
  }

  reset() {
    this.active.clear();
  }
}
