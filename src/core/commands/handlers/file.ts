import { fileKindOf, paths } from '../../schema';
import type { CommandHandler } from '../types';

/** Low-level whole-file write. For tools that edit structured data with no dedicated command yet. */
export const putFile: CommandHandler<{ path: string; data: unknown }> = {
  label: (p) => `Edit ${p.path}`,
  validate(_store, p) {
    if (!fileKindOf(p.path)) return `${p.path} is not a project file path.`;
    if (p.path.startsWith('.editor/')) return 'Editor state is not changed through commands.';
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
