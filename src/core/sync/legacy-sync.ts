import type { Command } from '../commands/types';
import type { Id } from '../ids';
import { migrate } from '../migrate';
import type { ProjectStore } from '../project/store';
import { type Project, paths } from '../schema';

/**
 * Turns a fresh v68 save into the file commands that make the store equal to it.
 * Ids are derived from legacy ids, so an edit in LEGO World only touches the files it changed
 * (usually one or two chunk files). project.json keeps its identity, name and index; only
 * entry (active map) and hero follow the save.
 */
export function legacySyncCommands(store: ProjectStore, legacyText: string): Command[] {
  const { files } = migrate(legacyText, {
    projectId: store.manifest.id as Id<'project'>,
    name: store.manifest.name,
    now: store.manifest.modified,
  });
  const cmds: Command[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const [path, value] of files) {
    if (path === paths.project) continue;
    if (!same(store.get(path), value)) cmds.push({ type: 'file.put', payload: { path, data: value } });
  }
  for (const path of store.keys()) {
    if (path !== paths.project && !path.startsWith('.editor/') && !files.has(path))
      cmds.push({ type: 'file.delete', payload: { path } });
  }
  const next = files.get(paths.project) as Project;
  const cur = store.manifest;
  if (!same(cur.entry, next.entry) || cur.hero !== next.hero)
    cmds.push({
      type: 'file.put',
      payload: { path: paths.project, data: { ...cur, entry: next.entry, hero: next.hero } },
    });
  return cmds;
}
