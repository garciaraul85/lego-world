import { LEGACY_COLORS } from '../legacy/constants';
import type { LegacyBuild, LegacyLink, LegacyMapEntry, LegacyPiece, LegacySave } from '../legacy/types';
import { rebuildConfig } from '../migrate/v4to5';
import type { Character, Chunk, Gates, Instances, MapDoc, MapState, Project, Settings } from '../schema';
import { paths } from '../schema';

export type FileSource = { get(path: string): unknown; keys(): Iterable<string> };

const COLOR_INDEX = new Map(LEGACY_COLORS.map(([, hex], i) => [hex, i]));

/** "brick2x4" -> kind/rows/cols */
export function parseType(type: string): Pick<LegacyPiece, 'kind' | 'rows' | 'cols'> {
  const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(type);
  if (!m) throw new Error(`unknown brick type ${type}`);
  return { kind: m[1] as LegacyPiece['kind'], rows: Number(m[2]), cols: Number(m[3]) };
}

/** Chunk files of one map -> legacy pieces in id order (v68 keeps pieces in id order). */
export function chunksToPieces(files: FileSource, mapId: string): LegacyPiece[] {
  const prefix = paths.chunkDir(mapId);
  const pieces: LegacyPiece[] = [];
  for (const path of files.keys()) {
    if (!path.startsWith(prefix)) continue;
    const c = files.get(path) as Chunk;
    for (const b of c.bricks) {
      const { kind, rows, cols } = parseType(c.palette.types[b[0]]!);
      const color = COLOR_INDEX.get(c.palette.colors[b[5]]!);
      if (color === undefined) throw new Error(`color ${c.palette.colors[b[5]]} has no legacy index`);
      const p: LegacyPiece = { id: b[7], rows, cols, turn: b[4], x: b[1], y: b[2], z: b[3], kind, color };
      if (b[8] >= 0) p.group = c.palette.groups[b[8]]!;
      pieces.push(p);
    }
  }
  return pieces.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

/** One map's v5 files -> the legacy build object v68 expects for a map. */
export function mapToLegacyBuild(files: FileSource, mapId: string): LegacyBuild {
  const map = files.get(paths.map(mapId)) as MapDoc;
  const state = (files.get(paths.state(mapId)) as MapState | undefined) ?? { broken: [], player: null };
  const instances = (files.get(paths.instances(mapId)) as Instances | undefined) ?? { npcsSaved: false, items: [] };
  const env = { time: map.sky.time, rain: map.weather.rain, snow: map.weather.snow, snowing: map.weather.snowing };
  const legacy = (map.legacy ?? {}) as Record<string, unknown>;
  let world: LegacyBuild['world'] = null;
  if (map.generator) {
    world = {
      config: (legacy.worldConfig as Record<string, unknown>) ?? rebuildConfig(map.generator, env),
      ...(legacy.noLayoutVersion ? {} : { layoutVersion: map.generator.version }),
      ...(map.size ? { width: map.size.w, depth: map.size.d } : {}),
      ...((legacy.world as object) ?? {}),
    };
  }
  const build: LegacyBuild = {
    pieces: chunksToPieces(files, mapId),
    world,
    environment: env,
    broken: state.broken,
    player: state.player,
  };
  if (instances.npcsSaved) {
    build.npcs = instances.items.flatMap((i) => {
      if (i.kind !== 'npc') return [];
      const chr = files.get(paths.character(i.character)) as Character;
      return [{ id: i.legacyId, biome: i.biome, role: i.role, profile: chr.profile, state: i.state }];
    });
  }
  return { ...build, ...((legacy.build as object) ?? {}) };
}

/** Assigns stable small integers for v68 to v5 objects that do not have a legacyId (created by the engine). */
function intIds<T extends { legacyId?: number | undefined }>(items: T[]): Map<T, number> {
  const used = new Set(items.flatMap((i) => (i.legacyId ? [i.legacyId] : [])));
  let next = 1;
  const out = new Map<T, number>();
  for (const i of items) {
    if (i.legacyId) out.set(i, i.legacyId);
    else {
      while (used.has(next)) next++;
      used.add(next);
      out.set(i, next);
    }
  }
  return out;
}

/**
 * Whole v5 project -> a v4 `brick-builder` save that LEGO World v68 loads (the legacy bridge, P0.8).
 * The entry map is the active map, as in v68.
 */
export function toLegacy(files: FileSource, opts: { activeMap?: string } = {}): LegacySave {
  const project = files.get(paths.project) as Project;
  const settings = (files.get(paths.settings) as Settings | undefined) ?? { quality: 'auto' };
  const sl = (settings.legacy ?? {}) as Record<string, unknown>;
  const gates = (files.get(paths.gates) as Gates | undefined) ?? { gates: [], mapOrder: [] };
  const maps = gates.mapOrder.map((id) => files.get(paths.map(id)) as MapDoc);
  const mapInt = intIds(maps);
  const byId = new Map(maps.map((m) => [m.id, m]));
  const active = byId.get((opts.activeMap ?? project.entry.map) as never) ?? maps[0];
  if (!active) throw new Error('project has no maps');
  const activeBuild = mapToLegacyBuild(files, active.id);

  // v68 key order: format, version, npcs, characters, player, broken, pieces, world, environment, maps
  const ordered: Record<string, unknown> = { format: 'brick-builder', version: 4 };
  if (activeBuild.npcs !== undefined) ordered.npcs = activeBuild.npcs;
  if (sl.characters !== false) {
    const heroes = [...files.keys()]
      .filter((p) => p.startsWith('characters/'))
      .map((p) => files.get(p) as Character)
      .filter((c) => c.role === 'hero');
    const heroInt = intIds(heroes);
    const items = heroes.map((c) => ({ id: heroInt.get(c)!, profile: c.profile })).sort((a, b) => a.id - b.id);
    const activeId =
      sl.activeCharacterId !== undefined
        ? sl.activeCharacterId
        : heroes.find((h) => h.id === project.hero)
          ? heroInt.get(heroes.find((h) => h.id === project.hero)!)
          : undefined;
    ordered.characters = activeId === undefined ? { items } : { items, activeId };
  }
  for (const k of ['player', 'broken', 'pieces', 'world', 'environment'] as const) ordered[k] = activeBuild[k];
  for (const [k, v] of Object.entries(activeBuild)) if (!(k in ordered) && k !== 'npcs') ordered[k] = v;
  if (sl.mapNetwork !== false) {
    const spawnInt = (m: MapDoc) => intIds(m.spawns);
    const spawnLookup = new Map<string, [number, number]>();
    const entries: LegacyMapEntry[] = maps.map((m) => {
      const sInt = spawnInt(m);
      for (const s of m.spawns) spawnLookup.set(s.id, [mapInt.get(m)!, sInt.get(s)!]);
      const entry: LegacyMapEntry = {
        id: mapInt.get(m)!,
        name: m.name,
        spawns: m.spawns.map((s) => ({
          id: sInt.get(s)!,
          name: s.name,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          heading: s.yaw,
        })),
      };
      // v68 writes build: null for the active map (its build is the top level of the save)
      entry.build = m === active ? null : mapToLegacyBuild(files, m.id);
      return entry;
    });
    const links: LegacyLink[] = intIds(gates.gates).size
      ? [...intIds(gates.gates)].map(([g, id]) => {
          const [fm, fs] = spawnLookup.get(g.from.spawn)!;
          const [tm, ts] = spawnLookup.get(g.to.spawn)!;
          return { id, from: { mapId: fm, spawnId: fs }, to: { mapId: tm, spawnId: ts }, twoWay: g.twoWay };
        })
      : [];
    ordered.maps = {
      activeId: mapInt.get(active)!,
      nextId: (sl.mapNextId as number | undefined) ?? Math.max(...mapInt.values()) + 1,
      maps: entries,
      links,
    };
  }
  if (sl.top && typeof sl.top === 'object') Object.assign(ordered, sl.top);
  return ordered as LegacySave;
}
