import { BUILTIN_MEDIA, DEFAULT_EVENTS, DEFAULT_MUSIC } from '../../../builtin/audio';
import { newId } from '../../../core/ids';
import { type MediaIndex, paths, type SoundEvent } from '../../../core/schema';
import { audioData } from '../../../engine/audio/data';
import type { EditorState } from '../../state';

export const BUS_LABEL: Record<string, string> = {
  master: 'Master',
  music: 'Music',
  sfx: 'Effects',
  voice: 'Voice',
  ui: 'Menus',
  ambience: 'Ambience',
};

/** Every playable media item: generated built-ins and the project's imported audio. */
export function mediaChoices(ed: EditorState) {
  ed.revision.value;
  const own = ed.store.get<MediaIndex>(paths.media)?.items ?? {};
  return [
    ...Object.entries(own)
      .filter(([, m]) => m.kind === 'audio')
      .map(([ref, m]) => ({ ref, name: m.name, builtin: false, duration: m.duration })),
    ...[...BUILTIN_MEDIA].map(([ref, name]) => ({
      ref,
      name: `${name} (built-in)`,
      builtin: true,
      duration: undefined,
    })),
  ];
}

export function mediaName(ed: EditorState, ref: string): string {
  const b = BUILTIN_MEDIA.get(ref as `sha256:${string}`);
  if (b) return `${b} (built-in)`;
  return ed.store.get<MediaIndex>(paths.media)?.items[ref]?.name ?? `${ref.slice(7, 15)}… (missing)`;
}

export const isBuiltinEventId = (id: string) => id in DEFAULT_EVENTS.events;
export const isBuiltinMusicId = (id: string) => id in DEFAULT_MUSIC.states;

/** whether the project has its own copy of an event / music (an edited built-in or its own) */
export function ownsEvent(ed: EditorState, id: string) {
  return !!(ed.store.get(paths.soundEvents) as { events: Record<string, unknown> } | undefined)?.events[id];
}
export function ownsMusic(ed: EditorState, id: string) {
  return !!(ed.store.get(paths.music) as { states: Record<string, unknown> } | undefined)?.states[id];
}

export function newSoundEvent(
  ed: EditorState,
  name: string,
  clips: string[],
): { id: string; event: SoundEvent } | null {
  const id = newId('sound');
  const event: SoundEvent = {
    name: name.slice(0, 60),
    clips,
    pick: 'random',
    volume: 0,
    pitch: [0.95, 1.05],
    bus: 'sfx',
    spatial: true,
    maxVoices: 4,
    cooldown: 0,
  };
  return ed.exec({ type: 'audio.setEvent', payload: { id, event } }, { label: `New sound ${name}` }).ok
    ? { id, event }
    : null;
}

export const data = (ed: EditorState) => {
  ed.revision.value;
  return audioData(ed.store);
};
