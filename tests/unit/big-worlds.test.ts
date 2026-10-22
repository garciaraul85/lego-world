import { describe, expect, it } from 'vitest';
import { decodeChunk, encodeChunks } from '../../src/core/bricks/codec';
import { inspectBricks } from '../../src/core/bricks/inspect';
import { MAX_BRICKS_PER_MAP, MapBricks } from '../../src/core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { LOCAL_CHECK_FROM } from '../../src/core/commands/handlers/assets';
import { maxOf, minOf } from '../../src/core/num';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import {
  BRICK_STRIDE,
  type Chunk,
  chunkCount,
  chunkRows,
  packChunk,
  packInts,
  paths,
  unpackInts,
  validateFile,
} from '../../src/core/schema';
import { generateLand, hillAt, LAND_ROOM } from '../../src/core/worldgen/land';
import { ChunkStream } from '../../src/engine/render/stream';
import { piecesAround, WINDOW_RADIUS } from '../../src/engine/runtime/pieces';
import { PlaySession, WINDOW_FROM } from '../../src/engine/runtime/session';

/** P27 part 3: big maps — packed chunks, a million bricks, local checks, the play window and streaming. */
const brick = (id: number, x: number, y: number, z: number, type = 'brick2x2', color = '#4b9f4a') => ({
  id,
  type,
  x,
  y,
  z,
  rot: 0,
  color,
  flags: 0,
});

describe('packed chunks', () => {
  it('ints round-trip through base64, and a chunk decodes to the same bricks it was made from', () => {
    const ints = new Int32Array([0, -2048, 300, 2047, 3, 1, 15, 2_000_000_000, -1, 7]);
    expect([...unpackInts(packInts(ints))!]).toEqual([...ints]);
    expect(unpackInts('AAA')).toBeNull();
    const bricks = [
      brick(1, 0, 0, 0),
      brick(2, 2, 0, 0, 'plate2x4', '#ff0000'),
      { ...brick(3, 4, 0, 0), group: 'Wall' },
    ];
    const [chunk] = [...encodeChunks(bricks).values()];
    expect('data' in chunk!).toBe(true);
    expect(chunkCount(chunk!)).toBe(3);
    expect(decodeChunk(chunk!)).toEqual(bricks);
    expect(validateFile('maps/map_aaaaaaaaaa/chunks/0_0.json', chunk)).toEqual([]);
  });
  it('old chunks of one list per brick still read, and are packed as a project opens', () => {
    const old = {
      cx: 0,
      cz: 0,
      palette: { types: ['brick2x2'], colors: ['#4b9f4a'], groups: [] },
      bricks: [[0, 1, 0, 1, 0, 0, 0, 5, -1]],
    } as Chunk;
    expect(validateFile('maps/map_aaaaaaaaaa/chunks/0_0.json', old)).toEqual([]);
    expect([...chunkRows(old)]).toEqual([0, 1, 0, 1, 0, 0, 0, 5, -1]);
    const packed = packChunk(old);
    expect(decodeChunk(packed)).toEqual(decodeChunk(old));
    const files = newProjectFiles({ name: 'Old', random: () => 0.3 });
    const map = [...files.keys()].find((k) => k.endsWith('/map.json'))!.split('/')[1]!;
    files.set(paths.chunk(map, 0, 0), old);
    const store = new ProjectStore(files);
    expect('data' in store.get<Chunk>(paths.chunk(map, 0, 0))!).toBe(true);
    expect(store.dirty().has(paths.chunk(map, 0, 0))).toBe(true);
  });
  it('a chunk with a brick outside it, out of the build area or out of its palette is refused', () => {
    const bad = (b: object) => {
      const [c] = [...encodeChunks([{ ...brick(1, 0, 0, 0), ...b }]).values()];
      return validateFile(`maps/map_aaaaaaaaaa/chunks/${c!.cx}_${c!.cz}.json`, { ...c, cx: 0, cz: 0 }).length;
    };
    expect(bad({ x: 40 })).toBeGreaterThan(0);
    expect(bad({ x: 0, y: 400 })).toBeGreaterThan(0);
    const [c] = [...encodeChunks([brick(1, 0, 0, 0)]).values()];
    const rows = chunkRows(c!).slice();
    rows[5] = 3; // colour index past the palette
    expect(validateFile('maps/map_aaaaaaaaaa/chunks/0_0.json', { ...c, data: packInts(rows) }).length).toBeGreaterThan(
      0,
    );
    expect(BRICK_STRIDE).toBe(9);
  });
});

describe('a million bricks', () => {
  it('big land fits the brick rules, leaves room to build and keeps the start flat', () => {
    const land = generateLand({ size: 256, seed: 3 });
    expect(inspectBricks(land).ok).toBe(true);
    expect(hillAt({ size: 256, seed: 3 }, 0, 0)).toBe(0);
    const big = generateLand({ size: 2048, seed: 3 });
    expect(big.length).toBe(MAX_BRICKS_PER_MAP - LAND_ROOM);
    // a list longer than the call stack takes
    expect(maxOf(big, (b) => b.id)).toBe(big.length);
    expect(minOf(big, (b) => b.x)).toBe(-1024);
  });
  it('a map of 950,000 bricks is made in one step, counted without decoding, and edited with local checks', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Big', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const run = (c: unknown) => bus.execute(c as Parameters<typeof bus.execute>[0], { source: 'user' });
    const map = 'map_bigbigbig1';
    expect(run({ type: 'map.create', payload: { id: map, name: 'Big land', land: { size: 2048, seed: 7 } } }).ok).toBe(
      true,
    );
    const mb = new MapBricks(store, map);
    expect(mb.count()).toBe(MAX_BRICKS_PER_MAP - LAND_ROOM);
    expect(mb.count()).toBeGreaterThan(LOCAL_CHECK_FROM);
    expect(store.get<{ size: { w: number } }>(paths.map(map))!.size.w).toBe(2048);
    // a brick on the clearing, then one in the air: the local check refuses the floating one
    const t0 = performance.now();
    expect(
      run({ type: 'bricks.place', payload: { map, bricks: [brick(0, 2, 1, 2)].map(({ id: _, ...b }) => b) } }).ok,
    ).toBe(true);
    expect(performance.now() - t0).toBeLessThan(2000);
    const air = run({ type: 'bricks.place', payload: { map, bricks: [{ ...brick(0, 10, 20, 10), id: undefined }] } });
    expect(air.ok).toBe(false);
    expect(air.error).toMatch(/stud connection/);
    const overlap = run({ type: 'bricks.place', payload: { map, bricks: [{ ...brick(0, 2, 1, 2), id: undefined }] } });
    expect(overlap.error).toMatch(/overlap/);
    // the build area is ±2048 studs
    expect(
      run({ type: 'bricks.place', payload: { map, bricks: [{ ...brick(0, 3000, 0, 0), id: undefined }] } }).error,
    ).toMatch(/outside the build area/);
    // undo takes the whole land away
    bus.undo();
    bus.undo();
    expect(store.has(paths.map(map))).toBe(false);
  });
  it('a big map is too big for v68 but plays in the engine: the hero’s window moves with the hero, far neighbours sleep', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Big', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const map = 'map_bigbigbig1';
    bus.execute(
      { type: 'map.create', payload: { id: map, name: 'Big land', land: { size: 1024, seed: 9 } } },
      { source: 'user' },
    );
    const p = new PlaySession(store.snapshot(), { mapId: map });
    expect(p.world.pieces.length).toBeGreaterThan(WINDOW_FROM);
    expect(p.world.big).toBe(true);
    expect(p.world.controller.pieces.length).toBeLessThan(p.world.pieces.length / 4);
    expect(p.world.windowAt).toBe('0_0');
    p.placeAt([200.5, 30, 200.5], 0);
    p.runtime.stepOnce();
    expect(p.world.windowAt).toBe('6_6');
    // the window holds the chunks around the hero
    const around = piecesAround(p.world.byChunk!, '6_6');
    expect(p.world.controller.pieces.length).toBe(around.length);
    for (const n of p.world.npcs) n.state.x = 0;
    expect(p.world.npcs.every((n) => !p.awake(p.world, n))).toBe(true);
    expect(WINDOW_RADIUS).toBe(3);
  });
  it('a small map plays as before (no window)', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Small', random: () => 0.3 }));
    const p = new PlaySession(store.snapshot());
    expect(p.world.big).toBe(false);
    expect(p.world.controller.pieces.length).toBe(p.world.pieces.length);
  });
  it('chunk streaming: small maps load at once; big maps load the nearest chunks first and drop far ones', () => {
    const built: string[] = [];
    const dropped: string[] = [];
    const renderer = {
      viewDistance: 0,
      lodDistance: 0,
      setChunk: (k: string) => built.push(k),
      dropChunk: (k: string) => dropped.push(k),
      clearChunks: () => {},
      setSegments: () => {},
    };
    const s = new ChunkStream(renderer as never, () => []);
    s.reset(['0_0', '1_0']);
    expect(built).toEqual(['0_0', '1_0']);
    expect(s.streaming).toBe(false);
    built.length = 0;
    const keys: string[] = [];
    for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) keys.push(`${x}_${z}`);
    s.viewDistance = 128;
    s.reset(keys);
    expect(s.streaming).toBe(true);
    expect(built).toEqual([]);
    while (s.update(0, 0));
    expect(built[0]).toBe('0_0');
    // 4 chunks each way: 9 × 9
    expect(built.length).toBe(81);
    expect(renderer.viewDistance).toBe(128);
    s.update(32 * 15, 0);
    expect(dropped).toContain('-4_0');
  });
});
