import { type Id, legacyId } from '../ids';
import { LEGACY_COLORS } from '../legacy/constants';
import type { LegacyBuild, LegacyMapEntry, LegacyPiece, LegacySave } from '../legacy/types';
import {
  type BrickTuple,
  CHUNK,
  type Character,
  type Chunk,
  type Gates,
  type Instances,
  type MapDoc,
  type MapState,
  paths,
  type Settings,
  type Spawn,
} from '../schema';
import type { Problem } from './problems';

/** Keys of a legacy map build that v5 models; anything else is preserved in map.legacy.build. */
const BUILD_KEYS = new Set(['pieces', 'world', 'environment', 'broken', 'player', 'npcs']);
const TOP_KEYS = new Set([...BUILD_KEYS, 'format', 'version', 'characters', 'maps']);
const CONFIG_KEYS = ['biomes', 'size', 'seed', 'mountainShape', 'mountainScale', 'time', 'rain', 'snow', 'snowing'];

/** Deterministic v5 ids for legacy objects, so re-importing the same save yields the same files. */
export const ids = {
  map: (m: number) => legacyId('map', m),
  spawn: (m: number, s: number) => legacyId('spawn', m * 100_000 + s),
  gate: (l: number) => legacyId('gate', l),
  hero: (c: number) => legacyId('character', c),
  npcCharacter: (m: number, n: number) => legacyId('character', 1_000_000_000 + m * 100_000 + n),
  npcInstance: (m: number, n: number) => legacyId('instance', m * 100_000 + n),
};

export const pieceType = (p: Pick<LegacyPiece, 'kind' | 'rows' | 'cols'>) => `${p.kind}${p.rows}x${p.cols}`;

/** Splits pieces into 32x32-stud chunk files. Bricks inside a chunk keep id order. */
export function piecesToChunks(pieces: LegacyPiece[]): Chunk[] {
  const byKey = new Map<string, LegacyPiece[]>();
  for (const p of [...pieces].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    const key = `${Math.floor(p.x / CHUNK)}_${Math.floor(p.z / CHUNK)}`;
    const list = byKey.get(key) ?? [];
    if (!byKey.has(key)) byKey.set(key, list);
    list.push(p);
  }
  const chunks: Chunk[] = [];
  for (const [key, list] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    const [cx, cz] = key.split('_').map(Number) as [number, number];
    const types: string[] = [];
    const colors: string[] = [];
    const groups: string[] = [];
    const index = (arr: string[], v: string) => {
      const i = arr.indexOf(v);
      return i >= 0 ? i : arr.push(v) - 1;
    };
    const bricks = list.map((p): BrickTuple => {
      const hex = LEGACY_COLORS[p.color]?.[1];
      if (!hex) throw new Error(`brick ${p.id} has unknown legacy color ${p.color}`);
      return [
        index(types, pieceType(p)),
        p.x,
        p.y,
        p.z,
        p.turn,
        index(colors, hex),
        0,
        p.id ?? 0,
        p.group === undefined ? -1 : index(groups, p.group),
      ];
    });
    chunks.push({ cx, cz, palette: { types, colors, groups }, bricks });
  }
  return chunks;
}

function spawnsOf(mapLegacy: number, entry: LegacyMapEntry | undefined): Spawn[] {
  return (entry?.spawns ?? []).map((s) => ({
    id: ids.spawn(mapLegacy, s.id),
    name: s.name,
    pos: [s.x, s.y, s.z],
    yaw: s.heading,
    legacyId: s.id,
  }));
}

function mapDoc(mapLegacy: number, name: string, entry: LegacyMapEntry | undefined, build: LegacyBuild): MapDoc {
  const env = build.environment ?? { time: 'day', rain: false, snow: false, snowing: false };
  const w = build.world ?? null;
  const legacy: Record<string, unknown> = {};
  let generator: MapDoc['generator'] = null;
  if (w) {
    const c = w.config;
    generator = {
      environments: (c.biomes ?? []) as never,
      seed: c.seed as number,
      size: c.size as 16 | 24 | 32,
      ...(c.mountainShape !== undefined ? { mountainShape: String(c.mountainShape) } : {}),
      ...(c.mountainScale !== undefined ? { mountainScale: String(c.mountainScale) } : {}),
      version: w.layoutVersion ?? 1,
      locked: false,
    };
    // v68 saves world.config = {...config, ...environment}; keep the original when it differs from what we rebuild.
    const rebuilt = rebuildConfig(generator, env);
    if (JSON.stringify(sortObj(rebuilt)) !== JSON.stringify(sortObj(c))) legacy.worldConfig = c;
    if (w.layoutVersion === undefined) legacy.noLayoutVersion = true;
    const extraWorld = Object.fromEntries(
      Object.entries(w).filter(([k]) => !['config', 'layoutVersion', 'width', 'depth'].includes(k)),
    );
    if (Object.keys(extraWorld).length) legacy.world = extraWorld;
  }
  const extraBuild = Object.fromEntries(Object.entries(build).filter(([k]) => !BUILD_KEYS.has(k)));
  if (Object.keys(extraBuild).length) legacy.build = extraBuild;
  return {
    id: ids.map(mapLegacy),
    name,
    size: w?.width && w.depth ? { w: w.width, d: w.depth } : null,
    sky: { time: env.time as MapDoc['sky']['time'] },
    weather: { rain: env.rain, snow: env.snow, snowing: env.snowing },
    generator,
    music: null,
    ambience: null,
    spawns: spawnsOf(mapLegacy, entry),
    zones: [],
    legacyId: mapLegacy,
    ...(Object.keys(legacy).length ? { legacy } : {}),
  };
}

export function rebuildConfig(
  g: NonNullable<MapDoc['generator']>,
  env: { time: string; rain: boolean; snow: boolean; snowing: boolean },
) {
  const c: Record<string, unknown> = { biomes: g.environments, size: g.size, seed: g.seed };
  if (g.mountainShape !== undefined) c.mountainShape = g.mountainShape;
  if (g.mountainScale !== undefined) c.mountainScale = g.mountainScale;
  return { ...c, time: env.time, rain: env.rain, snow: env.snow, snowing: env.snowing };
}

function sortObj(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

function mapFiles(
  files: Map<string, unknown>,
  mapLegacy: number,
  name: string,
  entry: LegacyMapEntry | undefined,
  build: LegacyBuild,
  problems: Problem[],
) {
  const id = ids.map(mapLegacy);
  const doc = mapDoc(mapLegacy, name, entry, build);
  files.set(paths.map(id), doc);
  const ordered = build.pieces.every((p, i, a) => i === 0 || (p.id ?? 0) > (a[i - 1]?.id ?? 0));
  if (!ordered)
    problems.push({
      level: 'warn',
      code: 'legacy.pieceOrder',
      message: `${name}: bricks are stored by id order; original file order differed.`,
      file: paths.map(id),
    });
  for (const c of piecesToChunks(build.pieces)) files.set(paths.chunk(id, c.cx, c.cz), c);
  const state: MapState = {
    broken: (build.broken ?? []).map((b) => ({
      id: b.id,
      originals: b.originals.map(cleanPiece),
      ...(typeof (b as { progress?: unknown }).progress === 'number'
        ? { progress: (b as { progress: number }).progress }
        : {}),
    })),
    player: build.player ?? null,
  };
  files.set(paths.state(id), state);
  const instances: Instances = { npcsSaved: build.npcs !== undefined, items: [] };
  for (const n of build.npcs ?? []) {
    const chr: Character = {
      id: ids.npcCharacter(mapLegacy, n.id),
      name: String(n.profile?.name ?? `Neighbor ${n.id}`),
      role: 'npc',
      profile: n.profile,
      legacyId: n.id,
    };
    files.set(paths.character(chr.id), chr);
    instances.items.push({
      id: ids.npcInstance(mapLegacy, n.id),
      kind: 'npc',
      character: chr.id,
      legacyId: n.id,
      biome: n.biome,
      role: n.role,
      state: n.state,
    });
  }
  files.set(paths.instances(id), instances);
  return id;
}

function cleanPiece(p: LegacyPiece) {
  const out = {
    id: p.id ?? 0,
    rows: p.rows,
    cols: p.cols,
    kind: p.kind,
    color: p.color,
    turn: p.turn,
    x: p.x,
    y: p.y,
    z: p.z,
  };
  return p.group === undefined ? out : { ...out, group: p.group };
}

export type V5Options = { projectId: Id<'project'>; name: string; now: string };

/** v4 legacy save -> map of v5 project files (without project.json's `files` index; the store fills it). */
export function v4to5(save: LegacySave, opts: V5Options, problems: Problem[]): Map<string, unknown> {
  const files = new Map<string, unknown>();
  const settingsLegacy: Record<string, unknown> = {};
  const net = save.maps;
  const mapOrder: Id<'map'>[] = [];
  let activeLegacy = 1;
  if (net && Array.isArray(net.maps) && net.maps.length) {
    activeLegacy = net.activeId;
    settingsLegacy.mapNextId = net.nextId;
    for (const entry of net.maps) {
      const build = entry.id === net.activeId ? (save as LegacyBuild) : entry.build;
      if (!build) {
        problems.push({
          level: 'warn',
          code: 'legacy.emptyMap',
          message: `Map "${entry.name}" had no saved build; it starts empty.`,
        });
      }
      mapOrder.push(mapFiles(files, entry.id, entry.name, entry, build ?? { pieces: [] }, problems));
    }
  } else {
    settingsLegacy.mapNetwork = false;
    mapOrder.push(mapFiles(files, 1, 'Map 1', undefined, save, problems));
  }
  const gates: Gates = {
    gates: (net?.links ?? []).map((l) => ({
      id: ids.gate(l.id),
      from: { map: ids.map(l.from.mapId), spawn: ids.spawn(l.from.mapId, l.from.spawnId) },
      to: { map: ids.map(l.to.mapId), spawn: ids.spawn(l.to.mapId, l.to.spawnId) },
      twoWay: l.twoWay,
      legacyId: l.id,
    })),
    mapOrder,
  };
  files.set(paths.gates, gates);

  let hero: Id<'character'> | null = null;
  if (save.characters) {
    for (const c of save.characters.items ?? []) {
      const chr: Character = {
        id: ids.hero(c.id),
        name: String(c.profile?.name ?? `Hero ${c.id}`),
        role: 'hero',
        profile: c.profile,
        legacyId: c.id,
      };
      files.set(paths.character(chr.id), chr);
    }
    const active = save.characters.activeId ?? save.characters.items?.[0]?.id;
    if (active !== undefined) hero = ids.hero(active);
    settingsLegacy.activeCharacterId = save.characters.activeId;
  } else settingsLegacy.characters = false;

  const extraTop = Object.fromEntries(Object.entries(save).filter(([k]) => !TOP_KEYS.has(k)));
  if (Object.keys(extraTop).length) {
    settingsLegacy.top = extraTop;
    problems.push({
      level: 'warn',
      code: 'legacy.unknownField',
      message: `Kept unknown save fields: ${Object.keys(extraTop).join(', ')}.`,
      file: paths.settings,
    });
  }
  const settings: Settings = { quality: 'auto', legacy: settingsLegacy };
  files.set(paths.settings, settings);

  const activeMap = ids.map(activeLegacy);
  const firstSpawn = (files.get(paths.map(activeMap)) as MapDoc | undefined)?.spawns[0]?.id ?? null;
  files.set(paths.project, {
    format: 'brickworlds-project',
    schema: 5,
    id: opts.projectId,
    name: opts.name,
    created: opts.now,
    modified: opts.now,
    entry: { map: activeMap, spawn: firstSpawn, screen: null },
    hero,
    files: {},
  });
  return files;
}

export { CONFIG_KEYS };
