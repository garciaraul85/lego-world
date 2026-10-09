import type { Project } from '../schema';
import { paths, validateFile } from '../schema';

/** Frozen, structurally shared view of every file at one moment (Play runs on one). */
export type ProjectSnapshot = ReadonlyMap<string, unknown>;

export type StoreOptions = {
  /** Validate every put against its schema (default true). Turn off only for trusted bulk loads. */
  validate?: boolean;
  /** Deep-freeze stored values so accidental mutation throws (default true in tests, cheap enough for dev). */
  freeze?: boolean;
};

/** Called before a path is first written in a transaction; the bus uses it to capture undo before-images. */
export type WriteHook = (path: string, before: unknown | undefined) => void;

export class StoreValidationError extends Error {
  constructor(
    readonly path: string,
    readonly issues: { at: string; message: string }[],
  ) {
    super(`${path}: ${issues.map((i) => `${i.at || '(root)'} ${i.message}`).join('; ')}`);
  }
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/**
 * The in-memory project: path -> parsed JSON. Values are immutable; `put` replaces a whole file.
 * Only command handlers (through the CommandBus) call put/remove.
 */
export class ProjectStore {
  private files = new Map<string, unknown>();
  private dirtySet = new Set<string>();
  private listeners = new Set<{ prefix: string; fn: (changed: string[]) => void }>();
  private pending: Set<string> | null = null;
  private hook: WriteHook | null = null;
  private readonly validate: boolean;
  private readonly freeze: boolean;

  constructor(initial: Iterable<[string, unknown]> = [], opts: StoreOptions = {}) {
    this.validate = opts.validate ?? true;
    this.freeze = opts.freeze ?? true;
    for (const [p, v] of initial) {
      this.check(p, v);
      this.files.set(p, this.freeze ? deepFreeze(v) : v);
    }
  }

  get manifest(): Project {
    const m = this.files.get(paths.project);
    if (!m) throw new Error('project.json missing');
    return m as Project;
  }

  get<T>(path: string): T | undefined {
    return this.files.get(path) as T | undefined;
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  /** Paths starting with prefix, sorted. */
  list(prefix: string): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  keys(): IterableIterator<string> {
    return this.files.keys();
  }

  put(path: string, data: unknown): void {
    this.check(path, data);
    this.hook?.(path, this.files.get(path));
    this.files.set(path, this.freeze ? deepFreeze(data) : data);
    this.touch(path);
  }

  remove(path: string): void {
    if (!this.files.has(path)) return;
    this.hook?.(path, this.files.get(path));
    this.files.delete(path);
    this.touch(path);
  }

  /** Paths changed (written or removed) since the last markSaved. */
  dirty(): ReadonlySet<string> {
    return this.dirtySet;
  }

  markSaved(saved: Iterable<string>): void {
    for (const p of saved) this.dirtySet.delete(p);
  }

  /** fn receives the changed paths under prefix, once per transaction. Returns unsubscribe. */
  subscribe(prefix: string, fn: (changed: string[]) => void): () => void {
    const l = { prefix, fn };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  snapshot(): ProjectSnapshot {
    return new Map(this.files);
  }

  /**
   * Runs fn as one transaction: listeners are notified once at the end, with every path changed.
   * The bus wraps commands in this. `hook` sees each path's value before its first write.
   */
  transaction<T>(fn: () => T, hook?: WriteHook): T {
    if (this.pending) throw new Error('nested store transaction');
    this.pending = new Set();
    this.hook = hook ?? null;
    let changed: string[] = [];
    try {
      return fn();
    } finally {
      changed = [...this.pending];
      this.pending = null;
      this.hook = null;
      this.notify(changed);
    }
  }

  private touch(path: string) {
    this.dirtySet.add(path);
    if (this.pending) this.pending.add(path);
    else this.notify([path]);
  }

  private notify(changed: string[]) {
    if (!changed.length) return;
    for (const l of this.listeners) {
      const mine = changed.filter((p) => p.startsWith(l.prefix));
      if (mine.length) l.fn(mine);
    }
  }

  private check(path: string, data: unknown) {
    if (!this.validate) return;
    const issues = validateFile(path, data);
    if (issues.length) throw new StoreValidationError(path, issues);
  }
}
