/**
 * Step 13c: the Lens of Truth. Its item button holds it up to the eye (or puts it down): while it is up it takes
 * magic, a little at a time, and the view takes a purple tint inside a ring. Through it, hidden things show (an
 * invisible platform, a hidden chest or door: unseen, but solid all the same) and fake things go
 * see-through (a wall or floor that only looks solid: the hero walks or falls through it either way).
 */
import type { Asset } from '../../core/schema';

/** magic a second while the Lens is up (a full meter of 48 lasts 12 seconds) */
export const LENS_DRAIN = 4;
/** how long the view takes to tint (and clear), seconds */
export const LENS_FADE = 0.25;
/** how see-through a fake thing is through the Lens, and how a hidden one shows */
export const FAKE_ALPHA = 0.28;
export const HIDDEN_ALPHA = 0.72;

type Inst = { def: Pick<Asset, 'hidden' | 'fake' | 'bricks'>; inst: { idBase: number; id: string } };

/** the brick id ranges of the hidden and the fake things of a map (each [first, last + 1]) */
export function lensRanges(instances: readonly Inst[]): { hidden: [number, number][]; fake: [number, number][] } {
  const hidden: [number, number][] = [];
  const fake: [number, number][] = [];
  for (const i of instances) {
    const r: [number, number] = [i.inst.idBase, i.inst.idBase + i.def.bricks.length];
    if (i.def.fake) fake.push(r);
    else if (i.def.hidden) hidden.push(r);
  }
  return { hidden, fake };
}

export const inRanges = (id: number | undefined, rs: readonly (readonly [number, number])[]) =>
  id !== undefined && rs.some(([lo, hi]) => id >= lo && id < hi);

export class Lens {
  /** held up to the eye */
  on = false;
  /** how far the view is tinted (0 to 1: it fades in and out) */
  amount = 0;

  constructor(
    private h: {
      /** take a steady drain of magic: false when the meter ran dry */
      drain(perSecond: number, dt: number): boolean;
      has(): boolean;
      say(text: string, seconds: number): void;
      log(text: string): void;
      sound(id: 'lensOn' | 'lensOff'): void;
    },
  ) {}

  /** its item button: up to the eye, or down */
  toggle(): boolean {
    if (this.on) {
      this.put();
      return false;
    }
    if (!this.h.has()) {
      this.h.say('No magic left: the Lens needs magic to see through.', 2);
      return false;
    }
    this.on = true;
    this.h.sound('lensOn');
    this.h.log('Looking through the Lens of Truth');
    return true;
  }

  put() {
    if (!this.on) return;
    this.on = false;
    this.h.sound('lensOff');
    this.h.log('Put the Lens of Truth down');
  }

  step(dt: number) {
    if (this.on && !this.h.drain(LENS_DRAIN, dt)) {
      this.put();
      this.h.say('Out of magic: the Lens goes dark.', 2);
    }
    const to = this.on ? 1 : 0;
    const d = dt / LENS_FADE;
    this.amount = this.amount < to ? Math.min(to, this.amount + d) : Math.max(to, this.amount - d);
  }

  /** how a hidden thing shows now (0: not at all) */
  get hiddenAlpha(): number {
    return this.amount * HIDDEN_ALPHA;
  }
  /** how a fake thing shows now (1: as solid as it looks, without the Lens) */
  get fakeAlpha(): number {
    return 1 - this.amount * (1 - FAKE_ALPHA);
  }

  /** the arm up, the lens at the right eye (measured with Session.gripPoints) */
  pose() {
    return this.on || this.amount > 0.5 ? LENS_POSE : null;
  }

  reset() {
    this.on = false;
    this.amount = 0;
  }
}

/**
 * The right hand up in front of the right eye, the forearm upright and the elbow down by the chest (as one holds a
 * magnifying glass to the eye): measured with Session.gripPoints and checked from the front, side and back.
 */
export const LENS_POSE: { ra: [number, number, number]; re: number } = { ra: [-0.6, -0.3, -0.3], re: -2.1 };
