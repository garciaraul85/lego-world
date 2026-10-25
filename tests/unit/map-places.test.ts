import { describe, expect, it } from 'vitest';
import { cleanAssetSpec, composeAsset } from '../../src/core/assets/compose';
import { CommandBus, registerAll } from '../../src/core/commands';
import { arrivalSpot, placeKeepingReach, reachable } from '../../src/core/gamegen/places';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';

/** Milestone 3, 10d part 5: buildings made from words find room on generated land, snowy and hilly too. */
describe('buildings on generated land', () => {
  for (const [biomes, snow] of [
    [['prairie', 'mountains'], true],
    [['beach'], false],
    [['desert'], false],
  ] as const)
    it(`${biomes.join(' + ')}${snow ? ', snowy' : ''}: four houses stand where the hero can walk, quickly`, () => {
      const store = new ProjectStore(newProjectFiles({ name: 'T' } as never), { validate: false });
      const bus = registerAll(new CommandBus(store));
      const M = 'map_tttttttttt';
      expect(
        bus.execute(
          [
            {
              type: 'map.create',
              payload: { id: M, name: 'V', generate: { environments: biomes, size: 32, seed: 42, snow } },
            },
          ],
          { source: 'user' },
        ).ok,
      ).toBe(true);
      const at = arrivalSpot(store, M);
      expect(at).not.toBeNull();
      const sp = (store.get(`maps/${M}/map.json`) as { spawns: { id: string }[] }).spawns[0]!;
      bus.execute([{ type: 'map.updateSpawn', payload: { map: M, spawn: sp.id, pos: at } }], { source: 'user' });
      const t = Date.now();
      const room = reachable(store, M).cells.length;
      let placed = 0;
      for (let k = 0; k < 4; k++) {
        const def = composeAsset(cleanAssetSpec({ kind: 'house' }), `ast_tttttttt${k}t`);
        bus.execute([{ type: 'asset.create', payload: { asset: def } }], { source: 'user' });
        if (placeKeepingReach(store, bus, M, def, 4).length) placed++;
      }
      // a beach is mostly sea: less room
      expect(placed).toBeGreaterThanOrEqual(biomes[0] === 'beach' ? 2 : 4);
      expect(Date.now() - t).toBeLessThan(10_000);
      // the hero can still walk most of the land
      expect(reachable(store, M).cells.length).toBeGreaterThan(room * 0.4);
    });
});
