import { paths } from '../schema';

/**
 * P18: project.json schema 6 adds `genre`. A schema-5 project opens as Open (every control), so nothing an
 * older project uses is hidden. Returns the upgraded manifest, or the input when it needs nothing.
 */
export function upgradeManifest(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const m = v as Record<string, unknown>;
  if (m.format !== 'brickworlds-project' || m.schema !== 5) return v;
  const { files, ...rest } = m;
  return { ...rest, schema: 6, genre: typeof m.genre === 'string' ? m.genre : 'open', files };
}

/** Upgrades the manifest inside a list of project files (load, import). */
export function upgradeFiles<T extends [string, unknown]>(entries: Iterable<T>): [string, unknown][] {
  return [...entries].map(([p, v]) => [p, p === paths.project ? upgradeManifest(v) : v]);
}
