import type { Cinematic } from '../../../core/schema';

/** One-shot things that happen as the playhead passes them (music, sounds, logic events, voice blips). */
export type Cue =
  | { t: number; kind: 'music'; music: string | null; fade: number }
  | { t: number; kind: 'sfx'; event: string; role?: string; pos?: [number, number, number] }
  | { t: number; kind: 'emit'; event: string }
  | { t: number; kind: 'setVar'; name: string; value: number | boolean | string }
  | { t: number; kind: 'voice'; event: string; role: string };

export const BLIP = 0.14;
export const DEFAULT_VOICE = 'snd_talk000000';

/** Every cue of a cinematic in time order (stable for equal times). */
export function cuesOf(c: Cinematic): Cue[] {
  const out: Cue[] = [];
  for (const tr of c.tracks) {
    switch (tr.kind) {
      case 'music':
        for (const it of tr.items)
          out.push({ t: it.t, kind: 'music', music: it.stop ? null : (it.music ?? null), fade: it.fade });
        break;
      case 'sfx':
        for (const it of tr.items)
          out.push({
            t: it.t,
            kind: 'sfx',
            event: it.event,
            ...(it.role ? { role: it.role } : {}),
            ...(it.pos ? { pos: it.pos } : {}),
          });
        break;
      case 'event':
        for (const it of tr.items)
          out.push(
            'emit' in it
              ? { t: it.t, kind: 'emit', event: it.emit }
              : { t: it.t, kind: 'setVar', name: it.setVar, value: it.value },
          );
        break;
      case 'actor':
        for (const it of tr.items)
          if (it.do === 'say') {
            const n = Math.max(1, Math.min(Math.ceil(it.text.length / 5), Math.floor(it.dur / BLIP)));
            for (let k = 0; k < n; k++)
              out.push({ t: it.t + k * BLIP, kind: 'voice', event: it.voice ?? DEFAULT_VOICE, role: tr.role });
          }
        break;
      default:
        break;
    }
  }
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.t - b.c.t || a.i - b.i)
    .map((x) => x.c);
}
