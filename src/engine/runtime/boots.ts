/**
 * Step 13c: the hover boots (after Ocarina of Time's). Worn, they float: off an edge (or at the top of a jump) the
 * hero stays level in the air for HOVER_TIME seconds, carried on by the speed it had, then falls as ever. Their
 * soles hardly grip, on the ground or in the air: the feet push no harder than HOVER_GRIP·g (a = μg, as on ice),
 * so the hero speeds up, turns and stops slowly and slides on when the keys are let go, losing speed only to
 * HOVER_FRICTION·g. No running in them. While floating the legs paddle in short quick steps and the arms go out
 * for balance; a thin jet of air shows under each sole.
 */

import type { PoseParams } from '../character/routine';

/** how long the boots hold the hero level in the air, seconds */
export const HOVER_TIME = 1.5;
/** how hard the feet can push (μ, times g) on the ground and while hovering */
export const HOVER_GRIP = 0.16;
/** the little friction that slows a slide (μ, times g): more than ice, less than shoes */
export const HOVER_FRICTION = 0.12;
/** walking speed in them (no running) */
export const HOVER_WALK = 4;
/** the paddling steps a second */
export const PADDLE_HZ = 3.2;

export class HoverBoots {
  worn = false;
  /** floating now: seconds left, and the height held */
  hover: { left: number; y: number } | null = null;
  /** the float is used up until the boots touch the ground again */
  private used = false;
  /** seconds floated (the paddling's clock) */
  private t = 0;

  constructor(private h: { log(text: string): void; sound(id: 'hoverOn' | 'hoverEnd'): void }) {}

  /**
   * After the hero has been moved: begin, hold or end the float. Returns the height to hold the hero at (and its
   * fall stopped), or null.
   */
  step(s: { y: number; vy: number; grounded: boolean }, dt: number, can: boolean): number | null {
    if (!this.worn || !can || s.grounded) {
      if (s.grounded) {
        this.used = false;
        if (this.hover) this.h.log('Landed after floating');
      }
      if (this.hover) this.end(false);
      return null;
    }
    if (!this.hover && !this.used && s.vy <= 0) {
      this.hover = { left: HOVER_TIME, y: s.y };
      this.used = true;
      this.t = 0;
      this.h.sound('hoverOn');
      this.h.log('Hovering on the hover boots');
    }
    if (!this.hover) return null;
    this.hover.left -= dt;
    this.t += dt;
    if (this.hover.left <= 0) {
      this.end(true);
      return null;
    }
    return this.hover.y;
  }

  private end(ran: boolean) {
    this.hover = null;
    if (ran) {
      this.h.sound('hoverEnd');
      this.h.log('The hover boots ran out of float');
    }
  }

  /** a jump with them on floats again at its top */
  jumped() {
    this.used = false;
  }

  /**
   * The floating pose: short quick paddling steps (one leg forward as the other goes back, knees bending as each
   * comes through), the arms out to the sides and a little forward for balance, the body leaning a touch forward.
   * In the last half second the legs reach down, as for the drop.
   */
  pose(): PoseParams | null {
    if (!this.hover) return null;
    const ph = this.t * PADDLE_HZ * Math.PI * 2;
    const sw = Math.sin(ph);
    const end = Math.max(0, Math.min(1, (0.5 - this.hover.left) / 0.5));
    const a = 0.42 * (1 - end * 0.6);
    return {
      ll: [-a * sw - 0.1, 0, -0.04],
      rl: [a * sw - 0.1, 0, 0.04],
      lk: 0.25 + 0.45 * Math.max(0, sw) * (1 - end),
      rk: 0.25 + 0.45 * Math.max(0, -sw) * (1 - end),
      la: [-0.45, 0, -1.05 + 0.08 * Math.sin(ph * 0.5)],
      ra: [-0.45, 0, 1.05 - 0.08 * Math.sin(ph * 0.5)],
      le: -0.35,
      re: -0.35,
      lean: 0.12,
    };
  }

  /** the jet under the soles, 0 to 1 (it flickers with the steps) */
  get jet(): number {
    if (!this.hover) return 0;
    return 0.7 + 0.3 * Math.abs(Math.sin(this.t * 19));
  }

  reset() {
    this.worn = false;
    this.hover = null;
    this.used = false;
    this.t = 0;
  }
}
