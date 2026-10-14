import type { ProjectStore } from '../core/project/store';

/**
 * P32: every custom event name the project uses, for pickers: events sent by asset interactions, zones,
 * screen buttons and gates ({ do: 'emit' }), and the ones logic sends (Send event) or listens to (On custom
 * event). Sorted, without repeats.
 */
export function eventNames(store: ProjectStore): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 12) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (o.do === 'emit' && typeof o.event === 'string' && o.event) out.add(o.event);
    if ((o.type === 'misc.emit' || o.type === 'event.onCustom') && o.args && typeof o.args === 'object') {
      const e = (o.args as Record<string, unknown>).event;
      if (typeof e === 'string' && e) out.add(e);
    }
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  // brick chunks and media hold no events
  for (const p of store.keys()) if (p.endsWith('.json') && !p.includes('/chunks/')) walk(store.get(p), 0);
  return [...out].sort((a, b) => a.localeCompare(b));
}
