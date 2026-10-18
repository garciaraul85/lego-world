import { EMPTY_PROGRESS, ProgressDoc } from '../../save/progress';
import { paths } from '../../schema';
import type { CommandHandler } from '../types';

/**
 * P26: the game's progress setup (game/progress.json): achievements, collections, best scores, new game plus.
 * The whole document is put at once; every list keeps unique ids (achievements), items and variables.
 */
export const putProgress: CommandHandler<{ progress: ProgressDoc }> = {
  label: () => 'Progress',
  validate(_store, p) {
    const r = ProgressDoc.safeParse(p.progress);
    if (!r.success) return `Progress: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    const dup = (xs: string[]) => xs.find((x, i) => xs.indexOf(x) !== i);
    const a = dup(p.progress.achievements.map((x) => x.id));
    if (a) return `Two achievements have the id “${a}”.`;
    const c = dup(p.progress.collections.map((x) => x.item));
    if (c) return `“${c}” is counted twice in Collections.`;
    const b = dup(p.progress.bests.map((x) => x.var));
    if (b) return `“${b}” is listed twice in Best scores.`;
    return null;
  },
  apply(store, p) {
    store.put(paths.progress, ProgressDoc.parse(p.progress));
  },
};

/** the game's progress setup (an empty one when the game has none yet) */
export const progressOf = (get: (path: string) => unknown): ProgressDoc =>
  (get(paths.progress) as ProgressDoc | undefined) ?? EMPTY_PROGRESS;
