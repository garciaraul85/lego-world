import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toLegacy } from '../../src/core/bridge/legacy-bridge';
import { CommandBus, registerAll } from '../../src/core/commands';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';
import { type Gates, type MapDoc, paths } from '../../src/core/schema';
import { validateWorld } from '../../src/core/world/validate';
import { canonical } from './helpers/legacy-app';

function setup() {
  const store = new ProjectStore(migrate(JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'))).files);
  const bus = registerAll(new CommandBus(store));
  const exec = (type: string, payload: unknown) => bus.execute({ type, payload }, { source: 'user' });
  return { store, bus, exec };
}
const spawnOf = (store: ProjectStore, map: string) => store.get<MapDoc>(paths.map(map))!.spawns[0]!.id;

describe('gates', () => {
  it('connect a new map one-way, see it in v68, make it two-way, then delete the map', () => {
    const { store, exec } = setup();
    expect(exec('map.create', { id: 'map_desert0001', name: 'Desert', generate: { environments: ['desert'], size: 16, seed: 4 } }).ok).toBe(true);
    const start = store.manifest.entry.map;
    expect(validateWorld(store).some((i) => i.code === 'unreachable' && i.map === 'map_desert0001')).toBe(true);
    const r = exec('gate.connect', { id: 'gt_desert0001', from: { map: start, spawn: spawnOf(store, start) }, to: { map: 'map_desert0001', spawn: spawnOf(store, 'map_desert0001') }, twoWay: false });
    expect(r.ok).toBe(true);
    expect(validateWorld(store).filter((i) => i.map === 'map_desert0001').map((i) => i.code)).toContain('noReturn');
    const v68 = canonical(toLegacy(store)) as { maps: { links: { twoWay: boolean }[] } };
    expect(v68.maps.links).toHaveLength(2);
    expect(v68.maps.links.at(-1)!.twoWay).toBe(false);
    expect(exec('gate.connect', { from: { map: start, spawn: spawnOf(store, start) }, to: { map: 'map_desert0001', spawn: spawnOf(store, 'map_desert0001') } }).error).toMatch(/already connected/);
    exec('gate.update', { gate: 'gt_desert0001', twoWay: true });
    expect(validateWorld(store).filter((i) => i.map === 'map_desert0001' && (i.code === 'unreachable' || i.code === 'noReturn'))).toEqual([]);
    expect(exec('map.delete', { map: 'map_desert0001' }).ok).toBe(true);
    expect(store.list('maps/map_desert0001/')).toEqual([]);
    expect(store.get<Gates>(paths.gates)!.gates.some((g) => g.id === 'gt_desert0001')).toBe(false);
  });

  it('refuses to delete the start map', () => {
    const { store, exec } = setup();
    expect(exec('map.delete', { map: store.manifest.entry.map }).error).toMatch(/start map/);
  });

  it('flags a spawn buried in bricks', async () => {
    const { MapBricks } = await import('../../src/core/bricks/map-bricks');
    const { store, exec } = setup();
    const map = store.manifest.entry.map;
    const above = new MapBricks(store, map).all().find((b) => b.y === 1 && b.type.startsWith('brick'))!;
    const added = exec('map.addSpawn', { map, id: 'sp_buried0001', name: 'Buried', pos: [above.x + 0.5, 0.4, above.z + 0.5], yaw: 0 });
    expect(added.error ?? 'ok').toBe('ok');
    expect(validateWorld(store).some((i) => i.code === 'blockedSpawn' && i.spawn === 'sp_buried0001')).toBe(true);
  });
});
