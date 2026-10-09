/** Storage behind a project. The editor never touches IndexedDB, Tauri fs or Capacitor directly. */
export type ProjectMeta = { id: string; name: string; modified: string };

export interface WriteBatch {
  put: Array<{ path: string; text: string }>;
  del: string[];
  media?: Array<{ sha: string; blob: Blob }>;
}

export interface FileBackend {
  listProjects(): Promise<ProjectMeta[]>;
  /** JSON text of one file, or null */
  readFile(projectId: string, path: string): Promise<string | null>;
  /** every file of a project (used to open it) */
  readAll(projectId: string): Promise<Map<string, string>>;
  readMedia(projectId: string, sha: string): Promise<Blob | null>;
  /** atomic: all puts, deletes and media land, or none */
  writeBatch(projectId: string, batch: WriteBatch): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}

/** In-memory backend for tests and for the artifact before storage is granted. */
export class MemoryBackend implements FileBackend {
  readonly projects = new Map<string, { meta: ProjectMeta; files: Map<string, string>; media: Map<string, Blob> }>();
  /** set to make the next writeBatch fail (tests) */
  failNext = 0;
  writes = 0;

  async listProjects() {
    return [...this.projects.values()].map((p) => p.meta);
  }
  async readFile(id: string, path: string) {
    return this.projects.get(id)?.files.get(path) ?? null;
  }
  async readAll(id: string) {
    return new Map(this.projects.get(id)?.files ?? []);
  }
  async readMedia(id: string, sha: string) {
    return this.projects.get(id)?.media.get(sha) ?? null;
  }
  async writeBatch(id: string, batch: WriteBatch) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('simulated storage failure');
    }
    this.writes++;
    const p = this.projects.get(id) ?? { meta: { id, name: id, modified: '' }, files: new Map(), media: new Map() };
    this.projects.set(id, p);
    for (const { path, text } of batch.put) p.files.set(path, text);
    for (const path of batch.del) p.files.delete(path);
    for (const m of batch.media ?? []) p.media.set(m.sha, m.blob);
    const manifest = batch.put.find((f) => f.path === 'project.json');
    if (manifest) {
      const m = JSON.parse(manifest.text) as { name: string; modified: string };
      p.meta = { id, name: m.name, modified: m.modified };
    }
  }
  async deleteProject(id: string) {
    this.projects.delete(id);
  }
}
