import type { SoundEvent } from '../../core/schema';

export type PlayPlan = { clip: string; rate: number; gainDb: number };

/**
 * Turns a sound event into one concrete play (P5.3): which clip (random / sequence / shuffle),
 * which pitch inside the range, and whether the cooldown allows it. Pure: no audio here.
 */
export class SoundEventPicker {
  private last = new Map<string, number>();
  private seq = new Map<string, number>();
  private bags = new Map<string, number[]>();
  private lastClip = new Map<string, number>();

  constructor(private readonly random: () => number = Math.random) {}

  pick(id: string, ev: SoundEvent, now: number): PlayPlan | null {
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < ev.cooldown) return null;
    this.last.set(id, now);
    const n = ev.clips.length;
    let i = 0;
    if (ev.pick === 'sequence') {
      i = (this.seq.get(id) ?? -1) + 1;
      if (i >= n) i = 0;
      this.seq.set(id, i);
    } else if (ev.pick === 'shuffle') {
      let bag = this.bags.get(id);
      if (!bag?.length) {
        bag = [...Array(n).keys()];
        for (let k = bag.length - 1; k > 0; k--) {
          const j = Math.floor(this.random() * (k + 1));
          [bag[k], bag[j]] = [bag[j]!, bag[k]!];
        }
        // never repeat the clip that just played when a new round starts
        if (n > 1 && bag[bag.length - 1] === this.lastClip.get(id))
          [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
        this.bags.set(id, bag);
      }
      i = bag.pop()!;
    } else {
      i = Math.min(n - 1, Math.floor(this.random() * n));
    }
    this.lastClip.set(id, i);
    const [lo, hi] = ev.pitch;
    const rate = lo + (hi - lo) * this.random();
    return { clip: ev.clips[i]!, rate, gainDb: ev.volume };
  }

  reset() {
    this.last.clear();
    this.seq.clear();
    this.bags.clear();
  }
}
