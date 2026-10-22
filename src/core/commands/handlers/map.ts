import { BUILTIN_EFFECTS } from '../../../builtin/effects';
import { GENRES } from '../../../builtin/genres';
import { BUILTIN_SCREEN_EFFECTS } from '../../../builtin/screen-effects';
import { expandAsset } from '../../assets/expand';
import { maxBrickId } from '../../assets/instances';
import { generatedInstanceId, instancify } from '../../assets/instancify';
import { encodeChunks } from '../../bricks/codec';
import { footprint, inspectBricks } from '../../bricks/inspect';
import { DialogueLook } from '../../dialogue/schema';
import { EffectHooks } from '../../effects/schema';
import { Mood, ScreenHooks } from '../../effects/screen';
import { hash64 } from '../../hash';
import { type Id, newId } from '../../ids';
import { Ambient, DayLength, Fog } from '../../lighting/atmosphere';
import type { ProjectStore } from '../../project/store';
import { type Saving, Saving as SavingSchema } from '../../save/save';
import {
  type Asset,
  type AssetInstance,
  BIOMES,
  type Gates,
  type Instances,
  type MapDoc,
  type MapState,
  type Project,
  paths,
  type Spawn,
  TIMES,
  ViewDistance,
} from '../../schema';
import { type GenerateConfig, generateConfigError, generateMap } from '../../worldgen/generate';
import { generateLand, LAND_SIZES, type LandConfig } from '../../worldgen/land';
import type { CommandHandler } from '../types';
import { allBricks } from './assets';

/** P27 part 3c: was 16 */
export const MAX_MAPS = 1000;
export const MAX_SPAWNS = 32;

export type SetEnvironment = {
  map: string;
  time?: MapDoc['sky']['time'];
  rain?: boolean;
  snow?: boolean;
  snowing?: boolean;
  /** P23 part 2: the map's mood (null: none) */
  mood?: Mood | null;
  /** P27: how dark it is without its lights (0: as its sky lights it) */
  darkness?: number;
  /** P27 part 2: fog (null: none), the shadows' colour (null: as the sky gives), a day's length (null: 20 min) */
  fog?: Fog | null;
  ambient?: Ambient | null;
  dayLength?: number | null;
  /** P27 part 3: how far a big map is drawn (null: 256 studs) */
  viewDistance?: number | null;
};

const mapMissing = (store: ProjectStore, map: string) =>
  store.has(paths.map(map)) ? null : `Map ${map} does not exist.`;
const getMap = (store: ProjectStore, map: string) => store.get<MapDoc>(paths.map(map))!;

export const setEnvironment: CommandHandler<SetEnvironment> = {
  label: () => 'Change sky and weather',
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    if (p.time !== undefined && !TIMES.includes(p.time)) return `Time must be one of ${TIMES.join(', ')}.`;
    if (p.darkness !== undefined && !(p.darkness >= 0 && p.darkness <= 1)) return 'Darkness goes from 0 to 1.';
    for (const [k, schema] of [
      ['fog', Fog],
      ['ambient', Ambient],
      ['dayLength', DayLength],
      ['viewDistance', ViewDistance],
    ] as const) {
      const v = p[k];
      if (v === undefined || v === null) continue;
      const r = schema.safeParse(v);
      if (!r.success) return `${k}: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    }
    if (p.fog && p.fog.far <= p.fog.near) return 'Fog: where it is thickest must be further than where it starts.';
    if (p.mood) {
      const r = Mood.safeParse(p.mood);
      if (!r.success) return `Mood: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    }
    return null;
  },
  apply(store, p) {
    const m = getMap(store, p.map);
    const { mood: _old, darkness: _dark, fog: _fog, ambient: _amb, dayLength: _day, viewDistance: _view, ...rest } = m;
    const keep = <T>(v: T | null | undefined, old: T | undefined) => (v === undefined ? old : (v ?? undefined));
    const fog = keep(p.fog, m.fog);
    const ambient = keep(p.ambient, m.ambient);
    const dayLength = keep(p.dayLength, m.dayLength);
    const viewDistance = keep(p.viewDistance, m.viewDistance);
    // no darkness is no field (maps made before lights stay as they were)
    const darkness = p.darkness === undefined ? m.darkness : Math.round(p.darkness * 100) / 100;
    // a mood that does nothing is no mood (the map file stays as it was before moods)
    const some = (x: Mood) => x.grade !== 'none' || x.vignette > 0 || x.drift !== 'none';
    const mood = p.mood === undefined ? m.mood : p.mood && some(p.mood) ? Mood.parse(p.mood) : undefined;
    store.put(paths.map(p.map), {
      ...rest,
      ...(mood ? { mood } : {}),
      ...(darkness ? { darkness } : {}),
      ...(fog ? { fog: Fog.parse(fog) } : {}),
      ...(ambient ? { ambient: Ambient.parse(ambient) } : {}),
      ...(dayLength !== undefined ? { dayLength } : {}),
      ...(viewDistance !== undefined ? { viewDistance } : {}),
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
  // P3.2: houses, trees, cars... become asset instances; terrain and roads stay chunk bricks.
  const existing = store.list('assets/').map((p) => store.get<Asset>(p)!);
  const split = instancify(g.bricks, { existing });
  for (const a of split.assets) store.put(paths.asset(a.id), a);
  for (const p of store.list(paths.chunkDir(mapId))) store.remove(p);
  for (const [key, chunk] of encodeChunks(split.plain)) {
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
    items: split.instances.map((i) => ({ ...i, id: generatedInstanceId(mapId, i.idBase) })),
  } satisfies Instances);
  placeRuleAssets(store, mapId, config, g.size);
  pruneGeneratedAssets(store);
}

/** Generated assets no map uses any more are removed (built-in and user assets always stay). */
export function pruneGeneratedAssets(store: ProjectStore) {
  const used = new Set<string>();
  for (const p of store.list('maps/'))
    if (p.endsWith('/instances.json'))
      for (const i of store.get<Instances>(p)!.items) if (i.kind === 'asset') used.add(i.asset);
  for (const p of store.list('assets/')) {
    const a = store.get<Asset>(p)!;
    if (a.origin === 'generated' && !used.has(a.id)) store.remove(p);
  }
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

/** `spawnId` names the map's first spawn (the game generator passes it so a seed always gives the same files). */
export type CreateMap = {
  id?: string;
  name: string;
  generate?: GenerateConfig;
  spawnId?: string;
  /** P27 part 3: big land (studs per side and a seed) instead of v68's generator */
  land?: LandConfig;
};

export const createMap: CommandHandler<CreateMap> = {
  label: (p) => `Add map ${p.name}`,
  validate(store, p) {
    const gates = store.get<Gates>(paths.gates);
    if ((gates?.mapOrder.length ?? 0) >= MAX_MAPS) return `A project can have ${MAX_MAPS} maps.`;
    if (!p.name.trim()) return 'Give the map a name.';
    if (p.id && store.has(paths.map(p.id))) return 'That map already exists.';
    if (p.land) {
      if (p.generate) return 'Pick v68’s generator or big land, not both.';
      if (!LAND_SIZES.includes(p.land.size)) return `Big land is ${LAND_SIZES.join(', ')} studs across.`;
      if (!Number.isInteger(p.land.seed) || p.land.seed < 0 || p.land.seed > 99_999_999)
        return 'Seed must be a whole number from 0 to 99,999,999.';
    }
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
      spawns: [{ id: (p.spawnId ?? newId('spawn')) as Id<'spawn'>, name: 'Arrival', pos: [0, 0.4, 0], yaw: Math.PI }],
      zones: [],
    };
    store.put(paths.map(id), doc);
    store.put(paths.state(id), { broken: [], player: null } satisfies MapState);
    store.put(paths.instances(id), { npcsSaved: false, items: [] } satisfies Instances);
    const gates = store.get<Gates>(paths.gates) ?? { gates: [], mapOrder: [] };
    store.put(paths.gates, { ...gates, mapOrder: [...gates.mapOrder, id] });
    if (p.generate) writeGenerated(store, id, p.generate);
    if (p.land) {
      // big land: every brick is a loose brick in the chunk files (built valid, so no rules check of a million)
      for (const [key, chunk] of encodeChunks(generateLand(p.land))) {
        const [cx, cz] = key.split('_').map(Number) as [number, number];
        store.put(paths.chunk(id, cx, cz), chunk);
      }
      store.put(paths.map(id), { ...doc, size: { w: p.land.size, d: p.land.size } });
    }
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

export type UpdateProject = {
  name?: string;
  entryMap?: string;
  entrySpawn?: string | null;
  hero?: string | null;
  /** the first screen the player sees (P5.8), null = straight into the game */
  entryScreen?: string | null;
  /** P18: the kind of game (a genre id from src/builtin/genres): what the editor shows */
  genre?: string;
  /** P26: how the player saves (null: back to the genre's default) */
  saving?: Saving | null;
  /** P22: how conversations look (null: back to the genre's) */
  dialogue?: Partial<DialogueLook> | null;
  /** P22 part 2: playable heroes to switch between (null: just the hero) */
  party?: string[] | null;
  /** P23: which effects play for hits and things that happen (null: the built-in ones) */
  effects?: EffectHooks | null;
  /** P23 part 2: which screen effects play when things happen; low-health edges (null: the built-in ones) */
  screenEffects?: ScreenHooks | null;
};

export const updateProject: CommandHandler<UpdateProject> = {
  label: (p) =>
    p.genre !== undefined && Object.keys(p).length === 1
      ? `Genre: ${GENRES.find((g) => g.id === p.genre)?.name ?? p.genre}`
      : p.saving !== undefined && Object.keys(p).length === 1
        ? 'Saving settings'
        : p.dialogue !== undefined && Object.keys(p).length === 1
          ? 'Dialogue style'
          : p.effects !== undefined && Object.keys(p).length === 1
            ? 'Game effects'
            : p.screenEffects !== undefined && Object.keys(p).length === 1
              ? 'Game screen effects'
              : 'Edit project settings',
  validate(store, p) {
    if (p.name !== undefined && !p.name.trim()) return 'Give the game a name.';
    if (p.saving && !SavingSchema.safeParse(p.saving).success)
      return 'Saving: mode anywhere, savePoints or checkpoints; 1 to 3 slots; autosave on or off.';
    if (p.party) {
      if (p.party.length > 6) return 'A party has at most 6 heroes.';
      if (p.party.some((c) => !store.has(paths.character(c)))) return 'A party member does not exist.';
    }
    if (p.dialogue) {
      const r = DialogueLook.partial().safeParse(p.dialogue);
      if (!r.success)
        return `Dialogue style: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
      if (p.dialogue.blip && !/^snd_[0-9a-z]{10}$/.test(p.dialogue.blip)) return 'The voice blip is a sound event.';
    }
    if (p.effects) {
      const r = EffectHooks.safeParse(p.effects);
      if (!r.success) return `Effects: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
      const ids = [...Object.values(p.effects.hits ?? {}), ...Object.values(p.effects.events ?? {})];
      const missing = ids.find(
        (id) => id && id !== 'none' && !store.has(paths.effect(id)) && !BUILTIN_EFFECTS.some((e) => e.id === id),
      );
      if (missing) return `There is no effect ${missing}.`;
    }
    if (p.screenEffects) {
      const r = ScreenHooks.safeParse(p.screenEffects);
      if (!r.success)
        return `Screen effects: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
      const missing = Object.values(p.screenEffects.events ?? {}).find(
        (id) =>
          id && id !== 'none' && !store.has(paths.screenEffect(id)) && !BUILTIN_SCREEN_EFFECTS.some((e) => e.id === id),
      );
      if (missing) return `There is no screen effect ${missing}.`;
    }
    if (p.hero && !store.has(paths.character(p.hero))) return 'That character does not exist.';
    if (p.entryMap !== undefined && !store.has(paths.map(p.entryMap))) return 'Start map not found.';
    if (p.entryScreen && !/^scr_[0-9a-z]{10}$/.test(p.entryScreen)) return 'Pick a screen.';
    if (p.genre !== undefined && !GENRES.some((g) => g.id === p.genre))
      return `No genre “${p.genre}”: pick one of ${GENRES.map((g) => g.id).join(', ')}.`;
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
      entry: {
        ...cur.entry,
        map: entryMap,
        spawn: spawn as Project['entry']['spawn'],
        ...(p.entryScreen !== undefined ? { screen: p.entryScreen as Project['entry']['screen'] } : {}),
      },
      ...(p.hero !== undefined ? { hero: p.hero as Project['hero'] } : {}),
      ...(p.genre !== undefined ? { genre: p.genre } : {}),
    });
    if (p.saving !== undefined) {
      const next = { ...store.manifest } as Project & { saving?: Saving };
      if (p.saving) next.saving = { ...p.saving };
      else delete next.saving;
      store.put(paths.project, next);
    }
    if (p.party !== undefined) {
      const next = { ...store.manifest } as Project & { party?: string[] };
      if (p.party?.length) next.party = [...new Set(p.party)] as Project['party'] & string[];
      else delete next.party;
      store.put(paths.project, next);
    }
    if (p.effects !== undefined) {
      const next = { ...store.manifest } as Project & { effects?: EffectHooks };
      if (p.effects && (Object.keys(p.effects.hits ?? {}).length || Object.keys(p.effects.events ?? {}).length))
        next.effects = EffectHooks.parse(p.effects);
      else delete next.effects;
      store.put(paths.project, next);
    }
    if (p.screenEffects !== undefined) {
      const next = { ...store.manifest } as Project & { screenEffects?: ScreenHooks };
      const h = p.screenEffects;
      if (h && (Object.keys(h.events ?? {}).length || h.lowHealth !== undefined))
        next.screenEffects = ScreenHooks.parse(h);
      else delete next.screenEffects;
      store.put(paths.project, next);
    }
    if (p.dialogue !== undefined) {
      const next = { ...store.manifest } as Project & { dialogue?: Partial<DialogueLook> };
      if (p.dialogue) next.dialogue = { ...p.dialogue };
      else delete next.dialogue;
      store.put(paths.project, next);
    }
  },
};

/**
 * P3.4 "Use in generator": project assets with generator rules for one of the map's environments get
 * copies on flat open ground, deterministic for the seed. v68's own structures are untouched.
 */
function placeRuleAssets(store: ProjectStore, mapId: string, config: GenerateConfig, size: { w: number; d: number }) {
  const rules = store
    .list('assets/')
    .map((p) => store.get<Asset>(p)!)
    .filter((a) => a.generator && a.generator.environments.some((e) => config.environments.includes(e)));
  if (!rules.length) return;
  const all = allBricks(store, mapId);
  const top = new Map<string, number>();
  for (const b of all) {
    const [w, d] = footprint(b);
    const h = b.y + (b.type.startsWith('brick') ? 3 : 1);
    const studs = !b.type.startsWith('tile');
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const k = `${b.x + x},${b.z + z}`;
        // a tile top cannot hold anything: mark it unusable
        if (h >= (top.get(k) ?? -1)) top.set(k, studs ? h : -1000);
      }
  }
  let next = maxBrickId(store, mapId) + 1;
  const items: AssetInstance[] = [];
  for (const a of rules) {
    let seed = (config.seed ^ Number.parseInt(hash64(a.id).slice(0, 8), 16)) >>> 0;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const want = Math.max(1, Math.round(a.generator!.weight * ((size.w * size.d) / 256)));
    let placed = 0;
    for (let tries = 0; tries < want * 30 && placed < want; tries++) {
      const rot = Math.floor(random() * 4);
      const [w, d] = rot % 2 ? [a.footprint[1], a.footprint[0]] : a.footprint;
      const x = Math.floor(-size.w / 2 + random() * Math.max(1, size.w - w));
      const z = Math.floor(-size.d / 2 + random() * Math.max(1, size.d - d));
      // flat ground under the whole footprint, and no road or tile in the way
      const h = top.get(`${x},${z}`);
      if (h === undefined || h < 1) continue;
      let flat = true;
      for (let i = 0; i < w && flat; i++)
        for (let j = 0; j < d && flat; j++) if (top.get(`${x + i},${z + j}`) !== h) flat = false;
      if (!flat) continue;
      const inst: AssetInstance = {
        id: generatedInstanceId(mapId, next),
        kind: 'asset',
        asset: a.id,
        pos: [x, h, z],
        rot,
        idBase: next,
      };
      const bricks = expandAsset(a, inst).bricks;
      if (!inspectBricks([...all, ...bricks]).ok) continue;
      all.push(...bricks);
      for (const b of bricks) {
        const [bw, bd] = footprint(b);
        for (let i = 0; i < bw; i++) for (let j = 0; j < bd; j++) top.set(`${b.x + i},${b.z + j}`, -1000);
      }
      items.push(inst);
      next += a.bricks.length;
      placed++;
    }
  }
  if (!items.length) return;
  const cur = store.get<Instances>(paths.instances(mapId))!;
  store.put(paths.instances(mapId), { ...cur, items: [...cur.items, ...items] });
}

type ZoneT = MapDoc['zones'][number];
export const MAX_ZONES = 64;

/** Trigger zones (boxes in world units: x/z studs, y = plates × 0.4). */
export const addZone: CommandHandler<{ map: string; zone: Omit<ZoneT, 'id' | 'shape' | 'tags'> & Partial<ZoneT> }> = {
  label: () => 'Add trigger zone',
  validate(store, p) {
    const e = mapMissing(store, p.map);
    if (e) return e;
    if (getMap(store, p.map).zones.length >= MAX_ZONES) return `A map can have ${MAX_ZONES} zones.`;
    const { min, max } = p.zone;
    return min.every((v, i) => v < max[i]!) ? null : 'A zone needs some width, depth and height.';
  },
  apply(store, p) {
    const m = getMap(store, p.map);
    const zone: ZoneT = { shape: 'box', tags: [], ...p.zone, id: (p.zone.id ?? newId('zone')) as ZoneT['id'] };
    store.put(paths.map(p.map), { ...m, zones: [...m.zones, zone] });
  },
};

export const updateZone: CommandHandler<{ map: string; zone: string; patch: Partial<Omit<ZoneT, 'id' | 'shape'>> }> = {
  label: () => 'Edit trigger zone',
  validate(store, p) {
    const e = mapMissing(store, p.map);
    if (e) return e;
    const z = getMap(store, p.map).zones.find((x) => x.id === p.zone);
    if (!z) return 'Zone not found.';
    const next = { ...z, ...p.patch };
    return next.min.every((v, i) => v < next.max[i]!) ? null : 'A zone needs some width, depth and height.';
  },
  apply(store, p) {
    const m = getMap(store, p.map);
    store.put(paths.map(p.map), { ...m, zones: m.zones.map((z) => (z.id === p.zone ? { ...z, ...p.patch } : z)) });
  },
};

export const removeZone: CommandHandler<{ map: string; zone: string }> = {
  label: () => 'Remove trigger zone',
  validate: (store, p) =>
    mapMissing(store, p.map) ?? (getMap(store, p.map).zones.some((z) => z.id === p.zone) ? null : 'Zone not found.'),
  apply(store, p) {
    const m = getMap(store, p.map);
    store.put(paths.map(p.map), { ...m, zones: m.zones.filter((z) => z.id !== p.zone) });
  },
};
