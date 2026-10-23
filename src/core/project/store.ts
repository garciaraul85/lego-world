import { upgradeManifest } from '../migrate/v5to6';
import type { Project } from '../schema';
import { type Chunk, packChunk, paths, validateFile } from '../schema';

const CHUNK_PATH = /^maps\/map_[0-9a-z]{10}\/chunks\/-?\d+_-?\d+\.json$/;

/** Frozen, structurally shared view of every file at one moment (Play runs on one). */
export type ProjectSnapshot = ReadonlyMap<string, unknown>;

export type StoreOptions = {
  /** Validate every put against its schema (default true). Turn off only for trusted bulk loads. */
  validate?: boolean;
  /** Deep-freeze stored values so accidental mutation throws (default true in tests, cheap enough for dev). */
  freeze?: boolean;
  /** Validate the initial files (default true). The loader turns this off and reports problems itself. */
  validateInitial?: boolean;
};

/** Called before a path is first written in a transaction; the bus uses it to capture undo before-images. */
export type WriteHook = (path: string, before: unknown | undefined) => void;

export class StoreValidationError extends Error {
  constructor(
    readonly path: string,
    readonly issues: { at: string; message: string }[],
  ) {
    // a long list (thousands of items) shows its first few and how many more
    const shown = issues.slice(0, 3).map((i) => `${i.at || '(root)'} ${i.message}`);
    const more = issues.length > 3 ? ` (and ${(issues.length - 3).toLocaleString('en-US')} more)` : '';
    super(`${path}: ${shown.join('; ')}${more}`);
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
  /** P27 part 3: each path's value before its first write in the open transaction */
  private txBefore: Map<string, unknown> | null = null;
  private muted = 0;
  private hook: WriteHook | null = null;
  private readonly validate: boolean;
  private readonly freeze: boolean;

  constructor(initial: Iterable<[string, unknown]> = [], opts: StoreOptions = {}) {
    this.validate = opts.validate ?? true;
    this.freeze = opts.freeze ?? true;
    for (const [p, v0] of initial) {
      // P18: an older project.json (schema 5) is upgraded as it opens, and saved upgraded
      // P27 part 3: chunks of one list per brick are packed as they open (5 times smaller in memory and on disk)
      const v =
        p === paths.project
          ? upgradeManifest(v0)
          : CHUNK_PATH.test(p) && v0 && typeof v0 === 'object' && 'bricks' in v0
            ? packChunk(v0 as Chunk)
            : v0;
      if (v !== v0) this.dirtySet.add(p);
      if (opts.validateInitial ?? true) this.check(p, v);
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
    if (this.txBefore && !this.txBefore.has(path)) this.txBefore.set(path, this.files.get(path));
    this.files.set(path, this.freeze ? deepFreeze(data) : data);
    this.touch(path);
  }

  remove(path: string): void {
    if (!this.files.has(path)) return;
    this.hook?.(path, this.files.get(path));
    if (this.txBefore && !this.txBefore.has(path)) this.txBefore.set(path, this.files.get(path));
    this.files.delete(path);
    this.touch(path);
  }

  /** Paths changed (written or removed) since the last markSaved. */
  dirty(): ReadonlySet<string> {
    return this.dirtySet;
  }

  /** Marks files as needing a save without changing them (e.g. a new project's first write goes through autosave). */
  markDirty(changed: Iterable<string>): void {
    for (const p of changed) this.dirtySet.add(p);
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
    this.txBefore = new Map();
    this.hook = hook ?? null;
    let changed: string[] = [];
    try {
      return fn();
    } finally {
      changed = [...this.pending];
      this.pending = null;
      this.txBefore = null;
      this.hook = null;
      this.notify(changed);
    }
  }

  /** Inside a transaction: the paths written so far, each with its value before (undefined: it was new). */
  txChanges(): ReadonlyMap<string, unknown> | null {
    return this.txBefore;
  }

  private touch(path: string) {
    this.dirtySet.add(path);
    if (this.pending) this.pending.add(path);
    else this.notify([path]);
  }

  /**
   * Runs fn without telling anyone: no listeners, no dirty marks. For trying a change and rolling it back
   * (the bus's check), so a drag can show "can't go here" without rebuilding the scene on every move.
   */
  silently<T>(fn: () => T): T {
    const dirty = new Set(this.dirtySet);
    this.muted++;
    try {
      return fn();
    } finally {
      this.muted--;
      this.dirtySet = dirty;
    }
  }

  private notify(changed: string[]) {
    if (!changed.length || this.muted) return;
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
