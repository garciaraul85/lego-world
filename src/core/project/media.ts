import type { FileBackend } from './backend';

/**
 * Imported media blobs of the open project, by MediaRef (`sha256:<hex>`). New blobs are kept in
 * memory until autosave writes them in the same atomic batch as media/index.json.
 */
export class MediaStore {
  private cache = new Map<string, Blob>();
  private pending = new Map<string, Blob>();
  private urls = new Map<string, string>();

  constructor(
    private readonly backend: FileBackend | null,
    private readonly projectId: string,
  ) {}

  /** keep a blob (same ref = same bytes, so a second put is a no-op) */
  put(ref: string, blob: Blob) {
    if (this.cache.has(ref)) return;
    this.cache.set(ref, blob);
    this.pending.set(ref, blob);
  }

  async get(ref: string): Promise<Blob | null> {
    const hit = this.cache.get(ref);
    if (hit) return hit;
    const b = (await this.backend?.readMedia(this.projectId, ref.replace(/^sha256:/, ''))) ?? null;
    if (b) this.cache.set(ref, b);
    return b;
  }

  /** object URL for <img> (images on screens) */
  url(ref: string): string | undefined {
    const u = this.urls.get(ref);
    if (u) return u;
    const b = this.cache.get(ref);
    if (!b || typeof URL.createObjectURL !== 'function') {
      void this.get(ref);
      return undefined;
    }
    const nu = URL.createObjectURL(b);
    this.urls.set(ref, nu);
    return nu;
  }

  /** blobs not yet written; autosave takes them and gives them back on failure */
  takePending(): Array<{ sha: string; blob: Blob }> {
    const out = [...this.pending].map(([ref, blob]) => ({ sha: ref.replace(/^sha256:/, ''), blob }));
    this.pending.clear();
    return out;
  }

  restorePending(list: Array<{ sha: string; blob: Blob }>) {
    for (const m of list) this.pending.set(`sha256:${m.sha}`, m.blob);
  }

  get pendingCount() {
    return this.pending.size;
  }
}
