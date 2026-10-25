import { describe, expect, it } from 'vitest';
import { ASSET_KINDS, assetSpecFromWords, cleanAssetSpec, composeAsset } from '../../src/core/assets/compose';
import { inspectBricks } from '../../src/core/bricks/inspect';
import { validBrickType } from '../../src/core/bricks/map-bricks';
import { Asset } from '../../src/core/schema';

/** Milestone 3, 10d part 4: assets from words — every kind builds into a valid asset of bricks that never overlap. */
function overlaps(a: Asset): string | null {
  const seen = new Set<string>();
  for (const [t, x, y, z, rot] of a.bricks) {
    const type = a.palette.types[t]!;
    const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(type)!;
    const h = m[1] === 'brick' ? 3 : 1;
    const [rows, cols] = [Number(m[2]), Number(m[3])];
    const [w, d] = rot % 2 ? [rows, cols] : [cols, rows];
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++)
        for (let k = 0; k < h; k++) {
          const key = `${x + i},${y + k},${z + j}`;
          if (seen.has(key)) return key;
          seen.add(key);
        }
  }
  return null;
}

describe('every kind of asset', () => {
  for (const kind of ASSET_KINDS)
    it(`${kind}: a valid asset, bricks v68 has, none overlapping, standing on the ground`, () => {
      for (const extra of [{}, { width: 32, depth: 32, floors: 12 }, { width: 2, depth: 2, floors: 1 }]) {
        const spec = cleanAssetSpec({
          kind,
          ...extra,
          features: [
            'chimney',
            'flag',
            'door',
            'windows',
            'sail',
            'wheels',
            'awning',
            'sign',
            'clock',
            'garden',
            'balcony',
          ],
        });
        const a = composeAsset(spec, 'ast_test000001');
        const r = Asset.safeParse(a);
        expect(r.success, JSON.stringify(r.error?.issues[0])).toBe(true);
        expect(a.bricks.length).toBeGreaterThan(0);
        expect(a.bricks.length).toBeLessThan(6000);
        for (const t of a.palette.types) expect(validBrickType(t), t).toBe(true);
        expect(overlaps(a)).toBeNull();
        // v68's rule: every brick held by studs to the ground through others (so it can be placed on a map)
        const bricks = a.bricks.map(([t, x, y, z, rot, c], i) => ({
          id: i + 1,
          type: a.palette.types[t]!,
          x,
          y,
          z,
          rot,
          color: a.palette.colors[c]!,
          flags: 0,
          group: -1,
        }));
        const r2 = inspectBricks(bricks as never);
        expect(r2.ok, `${kind} ${JSON.stringify(extra)}: ${(r2 as { reason?: string }).reason}`).toBe(true);
        expect(Math.min(...a.bricks.map((b) => b[2]))).toBe(0);
        expect(Math.min(...a.bricks.map((b) => b[1]))).toBe(0);
        expect(Math.min(...a.bricks.map((b) => b[3]))).toBe(0);
      }
    });
  it('merges cells into big bricks: a plain house is far fewer bricks than studs', () => {
    const a = composeAsset(cleanAssetSpec({ kind: 'house', width: 16, depth: 12, floors: 2 }), 'ast_test000002');
    expect(a.palette.types.some((t) => /x[4-8]$/.test(t))).toBe(true);
    expect(a.bricks.length).toBeLessThan(500);
  });
});

describe('assets from words', () => {
  it('a red brick house with a blue door, three floors and a chimney', () => {
    const s = assetSpecFromWords('a red brick house with a blue door, three floors and a chimney');
    expect(s).toMatchObject({ kind: 'house', floors: 3, name: 'Red Brick House' });
    expect(s.colors.main).toBe('#c91a09');
    expect(s.colors.door).toBe('#0055bf');
    expect(s.features).toContain('chimney');
  });
  it('kinds, sizes and roofs from words', () => {
    expect(assetSpecFromWords('a big stone castle').kind).toBe('castle');
    expect(assetSpecFromWords('a big stone castle').width).toBeGreaterThan(20);
    expect(assetSpecFromWords('a pirate ship with black sails').kind).toBe('ship');
    expect(assetSpecFromWords('a pirate ship with black sails').features).toContain('cannons');
    expect(assetSpecFromWords('a pirate ship with black sails').colors.accent).toBe('#1b1b1b');
    expect(assetSpecFromWords('a wooden bridge').kind).toBe('bridge');
    expect(assetSpecFromWords('a tiny yellow taxi').kind).toBe('car');
    expect(assetSpecFromWords('a tiny yellow taxi').width).toBeLessThan(8);
    expect(assetSpecFromWords('a bakery with a flat roof and an awning').roof).toBe('flat');
    expect(assetSpecFromWords('a 20 story office block').floors).toBe(12);
    expect(assetSpecFromWords('a lighthouse').kind).toBe('lighthouse');
    expect(assetSpecFromWords('something').kind).toBe('house');
  });
  it('Claude’s specs are kept in range', () => {
    const s = cleanAssetSpec({
      kind: 'spaceship',
      width: 999,
      depth: -3,
      floors: 2.6,
      roof: 'glass',
      features: ['laser', 'flag'],
      colors: { main: '#FF0000', roof: 'red' },
    });
    expect(s).toMatchObject({ kind: 'house', width: 32, depth: 2, floors: 3, roof: 'gable', features: ['flag'] });
    expect(s.colors.main).toBe('#ff0000');
    expect(s.colors.roof).toBe('#c91a09');
  });
});

describe('things built in front of a wall', () => {
  it('a windmill’s sails, a shop’s awning, a car’s wheels on both sides are kept', () => {
    const colors = (k: string, f?: string[]) =>
      composeAsset(cleanAssetSpec({ kind: k, ...(f ? { features: f } : {}) }), 'ast_test000003').palette.colors;
    expect(colors('windmill')).toContain('#f4f4f4');
    expect(colors('shop')).toContain('#c91a09');
    const car = composeAsset(cleanAssetSpec({ kind: 'car' }), 'ast_test000004');
    const wheels = car.bricks.filter((b) => car.palette.colors[b[5]] === '#1b1b1b' && b[2] === 0);
    expect(new Set(wheels.map((b) => b[3])).size).toBe(2);
  });
});

describe('nothing is lost to the stud rule', () => {
  it('every kind keeps (nearly) all its bricks: recipes hold every part by studs', async () => {
    const { heldBricks, __mesh } = await import('../../src/core/assets/compose');
    for (const kind of ASSET_KINDS)
      for (const extra of [{}, { width: 32, depth: 32, floors: 12 }, { width: 3, depth: 3, floors: 1 }]) {
        const spec = cleanAssetSpec({
          kind,
          ...extra,
          features: [
            'chimney',
            'flag',
            'door',
            'windows',
            'sail',
            'wheels',
            'awning',
            'sign',
            'clock',
            'garden',
            'balcony',
            'cannons',
            'lamp',
          ],
        });
        const all = __mesh(spec);
        expect(heldBricks(all).length, `${kind} ${JSON.stringify(extra)}`).toBe(all.length);
      }
  });
});
