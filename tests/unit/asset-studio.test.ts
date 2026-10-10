import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { expandAsset } from '../../src/core/assets/expand';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { ProjectStore } from '../../src/core/project/store';
import { assetFromScratch, initialIndex, scratchFor } from '../../src/editor/workspaces/asset-studio/scratch';

const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;

function plate(state: string) {
  const sc = scratchFor(chest, state);
  const store = new ProjectStore(sc.files);
  const bus = registerAll(new CommandBus(store));
  return { sc, store, bus, read: () => new MapBricks(store, sc.mapId).all() };
}

describe('Asset studio build plate', () => {
  it('shows only the bricks of the viewed state and saves back the same asset when nothing changed', () => {
    const p = plate('closed');
    expect(p.read()).toHaveLength(3);
    const r = assetFromScratch(chest, p.read(), p.sc.hidden, initialIndex(chest, p.sc.hidden), null);
    expect(r.asset.bricks).toEqual(chest.bricks);
    expect(r.asset.onlyIn).toEqual(chest.onlyIn);
  });

  it('keeps brick order and state lists through removals and additions, edit after edit', () => {
    const p = plate('open');
    let indexOf = initialIndex(chest, p.sc.hidden);
    let hidden = p.sc.hidden;
    let asset = chest;
    // remove the open-state coins (index 4), then add a brick only in "open"
    p.bus.execute({ type: 'bricks.remove', payload: { map: p.sc.mapId, ids: [5] } }, { source: 'user' });
    let r = assetFromScratch(asset, p.read(), hidden, indexOf, null);
    ({ asset, indexOf, hidden } = r);
    expect(asset.bricks).toHaveLength(4);
    expect(asset.onlyIn).toEqual({ closed: [2], open: [3] });
    p.bus.execute(
      {
        type: 'bricks.place',
        payload: { map: p.sc.mapId, bricks: [{ type: 'plate1x1', x: 3, y: 4, z: 1, rot: 0, color: '#f7c900' }] },
      },
      { source: 'user' },
    );
    r = assetFromScratch(asset, p.read(), hidden, indexOf, 'open');
    ({ asset, indexOf, hidden } = r);
    expect(asset.bricks).toHaveLength(5);
    expect(asset.onlyIn).toEqual({ closed: [2], open: [3, 4] });
    // the closed lid (never on the plate) is untouched
    expect(asset.bricks[2]).toEqual(chest.bricks[2]);
    expect(expandAsset(asset, { pos: [0, 0, 0], rot: 0, idBase: 1, state: 'closed' }).bricks).toHaveLength(3);
  });
});
