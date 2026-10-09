import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { type Command, CommandBus, registerAll } from '../../src/core/commands';
import { serializeFile } from '../../src/core/json/stable';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';
import { type MapDoc, paths } from '../../src/core/schema';

const NOW = '2026-10-09T00:00:00.000Z';

function setup(opts: { maxSteps?: number } = {}) {
  const save = JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'));
  const store = new ProjectStore(migrate(save, { now: NOW }).files);
  const bus = registerAll(new CommandBus(store, { now: () => 0, ...opts }));
  const map = store.manifest.entry.map;
  return { store, bus, map };
}

const dump = (store: ProjectStore) =>
  [...store.keys()]
    .sort()
    .map((p) => `${p}\n${serializeFile(p, store.get(p))}`)
    .join('\n');

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('CommandBus', () => {
  it('place -> undo -> redo restores byte-identical files', () => {
    const { store, bus, map } = setup();
    const before = dump(store);
    const r = bus.execute(
      {
        type: 'bricks.place',
        payload: { map, bricks: [{ type: 'brick2x4', x: 3, y: 6, z: 3, rot: 0, color: '#d20c20' }] },
      },
      { source: 'user' },
    );
    expect(r).toMatchObject({ ok: true });
    expect(r.touched).toEqual([paths.chunk(map, 0, 0)]);
    const after = dump(store);
    expect(after).not.toBe(before);
    expect(bus.undo()).toBe(true);
    expect(dump(store)).toBe(before);
    expect(bus.redo()).toBe(true);
    expect(dump(store)).toBe(after);
    expect(bus.history()).toEqual([{ label: 'Place brick2x4', source: 'user', at: 0, touched: r.touched }]);
  });

  it('runs a list as one transaction: a bad command rolls everything back', () => {
    const { store, bus, map } = setup();
    const before = dump(store);
    const r = bus.execute(
      [
        {
          type: 'bricks.place',
          payload: { map, bricks: [{ type: 'plate2x2', x: 1, y: 0, z: 1, rot: 0, color: '#0058ac' }] },
        },
        { type: 'bricks.remove', payload: { map, ids: [999_999] } },
      ],
      { source: 'ai' },
    );
    expect(r).toMatchObject({ ok: false, failedAt: 1, error: 'Brick 999999 not found.' });
    expect(dump(store)).toBe(before);
    expect(bus.history()).toHaveLength(0);
  });

  it('dryRun previews without changing anything', () => {
    const { store, bus, map } = setup();
    const before = dump(store);
    const r = bus.dryRun([{ type: 'map.setEnvironment', payload: { map, time: 'night', rain: true } }]);
    expect(r.ok).toBe(true);
    expect((r.preview.get(paths.map(map)) as MapDoc).sky.time).toBe('night');
    expect(dump(store)).toBe(before);
    expect(bus.canUndo()).toBe(false);
  });

  it('moves bricks between chunk files and deletes emptied chunks', () => {
    const { store, bus, map } = setup();
    bus.execute(
      {
        type: 'bricks.place',
        payload: { map, bricks: [{ id: 50_000, type: 'tile1x1', x: 200, y: 0, z: 200, rot: 0, color: '#eef0f2' }] },
      },
      { source: 'user' },
    );
    expect(store.has(paths.chunk(map, 6, 6))).toBe(true);
    const r = bus.execute(
      { type: 'bricks.move', payload: { map, ids: [50_000], dx: 40, dy: 0, dz: 0 } },
      { source: 'user' },
    );
    expect(r.touched.sort()).toEqual([paths.chunk(map, 6, 6), paths.chunk(map, 7, 6)].sort());
    expect(store.has(paths.chunk(map, 6, 6))).toBe(false);
    expect(new MapBricks(store, map).locate([50_000]).get(50_000)).toBe('7_6');
  });

  it('rejects what v68 rejects', () => {
    const { bus, map } = setup();
    const place = (b: object) =>
      bus.execute(
        {
          type: 'bricks.place',
          payload: { map, bricks: [{ type: 'brick2x4', x: 0, y: 0, z: 0, rot: 0, color: '#d20c20', ...b }] },
        },
        { source: 'user' },
      );
    expect(place({ type: 'brick5x5' }).error).toMatch(/Unknown brick type/);
    expect(place({ x: 300 }).error).toMatch(/outside the build area/);
    expect(place({ y: 298 }).error).toMatch(/outside the build area/);
    expect(place({ rot: 4 }).error).toMatch(/Rotation/);
    expect(bus.execute({ type: 'nope', payload: {} }, { source: 'user' }).error).toBe('Unknown command "nope".');
  });

  it('caps history at maxSteps', () => {
    const { bus, map } = setup({ maxSteps: 3 });
    for (const time of ['night', 'day', 'noon', 'evening', 'night'] as const)
      bus.execute({ type: 'map.setEnvironment', payload: { map, time } }, { source: 'user' });
    expect(bus.history()).toHaveLength(3);
  });

  it('500 random commands, then undo all, equals the start; redo all equals the end', () => {
    const { store, bus, map } = setup({ maxSteps: 1000 }); // default cap (200) would drop the oldest steps
    const rnd = mulberry32(7);
    const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
    const start = dump(store);
    let applied = 0;
    for (let i = 0; i < 500; i++) {
      const ids = new MapBricks(store, map).all().map((b) => b.id);
      const some = () => Array.from(new Set(Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => pick(ids))));
      const cmd: Command = pick([
        () => ({
          type: 'bricks.place',
          payload: {
            map,
            bricks: [
              {
                type: pick(['brick2x4', 'plate2x2', 'tile1x2', 'brick1x1']),
                x: Math.floor(rnd() * 200) - 100,
                y: Math.floor(rnd() * 30),
                z: Math.floor(rnd() * 200) - 100,
                rot: Math.floor(rnd() * 4),
                color: pick(['#d20c20', '#0058ac', '#f7c900']),
              },
            ],
          },
        }),
        () => ({ type: 'bricks.remove', payload: { map, ids: some() } }),
        () => ({
          type: 'bricks.move',
          payload: {
            map,
            ids: some(),
            dx: Math.floor(rnd() * 70) - 35,
            dy: 0,
            dz: Math.floor(rnd() * 70) - 35,
            drot: 1,
          },
        }),
        () => ({ type: 'bricks.paint', payload: { map, ids: some(), color: '#a187cd' } }),
        () => ({
          type: 'map.setEnvironment',
          payload: { map, time: pick(['day', 'night'] as const), rain: rnd() < 0.5 },
        }),
      ])();
      if (bus.execute(cmd, { source: 'user' }).ok) applied++;
    }
    expect(applied).toBeGreaterThan(300);
    const end = dump(store);
    const steps = bus.history().length;
    for (let i = 0; i < steps; i++) bus.undo();
    expect(bus.canUndo()).toBe(false);
    expect(dump(store)).toBe(start);
    for (let i = 0; i < steps; i++) bus.redo();
    expect(dump(store)).toBe(end);
  });
});

describe('ProjectStore', () => {
  it('refuses invalid files and frozen values cannot be mutated', () => {
    const { store, map } = setup();
    expect(() => store.put(paths.map(map), { nope: true })).toThrow(/map\.json/);
    const doc = store.get<MapDoc>(paths.map(map))!;
    expect(() => {
      (doc as { name: string }).name = 'x';
    }).toThrow();
  });

  it('notifies subscribers once per transaction with the changed paths', () => {
    const { store, bus, map } = setup();
    const seen: string[][] = [];
    store.subscribe(`maps/${map}/`, (c) => seen.push(c));
    bus.execute(
      [
        { type: 'map.setEnvironment', payload: { map, time: 'night' } },
        {
          type: 'bricks.place',
          payload: { map, bricks: [{ type: 'brick1x1', x: 0, y: 30, z: 0, rot: 0, color: '#222630' }] },
        },
      ],
      { source: 'user' },
    );
    expect(seen).toEqual([[paths.map(map), paths.chunk(map, 0, 0)]]);
    expect([...store.dirty()].sort()).toEqual([paths.chunk(map, 0, 0), paths.map(map)].sort());
  });
});
