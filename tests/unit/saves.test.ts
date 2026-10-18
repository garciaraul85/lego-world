import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { AUTO_SLOT, MemorySaveStore, newestSave, SaveGame } from '../../src/core/save/save';
import { type Asset, type Instances, type Project, paths } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';
import { BrowserSaveStore } from '../../src/platform/saves';

/** P26: saves — quit and resume with everything as it was; checkpoints; saves survive edits to the game. */
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
const flag = BUILTIN_ASSETS.find((a) => a.name === 'Checkpoint flag')!;
const savePoint = BUILTIN_ASSETS.find((a) => a.name === 'Save point')!;
const floor: Asset = {
  ...crate,
  id: 'ast_yardfloor0' as Asset['id'],
  name: 'Yard floor',
  health: undefined,
  smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  palette: { types: ['plate8x8'], colors: ['#5a8f3c'] },
  footprint: [32, 32],
  bricks: [0, 1, 2, 3].flatMap((i) =>
    [0, 1, 2, 3].map((j) => [0, i * 8, 0, j * 8, 0, 0, 0] as Asset['bricks'][number]),
  ),
};

function game() {
  const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  const r = bus.execute(
    [
      { type: 'asset.create', payload: { asset: floor } },
      { type: 'asset.place', payload: { map, asset: floor.id, pos: [-4, 0, -8] } },
      { type: 'asset.create', payload: { asset: crate } },
      { type: 'asset.place', payload: { map, asset: crate.id, pos: [6, 1, 3] } },
      { type: 'asset.create', payload: { asset: chest } },
      { type: 'asset.place', payload: { map, asset: chest.id, pos: [12, 1, 3] } },
      { type: 'asset.create', payload: { asset: flag } },
      { type: 'asset.place', payload: { map, asset: flag.id, pos: [18, 1, 12] } },
      { type: 'asset.create', payload: { asset: savePoint } },
      { type: 'asset.place', payload: { map, asset: savePoint.id, pos: [0, 1, 14] } },
    ] as never,
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  const items = () => (s.get<Instances>(paths.instances(map))?.items ?? []).filter((i) => i.kind === 'asset');
  const id = (name: string) => items().find((i) => i.kind === 'asset' && i.asset === assetOf(name).id)!.id;
  return { s, bus, map, id };
}
const assetOf = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;
const inst = (p: PlaySession, id: string) => p.world.instances.find((i) => i.inst.id === id);
const steps = (p: PlaySession, n = 5) => {
  for (let i = 0; i < n; i++) p.runtime.stepOnce();
};

describe('saving and loading', () => {
  it('quit and resume: an opened chest, a smashed crate, items, variables and the hero come back', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    const crateId = g.id('Wooden crate');
    const chestId = g.id('Treasure chest');
    p.setInstanceState(chestId, 'open');
    p.hitInstance(inst(p, crateId)!, { power: 50, type: 'blunt' });
    const brokenBricks = p.world.broken.flatMap((b) => b.originals).length;
    expect(brokenBricks).toBeGreaterThan(0);
    const piecesLeft = p.world.pieces.length;
    p.actions.run([{ do: 'give', item: 'Key', count: 2 }], p.clock);
    p.logic.setVar('coins', 7);
    p.placeAt([4, 0.4, 10], 1.2);
    p.saveGame(1);

    // a new play of the same game, as after closing it
    const q = new PlaySession(g.s.snapshot(), { saves });
    expect(inst(q, chestId)?.state).toBe('closed');
    expect(q.loadSave(1)).toBe(true);
    expect(inst(q, chestId)?.state).toBe('open');
    expect(q.world.pieces.length).toBe(piecesLeft);
    expect(q.world.broken.flatMap((b) => b.originals).length).toBe(brokenBricks);
    expect(q.inventory.get('Key')).toBe(2);
    expect(q.logic.vars.get('coins')).toBe(7);
    expect(Math.hypot(q.heroState.x - 4, q.heroState.z - 10)).toBeLessThan(1.5);
    // the smashed crate can still be rebuilt after loading
    q.cheat('rebuildAll');
    expect(q.world.broken.length).toBe(0);
  });

  it('things added and removed in play are kept, with their ids', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    // a sword rises out of the chest (an item added in play), and the save point is removed
    const added = p.spawnNear('Sword', g.id('Treasure chest'));
    expect(added).toBeTruthy();
    p.despawn(g.id('Save point'));
    expect(inst(p, g.id('Save point'))).toBeUndefined();
    p.saveGame(2);
    const q = new PlaySession(g.s.snapshot(), { saves });
    q.loadSave(2);
    expect(inst(q, added!)?.def.name).toBe('Sword');
    expect(inst(q, g.id('Save point'))).toBeUndefined();
    // a copy made after loading gets a new id (no clash with the one put back)
    const next = q.spawnNear('Sword', g.id('Treasure chest'));
    expect(next && next !== added).toBeTruthy();
  });

  it('a save made before the maker edited the game still loads; what is gone is skipped', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    const chestId = g.id('Treasure chest');
    p.setInstanceState(chestId, 'open');
    p.setInstanceState(g.id('Checkpoint flag'), 'up');
    p.saveGame(1);
    // the maker deletes the chest
    g.s.put(paths.instances(g.map), {
      ...g.s.get<Instances>(paths.instances(g.map))!,
      items: g.s.get<Instances>(paths.instances(g.map))!.items.filter((i) => i.id !== chestId),
    });
    const q = new PlaySession(g.s.snapshot(), { saves });
    expect(() => q.loadSave(1)).not.toThrow();
    expect(inst(q, g.id('Checkpoint flag'))?.state).toBe('up');
    expect(q.events.at(-1)?.msg).toMatch(/skipped/);
    // a save of a map that no longer exists, or a broken save file, does not stop the game
    const raw = saves.read(g.s.manifest.id, 1)!;
    saves.write({ ...raw, map: 'map_gone000000', maps: { ...raw.maps, map_gone000000: raw.maps[g.map]! } });
    expect(q.loadSave(1)).toBe(true);
    expect(q.world.mapId).toBe(g.map);
  });

  it('health of hurt things is kept', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    p.health.of('i:x', { hp: 5, atZero: {} } as never);
    p.health.hit('i:x', { hp: 5, atZero: {} } as never, { power: 2, type: 'blunt' });
    p.saveGame(1);
    const save = saves.read(g.s.manifest.id, 1)!;
    expect(save.health['i:x']).toBe(3);
    const q = new PlaySession(g.s.snapshot(), { saves });
    q.loadSave(1);
    expect(q.health.of('i:x', { hp: 5, atZero: {} } as never).hp).toBe(3);
  });
});

describe('checkpoints', () => {
  it('touching a checkpoint flag raises it, autosaves, and Retry and falls come back to it', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    const flagId = g.id('Checkpoint flag');
    const c = p.instanceCenter(inst(p, flagId)!)!;
    p.placeAt([c[0], 0.4, c[2] + 2.2], 0);
    steps(p, 3);
    expect(inst(p, flagId)?.state).toBe('up');
    expect(p.checkpoint.pos).toBeTruthy();
    expect(saves.read(g.s.manifest.id, AUTO_SLOT)).toBeTruthy();
    // far away, then Retry
    p.placeAt([0, 0.4, 0], 0);
    p.gameOp('retry');
    expect(Math.hypot(p.heroState.x - c[0], p.heroState.z - c[2])).toBeLessThan(3);
    // a fall off the world comes back to it as well
    p.placeAt([0, 0.4, 0], 0);
    p.heroState.y = -20;
    steps(p, 1);
    expect(Math.hypot(p.heroState.x - c[0], p.heroState.z - c[2])).toBeLessThan(3);
  });

  it('Set checkpoint (logic) and the save point (E · Save) work through actions', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    p.placeAt([2, 0.4, 2], 0);
    p.actions.run([{ do: 'checkpoint' }], p.clock);
    expect(p.checkpoint.pos?.[0]).toBeCloseTo(p.heroState.x, 0);
    const sp = inst(p, g.id('Save point'))!;
    expect(sp.def.interactions[0]?.do).toEqual([{ do: 'save' }]);
    p.actions.run(sp.def.interactions[0]!.do, p.clock, sp.inst.id);
    expect(saves.read(g.s.manifest.id, 1)).toBeTruthy();
  });
});

describe('save slots, Continue and a new game', () => {
  it('Continue loads the newest save; Quit then Play starts a new game; the Saves screen saves and loads', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves, boot: 'entry' });
    expect(p.lookup('save.any')).toBe(false);
    p.gameOp('start');
    const chestId = g.id('Treasure chest');
    p.setInstanceState(chestId, 'open');
    // the Saves screen opened from Pause › Save game; the slot 2 button saves there
    p.gameOp('saveMenu');
    expect(p.saveMenu).toBe('save');
    expect(p.lookup('save.slot2')).toBe('Slot 2 · empty');
    p.actions.run([{ do: 'slot', slot: 2 }], p.clock);
    expect(p.saveMenu).toBe(null);
    expect(String(p.lookup('save.slot2'))).toMatch(/^Slot 2 · /);
    expect(p.lookup('save.any')).toBe(true);
    expect(newestSave(saves, g.s.manifest.id)?.slot).toBe(2);
    // Quit to title, then Play: a new game (the chest is closed again)
    p.gameOp('quit');
    p.gameOp('start');
    expect(inst(p, chestId)?.state).toBe('closed');
    // Continue: the newest save
    p.gameOp('quit');
    p.gameOp('continue');
    expect(inst(p, chestId)?.state).toBe('open');
    expect(p.slot).toBe(2);
  });

  it('the game’s Saving settings decide slots and whether Pause can save', () => {
    const g = game();
    g.bus.execute(
      { type: 'project.update', payload: { saving: { mode: 'savePoints', slots: 1, autosave: false } } },
      { source: 'user' },
    );
    expect((g.s.manifest as Project).saving?.mode).toBe('savePoints');
    const p = new PlaySession(g.s.snapshot(), { saves: new MemorySaveStore() });
    expect(p.lookup('save.canSave')).toBe(false);
    expect(p.lookup('save.slot2.shown')).toBe(false);
    p.gameOp('saveMenu');
    expect(p.saveMenu).toBe(null);
    const bad = g.bus.execute(
      { type: 'project.update', payload: { saving: { mode: 'never', slots: 9, autosave: true } } } as never,
      { source: 'user' },
    );
    expect(bad.ok).toBe(false);
  });
});

describe('browser storage', () => {
  it('keeps saves per game and slot; broken or blocked storage reads as no save', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as unknown as Storage;
    const store = new BrowserSaveStore(storage);
    const g = game();
    const p = new PlaySession(g.s.snapshot(), { saves: store });
    p.saveGame(3);
    const back = store.read(g.s.manifest.id, 3);
    expect(SaveGame.safeParse(back).success).toBe(true);
    data.set(`brickworlds.save.${g.s.manifest.id}.1`, '{not json');
    expect(store.read(g.s.manifest.id, 1)).toBe(null);
    store.remove(g.s.manifest.id, 3);
    expect(store.read(g.s.manifest.id, 3)).toBe(null);
    const blocked = new BrowserSaveStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {},
    } as unknown as Storage);
    expect(blocked.read('x', 1)).toBe(null);
    expect(() => blocked.write(back!)).not.toThrow();
  });
});
