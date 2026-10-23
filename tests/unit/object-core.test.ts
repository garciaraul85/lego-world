import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { MAX_ASSETS_PER_MAP } from '../../src/core/commands/handlers/items';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, paths, validateFile } from '../../src/core/schema';
import { type IndexedObject, ObjectIndex } from '../../src/engine/runtime/objects';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 2b, the object core: indexes that answer without walking every object, and 100,000 objects a map. */
const obj = (i: number, x: number, z: number, n = 3, extra: Partial<IndexedObject['def']> = {}): IndexedObject => ({
  inst: {
    id: `ins_${String(i).padStart(10, '0')}`,
    name: i % 1000 === 0 ? `Thing ${i}` : undefined,
    idBase: 1000 + i * 10,
    pos: [x, 1, z],
  },
  def: { bricks: Array.from({ length: n }), interactions: [], ...extra },
  bricks: Array.from({ length: n }, (_, k) => ({ x: x + (k % 2), y: 1 + k, z })),
});

describe('object index', () => {
  it('finds by id, name and brick, and near a point, the same as walking the list', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const list = Array.from({ length: 5000 }, (_, i) =>
      obj(i, Math.floor(rnd() * 800 - 400), Math.floor(rnd() * 800 - 400)),
    );
    const idx = new ObjectIndex<IndexedObject>().sync(list);
    expect(idx.byId(list[1234]!.inst.id)).toBe(list[1234]);
    expect(idx.byName('thing 3000')).toBe(list[3000]);
    for (const probe of [1000, 1000 + 1234 * 10 + 2, 1000 + 4999 * 10 + 2, 1000 + 4999 * 10 + 3, 999, 7])
      expect(idx.byPiece(probe)).toBe(
        list.find((o) => probe >= o.inst.idBase && probe < o.inst.idBase + o.def.bricks.length) ?? null,
      );
    for (let t = 0; t < 30; t++) {
      const x = rnd() * 800 - 400;
      const z = rnd() * 800 - 400;
      const r = 5 + rnd() * 60;
      const want = list
        .filter((o) => {
          const c = idx.centre(o)!;
          return (c[0] - x) ** 2 + (c[2] - z) ** 2 <= r * r;
        })
        .sort((a, b) => a.inst.idBase - b.inst.idBase);
      expect(idx.near(x, z, r).sort((a, b) => a.inst.idBase - b.inst.idBase)).toEqual(want);
    }
  });

  it('follows the list: added objects join it, a new list builds it again', () => {
    const list = [obj(1, 0, 0), obj(2, 50, 50)];
    const idx = new ObjectIndex<IndexedObject>().sync(list);
    list.push(obj(3, 100, 100, 3, { interactions: [{}] }));
    idx.sync(list);
    expect(idx.byId(list[2]!.inst.id)).toBe(list[2]);
    expect(idx.interactive).toEqual([list[2]]);
    expect(idx.byPiece(list[2]!.inst.idBase + 1)).toBe(list[2]);
    const fewer = list.slice(1);
    idx.sync(fewer);
    expect(idx.byId(list[0]!.inst.id)).toBeUndefined();
    expect(idx.near(0, 0, 3)).toEqual([]);
  });
});

describe('100,000 objects on a map', () => {
  const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
  const build = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Many', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const run = (type: string, payload: unknown) => bus.execute({ type, payload } as never, { source: 'user' });
    const map = 'map_manyobj001';
    expect(run('map.create', { id: map, name: 'Many', land: { size: 1024, seed: 1 } }).ok).toBe(true);
    expect(run('asset.create', { asset: crate }).ok).toBe(true);
    for (let s = 0; s < 20; s++)
      run('asset.scatter', { map, asset: crate.id, area: [-512, -512, 511, 511], count: 5000, seed: s + 1 });
    const items = () => store.get<Instances>(paths.instances(map))!.items;
    return { store, bus, run, map, items };
  };

  it('the editor keeps up: a map holds 100,000 copies, a move or a removal is quick, every file stays valid', () => {
    const { store, bus, run, map, items } = build();
    expect(MAX_ASSETS_PER_MAP).toBe(100_000);
    expect(items()).toHaveLength(100_000);
    expect(run('asset.place', { map, asset: crate.id, pos: [3, 1, 3] }).error).toMatch(/100,000 placed assets/);
    let t = performance.now();
    expect(run('instance.move', { map, instance: items()[500]!.id, dx: 2 }).error ?? 'ok').toMatch(
      /ok|overlap|connection/,
    );
    const moveMs = performance.now() - t;
    t = performance.now();
    expect(
      run('instance.remove', {
        map,
        instances: items()
          .slice(0, 100)
          .map((i) => i.id),
      }).ok,
    ).toBe(true);
    const removeMs = performance.now() - t;
    expect(items()).toHaveLength(99_900);
    bus.undo();
    expect(items()).toHaveLength(100_000);
    expect(validateFile(paths.instances(map), store.get(paths.instances(map)))).toEqual([]);
    // generous on a loaded test machine: these took 0.1 s and 0.3 s here
    expect(moveMs).toBeLessThan(2000);
    expect(removeMs).toBeLessThan(4000);
  }, 600_000);

  it('the game keeps up: a step stays inside the frame budget, and prompts, breaks and checkpoints still work', () => {
    const { store, map, items } = build();
    const t0 = performance.now();
    const p = new PlaySession(store.snapshot(), { mapId: map });
    const startMs = performance.now() - t0;
    p.runtime.stepOnce(); // builds the indexes once
    const t1 = performance.now();
    for (let i = 0; i < 120; i++) p.runtime.stepOnce();
    const stepMs = (performance.now() - t1) / 120;
    expect(stepMs).toBeLessThan(8);
    expect(startMs).toBeLessThan(20_000);
    // a crate far from the start: its bricks are found by the index
    const far = p.world.instances[items().length - 1]!;
    expect(p.instanceOfPiece(far.inst.idBase + 1)).toBe(far);
    expect(p.objs().near(far.inst.pos[0], far.inst.pos[2], 4)).toContain(far);
  }, 600_000);
});
