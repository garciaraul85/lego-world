/**
 * Deterministic JSON: object keys sorted, arrays kept in order.
 * `indent` 2 for files under 64 KB, 0 (compact) for chunks and big files — see Project files › Autosave.
 */
export function stableStringify(value: unknown, indent = 0): string {
  return JSON.stringify(sortKeys(value), null, indent || undefined);
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/** Serialize a project file the way the store writes it. Chunks are always compact. */
export function serializeFile(path: string, value: unknown): string {
  const compact = path.includes('/chunks/');
  const pretty = compact ? '' : stableStringify(value, 2);
  return compact || pretty.length > 65_536 ? stableStringify(value) : pretty;
}
