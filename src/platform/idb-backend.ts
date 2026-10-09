import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { FileBackend, ProjectMeta, WriteBatch } from '../core/project/backend';

interface BrickWorldsDB extends DBSchema {
  projects: { key: string; value: ProjectMeta };
  files: {
    key: [string, string];
    value: { projectId: string; path: string; text: string };
    indexes: { byProject: string };
  };
  media: {
    key: [string, string];
    value: { projectId: string; sha: string; blob: Blob };
    indexes: { byProject: string };
  };
}

export const DB_NAME = 'brickworlds';

/** Web, PWA, artifact and Capacitor storage: IndexedDB database "brickworlds" v1. */
export class IdbBackend implements FileBackend {
  private db: Promise<IDBPDatabase<BrickWorldsDB>>;

  constructor(name = DB_NAME) {
    this.db = openDB<BrickWorldsDB>(name, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('files', { keyPath: ['projectId', 'path'] }).createIndex('byProject', 'projectId');
        db.createObjectStore('media', { keyPath: ['projectId', 'sha'] }).createIndex('byProject', 'projectId');
      },
    });
  }

  async listProjects(): Promise<ProjectMeta[]> {
    return (await (await this.db).getAll('projects')).sort((a, b) => b.modified.localeCompare(a.modified));
  }

  async readFile(projectId: string, path: string): Promise<string | null> {
    return (await (await this.db).get('files', [projectId, path]))?.text ?? null;
  }

  async readAll(projectId: string): Promise<Map<string, string>> {
    const rows = await (await this.db).getAllFromIndex('files', 'byProject', projectId);
    return new Map(rows.map((r) => [r.path, r.text]));
  }

  async readMedia(projectId: string, sha: string): Promise<Blob | null> {
    return (await (await this.db).get('media', [projectId, sha]))?.blob ?? null;
  }

  async writeBatch(projectId: string, batch: WriteBatch): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(['files', 'media', 'projects'], 'readwrite');
    const files = tx.objectStore('files');
    const ops: Promise<unknown>[] = [];
    for (const { path, text } of batch.put) ops.push(files.put({ projectId, path, text }));
    for (const path of batch.del) ops.push(files.delete([projectId, path]));
    for (const m of batch.media ?? []) ops.push(tx.objectStore('media').put({ projectId, sha: m.sha, blob: m.blob }));
    const manifest = batch.put.find((f) => f.path === 'project.json');
    if (manifest) {
      const m = JSON.parse(manifest.text) as { name: string; modified: string };
      ops.push(tx.objectStore('projects').put({ id: projectId, name: m.name, modified: m.modified }));
    }
    await Promise.all([...ops, tx.done]);
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(['files', 'media', 'projects'], 'readwrite');
    const ops: Promise<unknown>[] = [tx.objectStore('projects').delete(projectId)];
    for (const store of ['files', 'media'] as const) {
      const keys = await tx.objectStore(store).index('byProject').getAllKeys(projectId);
      for (const k of keys) ops.push(tx.objectStore(store).delete(k));
    }
    await Promise.all([...ops, tx.done]);
  }

  /** Ask the browser not to evict our data (Platforms › storage eviction). */
  static async persist(): Promise<boolean> {
    return (await navigator.storage?.persist?.()) ?? false;
  }
}
