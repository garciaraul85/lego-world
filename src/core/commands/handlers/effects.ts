import { BUILTIN_EFFECTS } from '../../../builtin/effects';
import { Effect, MAX_EFFECTS } from '../../effects/schema';
import { type Instances, type Project, paths } from '../../schema';
import type { CommandHandler } from '../types';

type Store = { list(p: string): string[]; get<T>(p: string): T | undefined; manifest: Project };

/** where an effect is used: placed on maps, and the game's hit and event effects */
export function effectUses(store: Store, id: string): string[] {
  const out: string[] = [];
  for (const p of store.list('maps/'))
    if (p.endsWith('/instances.json'))
      for (const i of store.get<Instances>(p)?.items ?? [])
        if (i.kind === 'effect' && i.effect === id) out.push(i.name ?? 'an effect on a map');
  const h = store.manifest.effects;
  for (const [k, v] of Object.entries(h?.hits ?? {})) if (v === id) out.push(`${k} hits`);
  for (const [k, v] of Object.entries(h?.events ?? {})) if (v === id) out.push(k);
  return out;
}

/** P23: an effect of the game's own, put whole (each edit in the Effects screen is one undo step). */
export const putEffect: CommandHandler<{ effect: Effect }> = {
  label: (p) => `Edit effect ${p.effect.name}`,
  validate(store, p) {
    const r = Effect.safeParse(p.effect);
    if (!r.success) return `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    if (BUILTIN_EFFECTS.some((e) => e.id === p.effect.id)) return 'A built-in effect cannot be changed: make a copy.';
    if (!store.has(paths.effect(p.effect.id)) && store.list(paths.effectDir).length >= MAX_EFFECTS)
      return `A game holds at most ${MAX_EFFECTS} effects of its own.`;
    return null;
  },
  apply: (store, p) => store.put(paths.effect(p.effect.id), Effect.parse(p.effect)),
};

export const deleteEffect: CommandHandler<{ id: string }> = {
  label: () => 'Delete effect',
  validate(store, p) {
    if (!store.has(paths.effect(p.id))) return 'That effect does not exist.';
    const u = effectUses(store, p.id);
    return u.length ? `Still used by ${u.slice(0, 3).join(', ')}${u.length > 3 ? '…' : ''}.` : null;
  },
  apply: (store, p) => store.remove(paths.effect(p.id)),
};
