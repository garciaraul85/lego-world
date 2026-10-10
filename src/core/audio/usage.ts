import type { Action, Asset, Cinematic, Clip, Gates, Instances, LogicGraph, MapDoc, Screen, Widget } from '../schema';

type Files = { get(path: string): unknown; keys(): Iterable<string> };
export type Use = { path: string; what: string };

const actionUses = (list: readonly Action[] | undefined, id: string) =>
  (list ?? []).some(
    (a) =>
      (a.do === 'sound' && a.event === id) ||
      (a.do === 'music' && a.music === id) ||
      (a.do === 'cinematic' && a.cinematic === id) ||
      ((a.do === 'showScreen' || a.do === 'hideScreen') && a.screen === id),
  );

function widgetUses(w: Widget, id: string): boolean {
  return w.sound === id || actionUses(w.onPress, id) || (w.children ?? []).some((c) => widgetUses(c, id));
}

/**
 * Where a sound event, music state, screen or cinematic id is used across the project ("where used" in the
 * Audio and Screens workspaces, and the delete guard).
 */
export function usesOf(files: Files, id: string): Use[] {
  const out: Use[] = [];
  for (const path of files.keys()) {
    const v = files.get(path);
    if (/^maps\/[^/]+\/map\.json$/.test(path)) {
      const m = v as MapDoc;
      if (m.music === id) out.push({ path, what: `${m.name} · map music` });
      if (m.ambience === id) out.push({ path, what: `${m.name} · map ambience` });
      for (const z of m.zones)
        if (z.music === id || z.ambience === id || actionUses(z.onEnter, id) || actionUses(z.onExit, id))
          out.push({ path, what: `${m.name} · trigger zone ${z.tags[0] ?? z.id}` });
    } else if (/^maps\/[^/]+\/instances\.json$/.test(path)) {
      for (const i of (v as Instances).items)
        if (i.kind === 'emitter' && i.sound === id) out.push({ path, what: `emitter ${i.name ?? i.id}` });
    } else if (path.startsWith('assets/')) {
      const a = v as Asset;
      if (a.interactions.some((x) => actionUses(x.do, id)) || a.smash.sound === id)
        out.push({ path, what: `asset ${a.name}` });
    } else if (path.startsWith('screens/')) {
      const s = v as Screen;
      if (s.music === id || widgetUses(s.root, id) || actionUses(s.onShow, id) || actionUses(s.onBack, id))
        out.push({ path, what: `screen ${s.name}` });
    } else if (path.startsWith('clips/')) {
      const c = v as Clip;
      if (c.events.some((e) => ('sound' in e && e.sound === id) || ('cinematic' in e && e.cinematic === id)))
        out.push({ path, what: `clip ${c.name ?? c.id}` });
    } else if (path === 'world/gates.json') {
      for (const g of (v as Gates).gates)
        if (actionUses(g.onArrive, id)) out.push({ path, what: `gate ${g.id} · on arrive` });
    } else if (path.startsWith('cinematics/')) {
      const c = v as Cinematic;
      if (c.tracks.some((t) => JSON.stringify(t.items).includes(`"${id}"`)))
        out.push({ path, what: `cinematic ${c.name}` });
    } else if (/^logic\/lg_/.test(path)) {
      const g = v as LogicGraph;
      if (g.nodes.some((n) => Object.values(n.args ?? {}).includes(id))) out.push({ path, what: `logic ${g.name}` });
    }
  }
  return out;
}
