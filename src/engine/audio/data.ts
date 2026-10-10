import { DEFAULT_EVENTS, DEFAULT_MIXER, DEFAULT_MUSIC } from '../../builtin/audio';
import { type Mixer, type Music, paths, type SoundEvent, type SoundEvents } from '../../core/schema';

export type AudioData = { events: Record<string, SoundEvent>; music: Music; mixer: Mixer };
type Files = { get(path: string): unknown };

/** The project's audio files over the built-in defaults: project events/states win by id, built-ins stay available. */
export function audioData(files: Files): AudioData {
  const ev = files.get(paths.soundEvents) as SoundEvents | undefined;
  const mu = files.get(paths.music) as Music | undefined;
  const mx = files.get(paths.mixer) as Mixer | undefined;
  return {
    events: { ...DEFAULT_EVENTS.events, ...(ev?.events ?? {}) },
    music: {
      states: { ...DEFAULT_MUSIC.states, ...(mu?.states ?? {}) },
      crossfade: mu?.crossfade ?? DEFAULT_MUSIC.crossfade,
      stingers: { ...DEFAULT_MUSIC.stingers, ...(mu?.stingers ?? {}) },
    },
    mixer: mx ?? DEFAULT_MIXER,
  };
}

export const isBuiltinEvent = (id: string) => id in DEFAULT_EVENTS.events;
export const isBuiltinMusic = (id: string) => id in DEFAULT_MUSIC.states;
