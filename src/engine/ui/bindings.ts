/** {var} bindings in screen text (P5.7). The lookup reads game variables and built-in values. */
export type Lookup = (name: string) => unknown;

export function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.map(formatValue).join(', ');
  if (v instanceof Map) return [...v].map(([k, n]) => `${k} × ${formatValue(n)}`).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const VAR = /\{([a-zA-Z_][\w.]*)\}/g;

export function interpolate(text: string, lookup: Lookup): string {
  return text.replace(VAR, (_, name: string) => formatValue(lookup(name)));
}

/** variable names a text depends on (for "where used" and the bindings panel) */
export function bindingsOf(text: string): string[] {
  return [...text.matchAll(VAR)].map((m) => m[1]!);
}

export function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** list widgets: arrays, Maps and objects become lines */
export function asLines(v: unknown): string[] {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v.map(formatValue);
  if (v instanceof Map) return [...v].map(([k, n]) => `${k} × ${formatValue(n)}`);
  if (typeof v === 'object') return Object.entries(v).map(([k, n]) => `${k}: ${formatValue(n)}`);
  return [formatValue(v)];
}
