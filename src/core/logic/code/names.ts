import { BUILTIN_ASSETS } from '../../../builtin/assets';
import { DEFAULT_EVENTS, DEFAULT_MUSIC } from '../../../builtin/audio/pack';
import { BUILTIN_SCREENS } from '../../../builtin/screens';
import type { LogicGraph, MapDoc } from '../../schema';
import { nodeDef } from '../catalog';
import type { ArgKind } from '../catalog/types';

/**
 * P9b.1: code says names, not ids. `audio.playSound("chest")`, `on("enterZone", { zone: "Pond" }, …)`,
 * `world.teleport("Arrival")` — the graph keeps ids (so renaming never breaks it); the code view swaps them for
 * the names you see in the editor, and back again when you type. A name that two things share, or nothing has,
 * stays as it is written (the id still works in code).
 */
export type NameKind = Extract<
  ArgKind,
  'zone' | 'spawn' | 'map' | 'asset' | 'sound' | 'music' | 'screen' | 'cinematic'
>;
export const NAME_KINDS: readonly NameKind[] = [
  'zone',
  'spawn',
  'map',
  'asset',
  'sound',
  'music',
  'screen',
  'cinematic',
];

export type NamedThing = { id: string; name: string; kind: NameKind /** where it is, what it is */; note: string };

export type NameBook = {
  /** everything that can be named, by kind (for pick lists and code completion) */
  all(kind: NameKind): NamedThing[];
  nameOf(kind: NameKind, id: string): string;
  idOf(kind: NameKind, name: string): string;
};

type Source = { get(path: string): unknown; list(prefix: string): string[] };

const read = <T>(s: Source, p: string) => s.get(p) as T | undefined;

/** what the project has, by kind, with names */
export function namedThings(s: Source): Record<NameKind, NamedThing[]> {
  const out: Record<NameKind, NamedThing[]> = {
    zone: [],
    spawn: [],
    map: [],
    asset: [],
    sound: [],
    music: [],
    screen: [],
    cinematic: [],
  };
  const order = read<{ mapOrder: string[] }>(s, 'world/gates.json')?.mapOrder ?? [];
  const mapPaths = s.list('maps/').filter((p) => p.endsWith('/map.json'));
  const maps = mapPaths
    .map((p) => read<MapDoc>(s, p))
    .filter((m): m is MapDoc => !!m)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const m of maps) {
    out.map.push({ id: m.id, name: m.name, kind: 'map', note: `${m.spawns.length} spawn points` });
    m.zones.forEach((z, i) => {
      out.zone.push({
        id: z.id,
        name: z.tags[0] ?? `Zone ${i + 1}`,
        kind: 'zone',
        note: `trigger zone on ${m.name}${z.tags.length > 1 ? ` · ${z.tags.slice(1).join(', ')}` : ''}`,
      });
    });
    for (const sp of m.spawns)
      out.spawn.push({ id: sp.id, name: sp.name, kind: 'spawn', note: `spawn point on ${m.name}` });
  }
  const seen = new Set<string>();
  for (const p of s.list('assets/')) {
    const a = read<{ id: string; name: string; origin?: string; states?: string[] }>(s, p);
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    out.asset.push({ id: a.id, name: a.name, kind: 'asset', note: 'asset in this game' });
  }
  for (const a of BUILTIN_ASSETS)
    if (!seen.has(a.id)) out.asset.push({ id: a.id, name: a.name, kind: 'asset', note: 'built-in asset' });
  const ev = read<{ events: Record<string, { name?: string; clips: unknown[]; bus: string }> }>(s, 'audio/events.json');
  // the game hears the built-in sound pack plus its own sounds (as Play does)
  for (const [id, e] of Object.entries({ ...DEFAULT_EVENTS.events, ...(ev?.events ?? {}) }) as [
    string,
    { name?: string; clips: unknown[]; bus: string },
  ][])
    out.sound.push({
      id,
      name: e.name ?? id,
      kind: 'sound',
      note: `${e.bus} sound · ${e.clips.length} clip${e.clips.length === 1 ? '' : 's'}`,
    });
  const mu = read<{ states: Record<string, { name?: string; loop: boolean }> }>(s, 'audio/music.json');
  for (const [id, m] of Object.entries({ ...DEFAULT_MUSIC.states, ...(mu?.states ?? {}) }) as [
    string,
    { name?: string; loop: boolean },
  ][])
    out.music.push({ id, name: m.name ?? id, kind: 'music', note: m.loop ? 'music · loops' : 'music' });
  // the built-in screens (splash, title, HUD…) unless the game has its own copy, then the game's own
  const screens = new Map<string, { id: string; name: string; kind?: string }>();
  for (const b of BUILTIN_SCREENS) screens.set(b.id, b);
  for (const p of s.list('screens/')) {
    const sc = read<{ id: string; name: string; kind?: string }>(s, p);
    if (sc?.id) screens.set(sc.id, sc);
  }
  for (const sc of screens.values())
    out.screen.push({ id: sc.id, name: sc.name, kind: 'screen', note: `${sc.kind ?? 'screen'} screen` });
  for (const p of s.list('cinematics/')) {
    const c = read<{ id: string; name: string; map?: string }>(s, p);
    const on = maps.find((m) => m.id === c?.map)?.name;
    if (c?.id) out.cinematic.push({ id: c.id, name: c.name, kind: 'cinematic', note: on ? `scene on ${on}` : 'scene' });
  }
  return out;
}

export function nameBook(s: Source): NameBook {
  const all = namedThings(s);
  const toName = new Map<string, string>();
  const toId = new Map<string, string>();
  for (const kind of NAME_KINDS) {
    const count = new Map<string, number>();
    for (const t of all[kind]) count.set(t.name.toLowerCase(), (count.get(t.name.toLowerCase()) ?? 0) + 1);
    for (const t of all[kind]) {
      // a name two things share would be ambiguous: those keep their ids in code
      if (count.get(t.name.toLowerCase()) !== 1) continue;
      toName.set(`${kind}:${t.id}`, t.name);
      toId.set(`${kind}:${t.name.toLowerCase()}`, t.id);
    }
  }
  return {
    all: (kind) => all[kind],
    nameOf: (kind, id) => toName.get(`${kind}:${id}`) ?? id,
    idOf: (kind, name) => toId.get(`${kind}:${name.trim().toLowerCase()}`) ?? name,
  };
}

const isNameKind = (k: string): k is NameKind => (NAME_KINDS as readonly string[]).includes(k);

/** a copy of the graph with each named setting swapped (ids → names to print, names → ids after parsing) */
function swap<G extends Pick<LogicGraph, 'nodes' | 'edges'>>(g: G, f: (kind: NameKind, v: string) => string): G {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      const defs = nodeDef(n.type)?.args ?? [];
      if (!n.args || !defs.some((a) => isNameKind(a.kind))) return n;
      const args = { ...n.args };
      for (const a of defs) {
        const v = args[a.name];
        if (isNameKind(a.kind) && typeof v === 'string' && v) args[a.name] = f(a.kind, v);
      }
      return { ...n, args };
    }),
  };
}

export const withNames = <G extends Pick<LogicGraph, 'nodes' | 'edges'>>(g: G, book: NameBook | null): G =>
  book ? swap(g, book.nameOf) : g;
export const withIds = <G extends Pick<LogicGraph, 'nodes' | 'edges'>>(g: G, book: NameBook | null): G =>
  book ? swap(g, book.idOf) : g;
