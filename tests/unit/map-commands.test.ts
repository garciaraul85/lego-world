import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectBricks } from '../../src/core/bricks/inspect';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { toLegacy } from '../../src/core/bridge/legacy-bridge';
import { CommandBus, registerAll } from '../../src/core/commands';
import { worldGenerator } from '../../src/core/legacy/modules';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';
import { type Gates, type MapDoc, paths } from '../../src/core/schema';
import { canonical } from './helpers/legacy-app';

function setup() {
  const store = new ProjectStore(migrate(JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'))).files);
  return { store, bus: registerAll(new CommandBus(store)), map: store.manifest.entry.map };
}
const config = {
  environments: ['forest', 'city'],
  size: 16 as const,
  seed: 418811,
  time: 'evening' as const,
  rain: true,
};

describe('map commands', () => {
  it('map.generate produces exactly the bricks v68 generates, and v68 loads the result', () => {
    const { store, bus, map } = setup();
    expect(bus.execute({ type: 'map.generate', payload: { map, config } }, { source: 'user' })).toMatchObject({
      ok: true,
    });
    const bricks = new MapBricks(store, map).all();
    const v68 = worldGenerator().generate({
      biomes: ['forest', 'city'],
      size: 16,
      seed: 418811,
      time: 'evening',
      rain: true,
      snow: false,
      snowing: false,
      mountainShape: 'mixed',
      mountainScale: 'mixed',
    });
    expect(bricks.length).toBe(v68.pieces.length);
    expect(inspectBricks(bricks)).toEqual({ ok: true });
    const doc = store.get<MapDoc>(paths.map(map))!;
    expect(doc).toMatchObject({
      sky: { time: 'evening' },
      weather: { rain: true },
      size: { w: v68.width, d: v68.depth },
    });
    const loaded = canonical(toLegacy(store)) as { pieces: unknown[]; world: { config: { seed: number } } };
    expect(loaded.pieces.length).toBe(v68.pieces.length);
    expect(loaded.world.config.seed).toBe(418811);
    bus.undo();
    expect(new MapBricks(store, map).count()).not.toBe(v68.pieces.length);
  });

  it('rejects bad generator settings', () => {
    const { bus, map } = setup();
    expect(
      bus.execute(
        { type: 'map.generate', payload: { map, config: { ...config, environments: [] } } },
        { source: 'user' },
      ).error,
    ).toBe('Pick at least one environment.');
    expect(
      bus.execute({ type: 'map.generate', payload: { map, config: { ...config, seed: -1 } } }, { source: 'user' })
        .error,
    ).toMatch(/Seed/);
  });

  it('map.create adds a generated map to the world and v68 sees three maps', () => {
    const { store, bus } = setup();
    expect(
      bus.execute(
        {
          type: 'map.create',
          payload: { name: 'Desert 3', generate: { environments: ['desert'], size: 16, seed: 9 } },
        },
        { source: 'user' },
      ).ok,
    ).toBe(true);
    const gates = store.get<Gates>(paths.gates)!;
    expect(gates.mapOrder).toHaveLength(3);
    const loaded = canonical(toLegacy(store)) as { maps: { maps: { name: string }[] } };
    expect(loaded.maps.maps.map((m) => m.name)).toEqual(['Map 1', 'Prairie', 'Desert 3']);
  });

  it('spawn points: add, move, and refuse to remove one a gate uses', () => {
    const { store, bus, map } = setup();
    bus.execute(
      { type: 'map.addSpawn', payload: { map, id: 'sp_test000001', name: 'Dock', pos: [3, 0.4, 4], yaw: 0 } },
      { source: 'user' },
    );
    bus.execute(
      { type: 'map.updateSpawn', payload: { map, spawn: 'sp_test000001', pos: [5, 0.4, 5] } },
      { source: 'user' },
    );
    expect(store.get<MapDoc>(paths.map(map))!.spawns.at(-1)).toMatchObject({ name: 'Dock', pos: [5, 0.4, 5] });
    const gated = store.get<Gates>(paths.gates)!.gates[0]!.from.spawn;
    const owner = store.get<Gates>(paths.gates)!.gates[0]!.from.map;
    expect(
      bus.execute({ type: 'map.removeSpawn', payload: { map: owner, spawn: gated } }, { source: 'user' }).error,
    ).toMatch(/gate/);
  });
});
