import type { ProjectStore } from '../project/store';
import { type MediaIndex, paths } from '../schema';

/**
 * Step 11 (P24 part 3): where an imported file is used — every project file that names its ref (a screen, a picture
 * in the art library, a sound event, music, a model on a map, a character's drawing…), said in words.
 */
export type MediaUse = { path: string; what: string };

const nameOf = (data: unknown) =>
  data && typeof data === 'object' && typeof (data as { name?: unknown }).name === 'string'
    ? (data as { name: string }).name
    : null;

function describe(store: Pick<ProjectStore, 'get'>, path: string): string {
  const data = store.get(path);
  const n = nameOf(data);
  if (path.startsWith('screens/')) return `Screen ${n ?? path}`;
  if (path.startsWith('art/')) return `Art ${n ?? path}`;
  if (path === paths.soundEvents) return 'Sound events';
  if (path === paths.music) return 'Music';
  if (path.startsWith('maps/')) {
    const map = path.split('/')[1]!;
    return `Map ${nameOf(store.get(paths.map(map))) ?? map}`;
  }
  if (path.startsWith('characters/')) return `Character ${n ?? path}`;
  if (path.startsWith('cinematics/')) return `Cinematic ${n ?? path}`;
  return n ?? path;
}

export function mediaUses(store: Pick<ProjectStore, 'get' | 'keys'>, ref: string): MediaUse[] {
  const out: MediaUse[] = [];
  for (const path of store.keys()) {
    if (path === paths.media) continue;
    const data = store.get(path);
    if (data !== undefined && JSON.stringify(data).includes(ref)) out.push({ path, what: describe(store, path) });
  }
  return out.sort((a, b) => a.what.localeCompare(b.what));
}

/** what the project's media adds up to, by kind */
export function mediaTotals(index: MediaIndex | undefined) {
  const by: Record<string, { n: number; bytes: number }> = {};
  let bytes = 0;
  for (const m of Object.values(index?.items ?? {})) {
    by[m.kind] ??= { n: 0, bytes: 0 };
    by[m.kind]!.n++;
    by[m.kind]!.bytes += m.bytes;
    bytes += m.bytes;
  }
  return { bytes, by };
}

/** 1.2 MB, 340 KB */
export const sizeText = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** the media with a credit, for the game's credits */
export function mediaCredits(index: MediaIndex | undefined) {
  return Object.values(index?.items ?? {})
    .filter((m) => m.credit && (m.credit.author || m.credit.license))
    .map((m) => ({ name: m.name.replace(/\.[^.]+$/, ''), kind: m.kind, ...m.credit! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
