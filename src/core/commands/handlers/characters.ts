import type { ProjectStore } from '../../project/store';
import { Character, Clip, type Instances, paths } from '../../schema';
import type { CommandHandler } from '../types';

const invalid = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? null : `Not valid: ${r.error?.issues[0]?.path.join('.')} ${r.error?.issues[0]?.message}`;

function usedByNpc(store: ProjectStore, id: string): boolean {
  return store
    .list('maps/')
    .some(
      (p) =>
        p.endsWith('/instances.json') &&
        store.get<Instances>(p)!.items.some((i) => i.kind === 'npc' && i.character === id),
    );
}

export const createCharacter: CommandHandler<{ character: Character }> = {
  label: (p) => `New character ${p.character.name}`,
  validate: (store, p) =>
    invalid(Character.safeParse(p.character)) ??
    (store.has(paths.character(p.character.id)) ? 'A character with that id already exists.' : null),
  apply: (store, p) => store.put(paths.character(p.character.id), p.character),
};

/** Replaces a character (look, gear, emotes...). The profile is checked with v68's CharacterCatalog by the editor. */
export const updateCharacter: CommandHandler<{ character: Character }> = {
  label: (p) => `Edit ${p.character.name}`,
  validate(store, p) {
    if (!store.has(paths.character(p.character.id))) return 'That character does not exist.';
    const e = invalid(Character.safeParse(p.character));
    if (e) return e;
    for (const c of p.character.emotes ?? []) if (!store.has(paths.clip(c))) return 'An emote clip is missing.';
    return null;
  },
  apply: (store, p) => store.put(paths.character(p.character.id), p.character),
};

export const deleteCharacter: CommandHandler<{ character: string }> = {
  label: () => 'Delete character',
  validate(store, p) {
    if (!store.has(paths.character(p.character))) return 'That character does not exist.';
    if (store.manifest.hero === p.character) return 'This is the player character. Choose another one first.';
    if (usedByNpc(store, p.character)) return 'A neighbor on a map uses this character.';
    return null;
  },
  apply: (store, p) => store.remove(paths.character(p.character)),
};

export const createClip: CommandHandler<{ clip: Clip }> = {
  label: (p) => `New clip ${p.clip.name ?? ''}`.trim(),
  validate: (store, p) =>
    invalid(Clip.safeParse(p.clip)) ??
    (store.has(paths.clip(p.clip.id)) ? 'A clip with that id already exists.' : null),
  apply: (store, p) => store.put(paths.clip(p.clip.id), p.clip),
};

/** Replaces a clip; keys are kept sorted by time and inside the clip's length. */
export const updateClip: CommandHandler<{ clip: Clip }> = {
  label: (p) => `Edit clip ${p.clip.name ?? ''}`.trim(),
  validate(store, p) {
    if (!store.has(paths.clip(p.clip.id))) return 'That clip does not exist.';
    const e = invalid(Clip.safeParse(p.clip));
    if (e) return e;
    for (const t of p.clip.tracks)
      for (const k of t.keys) if (k[0] > p.clip.length + 1e-9) return 'A key is after the end of the clip.';
    for (const ev of p.clip.events) if (ev.t > p.clip.length + 1e-9) return 'An event is after the end of the clip.';
    return null;
  },
  apply(store, p) {
    const clip = {
      ...p.clip,
      tracks: p.clip.tracks.map((t) => ({ ...t, keys: [...t.keys].sort((a, b) => a[0] - b[0]) })),
      events: [...p.clip.events].sort((a, b) => a.t - b.t),
    };
    store.put(paths.clip(p.clip.id), clip);
  },
};

export const deleteClip: CommandHandler<{ clip: string }> = {
  label: () => 'Delete clip',
  validate(store, p) {
    if (!store.has(paths.clip(p.clip))) return 'That clip does not exist.';
    const user = store
      .list('characters/')
      .map((x) => store.get<Character>(x)!)
      .find((c) => c.emotes?.includes(p.clip as never));
    return user ? `${user.name} uses this clip as an emote.` : null;
  },
  apply: (store, p) => store.remove(paths.clip(p.clip)),
};
