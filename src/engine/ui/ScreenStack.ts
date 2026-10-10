import type { Screen } from '../../core/schema';

/**
 * The screens on top of the game (P5.8): push / pop / replace. Any visible screen with `pausesGame`
 * pauses the Runtime. The bottom is usually the HUD; title, pause and game over sit on top.
 */
export class ScreenStack {
  private stack: string[] = [];
  private listeners = new Set<() => void>();
  /** bumps on every change (renderers watch it) */
  serial = 0;

  constructor(private readonly resolve: (id: string) => Screen | undefined) {}

  get ids(): readonly string[] {
    return this.stack;
  }

  screens(): Screen[] {
    return this.stack.map((id) => this.resolve(id)).filter((s): s is Screen => !!s);
  }

  top(): Screen | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.resolve(this.stack[i]!);
      if (s) return s;
    }
    return undefined;
  }

  has(id: string) {
    return this.stack.includes(id);
  }

  /** shows a screen on top (moving it up if already shown); returns false for an unknown screen */
  push(id: string): boolean {
    if (!this.resolve(id)) return false;
    this.stack = [...this.stack.filter((x) => x !== id), id];
    this.changed();
    return true;
  }

  /** replaces the top screen */
  replace(id: string): boolean {
    if (!this.resolve(id)) return false;
    this.stack = [...this.stack.slice(0, -1).filter((x) => x !== id), id];
    this.changed();
    return true;
  }

  pop(): string | undefined {
    const id = this.stack.pop();
    if (id) this.changed();
    return id;
  }

  hide(id: string) {
    if (!this.stack.includes(id)) return;
    this.stack = this.stack.filter((x) => x !== id);
    this.changed();
  }

  set(ids: string[]) {
    this.stack = ids.filter((id) => this.resolve(id));
    this.changed();
  }

  /** true while a visible screen pauses the game */
  get pausesGame(): boolean {
    return this.screens().some((s) => s.pausesGame);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.serial++;
    for (const l of this.listeners) l();
  }
}
