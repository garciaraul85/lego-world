import { hash64, utf8Length } from '../hash';
import { serializeFile } from '../json/stable';
import { type Project, paths } from '../schema';
import type { FileBackend } from './backend';
import type { ProjectStore } from './store';

export type SaveStatus = { state: 'saved' | 'saving' | 'unsaved' | 'error'; dirty: number; error?: string };

export type AutosaveOptions = {
  debounceMs?: number;
  /** retry delays after a failed write, ms */
  backoffMs?: number[];
  now?: () => string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

/**
 * Writes only dirty files, 2 s after the last change, in one atomic batch (plus project.json's index).
 * Call flush() on visibilitychange/pagehide/app pause. See Project files › Autosave.
 */
export class Autosave {
  private timer: unknown = null;
  private ownWrite = false;
  private retry = 0;
  private running: Promise<void> | null = null;
  private unsub: () => void;
  private listeners = new Set<(s: SaveStatus) => void>();
  status: SaveStatus = { state: 'saved', dirty: 0 };
  private readonly o: Required<AutosaveOptions>;

  constructor(
    private readonly store: ProjectStore,
    private readonly backend: FileBackend,
    opts: AutosaveOptions = {},
  ) {
    this.o = {
      debounceMs: opts.debounceMs ?? 2000,
      backoffMs: opts.backoffMs ?? [2000, 5000, 15000, 60000],
      now: opts.now ?? (() => new Date().toISOString()),
      setTimer: opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: opts.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>)),
    };
    this.unsub = store.subscribe('', (_changed) => {
      if (this.ownWrite) return; // our own project.json index update
      this.schedule(this.o.debounceMs);
      this.setStatus({ state: this.status.state === 'error' ? 'error' : 'unsaved', dirty: this.store.dirty().size });
    });
  }

  onStatus(fn: (s: SaveStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Save now. Resolves when the write finished (or failed and a retry is scheduled). */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.o.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.running) return this.running.then(() => (this.store.dirty().size ? this.flush() : undefined));
    this.running = this.write().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  dispose(): void {
    this.unsub();
    if (this.timer !== null) this.o.clearTimer(this.timer);
  }

  private schedule(ms: number) {
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private async write(): Promise<void> {
    const dirty = [...this.store.dirty()].filter((p) => !p.startsWith('.editor/'));
    if (!dirty.length) {
      this.setStatus({ state: 'saved', dirty: 0 });
      return;
    }
    this.setStatus({ state: 'saving', dirty: dirty.length });
    const put: { path: string; text: string }[] = [];
    const del: string[] = [];
    const written = new Map<string, unknown>();
    const project = this.store.manifest;
    const index: Project['files'] = { ...project.files };
    for (const path of dirty) {
      if (path === paths.project) continue;
      const value = this.store.get(path);
      written.set(path, value);
      if (value === undefined) {
        del.push(path);
        delete index[path];
      } else {
        const text = serializeFile(path, value);
        put.push({ path, text });
        index[path] = { hash: hash64(text), bytes: utf8Length(text) };
      }
    }
    // project.json is maintained by autosave: file index + modified time. Not an undoable edit.
    const manifest: Project = { ...project, modified: this.o.now(), files: index };
    this.ownWrite = true;
    try {
      this.store.put(paths.project, manifest);
    } finally {
      this.ownWrite = false;
    }
    written.set(paths.project, manifest);
    put.push({ path: paths.project, text: serializeFile(paths.project, manifest) });
    try {
      await this.backend.writeBatch(project.id, { put, del });
      // Only paths that did not change again while writing are clean.
      this.store.markSaved([...written].filter(([p, v]) => this.store.get(p) === v).map(([p]) => p));
      this.retry = 0;
      const left = this.store.dirty().size;
      this.setStatus({ state: left ? 'unsaved' : 'saved', dirty: left });
      if (left) this.schedule(this.o.debounceMs);
    } catch (e) {
      const delay = this.o.backoffMs[Math.min(this.retry, this.o.backoffMs.length - 1)]!;
      this.retry++;
      this.setStatus({
        state: 'error',
        dirty: this.store.dirty().size,
        error: e instanceof Error ? e.message : String(e),
      });
      this.schedule(delay);
    }
  }

  private setStatus(s: SaveStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }
}
