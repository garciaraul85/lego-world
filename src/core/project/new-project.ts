import { encodeChunks } from '../bricks/codec';
import { type Id, newId } from '../ids';
import { indexFiles } from '../migrate';
import { type Gates, type Instances, type MapDoc, type MapState, type Project, paths, type Settings } from '../schema';
import { type GenerateConfig, generateMap } from '../worldgen/generate';

export type NewProjectOptions = {
  name: string;
  mapName?: string;
  /** omitted = an empty free-build map */
  generate?: GenerateConfig;
  now?: string;
  random?: () => number;
};

/** Files of a brand-new project with one map (generated or empty) and one spawn point. */
export function newProjectFiles(o: NewProjectOptions): Map<string, unknown> {
  const rnd = o.random ?? Math.random;
  const now = o.now ?? new Date().toISOString();
  const mapId = newId('map', rnd) as Id<'map'>;
  const spawnId = newId('spawn', rnd) as Id<'spawn'>;
  const files = new Map<string, unknown>();
  let map: MapDoc = {
    id: mapId,
    name: o.mapName ?? 'Map 1',
    size: null,
    sky: { time: 'day' },
    weather: { rain: false, snow: false, snowing: false },
    generator: null,
    music: null,
    ambience: null,
    spawns: [{ id: spawnId, name: 'Arrival', pos: [0, 0.4, 0], yaw: Math.PI }],
    zones: [],
  };
  if (o.generate) {
    const g = generateMap(o.generate);
    map = { ...map, generator: g.generator, size: g.size, sky: g.sky, weather: g.weather };
    for (const [key, chunk] of encodeChunks(g.bricks)) {
      const [cx, cz] = key.split('_').map(Number) as [number, number];
      files.set(paths.chunk(mapId, cx, cz), chunk);
    }
  }
  files.set(paths.map(mapId), map);
  files.set(paths.state(mapId), { broken: [], player: null } satisfies MapState);
  files.set(paths.instances(mapId), { npcsSaved: false, items: [] } satisfies Instances);
  files.set(paths.gates, { gates: [], mapOrder: [mapId] } satisfies Gates);
  files.set(paths.settings, { quality: 'auto', legacy: { characters: false } } satisfies Settings);
  const project: Project = {
    format: 'brickworlds-project',
    schema: 5,
    id: newId('project', rnd) as Project['id'],
    name: o.name,
    created: now,
    modified: now,
    entry: { map: mapId, spawn: spawnId, screen: null },
    hero: null,
    files: {},
  };
  files.set(paths.project, project);
  indexFiles(files);
  return files;
}
