import { expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { assetSpot } from '../../src/core/gamegen/places';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';

/** “Do it for me” places assets on a map with no bricks yet too (the tutorial's practice map). */
it('an asset finds a spot on the bare ground of an empty map, away from the spawn', () => {
  const store = new ProjectStore(newProjectFiles({ name: 'T', mapName: 'Practice map' }));
  const bus = registerAll(new CommandBus(store));
  const def = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
  expect(bus.execute([{ type: 'asset.create', payload: { asset: def } }], { source: 'user' }).ok).toBe(true);
  const cmd = assetSpot(store, bus, store.manifest.entry.map, def, { minSteps: 3 });
  expect(cmd).not.toBeNull();
  expect(bus.execute([cmd!], { source: 'user' }).ok).toBe(true);
  const pos = (cmd!.payload as { pos: number[] }).pos;
  expect(Math.hypot(pos[0]!, pos[2]!)).toBeGreaterThanOrEqual(3);
});

it('in Play, one asset on a bare map does not shrink the room to walk: the hero stays on the ground', async () => {
  const { PlaySession } = await import('../../src/engine/runtime/session');
  const store = new ProjectStore(newProjectFiles({ name: 'T', mapName: 'Practice map' }));
  const bus = registerAll(new CommandBus(store));
  const def = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
  bus.execute([{ type: 'asset.create', payload: { asset: def } }], { source: 'user' });
  bus.execute([assetSpot(store, bus, store.manifest.entry.map, def)!], { source: 'user' });
  const s = new PlaySession(store.snapshot());
  // the hero is where the spawn is, on the ground, not on top of the chest
  expect(s.heroState.y).toBeLessThan(1);
  s.placeAt([10, 0.4, 10], 0);
  expect([s.heroState.x, s.heroState.z]).toEqual([10, 10]);
});
