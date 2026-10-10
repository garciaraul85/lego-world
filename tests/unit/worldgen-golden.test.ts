import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapPieces } from '../../src/core/bridge/legacy-bridge';
import { CommandBus, registerAll } from '../../src/core/commands';
import { worldGenerator } from '../../src/core/legacy/modules';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, BIOMES, type Instances, paths } from '../../src/core/schema';

/**
 * P3.2 golden test: a generated map is stored as terrain chunks + asset instances, and
 * flatten(chunks + expandAsset(instances)) is exactly what v68's generator produces.
 */
describe('generator golden output through assets', () => {
  const store = new ProjectStore(migrate(JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'))).files);
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  for (const seed of [1, 42, 418811])
    for (const env of BIOMES)
      it(`${env} · seed ${seed}`, () => {
        const config = { environments: [env], size: 16 as const, seed };
        const r = bus.execute({ type: 'map.generate', payload: { map, config } }, { source: 'user' });
        expect(r).toMatchObject({ ok: true });
        const v68 = worldGenerator().generate({
          biomes: [env],
          size: 16,
          seed,
          time: 'day',
          rain: false,
          snow: false,
          snowing: false,
          mountainShape: 'mixed',
          mountainScale: 'mixed',
        });
        expect(mapPieces(store, map)).toEqual(v68.pieces);
        const items = store.get<Instances>(paths.instances(map))!.items;
        const grouped = new Set(v68.pieces.flatMap((p) => (p.group ? [p.group] : [])));
        expect(items.filter((i) => i.kind === 'asset').length).toBe(grouped.size);
        for (const p of store.list('assets/')) expect(store.get<Asset>(p)!.origin).toBe('generated');
      });

  it('reuses one asset for identical structures and prunes assets no map uses', () => {
    bus.execute(
      { type: 'map.generate', payload: { map, config: { environments: ['city'], size: 16, seed: 7 } } },
      { source: 'user' },
    );
    const items = store.get<Instances>(paths.instances(map))!.items.filter((i) => i.kind === 'asset');
    const used = new Set(items.map((i) => (i.kind === 'asset' ? i.asset : '')));
    expect(used.size).toBeLessThan(items.length);
    expect(new Set(store.list('assets/'))).toEqual(new Set([...used].map((a) => paths.asset(a))));
  });
});
