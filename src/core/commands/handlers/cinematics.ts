import { usesOf } from '../../audio/usage';
import { Cinematic, paths } from '../../schema';
import type { CommandHandler } from '../types';

const issue = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? null : `Not valid: ${r.error?.issues[0]?.path.join('.')} ${r.error?.issues[0]?.message}`;

export const MAX_CINEMATICS = 64;

/** cinematic.put: create or replace a whole scene (the Director edits by whole-file puts, one undo step each). */
export const putCinematic: CommandHandler<{ cinematic: Cinematic }> = {
  label: (p) => `Edit cinematic ${p.cinematic.name}`,
  validate(store, p) {
    const e = issue(Cinematic.safeParse(p.cinematic));
    if (e) return e;
    if (!store.has(paths.map(p.cinematic.map))) return 'The scene’s map does not exist.';
    if (!store.has(paths.cinematic(p.cinematic.id)) && store.list('cinematics/').length >= MAX_CINEMATICS)
      return `A project holds at most ${MAX_CINEMATICS} cinematics.`;
    return null;
  },
  apply: (store, p) => store.put(paths.cinematic(p.cinematic.id), p.cinematic),
};

export const deleteCinematic: CommandHandler<{ id: string }> = {
  label: () => 'Delete cinematic',
  validate(store, p) {
    if (!store.has(paths.cinematic(p.id))) return 'That cinematic does not exist.';
    const u = usesOf(store, p.id).filter((x) => x.path !== paths.cinematic(p.id));
    return u.length
      ? `Still used by ${u
          .map((x) => x.what)
          .slice(0, 3)
          .join(', ')}${u.length > 3 ? '…' : ''}.`
      : null;
  },
  apply: (store, p) => store.remove(paths.cinematic(p.id)),
};
