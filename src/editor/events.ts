import type { ProjectStore } from '../core/project/store';

/** P32: who sends and who listens to one custom event name (short descriptions, for pickers and warnings). */
export type EventUse = { senders: string[]; listeners: string[] };

type Doc = Record<string, unknown>;
const nameOf = (d: Doc | undefined, fallback: string) =>
  typeof d?.name === 'string' && d.name ? (d.name as string) : fallback;

/** What a project file is, in words (“asset Treasure chest”, “scene Treasure chest”, “graph Treasure chest”). */
function owner(path: string, doc: Doc | undefined): string {
  if (path.startsWith('assets/')) return `asset ${nameOf(doc, path.slice(7, -5))}`;
  if (path.startsWith('cinematics/')) return `scene ${nameOf(doc, path.slice(11, -5))}`;
  if (path.startsWith('logic/')) return `graph ${nameOf(doc, path.slice(6, -5))}`;
  if (path.startsWith('clips/')) return `clip ${nameOf(doc, path.slice(6, -5))}`;
  if (path.startsWith('screens/')) return `screen ${nameOf(doc, path.slice(8, -5))}`;
  if (path.startsWith('maps/')) return `map ${nameOf(doc, path.split('/')[1] ?? path)}`;
  if (path.startsWith('world/')) return 'World graph (gates)';
  return path;
}

/**
 * Every custom event name the project uses, with who sends it and who listens: asset interactions, zones,
 * screen buttons and gates ({ do: 'emit' }), cinematics' Events row and clip markers ({ t, emit }), logic's
 * Send event (senders) and On custom event (listeners).
 */
export function eventUses(store: ProjectStore): Map<string, EventUse> {
  const out = new Map<string, EventUse>();
  const use = (name: string) => {
    const u = out.get(name) ?? { senders: [], listeners: [] };
    out.set(name, u);
    return u;
  };
  const add = (list: string[], what: string) => {
    if (!list.includes(what)) list.push(what);
  };
  for (const p of store.keys()) {
    if (!p.endsWith('.json') || p.includes('/chunks/')) continue;
    const doc = store.get(p) as Doc | undefined;
    const who = owner(p, doc);
    const walk = (v: unknown, depth: number): void => {
      if (!v || typeof v !== 'object' || depth > 14) return;
      if (Array.isArray(v)) {
        for (const x of v) walk(x, depth + 1);
        return;
      }
      const o = v as Doc;
      if (o.do === 'emit' && typeof o.event === 'string' && o.event) add(use(o.event).senders, who);
      // a cinematic's Events row item or a clip's event marker: { t, emit }
      if (typeof o.emit === 'string' && o.emit && typeof o.t === 'number')
        add(use(o.emit).senders, `${who} at ${o.t} s`);
      if ((o.type === 'misc.emit' || o.type === 'event.onCustom') && o.args && typeof o.args === 'object') {
        const e = (o.args as Doc).event;
        if (typeof e === 'string' && e) add(o.type === 'misc.emit' ? use(e).senders : use(e).listeners, who);
      }
      for (const x of Object.values(o)) walk(x, depth + 1);
    };
    walk(doc, 0);
  }
  return out;
}

/** Every custom event name the project uses, sorted (for pickers). */
export function eventNames(store: ProjectStore): string[] {
  return [...eventUses(store).keys()].sort((a, b) => a.localeCompare(b));
}

/** “sent by asset Treasure chest; heard by graph Treasure chest” — or what is missing. */
export function describeUse(u: EventUse | undefined): string {
  if (!u) return 'nothing sends or listens to it yet';
  const s = u.senders.length ? `sent by ${u.senders.join(', ')}` : 'nothing sends it yet';
  const l = u.listeners.length ? `heard by ${u.listeners.join(', ')}` : 'nothing listens yet';
  return `${s}; ${l}`;
}
