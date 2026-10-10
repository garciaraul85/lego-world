/** Voice limits (plan Performance › Audio): 32 voices, per-event maxVoices, steal the oldest lowest-priority voice. */
export type PooledVoice = { event: string; priority: number; started: number };

export type Admit<V> = { ok: true; steal: V | null } | { ok: false; reason: 'busy' };

export const BUS_PRIORITY: Record<string, number> = { ui: 3, voice: 3, sfx: 2, music: 4, ambience: 1 };

export class VoicePool<V extends PooledVoice> {
  readonly active: V[] = [];
  /** voices refused or stolen since creation (shown in the Audio workspace) */
  stolen = 0;
  refused = 0;

  constructor(readonly max = 32) {}

  /**
   * May a new voice of `event` start? Returns the voice to stop first when the event or the pool is full.
   * Same event full → its oldest voice is stolen. Pool full → the oldest voice with the lowest priority
   * not above the new one is stolen; if every voice outranks it, the new voice is refused.
   */
  admit(event: string, maxPerEvent: number, priority: number): Admit<V> {
    const same = this.active.filter((v) => v.event === event);
    if (same.length >= maxPerEvent) {
      this.stolen++;
      return { ok: true, steal: oldest(same) };
    }
    if (this.active.length < this.max) return { ok: true, steal: null };
    const low = Math.min(...this.active.map((v) => v.priority));
    if (low > priority) {
      this.refused++;
      return { ok: false, reason: 'busy' };
    }
    this.stolen++;
    return { ok: true, steal: oldest(this.active.filter((v) => v.priority === low)) };
  }

  add(v: V) {
    this.active.push(v);
    if (this.active.length > this.max) throw new Error('voice pool overflow');
  }

  remove(v: V) {
    const i = this.active.indexOf(v);
    if (i >= 0) this.active.splice(i, 1);
  }

  clear() {
    this.active.length = 0;
  }
}

function oldest<V extends PooledVoice>(list: V[]): V {
  return list.reduce((a, b) => (b.started < a.started ? b : a));
}
