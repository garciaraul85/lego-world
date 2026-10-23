import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CLEANUP, cleanupOf, DEBRIS_FADE, MAX_BROKEN, RUBBLE_BRICKS } from '../../src/core/assets/cleanup';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, paths, validateFile } from '../../src/core/schema';
import { captureMap, type SaveWorld } from '../../src/engine/runtime/saves';
import { PlaySession } from '../../src/engine/runtime/session';

/** P27 part 3d: what becomes of things that break — rebuilt, gone, back, or rubble — and keeping it small. */
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;

function game(after: Asset['smash']['after'], respawnAfter?: number) {
  const store = new ProjectStore(newProjectFiles({ name: 'Crates', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const def: Asset = {
    ...crate,
    smash: {
      ...crate.smash,
      enabled: true,
      after,
      rebuild: after === 'rebuild',
      ...(respawnAfter !== undefined ? { respawnAfter } : {}),
    },
  };
  const run = (c: unknown) => {
    const r = bus.execute(c as Parameters<typeof bus.execute>[0], { source: 'user' });
    expect(r.ok, r.error).toBe(true);
  };
  run(
    store.has(paths.asset(def.id))
      ? { type: 'asset.update', payload: { asset: def } }
      : { type: 'asset.create', payload: { asset: def } },
  );
  run({ type: 'asset.place', payload: { map, asset: def.id, pos: [20, 0, 20], rot: 0, id: 'ins_crate00001' } });
  const p = new PlaySession(store.snapshot());
  const inst = p.world.instances.find((i) => i.inst.id === 'ins_crate00001')!;
  const piece = p.world.pieces.find((x) => x.id === inst.inst.idBase)!;
  return { store, bus, map, p, inst, piece };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};

describe('after it breaks', () => {
  it('the four choices, and assets made before them keep their rebuild setting', () => {
    expect(CLEANUP).toEqual(['rebuild', 'gone', 'respawn', 'rubble']);
    expect(cleanupOf({ smash: { ...crate.smash, rebuild: true } })).toBe('rebuild');
    expect(cleanupOf({ smash: { ...crate.smash, rebuild: false } })).toBe('gone');
    expect(cleanupOf({ smash: { ...crate.smash, after: 'rubble' } })).toBe('rubble');
    expect(cleanupOf(null)).toBe('rebuild');
    expect(
      validateFile(paths.asset(crate.id), { ...crate, smash: { ...crate.smash, after: 'melts' } }).length,
    ).toBeGreaterThan(0);
  });
  it('rebuildable: it waits for the hero to rebuild it (as before)', () => {
    const { p, piece } = game('rebuild');
    p.placeAt([10, 0.4, 10], 0);
    expect(p.breakHit(piece, undefined, true)).toBeGreaterThan(0);
    expect(p.world.broken[0]!.mode).toBe('rebuild');
    p.placeAt([21, 0.4, 19], 0);
    expect(p.nearestBroken()).toBe(p.world.broken[0]);
    steps(p, DEBRIS_FADE + 1);
    expect(p.world.debris.length).toBeGreaterThan(0);
  });
  it('gone for good: no rebuild, its loose bricks fade', () => {
    const { p, piece } = game('gone');
    p.placeAt([10, 0.4, 10], 0);
    p.breakHit(piece, undefined, true);
    expect(p.world.debris.length).toBeGreaterThan(0);
    p.placeAt([21, 0.4, 19], 0);
    expect(p.nearestBroken()).toBeNull();
    steps(p, DEBRIS_FADE + 1);
    expect(p.world.debris).toHaveLength(0);
  });
  it('rubble: a few bricks stay for good', () => {
    const { p, piece } = game('rubble');
    p.placeAt([10, 0.4, 10], 0);
    p.breakHit(piece, undefined, true);
    steps(p, DEBRIS_FADE + 1);
    const kept = p.world.debris.filter((d) => d.keep).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThanOrEqual(RUBBLE_BRICKS);
    expect(p.world.debris.every((d) => d.keep)).toBe(true);
  });
  it('comes back: after its time (not while the hero stands there), healed; or when the player returns', () => {
    const { p, piece, inst } = game('respawn', 2);
    const count = p.world.pieces.length;
    p.placeAt([10, 0.4, 10], 0);
    p.breakHit(piece, undefined, true);
    expect(p.world.pieces.length).toBeLessThan(count);
    steps(p, 1);
    // the hero waits beside it: it does not come back on top of them
    p.placeAt([20.4, 0.4, 20.4], 0);
    steps(p, 2.5);
    expect(p.world.broken).toHaveLength(1);
    p.placeAt([4, 0.4, 4], 0);
    expect(p.world.broken).toHaveLength(1);
    steps(p, 1);
    expect(p.world.broken).toHaveLength(0);
    expect(p.world.pieces.length).toBe(count);
    expect(p.health.peek(`i:${inst.inst.id}`)).toBeUndefined();
    // 0: when the player comes back to the map
    const g = game('respawn', 0);
    g.bus.execute({ type: 'map.create', payload: { id: 'map_otherside1', name: 'Other side' } }, { source: 'user' });
    const q = new PlaySession(g.store.snapshot());
    const qp = q.world.pieces.find((x) => x.id === g.inst.inst.idBase)!;
    q.placeAt([10, 0.4, 10], 0);
    q.breakHit(qp, undefined, true);
    steps(q, 5);
    expect(q.world.broken).toHaveLength(1);
    const home = q.world.mapId;
    q.travel('map_otherside1', '');
    q.travel(home, '');
    expect(q.world.broken).toHaveLength(0);
  });
  it('a map remembers at most 2,000 breaks: the oldest gone ones are kept as ids only, and saves keep them', () => {
    const { p, piece } = game('gone');
    const w = p.world;
    // 2,000 old breaks (records only), then one more
    for (let i = 0; i < MAX_BROKEN; i++)
      w.broken.push({
        id: w.brokenSerial++,
        originals: [{ ...piece, id: 900_000 + i }],
        progress: 0,
        mode: 'gone',
        at: 0,
      });
    p.placeAt([10, 0.4, 10], 0);
    p.breakHit(piece, undefined, true);
    expect(w.broken.length).toBe(MAX_BROKEN);
    expect(w.goneIds).toContain(900_000);
    const save = captureMap(w as unknown as SaveWorld);
    expect(save.gone).toContain(900_000);
    expect(save.broken.length).toBe(MAX_BROKEN);
  });
  it('a beaten neighbour that comes back returns home, healed', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Town', random: () => 0.3 }));
    const p = new PlaySession(store.snapshot());
    const npc = p.world.npcs[0];
    if (!npc) return; // a map without neighbours
    const w = p.world;
    w.npcs = w.npcs.filter((n) => n !== npc);
    w.defeated.push({ npc, at: p.clock, after: 1 });
    p.placeAt([npc.state.x + 40, 0.4, npc.state.z + 40], 0);
    steps(p, 2);
    expect(w.npcs).toContain(npc);
    expect(w.defeated).toHaveLength(0);
  });
});

describe('many breaks (stress)', () => {
  it('500 crates smashed on a big land: each break stays quick, debris stays capped, the save stays small', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Smash', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const map = 'map_smashland1';
    const made = bus.execute(
      { type: 'map.create', payload: { id: map, name: 'Smash land', land: { size: 512, seed: 3 } } },
      { source: 'user' },
    );
    expect(made.ok, made.error).toBe(true);
    const def: Asset = { ...crate, smash: { ...crate.smash, enabled: true, after: 'gone', rebuild: false } };
    expect(bus.execute({ type: 'asset.create', payload: { asset: def } }, { source: 'user' }).ok).toBe(true);
    const r = bus.execute(
      { type: 'asset.scatter', payload: { map, asset: def.id, area: [-200, -200, 200, 200], count: 5000, seed: 7 } },
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(store.snapshot());
    p.travel(map, '');
    p.placeAt([0, 0.4, 0], 0);
    expect(p.world.big).toBe(true);
    const crates = p.world.instances.filter((i) => i.def.id === def.id).slice(0, 500);
    const pieces0 = p.world.pieces.length;
    const t0 = performance.now();
    for (const c of crates) {
      const piece = p.pieceById(p.world, c.inst.idBase);
      if (piece) p.breakHit(piece, undefined, true);
    }
    const breakMs = (performance.now() - t0) / crates.length;
    const w = p.world;
    expect(w.broken.length).toBe(crates.length);
    expect(w.pieces.length).toBe(pieces0 - crates.length * def.bricks.length);
    expect(w.debris.length).toBeLessThanOrEqual(220);
    const save = JSON.stringify(captureMap(w as unknown as SaveWorld));
    const t1 = performance.now();
    steps(p, 1);
    const stepMs = (performance.now() - t1) / 60;
    // ${pieces0} pieces: about 20 ms a break here (it was 60 before the local check and partial re-index)
    expect(breakMs).toBeLessThan(60);
    expect(stepMs).toBeLessThan(16);
    expect(save.length / crates.length).toBeLessThan(2_000);
    // the neighbours caught up with the breaks
    expect(w.npcsStale).toBeFalsy();
  }, 240_000);
});
