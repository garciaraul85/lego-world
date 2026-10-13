import { artSvg, fontFamilyOf, svgDataUrl } from '../../core/art/render';
import { pixelFontTtf } from '../../core/art/ttf';
import { type Art, paths } from '../../core/schema';

/**
 * P31: art files on screens, in the editor and in Play. Generated and drawn art become SVG data URLs;
 * imported pictures use the media store's URL; fonts are loaded once with FontFace (a designed pixel font is
 * written out as a TTF first). Everything is cached by the art file's contents.
 */
export type ArtFiles = { get(path: string): unknown };
export type ArtMedia = { url(ref: string): string | undefined };

const urls = new Map<string, { key: string; url: string }>();

export function artUrl(files: ArtFiles, media: ArtMedia | null | undefined, id: string): string | undefined {
  const art = files.get(paths.art(id)) as Art | undefined;
  if (!art) return undefined;
  const src = art.source;
  if (src.type === 'image') return media?.url(src.media);
  const key = JSON.stringify(src);
  const hit = urls.get(id);
  if (hit?.key === key) return hit.url;
  const svg = artSvg(src);
  if (!svg) return undefined;
  const url = svgDataUrl(svg);
  urls.set(id, { key, url });
  return url;
}

/** Built-in font choices (system fonts that look the same everywhere enough). */
export const BUILTIN_FONTS: Record<string, { name: string; css: string }> = {
  ui: { name: 'Game (default)', css: 'var(--font, system-ui, sans-serif)' },
  rounded: { name: 'Rounded', css: '"Arial Rounded MT Bold", "Nunito", system-ui, sans-serif' },
  serif: { name: 'Book', css: 'Georgia, "Times New Roman", serif' },
  mono: { name: 'Typewriter', css: 'ui-monospace, "Courier New", monospace' },
  impact: { name: 'Bold poster', css: 'Impact, "Arial Black", sans-serif' },
};

const fonts = new Map<string, { key: string; family: string; state: 'loading' | 'ready' | 'failed' }>();

/**
 * CSS font-family for a widget's style.font: a built-in key, or `art:<id>` for an imported or designed
 * font (loaded on first use; until it is ready the text shows in the default font).
 */
export function fontCss(
  files: ArtFiles,
  media: ArtMedia | null | undefined,
  ref: string | undefined,
): string | undefined {
  if (!ref) return undefined;
  if (!ref.startsWith('art:')) return BUILTIN_FONTS[ref]?.css;
  const id = ref.slice(4);
  const art = files.get(paths.art(id)) as Art | undefined;
  if (!art || art.kind !== 'font') return undefined;
  const key = JSON.stringify(art.source);
  const hit = fonts.get(id);
  const family = hit?.key === key ? hit.family : `${fontFamilyOf(id)}_${hash(key)}`;
  if (hit?.key !== key && typeof FontFace === 'function' && typeof document !== 'undefined') {
    const entry = { key, family, state: 'loading' as 'loading' | 'ready' | 'failed' };
    fonts.set(id, entry);
    let face: FontFace | null = null;
    const src = art.source;
    if (src.type === 'pixelFont') face = new FontFace(family, pixelFontTtf(src, art.name) as unknown as ArrayBuffer);
    else if (src.type === 'fontFile') {
      const url = media?.url(src.media);
      if (url) face = new FontFace(family, `url("${url}")`);
      else fonts.delete(id); // the file is still loading: try again next time
    }
    if (face)
      face
        .load()
        .then((f) => {
          document.fonts.add(f);
          entry.state = 'ready';
        })
        .catch(() => {
          entry.state = 'failed';
        });
  }
  return `"${family}", var(--font, system-ui, sans-serif)`;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).slice(0, 6);
}
