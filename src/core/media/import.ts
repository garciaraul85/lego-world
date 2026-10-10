import type { MediaIndex } from '../schema';
import { sha256 } from './hash';
import { type Decoder, probeAudio } from './probe';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;

const TYPES: Record<string, { kind: 'audio' | 'image'; mime: string }> = {
  wav: { kind: 'audio', mime: 'audio/wav' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  png: { kind: 'image', mime: 'image/png' },
};

export type MediaEntry = MediaIndex['items'][string];
export type ImportResult =
  | { ok: true; ref: `sha256:${string}`; entry: MediaEntry; duplicate: boolean; warnings: string[] }
  | { ok: false; error: string };

export const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';
export const ACCEPT = Object.keys(TYPES)
  .map((e) => `.${e}`)
  .join(',');

/**
 * Checks and fingerprints one file (P5.2). The caller stores the blob under `ref` and registers `entry`
 * with the media.register command. The same bytes always give the same ref, so re-importing stores one blob.
 */
export async function importMedia(
  name: string,
  bytes: Uint8Array,
  opts: { index: MediaIndex | undefined; decode?: Decoder },
): Promise<ImportResult> {
  const t = TYPES[extOf(name)];
  if (!t) return { ok: false, error: `${name}: only ${ACCEPT.replaceAll(',', ' ')} files can be imported.` };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: `${name} is over 20 MB.` };
  const ref = `sha256:${await sha256(bytes)}` as const;
  const items = opts.index?.items ?? {};
  const existing = items[ref];
  if (existing) return { ok: true, ref, entry: existing, duplicate: true, warnings: [] };
  const total = Object.values(items).reduce((n, m) => n + m.bytes, 0);
  if (total + bytes.length > MAX_PROJECT_BYTES)
    return { ok: false, error: 'The project already holds 200 MB of media.' };
  const warnings: string[] = [];
  const entry: MediaEntry = { name: name.slice(0, 120), kind: t.kind, mime: t.mime, bytes: bytes.length };
  if (t.kind === 'audio') {
    if (extOf(name) === 'ogg')
      warnings.push(`${name}: .ogg does not play on older iPhones and iPads; prefer .m4a or .mp3.`);
    if (opts.decode) {
      try {
        const info = await probeAudio(bytes, opts.decode);
        entry.duration = Math.round(info.duration * 1000) / 1000;
        entry.channels = info.channels;
        entry.sampleRate = info.sampleRate;
      } catch {
        return { ok: false, error: `${name} could not be decoded as audio.` };
      }
    }
  }
  return { ok: true, ref, entry, duplicate: false, warnings };
}
