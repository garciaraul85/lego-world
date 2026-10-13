import type { ProjectStore } from '../../project/store';
import { type Art, Art as ArtSchema, paths, type Screen, type Widget } from '../../schema';
import type { CommandHandler } from '../types';

/** Screens that use an art file (as a background, a picture, an icon or a font). */
export function screensUsingArt(store: ProjectStore, artId: string): string[] {
  const ref = `art:${artId}`;
  const uses = (w: Widget): boolean =>
    Object.values({ ...(w.style ?? {}), ...(w.portrait?.style ?? {}) }).some((v) => v === ref) ||
    (w.children ?? []).some(uses);
  return store
    .list('screens/')
    .map((p) => store.get<Screen>(p)!)
    .filter((s) => uses(s.root))
    .map((s) => s.name);
}

/** art.put: adds or replaces a background, icon or font (P31). */
export const putArt: CommandHandler<{ art: Art }> = {
  label: (p) => `${p.art.kind === 'font' ? 'Font' : p.art.kind === 'icon' ? 'Icon' : 'Background'} ${p.art.name}`,
  validate(_store, p) {
    const r = ArtSchema.safeParse(p.art);
    if (!r.success) return `That ${p.art?.kind ?? 'art'} is not valid: ${r.error.issues[0]?.message}`;
    const s = p.art.source;
    if (s.type === 'pixels' && s.data.length !== s.w * s.h) return 'The picture data does not match its size.';
    if (s.type === 'pixelFont')
      for (const [ch, g] of Object.entries(s.glyphs)) {
        const rows = g.split('|');
        if (rows.length !== s.cellH || rows.some((r) => r.length !== s.cellW))
          return `Letter ${ch} does not fit the ${s.cellW}×${s.cellH} grid.`;
      }
    return null;
  },
  apply: (store, p) => store.put(paths.art(p.art.id), p.art),
};

/** art.delete: removes an art file no screen uses. */
export const deleteArt: CommandHandler<{ id: string }> = {
  label: () => 'Delete art',
  validate(store, p) {
    if (!store.has(paths.art(p.id))) return 'That art is not in the project.';
    const used = screensUsingArt(store, p.id);
    return used.length ? `Used on ${used.join(', ')}. Take it off those screens first.` : null;
  },
  apply: (store, p) => store.remove(paths.art(p.id)),
};
