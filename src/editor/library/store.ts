import { signal } from '@preact/signals';
import type { LibraryItem } from '../../core/library/library';
import type { WriteBatch } from '../../core/project/backend';
import { IdbBackend } from '../../platform/idb-backend';

/**
 * Step 11, 4c: where My library lives: the same browser storage as the projects, under a name that is never a
 * project (so no project list shows it), one file per item. Every project open in this browser sees the same
 * library. Without browser storage (tests, a locked-down browser) it lasts until the page closes.
 */
export const LIBRARY_ID = '__library__';

type Backend = {
  readAll(projectId: string): Promise<Map<string, string>>;
  writeBatch(projectId: string, batch: WriteBatch): Promise<void>;
};

class MemoryBackend implements Backend {
  private files = new Map<string, string>();
  async readAll() {
    return new Map(this.files);
  }
  async writeBatch(_id: string, b: WriteBatch) {
    for (const f of b.put) this.files.set(f.path, f.text);
    for (const p of b.del) this.files.delete(p);
  }
}

const itemPath = (id: string) => `items/${id}.json`;

export class LibraryStore {
  readonly items = signal<LibraryItem[]>([]);
  readonly loaded = signal(false);
  /** the last item brought into a game, and whether a pack was exported (the Scripts and scenes course checks) */
  readonly lastUsed = signal<string | null>(null);
  readonly exported = signal(false);
  private backend: Backend;
  private loading: Promise<void> | null = null;

  constructor(backend?: Backend) {
    this.backend = backend ?? (typeof indexedDB !== 'undefined' ? new IdbBackend() : new MemoryBackend());
  }

  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const all = await this.backend.readAll(LIBRARY_ID);
        const items: LibraryItem[] = [];
        for (const [p, text] of all)
          if (p.startsWith('items/'))
            try {
              items.push(JSON.parse(text) as LibraryItem);
            } catch {
              /* a damaged item is skipped */
            }
        this.items.value = sortItems(items);
      } catch {
        this.backend = new MemoryBackend();
        this.items.value = [];
      }
      this.loaded.value = true;
    })();
    return this.loading;
  }

  /** adds items (an item already in the library under the same id is replaced) */
  async add(items: LibraryItem[]): Promise<void> {
    await this.load();
    await this.backend.writeBatch(LIBRARY_ID, {
      put: items.map((i) => ({ path: itemPath(i.id), text: JSON.stringify(i) })),
      del: [],
    });
    const ids = new Set(items.map((i) => i.id));
    this.items.value = sortItems([...this.items.value.filter((i) => !ids.has(i.id)), ...items]);
  }

  async remove(id: string): Promise<void> {
    await this.load();
    await this.backend.writeBatch(LIBRARY_ID, { put: [], del: [itemPath(id)] });
    this.items.value = this.items.value.filter((i) => i.id !== id);
  }
}

const sortItems = (xs: LibraryItem[]) =>
  [...xs].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

let shared: LibraryStore | null = null;
/** the browser's one library */
export const library = (): LibraryStore => {
  shared ??= new LibraryStore();
  return shared;
};
