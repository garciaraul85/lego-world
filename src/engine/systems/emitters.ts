import type { EmitterInstance } from '../../core/schema';
import type { AudioPort, Vec3 } from '../audio/port';

/**
 * Sound emitters placed in maps (P5.5). Loops play while the hero is within maxDistance and stop
 * beyond it (culled); interval emitters play their event every [min, max] seconds while in range.
 */
export class EmitterSystem {
  private next = new Map<string, number>();
  private looping = new Set<string>();

  constructor(private readonly random: () => number = Math.random) {}

  step(emitters: readonly EmitterInstance[], ear: Vec3, now: number, audio: AudioPort) {
    const seen = new Set<string>();
    for (const e of emitters) {
      const key = `em:${e.id}`;
      seen.add(key);
      const d = Math.hypot(e.pos[0] - ear[0], e.pos[1] - ear[1], e.pos[2] - ear[2]);
      const inRange = d <= e.maxDistance;
      if (e.mode === 'loop') {
        if (inRange) {
          audio.loop(key, e.sound, { pos: e.pos as Vec3, volume: e.volume, maxDistance: e.maxDistance });
          this.looping.add(key);
        } else if (this.looping.delete(key)) audio.stopLoop(key);
        continue;
      }
      if (!inRange) {
        this.next.delete(key);
        continue;
      }
      const due = this.next.get(key);
      if (due === undefined) {
        this.next.set(key, now + this.wait(e) * this.random());
        continue;
      }
      if (now < due) continue;
      audio.play(e.sound, { pos: e.pos as Vec3, volume: e.volume });
      this.next.set(key, now + this.wait(e));
    }
    for (const key of [...this.looping])
      if (!seen.has(key)) {
        this.looping.delete(key);
        audio.stopLoop(key);
      }
  }

  private wait(e: EmitterInstance) {
    const [lo, hi] = e.interval;
    return Math.min(lo, hi) + Math.abs(hi - lo) * this.random();
  }

  /** stop every loop (map change, Stop) */
  reset(audio: AudioPort) {
    for (const key of this.looping) audio.stopLoop(key);
    this.looping.clear();
    this.next.clear();
  }

  get active() {
    return [...this.looping];
  }
}
