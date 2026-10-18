import type { LegacyPiece } from '../../core/legacy/types';
import { type MapSave, type SaveGame, slotName } from '../../core/save/save';
import { type Asset, type MapDoc, paths } from '../../core/schema';
import type { Npc } from '../legacy/runtime-modules';
import type { HealthBook } from './health';

/** what a save reads from and writes to a map in play (the session's MapWorld) */
export type SaveWorld = {
  mapId: string;
  doc: MapDoc;
  pieces: LegacyPiece[];
  broken: { id: number; originals: LegacyPiece[]; progress: number }[];
  brokenSerial: number;
  npcs: Npc[];
  instances: {
    inst: { id: string; asset: string; pos: [number, number, number]; rot: number; idBase: number };
    def: Asset;
    state: string;
    anim?: unknown;
  }[];
  /** what the map started with (instance id → state, neighbour ids): a save keeps only what changed */
  start: { instances: Map<string, string>; npcs: number[] };
  dirtyChunks: Set<string>;
  rev: number;
};

/** The play session as saving sees it (a structural type, so this file does not import the session). */
export interface SaveHost {
  readonly snapshot: { get(path: string): unknown };
  readonly project: { id: string; entry: { map: string; spawn: string | null } };
  readonly worlds: Map<string, SaveWorld>;
  world: SaveWorld;
  loadWorld(mapId: string): SaveWorld;
  readonly heroState: { x: number; y: number; z: number; heading: number };
  hero: Record<string, unknown>;
  readonly inventory: Map<string, number>;
  readonly health: HealthBook;
  readonly logic: { vars: Map<string, unknown> };
  readonly cine: { seen: Set<string> };
  checkpoint: { map: string; spawn: string | null; pos?: [number, number, number]; heading?: number };
  playTime(): number;
  findAsset(ref: string): Asset | null;
  placeCopy(def: Asset, pos: [number, number, number], rot: number, as?: { id: string; idBase: number }): string | null;
  despawn(target: string): void;
  setInstanceState(instanceId: string | undefined, state: string): void;
  /** brick rules check for a changed list of pieces */
  piecesOk(pieces: LegacyPiece[]): boolean;
  /** after pieces changed: collision and neighbours see it */
  piecesChanged(w: SaveWorld): void;
  chunkOf(p: LegacyPiece): string;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** What changed on one map since it was loaded. */
export function captureMap(w: SaveWorld): MapSave {
  const states: Record<string, string> = {};
  const spawned: MapSave['spawned'] = [];
  const here = new Set<string>();
  for (const i of w.instances) {
    here.add(i.inst.id);
    const start = w.start.instances.get(i.inst.id);
    if (start === undefined)
      spawned.push({
        id: i.inst.id,
        asset: i.def.id,
        pos: [...i.inst.pos],
        rot: i.inst.rot,
        idBase: i.inst.idBase,
        state: i.state,
      });
    else if (i.state !== start) states[i.inst.id] = i.state;
  }
  const removed = [...w.start.instances.keys()].filter((id) => !here.has(id));
  const npcs: MapSave['npcs'] = {};
  for (const n of w.npcs)
    npcs[String(n.id)] = { x: n.state.x, y: n.state.y, z: n.state.z, heading: Number(n.state.heading ?? 0) };
  const alive = new Set(w.npcs.map((n) => n.id));
  return {
    states,
    removed,
    spawned,
    broken: w.broken.map((b) =>
      b.originals.map((p) => [p.id ?? -1, p.x, p.y, p.z] as [number, number, number, number]),
    ),
    npcs,
    npcsGone: w.start.npcs.filter((id) => !alive.has(id)),
  };
}

/** The whole game as it stands now, ready to keep in a slot. */
export function captureSave(h: SaveHost, slot: number): SaveGame {
  const maps: Record<string, MapSave> = {};
  for (const [id, w] of h.worlds) maps[id] = captureMap(w);
  const s = h.heroState;
  const health: Record<string, number> = {};
  for (const w of h.health.entries()) health[w.key] = w.hp;
  const vars: Record<string, unknown> = {};
  for (const [k, v] of h.logic.vars) if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) vars[k] = v;
  return {
    format: 'brickworlds-save',
    v: 1,
    game: h.project.id,
    slot,
    savedAt: new Date().toISOString(),
    playTime: Math.round(h.playTime() * 10) / 10,
    label: h.world.doc.name,
    map: h.world.mapId,
    hero: {
      pos: [s.x, s.y, s.z],
      heading: s.heading,
      ...(typeof h.hero.held === 'string' ? { held: h.hero.held } : {}),
      ...(typeof h.hero.offHand === 'string' ? { offHand: h.hero.offHand } : {}),
    },
    checkpoint: { ...h.checkpoint },
    vars,
    inventory: Object.fromEntries(h.inventory),
    health,
    seen: [...h.cine.seen],
    maps,
  };
}

/**
 * Puts one map back the way the save found it. The world must be freshly loaded. Everything is matched
 * by id, and anything that is gone (the maker deleted it, or it no longer fits) is skipped: never an error.
 * Returns how many things were skipped.
 */
export function restoreMap(h: SaveHost, w: SaveWorld, m: MapSave): number {
  let skipped = 0;
  const before = h.world;
  h.world = w;
  try {
    // objects added in play first: smashed bricks may belong to them
    for (const s of m.spawned) {
      const def = h.findAsset(s.asset);
      if (!def || !h.placeCopy(def, s.pos, s.rot, { id: s.id, idBase: s.idBase })) {
        skipped++;
        continue;
      }
      if (s.state !== def.initialState) h.setInstanceState(s.id, s.state);
    }
    for (const id of m.removed) {
      if (!w.instances.some((i) => i.inst.id === id)) continue;
      h.despawn(id);
      if (w.instances.some((i) => i.inst.id === id)) skipped++;
    }
    for (const [id, state] of Object.entries(m.states)) {
      const inst = w.instances.find((i) => i.inst.id === id);
      if (!inst || !inst.def.states.includes(state)) {
        skipped++;
        continue;
      }
      h.setInstanceState(id, state);
      if (inst.state !== state) skipped++;
    }
    // things that open or rise are already open: no easing on load
    for (const i of w.instances) delete i.anim;
    for (const group of m.broken) {
      const take = new Set<LegacyPiece>();
      for (const [id, x, y, z] of group) {
        // the same brick: same id at the same place; else whatever brick now sits exactly there
        const p =
          w.pieces.find((q) => q.id === id && near(q.x, x) && near(q.y, y) && near(q.z, z)) ??
          w.pieces.find((q) => near(q.x, x) && near(q.y, y) && near(q.z, z));
        if (p) take.add(p);
      }
      if (!take.size) {
        skipped++;
        continue;
      }
      const remaining = w.pieces.filter((p) => !take.has(p));
      if (!h.piecesOk(remaining)) {
        skipped++;
        continue;
      }
      const originals = [...take].map((p) => ({ ...p }));
      for (const p of originals) w.dirtyChunks.add(h.chunkOf(p));
      w.pieces = remaining;
      w.broken.push({ id: w.brokenSerial++, originals, progress: 0 });
    }
    if (m.broken.length) h.piecesChanged(w);
    const gone = new Set(m.npcsGone);
    w.npcs = w.npcs.filter((n) => !gone.has(n.id));
    for (const n of w.npcs) {
      const at = m.npcs[String(n.id)];
      if (at) Object.assign(n.state, at);
    }
  } finally {
    h.world = before;
  }
  return skipped;
}

/** what a load reports: which map the hero is on, and how much of the save no longer fits the game */
export type LoadResult = { map: string; skipped: number };

/**
 * Loads a save into the session: every visited map is reloaded from the game and the save's changes put
 * back, then the hero, inventory, variables and health. Maps the maker removed are skipped.
 */
export function applySave(h: SaveHost, save: SaveGame): LoadResult {
  let skipped = 0;
  h.worlds.clear();
  for (const [id, m] of Object.entries(save.maps)) {
    if (!h.snapshot.get(paths.map(id))) {
      skipped++;
      continue;
    }
    skipped += restoreMap(h, h.loadWorld(id), m);
  }
  const map = h.snapshot.get(paths.map(save.map)) ? save.map : h.project.entry.map;
  h.world = h.loadWorld(map);
  h.inventory.clear();
  for (const [k, v] of Object.entries(save.inventory)) h.inventory.set(k, v);
  h.logic.vars.clear();
  for (const [k, v] of Object.entries(save.vars)) h.logic.vars.set(k, v);
  h.health.clear();
  h.health.preset(save.health);
  h.cine.seen.clear();
  for (const id of save.seen) h.cine.seen.add(id);
  if (save.hero.held) h.hero.held = save.hero.held;
  if (save.hero.offHand) h.hero.offHand = save.hero.offHand;
  const cp = save.checkpoint;
  h.checkpoint = h.snapshot.get(paths.map(cp.map))
    ? { ...cp }
    : { map, spawn: (h.snapshot.get(paths.map(map)) as MapDoc).spawns[0]?.id ?? null };
  return { map, skipped };
}

/** “Saved to Slot 1” / “Loaded Slot 2 (3 things changed in the game since)” */
export function loadMessage(slot: number, r: LoadResult): string {
  return `Loaded ${slotName(slot)}${r.skipped ? ` (${r.skipped} thing${r.skipped === 1 ? '' : 's'} in it changed in the game since, skipped)` : ''}`;
}
