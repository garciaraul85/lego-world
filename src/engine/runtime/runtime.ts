/** One game system. `fixed` runs at exactly STEP seconds; `frame` once per rendered frame. */
export interface System<W> {
  id: string;
  fixed?(world: W, dt: number): void;
  frame?(world: W, dt: number): void;
}

export const STEP = 1 / 60;
const MAX_ACCUMULATED = 0.25;
const MAX_STEPS = 4;

/**
 * Fixed-timestep loop (plan: Architecture › Runtime loop): 60 Hz simulation, at most 4 steps per
 * frame and 0.25 s of backlog, so a slow frame slows the game instead of spiralling.
 */
export class Runtime<W> {
  private acc = 0;
  paused = false;
  timeScale = 1;
  ticks = 0;
  /** seconds of simulated time */
  time = 0;

  constructor(
    readonly world: W,
    readonly systems: System<W>[],
  ) {}

  /** Advance by real seconds; returns the number of fixed steps run. */
  advance(realDt: number): number {
    if (!this.paused) this.acc = Math.min(MAX_ACCUMULATED, this.acc + Math.max(0, realDt) * this.timeScale);
    let n = 0;
    while (!this.paused && this.acc >= STEP && n < MAX_STEPS) {
      this.fixedStep();
      this.acc -= STEP;
      n++;
    }
    if (n === MAX_STEPS) this.acc = Math.min(this.acc, STEP);
    for (const s of this.systems) s.frame?.(this.world, realDt);
    return n;
  }

  /** Exactly one fixed step, even while paused (the Step button). */
  stepOnce() {
    this.fixedStep();
    for (const s of this.systems) s.frame?.(this.world, 0);
  }

  private fixedStep() {
    for (const s of this.systems) s.fixed?.(this.world, STEP);
    this.ticks++;
    this.time += STEP;
  }
}
