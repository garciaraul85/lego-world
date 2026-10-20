import type { ScreenEffect } from '../../core/effects/screen';

/** One colour laid over the whole view (a flash, a fade). */
export type ScreenLayer = { color: string; alpha: number };

type Active = { def: ScreenEffect; age: number; phase: number };

/** how long a screen effect lasts (its longest part) */
export function screenEffectLength(def: ScreenEffect): number {
  return Math.max(
    def.shake?.seconds ?? 0,
    def.flash?.seconds ?? 0,
    def.fade?.seconds ?? 0,
    def.slowMo?.seconds ?? 0,
    def.hitStop ?? 0,
  );
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * P23 part 2: the screen effects playing now. It runs on real time (a hit-stop must end even though the game
 * is frozen), and tells the game how fast to run (0 while a hit-stop holds, slower in slow motion), how far the
 * camera is shaken, and what colour is laid over the view. With Reduce motion on (a player setting), shakes are
 * a quarter as strong, flashes faint, and hit-stops and slow motion shorter.
 */
export class ScreenFx {
  reduceMotion = false;
  private list: Active[] = [];
  private stopLeft = 0;
  /** a fade to a colour that has finished stays until a fade in (or clear) */
  private held: string | null = null;
  private seed = 1;

  play(def: ScreenEffect) {
    const k = this.reduceMotion ? 0.5 : 1;
    if (def.hitStop) this.stopLeft = Math.max(this.stopLeft, def.hitStop * k);
    if (def.fade?.mode === 'in') this.held = null;
    this.seed = (this.seed * 16807) % 2147483647;
    this.list.push({ def, age: 0, phase: (this.seed % 1000) / 159 });
    // at most a dozen at once: the oldest go first
    if (this.list.length > 12) this.list.shift();
  }

  clear() {
    this.list = [];
    this.stopLeft = 0;
    this.held = null;
  }

  get count() {
    return this.list.length + (this.held ? 1 : 0);
  }

  /** Advance by real seconds. */
  step(realDt: number) {
    const dt = Math.max(0, realDt);
    this.stopLeft = Math.max(0, this.stopLeft - dt);
    for (const a of this.list) {
      a.age += dt;
      const f = a.def.fade;
      if (f?.mode === 'out' && a.age >= f.seconds) this.held = f.color;
    }
    this.list = this.list.filter((a) => a.age < screenEffectLength(a.def));
  }

  /** How fast the game runs now: 0 during a hit-stop, the slowest slow motion, else 1. */
  speed(): number {
    if (this.stopLeft > 0) return 0;
    let s = 1;
    for (const a of this.list) {
      const m = a.def.slowMo;
      if (!m || a.age >= m.seconds * (this.reduceMotion ? 0.6 : 1)) continue;
      // eases back to full speed over the last quarter
      const left = (m.seconds - a.age) / (m.seconds * 0.25);
      s = Math.min(s, m.speed + (1 - m.speed) * clamp01(1 - left));
    }
    return s;
  }

  /** How far the camera is moved now: sideways and up (studs), and its roll (radians). */
  shake(): [number, number, number] {
    let x = 0;
    let y = 0;
    let r = 0;
    for (const a of this.list) {
      const s = a.def.shake;
      if (!s || a.age >= s.seconds) continue;
      const left = 1 - a.age / s.seconds;
      const amp = s.strength * left * left * (this.reduceMotion ? 0.25 : 1);
      const f = s.rumble ? 7 : 23;
      const t = a.age * f + a.phase;
      x += amp * (Math.sin(t * 6.283) * 0.6 + Math.sin(t * 2.71 * 6.283) * 0.4);
      y += amp * (Math.cos(t * 1.37 * 6.283) * 0.6 + Math.sin(t * 3.1 * 6.283) * 0.3);
      r += amp * 0.04 * Math.sin(t * 0.83 * 6.283);
    }
    return [x, y, r];
  }

  /** The colours over the view now: fades first, flashes on top. */
  layers(): ScreenLayer[] {
    const out: ScreenLayer[] = [];
    if (this.held && !this.list.some((a) => a.def.fade?.mode === 'in')) out.push({ color: this.held, alpha: 1 });
    for (const a of this.list) {
      const f = a.def.fade;
      if (!f || a.age >= f.seconds) continue;
      const p = clamp01(a.age / f.seconds);
      const alpha = f.mode === 'out' ? p : f.mode === 'in' ? 1 - p : 1 - Math.abs(2 * p - 1);
      out.push({ color: f.color, alpha });
    }
    for (const a of this.list) {
      const fl = a.def.flash;
      if (!fl || a.age >= fl.seconds) continue;
      const left = 1 - a.age / fl.seconds;
      out.push({ color: fl.color, alpha: Math.min(this.reduceMotion ? 0.25 : 1, fl.alpha * left) });
    }
    return out;
  }
}
