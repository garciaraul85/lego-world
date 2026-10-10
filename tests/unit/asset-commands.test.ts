import { describe, expect, it } from 'vitest';
import { assetInstances, instanceBricks } from '../../src/core/assets/instances';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { mapPieces } from '../../src/core/bridge/legacy-bridge';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allBricks } from '../../src/core/commands/handlers/assets';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { Asset } from '../../src/core/schema';

function setup() {
  const store = new ProjectStore(newProjectFiles({ name: 'T', random: () => 0.5 }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const run = (type: string, payload: unknown) => bus.execute({ type, payload }, { source: 'user' });
  return { store, bus, map, run };
}

const crate: Asset = {
  id: 'ast_crate00001',
  name: 'Crate',
  category: 'prop',
  bricks: [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 3, 0, 0, 1, 0],
  ],
  palette: { types: ['brick2x4'], colors: ['#754429', '#d8b875'] },
  pivot: [0, 0, 0],
  footprint: [4, 2],
  sockets: [{ id: 'lid', kind: 'interact', pos: [2, 2.4, 1], prompt: 'Open' }],
  states: ['closed', 'open'],
  initialState: 'closed',
  interactions: [],
  smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
  generator: null,
  origin: 'user',
};

describe('asset instance commands', () => {
  it('places, moves, turns, removes and undoes an instance', () => {
    const { store, bus, map, run } = setup();
    expect(run('asset.create', { asset: crate }).ok).toBe(true);
    expect(run('asset.place', { map, asset: crate.id, pos: [4, 0, 4] }).ok).toBe(true);
    const [inst] = assetInstances(store, map);
    expect(instanceBricks(store, map).map((b) => [b.x, b.y, b.z])).toEqual([
      [4, 0, 4],
      [4, 3, 4],
    ]);
    // moving the instance's bricks as a whole moves the instance
    const ids = instanceBricks(store, map).map((b) => b.id);
    expect(run('bricks.move', { map, ids, dx: 2, dy: 0, dz: 0 }).ok).toBe(true);
    expect(assetInstances(store, map)[0]!.pos).toEqual([6, 0, 4]);
    // part of an instance cannot be moved, painted or removed
    expect(run('bricks.move', { map, ids: [ids[1]], dx: 1, dy: 0, dz: 0 }).error).toMatch(/part of the asset/);
    expect(run('bricks.paint', { map, ids, color: '#d20c20' }).error).toMatch(/Asset studio/);
    // turning through bricks.update (the editor's group rotate) turns the instance
    const turned = instanceBricks(store, map).map((b) => ({ id: b.id, x: b.x + 1, z: b.z - 1, rot: (b.rot + 1) % 4 }));
    expect(run('bricks.update', { map, bricks: turned }).ok).toBe(true);
    expect(assetInstances(store, map)[0]!.rot).toBe(1);
    expect(run('instance.move', { map, instance: inst!.id, rot: 2 }).ok).toBe(true);
    expect(run('bricks.remove', { map, ids }).ok).toBe(true);
    expect(assetInstances(store, map)).toEqual([]);
    bus.undo();
    expect(assetInstances(store, map)).toHaveLength(1);
  });

  it('refuses a placement that floats or overlaps, and the brick limit counts instances', () => {
    const { map, run } = setup();
    run('asset.create', { asset: crate });
    expect(run('asset.place', { map, asset: crate.id, pos: [0, 2, 0] }).ok).toBe(false);
    expect(run('asset.place', { map, asset: crate.id, pos: [0, 0, 0] }).ok).toBe(true);
    expect(run('asset.place', { map, asset: crate.id, pos: [1, 0, 0] }).ok).toBe(false);
  });

  it('states, unpack and make asset round trip to the same bricks', () => {
    const { store, map, run } = setup();
    const chest = { ...crate, onlyIn: { open: [1] } };
    run('asset.create', { asset: chest });
    run('asset.place', { map, asset: chest.id, pos: [0, 0, 0] });
    const inst = assetInstances(store, map)[0]!;
    expect(instanceBricks(store, map)).toHaveLength(1);
    expect(run('instance.setState', { map, instance: inst.id, state: 'open' }).ok).toBe(true);
    expect(instanceBricks(store, map)).toHaveLength(2);
    const pieces = mapPieces(store, map);
    expect(run('instance.unpack', { map, instances: [inst.id] }).ok).toBe(true);
    expect(assetInstances(store, map)).toEqual([]);
    expect(mapPieces(store, map)).toEqual(pieces);
    const ids = new MapBricks(store, map).all().map((b) => b.id);
    expect(run('asset.make', { map, ids, name: 'My chest' }).ok).toBe(true);
    expect(new MapBricks(store, map).count()).toBe(0);
    expect(allBricks(store, map)).toHaveLength(2);
    expect(store.list('assets/')).toHaveLength(2);
  });

  it('a grown asset moves its instances to fresh brick ids; delete refuses while placed', () => {
    const { store, map, run } = setup();
    run('asset.create', { asset: crate });
    run('asset.place', { map, asset: crate.id, pos: [0, 0, 0] });
    run('bricks.place', { map, bricks: [{ type: 'plate1x1', x: 10, y: 0, z: 10, rot: 0, color: '#d20c20' }] });
    const bigger = { ...crate, bricks: [...crate.bricks, [0, 0, 6, 0, 0, 0, 0] as Asset['bricks'][number]] };
    expect(run('asset.update', { asset: bigger }).ok).toBe(true);
    const ids = allBricks(store, map).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(run('asset.delete', { asset: crate.id }).error).toMatch(/placed on 1 map/);
  });
});

describe('generator rules', () => {
  it('a project asset marked “use in generator” is placed on flat ground of matching maps, repeatably', () => {
    const { store, map, run } = setup();
    run('asset.create', {
      asset: { ...crate, generator: { environments: ['prairie'], weight: 0.5, placeOn: 'ground' } },
    });
    const config = { environments: ['prairie'], size: 16, seed: 11 };
    expect(run('map.generate', { map, config }).ok).toBe(true);
    const placed = assetInstances(store, map).filter((i) => i.asset === crate.id);
    expect(placed.length).toBeGreaterThan(0);
    run('map.generate', { map, config });
    expect(assetInstances(store, map).filter((i) => i.asset === crate.id)).toEqual(placed);
    run('map.generate', { map, config: { ...config, environments: ['city'] } });
    expect(assetInstances(store, map).filter((i) => i.asset === crate.id)).toEqual([]);
  });
});
