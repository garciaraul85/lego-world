/**
 * Step 13c: the magic meter. As in Zelda, the hero has no meter until it gets something that uses magic (the Lens
 * of Truth) or picks up a magic jar; then a green bar shows under the hearts. Magic lives in logic's variables
 * (magic, maxMagic, hasMagic), so logic, screens and saves see it as they see the hearts, and Set or Add variable
 * changes it. Items take it a whole unit at a time (a steady drain adds up the fractions in between).
 */
import type { Magic } from '../../core/items/magic';

export { MAGIC_DEFAULTS } from '../../core/items/magic';

/** what a magic jar fills (a big one fills the meter) */
export const MAGIC_JAR = 12;

type Vars = { get(k: string): unknown; has(k: string): boolean };

export class MagicMeter {
  /** the fraction of a unit a drain has taken but not yet counted */
  private owed = 0;
  constructor(
    private varsOf: () => Vars,
    private setVar: (k: string, v: unknown) => void,
    private settings: () => Magic,
  ) {}

  get on(): boolean {
    return this.settings().can;
  }
  /** the hero has a meter (it got something that uses magic, or a jar) */
  get has(): boolean {
    return !!this.varsOf().get('hasMagic');
  }
  get max(): number {
    return Math.max(1, Number(this.varsOf().get('maxMagic') ?? this.settings().max) || this.settings().max);
  }
  get now(): number {
    return Math.max(0, Math.min(this.max, Number(this.varsOf().get('magic') ?? 0) || 0));
  }

  /** the meter comes (full), unless the hero already has one */
  grant() {
    if (!this.on || this.has) return;
    this.setVar('maxMagic', this.settings().max);
    this.setVar('magic', this.settings().max);
    this.setVar('hasMagic', true);
  }

  /** some magic back (a jar); true when there was room for it */
  fill(n: number): boolean {
    if (!this.on) return false;
    if (!this.has) {
      this.grant();
      return true;
    }
    const before = this.now;
    this.setVar('magic', Math.min(this.max, before + n));
    return this.now > before;
  }

  /** take n at once (all or none): false when there is not enough */
  spend(n: number): boolean {
    if (!this.on) return true;
    if (this.now < n) return false;
    this.setVar('magic', this.now - n);
    return true;
  }

  /** a steady drain (per second): false when the meter has run dry */
  drain(perSecond: number, dt: number): boolean {
    if (!this.on) return true;
    this.owed += perSecond * dt;
    while (this.owed >= 1) {
      this.owed -= 1;
      if (!this.spend(1)) {
        this.owed = 0;
        return false;
      }
    }
    return this.now > 0;
  }

  reset() {
    this.owed = 0;
  }
}
