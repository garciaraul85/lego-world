import { fileKindOf, paths } from '../../schema';
import type { CommandHandler } from '../types';

/** Low-level whole-file write. For tools that edit structured data with no dedicated command yet. */
export const putFile: CommandHandler<{ path: string; data: unknown }> = {
  label: (p) => `Edit ${p.path}`,
  validate(store, p) {
    if (!fileKindOf(p.path)) return `${p.path} is not a project file path.`;
    if (p.path.startsWith('.editor/')) return 'Editor state is not changed through commands.';
    if (p.path === paths.project) {
      const cur = store.manifest;
      const next = p.data as { id?: string; files?: unknown };
      if (next.id !== cur.id) return 'The project id cannot change.';
      if (JSON.stringify(next.files) !== JSON.stringify(cur.files)) return 'The file index is maintained by autosave.';
    }
    return null;
  },
  apply: (store, p) => store.put(p.path, p.data),
};

export const deleteFile: CommandHandler<{ path: string }> = {
  label: (p) => `Delete ${p.path}`,
  validate(store, p) {
    if (p.path === paths.project) return 'project.json cannot be deleted.';
    return store.has(p.path) ? null : `${p.path} does not exist.`;
  },
  apply: (store, p) => store.remove(p.path),
};
