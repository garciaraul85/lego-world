import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { BUILTIN_CHARACTERS } from '../../src/builtin/characters';
import { projectSummary } from '../../src/core/ai/context';
import { MAX_BRICKS_PER_MAP, MapBricks } from '../../src/core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { brickCount } from '../../src/core/commands/handlers/assets';
import { serializeFile } from '../../src/core/json/stable';
import { MemoryBackend } from '../../src/core/project/backend';
import { loadProject, saveAll } from '../../src/core/project/load';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { SaveGame } from '../../src/core/save/save';
import { type Asset, type Instances, type MapDoc, paths, validateFile } from '../../src/core/schema';
import { applySave, captureSave, type SaveHost } from '../../src/engine/runtime/saves';
import { PlaySession } from '../../src/engine/runtime/session';

/**
 * P27 part 3, end to end on the biggest map: every edit a maker can do on a full 2048 × 2048 big land (about
 * 950,000 bricks plus a scattered forest up to the 1,000,000-brick budget), then saving and opening the project,
 * playing it, breaking things, travelling, and a save game. Every file must stay valid at every step: the bug this
 * guards against was a scatter whose copies got brick ids past an old limit, so the change was refused.
 */
const tree = BUILTIN_ASSETS.find((a) => a.name === 'Birch tree')!;
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
const BIG = 'map_bigsoak001';
const SMALL = 'map_bigsoak002';

function project() {
  const store = new ProjectStore(newProjectFiles({ name: 'Soak', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(store));
  const run = (type: string, payload: unknown) =>
    bus.execute({ type, payload } as Parameters<typeof bus.execute>[0], { source: 'user' });
  const ok = (type: string, payload: unknown) => {
    const r = run(type, payload);
    expect(r.ok, `${type}: ${r.error}`).toBe(true);
    return r;
  };
  /** every file of the project follows its schema */
  const valid = () => {
    const bad: string[] = [];
    for (const p of store.keys()) {
      const issues = validateFile(p, store.get(p));
      if (issues.length) bad.push(`${p}: ${issues[0]!.at} ${issues[0]!.message}`);
    }
    expect(bad).toEqual([]);
  };
  const items = (map = BIG) => store.get<Instances>(paths.instances(map))?.items ?? [];
  const ms = (f: () => void) => {
    const t = performance.now();
    f();
    return performance.now() - t;
  };
  return { store, bus, run, ok, valid, items, ms };
}

describe('a full big land, end to end', () => {
  it('edits on a full 2048 land stay valid, inside the budget, and quick enough', () => {
    const { store, bus, run, ok, valid, items, ms } = project();
    const made = ms(() => ok('map.create', { id: BIG, name: 'Big soak', land: { size: 2048, seed: 5 } }));
    ok('map.create', { id: SMALL, name: 'Small soak', land: { size: 256, seed: 6 } });
    ok('asset.create', { asset: tree });
    ok('asset.create', { asset: crate });
    valid();
    const land = brickCount(store, BIG);
    expect(land).toBeGreaterThan(900_000);

    // scatter until the map is full, in pieces, as a maker would: every step valid
    const scatter = (count: number, seed: number) =>
      run('asset.scatter', { map: BIG, asset: tree.id, area: [-1024, -1024, 1023, 1023], count, seed });
    const scatterMs = ms(() => expect(scatter(1000, 1).ok).toBe(true));
    expect(scatter(5000, 2).ok).toBe(true);
    const trees = items().length;
    expect(brickCount(store, BIG)).toBeLessThanOrEqual(MAX_BRICKS_PER_MAP);
    expect(MAX_BRICKS_PER_MAP - brickCount(store, BIG)).toBeLessThan(tree.bricks.length);
    expect(scatter(10, 3).error).toMatch(/map is full/);
    valid();

    // the last few bricks of room: smaller crates fill it
    run('asset.scatter', { map: BIG, asset: crate.id, area: [-1024, -1024, 1023, 1023], count: 100, seed: 4 });
    expect(MAX_BRICKS_PER_MAP - brickCount(store, BIG)).toBeLessThan(crate.bricks.length);
    // a full map refuses more bricks and more assets, with a plain message
    expect(run('asset.place', { map: BIG, asset: crate.id, pos: [0, 1, 0] }).error).toMatch(/1,000,000 bricks/);
    expect(
      run('bricks.place', {
        map: BIG,
        bricks: Array.from({ length: 30 }, (_, i) => ({
          type: 'brick2x2',
          x: -20 + 2 * (i % 10),
          y: 1,
          z: 2 * Math.floor(i / 10),
          rot: 0,
          color: '#ff0000',
        })),
      }).error,
    ).toMatch(/1,000,000 bricks/);
    // a bigger tree would not fit: refused, nothing changed
    const bigger: Asset = { ...tree, bricks: [...tree.bricks, tree.bricks[tree.bricks.length - 1]!] };
    expect(run('asset.update', { asset: bigger }).error).toMatch(/more than 1,000,000 bricks/);
    expect(store.get<Asset>(paths.asset(tree.id))!.bricks).toHaveLength(tree.bricks.length);

    // remove 200 trees: room again; place, move, unpack and make an asset of loose bricks
    const gone = items()
      .slice(0, 200)
      .map((i) => i.id);
    const removeMs = ms(() => ok('instance.remove', { map: BIG, instances: gone }));
    expect(items().filter((i) => i.kind === 'asset' && i.asset === tree.id).length).toBe(trees - 200);
    ok('asset.place', { map: BIG, asset: crate.id, pos: [2, 1, 2], id: 'ins_soakcrate1' });
    ok('instance.move', { map: BIG, instance: 'ins_soakcrate1', dx: 2, dz: 0 });
    const someTree = items().find((i) => i.kind === 'asset' && i.asset === tree.id) as Extract<
      Instances['items'][number],
      { kind: 'asset' }
    >;
    const unpackMs = ms(() => ok('instance.unpack', { map: BIG, instances: [someTree.id] }));
    const loose = new MapBricks(store, BIG)
      .all()
      .filter((b) => b.id >= someTree.idBase && b.id < someTree.idBase + tree.bricks.length);
    expect(loose).toHaveLength(tree.bricks.length);
    ok('asset.make', { map: BIG, ids: loose.map((b) => b.id), name: 'My birch' });
    // loose bricks: place, move, paint, remove
    const before = brickCount(store, BIG);
    const placeMs = ms(() =>
      ok('bricks.place', { map: BIG, bricks: [{ type: 'brick2x2', x: 0, y: 1, z: 6, rot: 0, color: '#ff0000' }] }),
    );
    expect(brickCount(store, BIG)).toBe(before + 1);
    const mine = new MapBricks(store, BIG).all().find((b) => b.x === 0 && b.z === 6 && b.y === 1)!;
    ok('bricks.paint', { map: BIG, ids: [mine.id], color: '#0000ff' });
    ok('bricks.move', { map: BIG, ids: [mine.id], dx: 2, dy: 0, dz: 0 });
    ok('bricks.remove', { map: BIG, ids: [mine.id] });
    // neighbours, items, gates, environment, rename
    const character = BUILTIN_CHARACTERS[0]!.id;
    ok('npc.place', { map: BIG, character, pos: [6, 1, 6] });
    ok('item.add', {
      map: BIG,
      item: { id: 'ins_soaksign01', kind: 'ui', widget: 'sign', pos: [0, 2, 0], text: 'Hello', maxDistance: 20 },
    });
    const spawnOf = (m: string) => store.get<MapDoc>(paths.map(m))!.spawns[0]!.id;
    ok('gate.connect', {
      from: { map: BIG, spawn: spawnOf(BIG) },
      to: { map: SMALL, spawn: spawnOf(SMALL) },
      twoWay: true,
    });
    ok('map.setEnvironment', { map: BIG, viewDistance: 512 });
    ok('map.rename', { map: BIG, name: 'Big soak (full)' });
    valid();

    // undo all the way back to the plain land, and redo it all
    const undoMs = ms(() => {
      while (bus.canUndo()) bus.undo();
    });
    expect(store.has(paths.map(BIG))).toBe(false);
    const redoMs = ms(() => {
      while (bus.canRedo()) bus.redo();
    });
    expect(store.get<MapDoc>(paths.map(BIG))!.name).toBe('Big soak (full)');
    expect(items().filter((i) => i.kind === 'asset' && i.asset === tree.id).length).toBe(trees - 201);
    valid();

    // the AI sees the map without being flooded
    const summary = projectSummary(store);
    expect(summary.length).toBeLessThan(200_000);
    expect(summary).toContain('Big soak (full)');

    const timings = { made, scatterMs, removeMs, unpackMs, placeMs, undoMs, redoMs };
    process.stderr.write(`\nTIMINGS ${JSON.stringify(timings)}\n`);
    // edits on a full map must not freeze the editor (software timings: generous)
    expect(placeMs).toBeLessThan(2000);
    expect(removeMs).toBeLessThan(5000);
    expect(unpackMs).toBeLessThan(5000);
    expect(scatterMs).toBeLessThan(10_000);
  }, 600_000);

  it('a full big land saves, opens, plays, breaks, travels and makes a save game', async () => {
    const { store, ok, valid, items } = project();
    ok('map.create', { id: BIG, name: 'Big soak', land: { size: 2048, seed: 5 } });
    ok('map.create', { id: SMALL, name: 'Small soak', land: { size: 256, seed: 6 } });
    ok('asset.create', { asset: tree });
    ok('asset.create', {
      asset: { ...crate, smash: { ...crate.smash, enabled: true, after: 'respawn', rebuild: false, respawnAfter: 0 } },
    });
    ok('asset.scatter', { map: BIG, asset: crate.id, area: [-64, -64, 64, 64], count: 40, seed: 2 });
    ok('asset.scatter', { map: BIG, asset: tree.id, area: [-1024, -1024, 1023, 1023], count: 5000, seed: 1 });
    const spawnOf = (m: string) => store.get<MapDoc>(paths.map(m))!.spawns[0]!.id;
    ok('gate.connect', {
      from: { map: BIG, spawn: spawnOf(BIG) },
      to: { map: SMALL, spawn: spawnOf(SMALL) },
      twoWay: true,
    });
    ok('project.update', { entryMap: BIG, entrySpawn: spawnOf(BIG) });
    valid();

    // save to storage and open again: nothing reported, the same bricks and copies
    const backend = new MemoryBackend();
    await saveAll(backend, store, serializeFile);
    const { store: again, problems } = await loadProject(backend, store.manifest.id);
    expect(problems).toEqual([]);
    expect(brickCount(again, BIG)).toBe(brickCount(store, BIG));
    expect((again.get<Instances>(paths.instances(BIG))?.items ?? []).length).toBe(items().length);

    // play it: starts quickly, big, around the hero
    const t0 = performance.now();
    const p = new PlaySession(again.snapshot());
    const startMs = performance.now() - t0;
    expect(p.world.mapId).toBe(BIG);
    expect(p.world.big).toBe(true);
    expect(startMs).toBeLessThan(15_000);
    for (let i = 0; i < 30; i++) p.runtime.stepOnce();
    // break crates: they come back when the player comes back
    const crates = p.world.instances.filter((i) => i.def.id === crate.id);
    expect(crates.length).toBeGreaterThan(10);
    for (const c of crates.slice(0, 10)) {
      const piece = p.pieceById(p.world, c.inst.idBase);
      if (piece) p.breakHit(piece, undefined, true);
    }
    expect(p.world.broken.length).toBe(10);
    // walk far: the window follows
    const at = p.world.windowAt;
    p.placeAt([600, 0.4, 600], 0);
    for (let i = 0; i < 10; i++) p.runtime.stepOnce();
    expect(p.world.windowAt).not.toBe(at);
    // a save game here keeps the breaks, is valid and small enough for the browser's storage
    const save = captureSave(p as unknown as SaveHost, 1);
    expect(SaveGame.safeParse(JSON.parse(JSON.stringify(save))).success).toBe(true);
    expect(JSON.stringify(save).length).toBeLessThan(1_000_000);
    // travel there and back: the crates come back (Comes back, 0 s: when the player returns)
    p.travel(SMALL, '');
    expect(p.world.mapId).toBe(SMALL);
    p.travel(BIG, '');
    expect(p.world.broken.length).toBe(0);
    // loading the save brings the breaks back
    const loaded = applySave(p as unknown as SaveHost, save);
    expect(loaded).toBeTruthy();
    expect(p.world.mapId).toBe(BIG);
    expect(p.world.broken.length).toBe(10);
    for (let i = 0; i < 30; i++) p.runtime.stepOnce();
  }, 600_000);
});
