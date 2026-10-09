import type { Problem } from '../migrate/problems';
import { paths, validateFile } from '../schema';
import type { FileBackend } from './backend';
import { ProjectStore } from './store';

/** Opens a stored project. Invalid files are still loaded and reported as Problems, never dropped. */
export async function loadProject(
  backend: FileBackend,
  projectId: string,
): Promise<{ store: ProjectStore; problems: Problem[] }> {
  const texts = await backend.readAll(projectId);
  if (!texts.has(paths.project)) throw new Error(`project ${projectId} not found`);
  const problems: Problem[] = [];
  const entries: [string, unknown][] = [];
  for (const [path, text] of texts) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      problems.push({
        level: 'error',
        code: 'load.json',
        message: 'File is not valid JSON; it was skipped.',
        file: path,
      });
      continue;
    }
    for (const i of validateFile(path, value))
      problems.push({ level: 'error', code: 'load.schema', message: `${i.at}: ${i.message}`, file: path });
    entries.push([path, value]);
  }
  const store = new ProjectStore(entries, { validate: true, validateInitial: false });
  return { store, problems };
}

/** Writes every file of a store as one batch (new project, import, "Save as"). */
export async function saveAll(
  backend: FileBackend,
  store: ProjectStore,
  serialize: (path: string, v: unknown) => string,
): Promise<void> {
  const put = [...store.keys()]
    .filter((p) => !p.startsWith('.editor/'))
    .map((path) => ({ path, text: serialize(path, store.get(path)) }));
  await backend.writeBatch(store.manifest.id, { put, del: [] });
  store.markSaved(put.map((f) => f.path));
}
