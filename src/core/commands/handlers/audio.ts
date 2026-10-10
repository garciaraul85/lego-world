import { usesOf } from '../../audio/usage';
import { isId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { type MediaIndex, Mixer, Music, paths, type Screen, Screen as ScreenSchema, SoundEvents } from '../../schema';
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
    for (const path of [paths.soundEvents, paths.music])
      if (JSON.stringify(store.get(path) ?? {}).includes(p.ref)) return 'A sound event or music still plays that file.';
    for (const path of store.list('screens/'))
      if (JSON.stringify(store.get(path)).includes(p.ref)) return 'A screen still shows that image.';
    return null;
  },
  apply(store, p) {
    const cur = store.get<MediaIndex>(paths.media)!;
    const items = { ...cur.items };
    delete items[p.ref];
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
