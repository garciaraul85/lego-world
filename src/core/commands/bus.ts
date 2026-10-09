import type { ProjectStore } from '../project/store';
import type { Command, CommandHandler, DryRunResult, ExecuteResult, HistoryEntry, Source } from './types';

type Step = HistoryEntry & {
  before: Map<string, unknown | undefined>;
  after: Map<string, unknown | undefined>;
  bytes: number;
};

export type BusOptions = { maxSteps?: number; maxBytes?: number; now?: () => number };

/** Rough size of a before/after image, for the 64 MB history cap. Chunks are estimated, not stringified. */
function approxBytes(v: unknown): number {
  if (v === undefined) return 0;
  const bricks = (v as { bricks?: unknown[] }).bricks;
  if (Array.isArray(bricks)) return 64 + bricks.length * 40;
  return JSON.stringify(v).length;
}

/**
 * Every project edit goes through here: user tools, AI patches, tutorial steps, agent tools, the generator.
 * A list of commands is one transaction (all or nothing) and one undo step.
 */
export class CommandBus {
  private handlers = new Map<string, CommandHandler<unknown>>();
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private bytes = 0;
  private listeners = new Set<() => void>();
  private readonly maxSteps: number;
  private readonly maxBytes: number;
  private readonly now: () => number;

  constructor(
    readonly store: ProjectStore,
    opts: BusOptions = {},
  ) {
    this.maxSteps = opts.maxSteps ?? 200;
    this.maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
    this.now = opts.now ?? Date.now;
  }

  register<P>(type: string, handler: CommandHandler<P>): void {
    if (this.handlers.has(type)) throw new Error(`command ${type} already registered`);
    this.handlers.set(type, handler as CommandHandler<unknown>);
  }

  types(): string[] {
    return [...this.handlers.keys()].sort();
  }

  /** Runs commands as one transaction. Nothing changes if any command is invalid or throws. */
  execute(cmds: Command | Command[], opts: { source: Source; label?: string }): ExecuteResult {
    const list = Array.isArray(cmds) ? cmds : [cmds];
    const run = this.run(list);
    const step = run.ok ? run.step : null;
    if (!step) return run.result;
    if (step.touched.length) {
      step.label = opts.label ?? this.labelOf(list);
      step.source = opts.source;
      this.push(step);
      this.redoStack = [];
      this.emit();
    }
    return run.result;
  }

  /** Applies, captures a preview snapshot, then always rolls back. Used by AI review and tutorial checks. */
  dryRun(cmds: Command[]): DryRunResult {
    const run = this.run(cmds, true);
    return { ...run.result, preview: run.preview! };
  }

  undo(): boolean {
    const step = this.undoStack.pop();
    if (!step) return false;
    this.restore(step.before);
    this.bytes -= step.bytes;
    this.redoStack.push(step);
    this.emit();
    return true;
  }

  redo(): boolean {
    const step = this.redoStack.pop();
    if (!step) return false;
    this.restore(step.after);
    this.bytes += step.bytes;
    this.undoStack.push(step);
    this.emit();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  history(): ReadonlyArray<HistoryEntry> {
    return this.undoStack.map(({ label, source, at, touched }) => ({ label, source, at, touched }));
  }

  /** Called after every execute/undo/redo that changed history. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Drops all history (e.g. after loading another project). */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
    this.emit();
  }

  private labelOf(list: Command[]): string {
    const first = list[0];
    if (!first) return 'Nothing';
    const one = first.label ?? this.handlers.get(first.type)?.label?.(first.payload) ?? first.type;
    return list.length === 1 ? one : `${one} (+${list.length - 1})`;
  }

  private run(list: Command[], dry = false) {
    const before = new Map<string, unknown | undefined>();
    const store = this.store;
    let failure: ExecuteResult | null = null;
    let preview: ReturnType<ProjectStore['snapshot']> | undefined;
    const rollback = () => {
      for (const [p, v] of before) {
        if (v === undefined) store.remove(p);
        else store.put(p, v);
      }
    };
    store.transaction(
      () => {
        for (let i = 0; i < list.length; i++) {
          const cmd = list[i]!;
          const h = this.handlers.get(cmd.type);
          let error: string | null = h ? null : `Unknown command "${cmd.type}".`;
          if (h) {
            try {
              error = h.validate(store, cmd.payload);
              if (!error) h.apply(store, cmd.payload);
            } catch (e) {
              error = e instanceof Error ? e.message : String(e);
            }
          }
          if (error) {
            failure = { ok: false, error, failedAt: i, touched: [] };
            break;
          }
        }
        if (dry && !failure) preview = store.snapshot();
        if (failure || dry) rollback();
      },
      (path, value) => {
        if (!before.has(path)) before.set(path, value);
      },
    );
    if (failure) return { ok: false as const, result: failure as ExecuteResult, preview: store.snapshot() };
    const touched = [...before.keys()].sort();
    if (dry) return { ok: true as const, result: { ok: true, touched }, preview, step: null };
    const after = new Map(touched.map((p) => [p, store.get(p)]));
    // Paths written back to their original value are not a change.
    const changed = touched.filter((p) => before.get(p) !== after.get(p));
    let bytes = 0;
    for (const p of changed) bytes += approxBytes(before.get(p)) + approxBytes(after.get(p));
    const step: Step = { label: '', source: 'user', at: this.now(), touched: changed, before, after, bytes };
    return { ok: true as const, result: { ok: true, touched: changed }, step };
  }

  private restore(images: Map<string, unknown | undefined>) {
    this.store.transaction(() => {
      for (const [p, v] of images) {
        if (v === undefined) this.store.remove(p);
        else this.store.put(p, v);
      }
    });
  }

  private push(step: Step) {
    this.undoStack.push(step);
    this.bytes += step.bytes;
    while (this.undoStack.length > this.maxSteps || (this.bytes > this.maxBytes && this.undoStack.length > 1)) {
      const dropped = this.undoStack.shift()!;
      this.bytes -= dropped.bytes;
    }
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
