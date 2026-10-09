import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Brick } from '../../src/core/bricks/codec';
import { inspectBricks } from '../../src/core/bricks/inspect';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';

const b = (o: Partial<Brick>): Brick => ({
  id: 1,
  type: 'brick2x2',
  x: 0,
  y: 0,
  z: 0,
  rot: 0,
  color: '#d20c20',
  flags: 0,
  ...o,
});

describe('inspectBricks (port of v68 inspect)', () => {
  it('accepts every map of the v68 fixture save', () => {
    const store = new ProjectStore(
      migrate(JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'))).files,
    );
    const maps = store.list('maps/').filter((p) => p.endsWith('/map.json'));
    expect(maps.length).toBe(2);
    for (const m of maps) expect(inspectBricks(new MapBricks(store, m.split('/')[1]!).all())).toEqual({ ok: true });
  });

  it('connects through studs, not through tiles', () => {
    expect(inspectBricks([b({}), b({ id: 2, y: 3 })])).toEqual({ ok: true });
    expect(inspectBricks([b({ type: 'tile2x2' }), b({ id: 2, y: 1 })]).ok).toBe(false);
    expect(inspectBricks([b({ id: 2, y: 3 })])).toEqual({
      ok: false,
      reason: 'Needs a stud connection to the build. Tiles have no top studs.',
    });
  });

  it('rejects overlaps, using the rotated footprint', () => {
    expect(inspectBricks([b({ type: 'brick2x4' }), b({ id: 2, x: 3 })]).ok).toBe(false); // 2x4 unrotated is 4 wide in x
    expect(inspectBricks([b({ type: 'brick2x4', rot: 1 }), b({ id: 2, x: 3 })])).toEqual({ ok: true }); // rotated: 2 wide
  });
});
