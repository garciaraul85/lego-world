import { sha256 } from '../../core/media/hash';
import { BIG_PIXELS } from '../../core/media/import';
import { sizeText } from '../../core/media/uses';
import { type MediaIndex, paths } from '../../core/schema';
import type { EditorState } from '../state';

/** shrinks one imported picture and puts the smaller copy everywhere it is used (one undo step); its new ref */
export async function shrinkMedia(ed: EditorState, ref: string): Promise<string | null> {
  const m = ed.store.get<MediaIndex>(paths.media)?.items[ref];
  const blob = await ed.media?.get(ref);
  if (!m || !blob) {
    ed.notify(`${m?.name ?? 'That file'} is not on this device: open the game where it was imported.`, true);
    return null;
  }
  const s = await shrinkPicture(blob).catch(() => null);
  if (!s) {
    ed.notify(`${m.name} is already as small as it gets.`);
    return null;
  }
  const to = `sha256:${await sha256(s.bytes)}`;
  ed.media?.put(to, new Blob([s.bytes as BlobPart], { type: s.mime }));
  const name = `${m.name.replace(/\.[^.]+$/, '')}.${s.ext}`.slice(0, 120);
  const entry = { ...m, name, mime: s.mime, bytes: s.bytes.length, w: s.w, h: s.h };
  const r = ed.exec({ type: 'media.replace', payload: { from: ref, to, entry } }, { label: `Shrink ${m.name}` });
  if (!r.ok) {
    ed.notify(r.error ?? 'It could not be shrunk.', true);
    return null;
  }
  ed.notify(`${m.name}: ${sizeText(m.bytes)} → ${sizeText(s.bytes.length)}, ${s.w}×${s.h}.`);
  return to;
}

/**
 * Step 11 (P24 part 3): a big picture made smaller — no wider or taller than BIG_PIXELS, saved as the smallest of
 * WebP, PNG and (with no see-through parts) JPEG. Null when it would be neither fewer pixels nor fewer bytes.
 */
export async function shrinkPicture(
  blob: Blob,
): Promise<{ bytes: Uint8Array; mime: string; ext: string; w: number; h: number } | null> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, BIG_PIXELS / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    const encode = (type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob((b) => ok(b), type, q));
    // the smallest of WebP, PNG and (with nothing see-through) JPEG
    const tries = [await encode('image/webp', 0.86), await encode('image/png')];
    if (!seeThrough(g, w, h)) tries.push(await encode('image/jpeg', 0.86));
    const best = tries.filter((b): b is Blob => !!b && b.type.startsWith('image/')).sort((x, y) => x.size - y.size)[0];
    // smaller in bytes, or in pixels (a picture this big costs memory however well it packs)
    if (!best || (best.size >= blob.size && k === 1)) return null;
    const ext = best.type === 'image/webp' ? 'webp' : best.type === 'image/jpeg' ? 'jpg' : 'png';
    return { bytes: new Uint8Array(await best.arrayBuffer()), mime: best.type, ext, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** any pixel not fully solid (sampled) */
function seeThrough(g: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = g.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor(d.length / 4 / 40_000)) * 4;
  for (let i = 3; i < d.length; i += step) if (d[i]! < 255) return true;
  return false;
}
