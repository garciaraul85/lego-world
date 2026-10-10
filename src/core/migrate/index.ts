import { hash64, utf8Length } from '../hash';
import { legacyId } from '../ids';
import { serializeFile } from '../json/stable';
import type { Project } from '../schema';
import { paths, validateFile } from '../schema';
import { normalizeLegacy } from './legacy-normalize';
import type { Problem } from './problems';
import { type V5Options, v4to5 } from './v4to5';

export type { Problem } from './problems';
export { type IdResolver, ids, piecesToChunks } from './v4to5';

export type MigrationResult = {
  files: Map<string, unknown>;
  problems: Problem[];
  /** schema version the input had (1-4 legacy) */
  from: number;
};

/** Rewrites project.json's `files` index from the other files. Mutates and returns the project. */
export function indexFiles(files: Map<string, unknown>): Project {
  const project = files.get(paths.project) as Project;
  const index: Project['files'] = {};
  for (const [path, value] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (path === paths.project || path.startsWith('.editor/')) continue;
    const text = serializeFile(path, value);
    index[path] = { hash: hash64(text), bytes: utf8Length(text) };
  }
  project.files = index;
  return project;
}

/**
 * Any LEGO World save (object or JSON text, versions 1-4) -> v5 project files.
 * Throws on input v68 itself would reject; everything v68 would keep is kept (unknown fields land in `legacy` blocks).
 */
export function migrate(input: unknown, opts: Partial<V5Options> = {}): MigrationResult {
  const problems: Problem[] = [];
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  const from = (raw as { version?: number })?.version ?? 0;
  const save = normalizeLegacy(raw, problems);
  const files = v4to5(
    save,
    {
      projectId: opts.projectId ?? legacyId('project', 1),
      name: opts.name ?? 'Imported LEGO World',
      now: opts.now ?? new Date().toISOString(),
      ...(opts.ids ? { ids: opts.ids } : {}),
    },
    problems,
  );
  indexFiles(files);
  for (const [path, value] of files) {
    for (const issue of validateFile(path, value))
      problems.push({ level: 'error', code: 'schema', message: `${issue.at}: ${issue.message}`, file: path });
  }
  return { files, problems, from };
}
