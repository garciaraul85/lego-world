import { sha256 } from '../../core/media/hash';
import { importMedia, isBigPicture, type MediaEntry } from '../../core/media/import';
import { sizeText } from '../../core/media/uses';
import { type MediaIndex, paths } from '../../core/schema';
import type { EditorState } from '../state';
import { shrinkPicture } from './shrink';

/**
 * Step 11 (P24 part 3): importing files, the same everywhere (the Media library, Audio's Import, the Art library,
 * a Video widget). Each file is checked and measured; a big picture is shrunk on the way in when the maker chose
 * "Shrink big pictures" (on by default, remembered on this device).
 */
const SHRINK_KEY = 'bw.shrinkOnImport';

export function shrinkOnImport(): boolean {
  try {
    return localStorage.getItem(SHRINK_KEY) !== '0';
  } catch {
    return true;
  }
}
export function setShrinkOnImport(on: boolean) {
  try {
    localStorage.setItem(SHRINK_KEY, on ? '1' : '0');
  } catch {
    /* private mode: it lasts until the page closes */
  }
}

export type Imported =
  | { ok: true; name: string; ref: string; entry: MediaEntry; duplicate: boolean; shrunk?: string; warnings: string[] }
  | { ok: false; name: string; error: string };

/** checks, (maybe) shrinks, stores and registers one file; nothing is registered on failure */
export async function importFile(
  ed: EditorState,
  name: string,
  bytes: Uint8Array,
  opts: { shrink?: boolean; register?: boolean } = {},
): Promise<Imported> {
  ed.audio.init();
  const ctx = ed.audio.ctx;
  const r = await importMedia(name, bytes, {
    index: ed.store.get<MediaIndex>(paths.media),
    ...(ctx ? { decode: (b: ArrayBuffer) => ctx.decodeAudioData(b) } : {}),
  });
  if (!r.ok) return { ok: false, name, error: r.error };
  let ref: string = r.ref;
  let entry = r.entry;
  let data = bytes;
  let shrunk: string | undefined;
  if (!r.duplicate && (opts.shrink ?? shrinkOnImport()) && isBigPicture(entry)) {
    const s = await shrinkPicture(new Blob([bytes as BlobPart], { type: entry.mime })).catch(() => null);
    if (s) {
      shrunk = `${sizeText(entry.bytes)} → ${sizeText(s.bytes.length)}, ${s.w}×${s.h}`;
      data = s.bytes;
      ref = `sha256:${await sha256(s.bytes)}`;
      entry = {
        ...entry,
        name: `${entry.name.replace(/\.[^.]+$/, '')}.${s.ext}`.slice(0, 120),
        mime: s.mime,
        bytes: s.bytes.length,
        w: s.w,
        h: s.h,
      };
    }
  }
  const index = ed.store.get<MediaIndex>(paths.media);
  const duplicate = r.duplicate || !!index?.items[ref];
  ed.media?.put(ref, new Blob([data as BlobPart], { type: entry.mime }));
  if (!duplicate && opts.register !== false)
    ed.exec({ type: 'media.register', payload: { ref, entry } }, { label: `Import ${entry.name}` });
  const warnings = shrunk ? r.warnings.filter((w) => !/is big: shrink/.test(w)) : r.warnings;
  return { ok: true, name, ref, entry: duplicate ? (index?.items[ref] ?? entry) : entry, duplicate, shrunk, warnings };
}

/** imports several files from a file picker or a drop, telling the maker what happened to each */
export async function importFiles(
  ed: EditorState,
  files: Iterable<File>,
  opts: { shrink?: boolean } = {},
): Promise<Imported[]> {
  const out: Imported[] = [];
  for (const f of files) {
    const r = await importFile(ed, f.name, new Uint8Array(await f.arrayBuffer()), opts);
    out.push(r);
    if (!r.ok) ed.notify(r.error, true);
    else {
      if (r.duplicate) ed.notify(`${f.name} is already in the game (kept once).`);
      if (r.shrunk) ed.notify(`${f.name} shrunk as it came in: ${r.shrunk}.`);
      for (const w of r.warnings) ed.notify(w);
    }
  }
  return out;
}
