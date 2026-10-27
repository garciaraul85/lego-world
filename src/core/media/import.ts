import type { MediaIndex } from '../schema';
import { ModelError, readModel } from './gltf';
import { sha256 } from './hash';
import { type Decoder, probeAudio } from './probe';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 200 * 1024 * 1024;
/** step 11 (P24 part 3): a picture bigger than this (or wider or taller than BIG_PIXELS) can be shrunk */
export const BIG_PICTURE_BYTES = 1024 * 1024;
export const BIG_PIXELS = 2048;

export type MediaKind = 'audio' | 'image' | 'font' | 'model' | 'video';

const TYPES: Record<string, { kind: MediaKind; mime: string }> = {
  // Milestone 2b, 10c part 5: 3D models
  glb: { kind: 'model', mime: 'model/gltf-binary' },
  gltf: { kind: 'model', mime: 'model/gltf+json' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  png: { kind: 'image', mime: 'image/png' },
  // P31: pictures and fonts for screens
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  webp: { kind: 'image', mime: 'image/webp' },
  svg: { kind: 'image', mime: 'image/svg+xml' },
  // step 11 (P24 part 3): more pictures, and video
  gif: { kind: 'image', mime: 'image/gif' },
  avif: { kind: 'image', mime: 'image/avif' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  ttf: { kind: 'font', mime: 'font/ttf' },
  otf: { kind: 'font', mime: 'font/otf' },
  woff: { kind: 'font', mime: 'font/woff' },
  woff2: { kind: 'font', mime: 'font/woff2' },
};

/** File extensions by kind, for file pickers. */
export const ACCEPT_OF = (kind: MediaKind) =>
  Object.entries(TYPES)
    .filter(([, t]) => t.kind === kind)
    .map(([e]) => `.${e}`)
    .join(',');

export type MediaEntry = MediaIndex['items'][string];
export type ImportResult =
  | { ok: true; ref: `sha256:${string}`; entry: MediaEntry; duplicate: boolean; warnings: string[] }
  | { ok: false; error: string };

export const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';
export const ACCEPT = Object.keys(TYPES)
  .map((e) => `.${e}`)
  .join(',');

/** what the first bytes of a picture or video say it is (null: can't tell, e.g. svg) */
export function sniff(bytes: Uint8Array): string | null {
  const at = (o: number, s: string) => [...s].every((c, i) => bytes[o + i] === c.charCodeAt(0));
  if (bytes[0] === 0x89 && at(1, 'PNG')) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (at(0, 'GIF8')) return 'gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  if (at(0, 'BM')) return 'bmp';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (at(4, 'ftyp')) return at(8, 'avif') || at(8, 'avis') ? 'avif' : 'mp4';
  return null;
}
const SAME: Record<string, string> = { jpeg: 'jpg', m4a: 'mp4' };

/** a GIF or WebP with more than one frame */
export function isAnimated(ext: string, bytes: Uint8Array): boolean {
  if (ext === 'webp') {
    // the VP8X header's animation bit
    return bytes.length > 20 && String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X' && (bytes[20]! & 0x02) !== 0;
  }
  if (ext !== 'gif') return false;
  // count image descriptors (0x2C) after graphic control extensions (0x21 0xF9): two or more frames
  let frames = 0;
  for (let i = 13; i < bytes.length - 2 && frames < 2; i++)
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) frames++;
  return frames >= 2;
}

/** a picture's or a video's size (and a video's length), measured by the browser */
export type Measure = (bytes: Uint8Array, mime: string) => Promise<{ w: number; h: number; duration?: number }>;

/** the browser's own measuring (pictures by decoding, video by loading its first frame); none outside a browser */
export function browserMeasure(kind: 'image' | 'video'): Measure | undefined {
  const g = globalThis as unknown as { document?: Document; createImageBitmap?: typeof createImageBitmap };
  if (!g.document) return undefined;
  if (kind === 'image')
    return async (bytes, mime) => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
      } finally {
        URL.revokeObjectURL(url);
      }
    };
  return (bytes, mime) =>
    new Promise((ok, fail) => {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      const v = g.document!.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      const done = (f: () => void) => {
        clearTimeout(t);
        URL.revokeObjectURL(url);
        f();
      };
      const t = setTimeout(() => done(() => fail(new Error('timeout'))), 15_000);
      v.onloadedmetadata = () =>
        done(() =>
          ok({
            w: v.videoWidth || 1,
            h: v.videoHeight || 1,
            duration: Number.isFinite(v.duration) ? v.duration : 0,
          }),
        );
      v.onerror = () => done(() => fail(new Error('decode')));
      v.src = url;
    });
}

/**
 * Checks and fingerprints one file (P5.2). The caller stores the blob under `ref` and registers `entry`
 * with the media.register command. The same bytes always give the same ref, so re-importing stores one blob.
 */
export async function importMedia(
  name: string,
  bytes: Uint8Array,
  opts: { index: MediaIndex | undefined; decode?: Decoder; measure?: Measure | null },
): Promise<ImportResult> {
  const ext = extOf(name);
  const t = TYPES[ext];
  if (!t) return { ok: false, error: `${name}: only ${ACCEPT.replaceAll(',', ' ')} files can be imported.` };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: `${name} is over 20 MB.` };
  if (t.kind === 'image' || t.kind === 'video') {
    const is = sniff(bytes);
    const want = SAME[ext] ?? ext;
    if (ext !== 'svg' && is !== want && !(want === 'mp4' && is === 'avif'))
      return {
        ok: false,
        error: is
          ? `${name} is really a .${is} file: rename it to end in .${is} and import it again.`
          : `${name} could not be read as a ${t.kind === 'video' ? 'video' : 'picture'}.`,
      };
  }
  const ref = `sha256:${await sha256(bytes)}` as const;
  const items = opts.index?.items ?? {};
  const existing = items[ref];
  if (existing) return { ok: true, ref, entry: existing, duplicate: true, warnings: [] };
  const total = Object.values(items).reduce((n, m) => n + m.bytes, 0);
  if (total + bytes.length > MAX_PROJECT_BYTES)
    return {
      ok: false,
      error: 'The project already holds 200 MB of media. Shrink or remove some in File › Media library.',
    };
  const warnings: string[] = [];
  const entry: MediaEntry = { name: name.slice(0, 120), kind: t.kind, mime: t.mime, bytes: bytes.length };
  if (t.kind === 'model') {
    try {
      entry.triangles = readModel(bytes).triangles;
    } catch (e) {
      return {
        ok: false,
        error: `${name}: ${e instanceof ModelError ? e.message : 'it could not be read as a 3D model.'}`,
      };
    }
  }
  if (t.kind === 'audio') {
    if (ext === 'ogg') warnings.push(`${name}: .ogg does not play on older iPhones and iPads; prefer .m4a or .mp3.`);
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
  if (t.kind === 'image' || t.kind === 'video') {
    if (isAnimated(ext, bytes)) entry.animated = true;
    const measure = opts.measure === undefined ? browserMeasure(t.kind) : opts.measure;
    if (measure && ext !== 'svg') {
      try {
        const m = await measure(bytes, t.mime);
        entry.w = Math.max(1, Math.round(m.w));
        entry.h = Math.max(1, Math.round(m.h));
        if (m.duration !== undefined) entry.duration = Math.round(m.duration * 1000) / 1000;
      } catch {
        return {
          ok: false,
          error:
            t.kind === 'video'
              ? `${name} could not be played here: save it as an .mp4 (H.264) or .webm video.`
              : `${name} could not be shown here as a picture.`,
        };
      }
    }
    if (ext === 'avif') warnings.push(`${name}: .avif needs a recent browser (older iPhones can't show it).`);
    if (t.kind === 'image' && isBigPicture(entry))
      warnings.push(`${name} is big: shrink it in File › Media library to save space.`);
    if (t.kind === 'video' && bytes.length > 8 * 1024 * 1024)
      warnings.push(`${name} is over 8 MB: shorter or smaller videos keep the game quick to load.`);
  }
  return { ok: true, ref, entry, duplicate: false, warnings };
}

/** a picture worth shrinking: big in bytes or in pixels (never an animated one or an svg, which would lose things) */
export const isBigPicture = (e: MediaEntry) =>
  e.kind === 'image' &&
  !e.animated &&
  e.mime !== 'image/svg+xml' &&
  (e.bytes > BIG_PICTURE_BYTES || (e.w ?? 0) > BIG_PIXELS || (e.h ?? 0) > BIG_PIXELS || e.mime === 'image/bmp');
