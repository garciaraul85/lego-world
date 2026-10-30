import { generatedInstanceId, instancify } from '../assets/instancify';
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
  /** P18: the kind of game (src/builtin/genres); omitted = open (every control) */
  genre?: string;
  /**
   * Step 11, 4c: studs around the arrival kept free of the generated plants (the courses that place enemies there:
   * a shrub touching one made the game move it away, so it seemed destroyed)
   */
  clearAround?: number;
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
    // built-in "Explore" music (src/builtin/audio); players can change it in the Audio workspace
    music: 'mus_explore000',
    ambience: null,
    spawns: [{ id: spawnId, name: 'Arrival', pos: [0, 0.4, 0], yaw: Math.PI }],
    zones: [],
  };
  let items: Instances['items'] = [];
  if (o.generate) {
    const g = generateMap(o.generate);
    map = { ...map, generator: g.generator, size: g.size, sky: g.sky, weather: g.weather };
    const split = instancify(g.bricks);
    for (const a of split.assets) files.set(paths.asset(a.id), a);
    const r = o.clearAround ?? 0;
    items = split.instances
      .filter((i) => !r || i.kind !== 'asset' || Math.hypot(i.pos[0] + 1, i.pos[2] + 1) > r)
      .map((i) => ({
        ...i,
        id: generatedInstanceId(mapId, i.idBase),
      }));
    // the clearing has studs everywhere (smooth tiles become plates), so anything can be put down in it
    // ...and no flowers: small bricks standing on the ground would stop a pushed block or trip the hero
    const near = (b: { x: number; z: number }) => Math.hypot(b.x + 0.5, b.z + 0.5) <= r + 3;
    const plain = r
      ? split.plain
          .filter((b) => !(near(b) && b.y > 0 && /^(plate|tile|brick)1x1$/.test(b.type)))
          .map((b) => (b.type.startsWith('tile') && near(b) ? { ...b, type: `plate${b.type.slice(4)}` } : b))
      : split.plain;
    for (const [key, chunk] of encodeChunks(plain)) {
      const [cx, cz] = key.split('_').map(Number) as [number, number];
      files.set(paths.chunk(mapId, cx, cz), chunk);
    }
  }
  files.set(paths.map(mapId), map);
  files.set(paths.state(mapId), { broken: [], player: null } satisfies MapState);
  files.set(paths.instances(mapId), { npcsSaved: false, items } satisfies Instances);
  files.set(paths.gates, { gates: [], mapOrder: [mapId] } satisfies Gates);
  // Milestone 2b: new projects walk the hero with the physics engine (projects made before keep v68's walking)
  files.set(paths.settings, { quality: 'auto', movement: 'physics', legacy: { characters: false } } satisfies Settings);
  const project: Project = {
    format: 'brickworlds-project',
    schema: 6,
    id: newId('project', rnd) as Project['id'],
    name: o.name,
    created: now,
    modified: now,
    entry: { map: mapId, spawn: spawnId, screen: 'scr_splash0000' },
    hero: null,
    genre: o.genre ?? 'open',
    files: {},
  };
  files.set(paths.project, project);
  indexFiles(files);
  return files;
}
