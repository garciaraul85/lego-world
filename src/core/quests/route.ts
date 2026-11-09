/**
 * Milestone 3b (B7a-2, v141): goals on other maps. Where a named thing is in the whole game (a zone, a spawn point,
 * a placed object by its asset's name, a character, a pickup's item), and the way out of a map that leads toward
 * another — through the world graph's gates and zones that travel — taking the fewest maps.
 */
import { BUILTIN_ASSETS } from '../../builtin/assets';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { type Asset, type Character, type Gates, type Instances, type MapDoc, paths } from '../schema';

type Source = { get(path: string): unknown };

/** a way out of one map into another: standing on a gate's spawn point, or walking into a zone that travels */
export type MapLink = {
  from: string;
  to: string;
  /** where it is on `from` */
  at: { kind: 'spawn'; id: string } | { kind: 'zone'; id: string };
};

const key = (s: string) => s.trim().toLowerCase();

/** the maps of the game, in the World graph's order */
export function gameMaps(s: Source): MapDoc[] {
  const order = (s.get(paths.gates) as Gates | undefined)?.mapOrder ?? [];
  return order.map((id) => s.get(paths.map(id)) as MapDoc | undefined).filter((m): m is MapDoc => !!m);
}

/** a map by its name (or id) */
export function mapNamed(s: Source, name: string): MapDoc | null {
  const k = key(name);
  if (!k) return null;
  return gameMaps(s).find((m) => m.id === name || key(m.name) === k) ?? null;
}

/** every way out of every map */
export function mapLinks(s: Source): MapLink[] {
  const out: MapLink[] = [];
  for (const g of (s.get(paths.gates) as Gates | undefined)?.gates ?? []) {
    out.push({ from: g.from.map, to: g.to.map, at: { kind: 'spawn', id: g.from.spawn } });
    if (g.twoWay) out.push({ from: g.to.map, to: g.from.map, at: { kind: 'spawn', id: g.to.spawn } });
  }
  for (const m of gameMaps(s))
    for (const z of m.zones) {
      const t = [...(z.onEnter ?? [])].find((a) => a.do === 'travel') as { map?: string } | undefined;
      if (t?.map && t.map !== m.id) out.push({ from: m.id, to: t.map, at: { kind: 'zone', id: z.id } });
    }
  return out;
}

/** the first way out of `from` on the shortest road to `to` (fewest maps); null when there is none */
export function nextLink(links: readonly MapLink[], from: string, to: string): MapLink | null {
  if (from === to) return null;
  const firstStep = new Map<string, MapLink>();
  const seen = new Set([from]);
  let frontier = [from];
  while (frontier.length) {
    const next: string[] = [];
    for (const m of frontier)
      for (const l of links) {
        if (l.from !== m || seen.has(l.to)) continue;
        seen.add(l.to);
        firstStep.set(l.to, m === from ? l : firstStep.get(m)!);
        if (l.to === to) return firstStep.get(to)!;
        next.push(l.to);
      }
    frontier = next;
  }
  return null;
}

/**
 * the maps each named thing is on: "zone:old well", "spawn:arrival", "thing:mossbeard" (placed objects by their
 * asset's name, characters by name), "item:glowcap" (pickups that give it)
 */
export function placeIndex(s: Source): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  const put = (k: string, map: string) => {
    if (!k.endsWith(':')) {
      const l = idx.get(k);
      if (!l) idx.set(k, [map]);
      else if (!l.includes(map)) l.push(map);
    }
  };
  const assetName = new Map<string, Asset>();
  const asset = (id: string) => {
    let a = assetName.get(id);
    if (!a) {
      a = (s.get(paths.asset(id)) as Asset | undefined) ?? (BUILTIN_ASSETS.find((x) => x.id === id) as Asset);
      if (a) assetName.set(id, a);
    }
    return a;
  };
  const character = (id: string) =>
    (s.get(paths.character(id)) as Character | undefined) ??
    (BUILTIN_CHARACTERS.find((c) => c.id === id) as Character | undefined);
  for (const m of gameMaps(s)) {
    for (const z of m.zones) if (z.tags[0]) put(`zone:${key(z.tags[0])}`, m.id);
    for (const sp of m.spawns) put(`spawn:${key(sp.name)}`, m.id);
    for (const it of (s.get(paths.instances(m.id)) as Instances | undefined)?.items ?? []) {
      if (it.kind === 'asset') {
        const a = asset(it.asset);
        if (!a) continue;
        put(`thing:${key(a.name)}`, m.id);
        if (a.pickup?.item) put(`item:${key(a.pickup.item)}`, m.id);
      } else if (it.kind === 'npc') {
        const c = character(it.character);
        const n = c?.name ?? c?.profile?.name;
        if (n) put(`thing:${key(String(n))}`, m.id);
      }
    }
  }
  return idx;
}

/** the maps a place's name is on (a zone, a spawn point, an object or a character), first the ones listed first */
export function mapsOfPlace(idx: Map<string, string[]>, name: string): string[] {
  const k = key(name);
  if (!k) return [];
  return [
    ...new Set([...(idx.get(`zone:${k}`) ?? []), ...(idx.get(`spawn:${k}`) ?? []), ...(idx.get(`thing:${k}`) ?? [])]),
  ];
}
