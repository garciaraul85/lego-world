import { HairStyle, MAX_HAIRSTYLES } from '../../character/hair';
import { type Character, paths } from '../../schema';
import type { CommandHandler } from '../types';

/** characters whose hair came from this library hairstyle (they keep their own copy) */
export function hairStyleUses(store: { list(p: string): string[]; get<T>(p: string): T | undefined }, id: string) {
  return store
    .list('characters/')
    .map((p) => store.get<Character>(p)!)
    .filter((c) => (c?.profile?.customHair as { from?: string } | undefined)?.from === id)
    .map((c) => c.name);
}

/** Milestone 3, 10d part 3: a hairstyle in My library, put whole (save or rename one) */
export const putHairStyle: CommandHandler<{ style: HairStyle }> = {
  label: (p) => `Hairstyle ${p.style.name}`,
  validate(store, p) {
    const r = HairStyle.safeParse(p.style);
    if (!r.success) return `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    if (!store.has(paths.hairstyle(p.style.id)) && store.list(paths.hairstyleDir).length >= MAX_HAIRSTYLES)
      return `My library holds at most ${MAX_HAIRSTYLES} hairstyles.`;
    return null;
  },
  apply: (store, p) => store.put(paths.hairstyle(p.style.id), HairStyle.parse(p.style)),
};

/** Characters that wear it keep their copy of the hair. */
export const deleteHairStyle: CommandHandler<{ id: string }> = {
  label: () => 'Delete hairstyle',
  validate: (store, p) => (store.has(paths.hairstyle(p.id)) ? null : 'That hairstyle is not in My library.'),
  apply: (store, p) => store.remove(paths.hairstyle(p.id)),
};
