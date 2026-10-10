import { encodeChunks } from '../../bricks/codec';
import { type Id, newId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import {
  BIOMES,
  type Gates,
  type Instances,
  type MapDoc,
  type MapState,
  type Project,
  paths,
  type Spawn,
  TIMES,
} from '../../schema';
import { type GenerateConfig, generateConfigError, generateMap } from '../../worldgen/generate';
import type { CommandHandler } from '../types';

export const MAX_MAPS = 16;
export const MAX_SPAWNS = 32;

export type SetEnvironment = {
  map: string;
  time?: MapDoc['sky']['time'];
  rain?: boolean;
  snow?: boolean;
  snowing?: boolean;
};

const mapMissing = (store: ProjectStore, map: string) =>
  store.has(paths.map(map)) ? null : `Map ${map} does not exist.`;
const getMap = (store: ProjectStore, map: string) => store.get<MapDoc>(paths.map(map))!;

export const setEnvironment: CommandHandler<SetEnvironment> = {
  label: () => 'Change sky and weather',
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    if (p.time !== undefined && !TIMES.includes(p.time)) return `Time must be one of ${TIMES.join(', ')}.`;
    return null;
  },
  apply(store, p) {
    const m = getMap(store, p.map);
    store.put(paths.map(p.map), {
      ...m,
      sky: { time: p.time ?? m.sky.time },
      weather: {
        rain: p.rain ?? m.weather.rain,
        snow: p.snow ?? m.weather.snow,
        snowing: p.snowing ?? m.weather.snowing,
      },
    });
  },
};

/** Replaces every brick of a map with the v68 generator's output. Undo restores the old map. */
function writeGenerated(store: ProjectStore, mapId: string, config: GenerateConfig) {
  const g = generateMap(config);
  for (const p of store.list(paths.chunkDir(mapId))) store.remove(p);
  for (const [key, chunk] of encodeChunks(g.bricks)) {
    const [cx, cz] = key.split('_').map(Number) as [number, number];
    store.put(paths.chunk(mapId, cx, cz), chunk);
  }
  const m = getMap(store, mapId);
  const { legacy: _dropped, ...rest } = m;
  store.put(paths.map(mapId), { ...rest, generator: g.generator, size: g.size, sky: g.sky, weather: g.weather });
  store.put(paths.state(mapId), { broken: [], player: null } satisfies MapState);
  // v68 spawns fresh neighbors for a new world when a save has no `npcs`.
  const inst = store.get<Instances>(paths.instances(mapId)) ?? { npcsSaved: false, items: [] };
  for (const i of inst.items) if (i.kind === 'npc') store.remove(paths.character(i.character));
  store.put(paths.instances(mapId), {
    npcsSaved: false,
    items: inst.items.filter((i) => i.kind !== 'npc'),
  } satisfies Instances);
}

function configError(c: GenerateConfig): string | null {
  if (!c.environments.length) return 'Pick at least one environment.';
  if (c.environments.some((e) => !BIOMES.includes(e as never))) return 'Unknown environment.';
  if (![16, 24, 32].includes(c.size)) return 'Size must be 16, 24 or 32.';
  if (!Number.isInteger(c.seed) || c.seed < 0 || c.seed > 99_999_999)
    return 'Seed must be a whole number from 0 to 99,999,999.';
  return generateConfigError(c);
}

export const generateTerrain: CommandHandler<{ map: string; config: GenerateConfig }> = {
  label: () => 'Generate terrain',
  validate: (store, p) => mapMissing(store, p.map) ?? configError(p.config),
  apply: (store, p) => writeGenerated(store, p.map, p.config),
};

export type CreateMap = { id?: string; name: string; generate?: GenerateConfig };

export const createMap: CommandHandler<CreateMap> = {
  label: (p) => `Add map ${p.name}`,
  validate(store, p) {
    const gates = store.get<Gates>(paths.gates);
    if ((gates?.mapOrder.length ?? 0) >= MAX_MAPS) return `A project can have ${MAX_MAPS} maps.`;
    if (!p.name.trim()) return 'Give the map a name.';
    if (p.id && store.has(paths.map(p.id))) return 'That map already exists.';
    return p.generate ? configError(p.generate) : null;
  },
  apply(store, p) {
    const id = (p.id ?? newId('map')) as Id<'map'>;
    const doc: MapDoc = {
      id,
      name: p.name.trim().slice(0, 60),
      size: null,
      sky: { time: 'day' },
      weather: { rain: false, snow: false, snowing: false },
      generator: null,
      music: null,
      ambience: null,
      spawns: [{ id: newId('spawn'), name: 'Arrival', pos: [0, 0.4, 0], yaw: Math.PI }],
      zones: [],
    };
    store.put(paths.map(id), doc);
    store.put(paths.state(id), { broken: [], player: null } satisfies MapState);
    store.put(paths.instances(id), { npcsSaved: false, items: [] } satisfies Instances);
    const gates = store.get<Gates>(paths.gates) ?? { gates: [], mapOrder: [] };
    store.put(paths.gates, { ...gates, mapOrder: [...gates.mapOrder, id] });
    if (p.generate) writeGenerated(store, id, p.generate);
  },
};

export const renameMap: CommandHandler<{ map: string; name: string }> = {
  label: () => 'Rename map',
  validate: (store, p) => mapMissing(store, p.map) ?? (p.name.trim() ? null : 'Give the map a name.'),
  apply: (store, p) => store.put(paths.map(p.map), { ...getMap(store, p.map), name: p.name.trim().slice(0, 60) }),
};

export type SpawnInput = { name?: string; pos?: [number, number, number]; yaw?: number };

export const addSpawn: CommandHandler<{ map: string; id?: string } & SpawnInput> = {
  label: () => 'Add spawn point',
  validate(store, p) {
    const e = mapMissing(store, p.map);
    if (e) return e;
    return getMap(store, p.map).spawns.length >= MAX_SPAWNS ? `A map can have ${MAX_SPAWNS} spawn points.` : null;
  },
  apply(store, p) {
    const m = getMap(store, p.map);
    const spawn: Spawn = {
      id: (p.id ?? newId('spawn')) as Id<'spawn'>,
      name: (p.name ?? `Spawn ${m.spawns.length + 1}`).slice(0, 60),
      pos: p.pos ?? [0, 0.4, 0],
      yaw: p.yaw ?? Math.PI,
    };
    store.put(paths.map(p.map), { ...m, spawns: [...m.spawns, spawn] });
  },
};

export const updateSpawn: CommandHandler<{ map: string; spawn: string } & SpawnInput> = {
  label: () => 'Edit spawn point',
  validate: (store, p) =>
    mapMissing(store, p.map) ??
    (getMap(store, p.map).spawns.some((s) => s.id === p.spawn) ? null : 'Spawn point not found.'),
  apply(store, p) {
    const m = getMap(store, p.map);
    store.put(paths.map(p.map), {
      ...m,
      spawns: m.spawns.map((s) =>
        s.id === p.spawn
          ? {
              ...s,
              ...(p.name !== undefined ? { name: p.name.slice(0, 60) } : {}),
              ...(p.pos ? { pos: p.pos } : {}),
              ...(p.yaw !== undefined ? { yaw: p.yaw } : {}),
            }
          : s,
      ),
    });
  },
};

export const removeSpawn: CommandHandler<{ map: string; spawn: string }> = {
  label: () => 'Remove spawn point',
  validate(store, p) {
    const e = mapMissing(store, p.map);
    if (e) return e;
    const m = getMap(store, p.map);
    if (!m.spawns.some((s) => s.id === p.spawn)) return 'Spawn point not found.';
    if (m.spawns.length === 1) return 'A map needs at least one spawn point.';
    const gates = store.get<Gates>(paths.gates);
    if (gates?.gates.some((g) => g.from.spawn === p.spawn || g.to.spawn === p.spawn))
      return 'A gate uses this spawn point. Remove the gate first.';
    return null;
  },
  apply(store, p) {
    const m = getMap(store, p.map);
    store.put(paths.map(p.map), { ...m, spawns: m.spawns.filter((s) => s.id !== p.spawn) });
    const project = store.manifest;
    if (project.entry.spawn === p.spawn)
      store.put(paths.project, {
        ...project,
        entry: { ...project.entry, spawn: m.spawns.find((s) => s.id !== p.spawn)!.id },
      });
  },
};

export type UpdateProject = { name?: string; entryMap?: string; entrySpawn?: string | null };

export const updateProject: CommandHandler<UpdateProject> = {
  label: () => 'Edit project settings',
  validate(store, p) {
    if (p.name !== undefined && !p.name.trim()) return 'Give the game a name.';
    if (p.entryMap !== undefined && !store.has(paths.map(p.entryMap))) return 'Start map not found.';
    if (p.entrySpawn) {
      const map = p.entryMap ?? store.manifest.entry.map;
      if (!getMap(store, map).spawns.some((s) => s.id === p.entrySpawn)) return 'Start spawn is not on the start map.';
    }
    return null;
  },
  apply(store, p) {
    const cur = store.manifest;
    const entryMap = (p.entryMap ?? cur.entry.map) as Project['entry']['map'];
    const spawn =
      p.entrySpawn !== undefined
        ? p.entrySpawn
        : p.entryMap !== undefined
          ? (getMap(store, entryMap).spawns[0]?.id ?? null)
          : cur.entry.spawn;
    store.put(paths.project, {
      ...cur,
      name: p.name?.trim().slice(0, 120) ?? cur.name,
      entry: { ...cur.entry, map: entryMap, spawn: spawn as Project['entry']['spawn'] },
    });
  },
};
