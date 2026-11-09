import { usesOf } from '../../audio/usage';
import { isId } from '../../ids';
import { mediaUses } from '../../media/uses';
import type { ProjectStore } from '../../project/store';
import { MediaIndex, Mixer, Music, paths, type Screen, Screen as ScreenSchema, SoundEvents } from '../../schema';
import type { CommandHandler } from '../types';

type SoundEvent = SoundEvents['events'][string];
type MusicState = Music['states'][string];
const EMPTY_MUSIC: Music = { states: {}, crossfade: 1.5, stingers: {} };
const issue = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? null : `Not valid: ${r.error?.issues[0]?.path.join('.')} ${r.error?.issues[0]?.message}`;

const usedMsg = (store: ProjectStore, id: string) => {
  const u = usesOf(store, id);
  return u.length
    ? `Still used by ${u
        .map((x) => x.what)
        .slice(0, 3)
        .join(', ')}${u.length > 3 ? '…' : ''}.`
    : null;
};

/**
 * audio.setEvent: create, change or (event: null) remove one sound event in audio/events.json.
 * Removing a project event that overrides a built-in brings the built-in back.
 */
export const setSoundEvent: CommandHandler<{ id: string; event: SoundEvent | null; builtin?: boolean }> = {
  label: (p) => (p.event ? `Edit sound ${p.event.name ?? p.id}` : 'Delete sound event'),
  validate(store, p) {
    if (!isId('sound', p.id)) return 'Sound ids look like snd_ and 10 letters or digits.';
    if (!p.event) {
      if (!store.get<SoundEvents>(paths.soundEvents)?.events[p.id]) return 'That sound event is not in the project.';
      return p.builtin ? null : usedMsg(store, p.id);
    }
    return issue(SoundEvents.safeParse({ events: { [p.id]: p.event } }));
  },
  apply(store, p) {
    const cur = store.get<SoundEvents>(paths.soundEvents) ?? { events: {} };
    const events = { ...cur.events };
    if (p.event) events[p.id] = p.event;
    else delete events[p.id];
    if (Object.keys(events).length) store.put(paths.soundEvents, { events });
    else store.remove(paths.soundEvents);
  },
};

export const setMusicState: CommandHandler<{ id: string; state: MusicState | null; builtin?: boolean }> = {
  label: (p) => (p.state ? `Edit music ${p.state.name ?? p.id}` : 'Delete music'),
  validate(store, p) {
    if (!isId('music', p.id)) return 'Music ids look like mus_ and 10 letters or digits.';
    if (!p.state) {
      if (!store.get<Music>(paths.music)?.states[p.id]) return 'That music is not in the project.';
      return p.builtin ? null : usedMsg(store, p.id);
    }
    return issue(Music.safeParse({ ...EMPTY_MUSIC, states: { [p.id]: p.state } }));
  },
  apply(store, p) {
    const cur = store.get<Music>(paths.music) ?? EMPTY_MUSIC;
    const states = { ...cur.states };
    if (p.state) states[p.id] = p.state;
    else delete states[p.id];
    store.put(paths.music, { ...cur, states });
  },
};

export const setMusicSettings: CommandHandler<{ crossfade?: number; stingers?: Music['stingers'] }> = {
  label: () => 'Edit music settings',
  validate: (store, p) => {
    const cur = store.get<Music>(paths.music) ?? EMPTY_MUSIC;
    return issue(Music.safeParse({ ...cur, ...p }));
  },
  apply(store, p) {
    const cur = store.get<Music>(paths.music) ?? EMPTY_MUSIC;
    store.put(paths.music, { ...cur, ...p });
  },
};

/** audio.setMixer: bus faders (dB) and ducking rules. `base` is the mixer in effect (defaults) when no file exists yet. */
export const setMixer: CommandHandler<{ base: Mixer; buses?: Partial<Mixer['buses']>; duck?: Mixer['duck'] }> = {
  label: (p) => (p.duck ? 'Edit ducking' : `Mixer ${Object.keys(p.buses ?? {}).join(', ')}`),
  validate(store, p) {
    const cur = store.get<Mixer>(paths.mixer) ?? p.base;
    return issue(Mixer.safeParse({ buses: { ...cur.buses, ...p.buses }, duck: p.duck ?? cur.duck }));
  },
  apply(store, p) {
    const cur = store.get<Mixer>(paths.mixer) ?? p.base;
    store.put(paths.mixer, { buses: { ...cur.buses, ...p.buses }, duck: p.duck ?? cur.duck });
  },
};

/** media.register: records an imported file in media/index.json (the blob itself is stored by hash). */
export const registerMedia: CommandHandler<{ ref: string; entry: MediaIndex['items'][string] }> = {
  label: (p) => `Import ${p.entry.name}`,
  validate(store, p) {
    if (!/^sha256:[0-9a-f]{64}$/.test(p.ref)) return 'Media refs look like sha256:<64 hex>.';
    return store.get<MediaIndex>(paths.media)?.items[p.ref] ? 'That file is already imported.' : null;
  },
  apply(store, p) {
    const cur = store.get<MediaIndex>(paths.media) ?? { items: {} };
    store.put(paths.media, { items: { ...cur.items, [p.ref]: p.entry } });
  },
};

export const removeMedia: CommandHandler<{ ref: string }> = {
  label: () => 'Remove imported media',
  validate(store, p) {
    if (!store.get<MediaIndex>(paths.media)?.items[p.ref]) return 'That media file is not in the project.';
    // step 11 (P24 part 3): every file that names it (art and characters too, not only screens, sounds and maps)
    const u = mediaUses(store, p.ref);
    return u.length
      ? `Still used by ${u
          .slice(0, 3)
          .map((x) => x.what)
          .join(', ')}${u.length > 3 ? '…' : ''}.`
      : null;
  },
  apply(store, p) {
    const cur = store.get<MediaIndex>(paths.media)!;
    const items = { ...cur.items };
    delete items[p.ref];
    store.put(paths.media, { items });
  },
};

type MediaItem = MediaIndex['items'][string];

/** step 11 (P24 part 3): rename an imported file, or say who made it (its credit) */
export const updateMedia: CommandHandler<{ ref: string; name?: string; credit?: MediaItem['credit'] | null }> = {
  label: (p) => (p.credit !== undefined ? 'Credit media' : 'Rename media'),
  validate(store, p) {
    const cur = store.get<MediaIndex>(paths.media)?.items[p.ref];
    if (!cur) return 'That media file is not in the project.';
    if (p.name !== undefined && !p.name.trim()) return 'A name is needed.';
    const next = MediaIndex.safeParse({ items: { [p.ref]: patched(cur, p) } });
    return issue(next);
  },
  apply(store, p) {
    const cur = store.get<MediaIndex>(paths.media)!;
    store.put(paths.media, { items: { ...cur.items, [p.ref]: patched(cur.items[p.ref]!, p) } });
  },
};
function patched(cur: MediaItem, p: { name?: string; credit?: MediaItem['credit'] | null }): MediaItem {
  const next: MediaItem = { ...cur };
  if (p.name !== undefined) next.name = p.name.trim().slice(0, 120);
  if (p.credit === null || (p.credit && !p.credit.author.trim() && !p.credit.license.trim() && !p.credit.link?.trim()))
    delete next.credit;
  else if (p.credit)
    next.credit = {
      author: p.credit.author.trim(),
      license: p.credit.license.trim(),
      ...(p.credit.link?.trim() ? { link: p.credit.link.trim() } : {}),
    };
  return next;
}

/**
 * step 11 (P24 part 3): one file stands in for another everywhere it is used (a shrunk picture for the big one):
 * every project file naming `from` names `to`, which is registered with `entry`; `from` leaves the project.
 */
export const replaceMedia: CommandHandler<{ from: string; to: string; entry: MediaItem }> = {
  label: (p) => `Replace ${p.entry.name}`,
  validate(store, p) {
    const items = store.get<MediaIndex>(paths.media)?.items ?? {};
    if (!items[p.from]) return 'That media file is not in the project.';
    if (!/^sha256:[0-9a-f]{64}$/.test(p.to)) return 'Media refs look like sha256:<64 hex>.';
    if (p.to === p.from) return 'It is the same file.';
    return issue(MediaIndex.safeParse({ items: { [p.to]: p.entry } }));
  },
  apply(store, p) {
    for (const u of mediaUses(store, p.from)) {
      const data = store.get(u.path);
      store.put(u.path, JSON.parse(JSON.stringify(data).replaceAll(p.from, p.to)));
    }
    const cur = store.get<MediaIndex>(paths.media)!;
    const items = { ...cur.items, [p.to]: cur.items[p.to] ?? p.entry };
    if (cur.items[p.from]?.credit && !items[p.to]!.credit)
      items[p.to] = { ...items[p.to]!, credit: cur.items[p.from]!.credit };
    delete items[p.from];
    store.put(paths.media, { items });
  },
};

// ---------- screens (P5.9) ----------

/** screen.put: create or replace a screen file (editing a built-in saves an override with its id). */
export const putScreen: CommandHandler<{ screen: Screen }> = {
  label: (p) => `Edit screen ${p.screen.name}`,
  validate: (_store, p) => issue(ScreenSchema.safeParse(p.screen)),
  apply: (store, p) => store.put(paths.screen(p.screen.id), p.screen),
};

/** screen.delete: removes a project screen (for a built-in: back to the built-in version). */
export const deleteScreen: CommandHandler<{ id: string; builtin?: boolean }> = {
  label: (p) => (p.builtin ? 'Reset screen to built-in' : 'Delete screen'),
  validate(store, p) {
    if (!store.has(paths.screen(p.id))) return 'That screen is not in the project.';
    if (store.manifest.entry.screen === p.id && !p.builtin)
      return 'That is the game’s first screen; pick another first.';
    return p.builtin ? null : usedMsg(store, p.id);
  },
  apply: (store, p) => store.remove(paths.screen(p.id)),
};
