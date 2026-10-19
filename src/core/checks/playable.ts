import { expandInstances } from '../assets/instances';
import { footprint } from '../bricks/inspect';
import { checkConversation, dialogueUses } from '../dialogue/checks';
import type { Conversation } from '../dialogue/schema';
import { surfaceOf } from '../gamegen/places';
import type { ProjectStore } from '../project/store';
import { EMPTY_PROGRESS, type ProgressDoc } from '../save/progress';
import { type Action, type Gates, type LogicGraph, type MapDoc, paths } from '../schema';
import { reachable as mapsReachable } from '../world/validate';

/**
 * P28: “Can this game be finished?” — checks a game the way a player would meet it, without playing it:
 * can the hero walk from where they arrive to every gate, every object they must use and every zone that does
 * something; can every map be reached; is every achievement unlockable and every collection findable; does
 * the game end. Each finding says where it is and, when it can, how to fix it.
 */
export type PlayIssue = {
  level: 'error' | 'warn' | 'info';
  code:
    | 'noStart'
    | 'mapUnreachable'
    | 'gateUnreachable'
    | 'objectUnreachable'
    | 'zoneUnreachable'
    | 'achievementNever'
    | 'achievementMissing'
    | 'collectionShort'
    | 'noEnding'
    | 'dialogueBroken'
    | 'dialogueUnused';
  message: string;
  /** P22: the conversation to open */
  conversation?: string;
  map?: string;
  /** what to select: an instance, a spawn or a zone */
  instance?: string;
  spawn?: string;
  zone?: string;
};

type Cells = Map<string, number>;

/** every action list of the game: assets' interactions, zones, screens, gates, cinematics' events */
function allActions(store: ProjectStore, maps: MapDoc[], withAssets = true): Action[] {
  const out: Action[] = [];
  if (withAssets)
    for (const p of store.list('assets/')) {
      const a = store.get<{ interactions?: { do: Action[] }[] }>(p);
      for (const i of a?.interactions ?? []) out.push(...i.do);
    }
  for (const m of maps) for (const z of m.zones) out.push(...(z.onEnter ?? []), ...(z.onExit ?? []));
  for (const p of store.list('screens/')) {
    const walk = (w: { onPress?: Action[]; children?: unknown[] }) => {
      out.push(...(w.onPress ?? []));
      for (const c of (w.children ?? []) as (typeof w)[]) walk(c);
    };
    const s = store.get<{ root: { onPress?: Action[]; children?: unknown[] }; onShow?: Action[] }>(p);
    if (s) {
      walk(s.root);
      out.push(...(s.onShow ?? []));
    }
  }
  for (const g of store.get<Gates>(paths.gates)?.gates ?? []) out.push(...(g.onArrive ?? []));
  return out;
}

const graphs = (store: ProjectStore) =>
  store
    .list('logic/lg_')
    .map((p) => store.get<LogicGraph>(p))
    .filter((g): g is LogicGraph => !!g);

/** The checks. Slower than the live Problems (it walks every map), so it runs when asked. */
export function checkPlayable(store: ProjectStore): PlayIssue[] {
  const out: PlayIssue[] = [];
  const gates = store.get<Gates>(paths.gates) ?? { gates: [], mapOrder: [] };
  const mapIds = gates.mapOrder.length ? gates.mapOrder : [store.manifest.entry.map];
  const maps = mapIds.map((id) => store.get<MapDoc>(paths.map(id))).filter((m): m is MapDoc => !!m);
  const entry = store.manifest.entry;
  const startMap = maps.find((m) => m.id === entry.map);
  if (!startMap || !startMap.spawns.length) {
    out.push({ level: 'error', code: 'noStart', message: 'The game has no start: give the start map a spawn point.' });
    return out;
  }
  const fromStart = mapsReachable(gates, entry.map);
  // where the hero arrives on each map: the start spawn, and the far end of every gate leading there
  const arrivals = new Map<string, string[]>();
  const arrive = (map: string, spawn: string | null) => {
    if (!spawn) return;
    arrivals.set(map, [...(arrivals.get(map) ?? []), spawn]);
  };
  arrive(entry.map, entry.spawn ?? startMap.spawns[0]!.id);
  for (const g of gates.gates) {
    arrive(g.to.map, g.to.spawn);
    if (g.twoWay) arrive(g.from.map, g.from.spawn);
  }
  const graphList = graphs(store);
  for (const m of maps) {
    if (!fromStart.has(m.id)) {
      out.push({
        level: 'warn',
        code: 'mapUnreachable',
        message: `${m.name}: no gate leads here from the start map, so players never see it.`,
        map: m.id,
      });
      continue;
    }
    const s = surfaceOf(store, m.id);
    const reach: Cells = new Map();
    for (const sid of arrivals.get(m.id) ?? []) {
      const sp = m.spawns.find((x) => x.id === sid);
      if (!sp) continue;
      for (const [k, d] of s.reach(Math.floor(sp.pos[0]), Math.floor(sp.pos[2]))) reach.set(k, d);
    }
    if (!reach.size) continue;
    /** a reachable cell within `pad` studs of the rectangle (and, given a height in plates, standing near it) */
    const near = (x0: number, z0: number, x1: number, z1: number, pad = 2, y?: number) => {
      for (let x = Math.floor(x0) - pad; x <= Math.ceil(x1) + pad; x++)
        for (let z = Math.floor(z0) - pad; z <= Math.ceil(z1) + pad; z++) {
          if (!reach.has(`${x},${z}`)) continue;
          if (y === undefined || Math.abs((s.topAt(x, z) ?? 0) - y) <= 6) return true;
        }
      return false;
    };
    /** a cell inside the zone the hero can stand on, at a height inside it (the zone tests the hero's middle) */
    const walkIn = (z: { min: number[]; max: number[] }) => {
      for (let x = Math.floor(z.min[0]!); x <= Math.ceil(z.max[0]!); x++)
        for (let zz = Math.floor(z.min[2]!); zz <= Math.ceil(z.max[2]!); zz++) {
          if (!reach.has(`${x},${zz}`)) continue;
          const y = (s.topAt(x, zz) ?? 0) * 0.4 + 1;
          if (y >= z.min[1]! - 0.5 && y <= z.max[1]! + 0.5) return true;
        }
      return false;
    };
    // gates that leave this map
    for (const g of gates.gates) {
      const from = g.from.map === m.id ? g.from.spawn : g.twoWay && g.to.map === m.id ? g.to.spawn : null;
      if (!from) continue;
      const sp = m.spawns.find((x) => x.id === from);
      if (!sp) continue;
      const toMap = g.from.map === m.id ? g.to.map : g.from.map;
      if (!near(sp.pos[0], sp.pos[2], sp.pos[0], sp.pos[2], 1))
        out.push({
          level: 'warn',
          code: 'gateUnreachable',
          message: `${m.name}: the gate to ${store.get<MapDoc>(paths.map(toMap))?.name ?? 'another map'} (spawn “${sp.name}”) can’t be walked to from where the hero arrives.`,
          map: m.id,
          spawn: sp.id,
        });
    }
    // objects the hero must use: interactions, checkpoints
    for (const e of expandInstances(store, m.id)) {
      const must = e.def.interactions.length > 0 || !!e.def.checkpoint;
      if (!must || !e.bricks.length) continue;
      let x0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let z1 = -Infinity;
      let y0 = Infinity;
      for (const b of e.bricks) {
        y0 = Math.min(y0, b.y);
        const [w, d] = footprint(b);
        x0 = Math.min(x0, b.x);
        z0 = Math.min(z0, b.z);
        x1 = Math.max(x1, b.x + w - 1);
        z1 = Math.max(z1, b.z + d - 1);
      }
      if (!near(x0, z0, x1, z1, 2, y0))
        out.push({
          level: 'warn',
          code: 'objectUnreachable',
          message: `${m.name}: ${e.inst.name ?? e.def.name} can’t be reached on foot from where the hero arrives.`,
          map: m.id,
          instance: e.inst.id,
        });
    }
    // zones that do something (their own actions, or logic listening for them)
    for (const z of m.zones) {
      const used =
        !!z.onEnter?.length ||
        !!z.onExit?.length ||
        z.music !== undefined ||
        graphList.some((g) => g.nodes.some((n) => /^event\.on(Enter|Exit)Zone$/.test(n.type) && n.args?.zone === z.id));
      if (used && !walkIn(z))
        out.push({
          level: 'warn',
          code: 'zoneUnreachable',
          message: `${m.name}: zone “${z.tags[0] ?? 'Zone'}” does something, but the hero can’t walk into it.`,
          map: m.id,
          zone: z.id,
        });
    }
  }
  // progress: every achievement can be unlocked, every collection can be found, the game can end
  const progress = store.get<ProgressDoc>(paths.progress) ?? EMPTY_PROGRESS;
  const actions = allActions(store, maps);
  const unlockedBy = new Set<string>([
    ...actions.filter((a) => a.do === 'achieve').map((a) => (a as { id: string }).id),
    ...graphList.flatMap((g) =>
      g.nodes.filter((n) => n.type === 'game.unlockAchievement').map((n) => String(n.args?.achievement ?? '')),
    ),
  ]);
  for (const a of progress.achievements)
    if (!unlockedBy.has(a.id))
      out.push({
        level: 'warn',
        code: 'achievementNever',
        message: `Achievement “${a.name}” (${a.id}) is never unlocked: add Unlock achievement › ${a.id} in Logic.`,
      });
  for (const id of unlockedBy)
    if (id && !progress.achievements.some((a) => a.id === id))
      out.push({
        level: 'warn',
        code: 'achievementMissing',
        message: `Logic unlocks “${id}”, but Project › Progress has no achievement with that id.`,
      });
  for (const c of progress.collections) {
    let found = 0;
    let open = false;
    // zones, screens and gates give once; an asset's interaction gives once per placed copy
    for (const a of allActions(store, maps, false)) if (a.do === 'give' && a.item === c.item) found += a.count ?? 1;
    for (const m of maps)
      for (const e of expandInstances(store, m.id))
        for (const i of e.def.interactions)
          for (const a of i.do) if (a.do === 'give' && a.item === c.item) found += a.count ?? 1;
    for (const g of graphList)
      for (const n of g.nodes) {
        if (n.type !== 'world.give' || String(n.args?.item ?? '') !== c.item) continue;
        // a give in logic may run many times: the count can’t be known without playing
        open = true;
      }
    const drops = store
      .list('characters/')
      .some(
        (p) =>
          store.get<{ harm?: { health?: { atZero?: { drop?: { item: string } } } } }>(p)?.harm?.health?.atZero?.drop
            ?.item === c.item,
      );
    if (drops) open = true;
    if (!open && found < c.total)
      out.push({
        level: 'warn',
        code: 'collectionShort',
        message: found
          ? `${c.label}: ${c.total} to find, but only ${found} ${c.item} can be given.`
          : `${c.label}: ${c.total} to find, but nothing gives “${c.item}” (Give item, a drop, or logic).`,
      });
  }
  const ends =
    actions.some((a) => a.do === 'game' && a.op === 'finish') ||
    graphList.some((g) => g.nodes.some((n) => n.type === 'game.finish'));
  if (!ends && (progress.newGamePlus.enabled || progress.bests.some((b) => b.better === 'lower')))
    out.push({
      level: 'info',
      code: 'noEnding',
      message: 'Nothing finishes the game (Finish game), so New game + and lower-is-better best scores never happen.',
    });
  // P22: conversations with mistakes, and conversations nothing starts
  for (const p of store.list(paths.dialogueDir)) {
    const conv = store.get<Conversation>(p);
    if (!conv) continue;
    const bad = checkConversation(conv, {
      character: (id) => store.has(paths.character(id)),
      file: (f) => store.has(f),
    }).filter((i) => i.level === 'error');
    if (bad.length)
      out.push({
        level: 'error',
        code: 'dialogueBroken',
        message: `Conversation “${conv.name}”: ${bad[0]!.message}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''}`,
        conversation: conv.id,
      });
    if (!dialogueUses(store, conv.id).length)
      out.push({
        level: 'info',
        code: 'dialogueUnused',
        message: `Nothing starts the conversation “${conv.name}”: put it in a character’s Talk list, on a sign, or in an action.`,
        conversation: conv.id,
      });
  }
  return out;
}
