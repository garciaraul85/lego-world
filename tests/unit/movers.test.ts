import { describe, expect, it } from 'vitest';
import { cleanAssetSpec, composeAsset } from '../../src/core/assets/compose';
import { MOVERS, makeMover, moverPose, partBox } from '../../src/core/assets/movers';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { Asset } from '../../src/core/schema';

const base = () => {
  const a = composeAsset({ ...composeAssetSpec() }, 'ast_moverstest');
  // the top few bricks become the moving part
  return { ...a, parts: [{ name: 'Leaf', bricks: [a.bricks.length - 2, a.bricks.length - 1] }] } as Asset;
};
const composeAssetSpec = () => cleanAssetSpec({ kind: 'crate', name: 'Box', width: 4, depth: 4 });

describe('moving parts in one click', () => {
  it('turns a part of a one-state asset into each kind of mover, a valid asset the engine takes', () => {
    for (const kind of MOVERS) {
      const def = base();
      const next = makeMover(def, 0, kind);
      if (typeof next === 'string') throw new Error(next);
      expect(Asset.safeParse(next).success, kind).toBe(true);
      expect(next.states).toHaveLength(2);
      expect(next.initialState).toBe(next.states[0]);
      const part = next.parts![0]!;
      expect(part.hinge).toHaveLength(3);
      expect(Object.keys(part.pose!).length).toBeGreaterThan(0);
      // E switches between the two states
      expect(next.interactions.map((x) => [x.when?.state, x.do[0]])).toEqual([
        [next.states[0], { do: 'setState', state: next.states[1] }],
        [next.states[1], { do: 'setState', state: next.states[0] }],
      ]);
      expect(next.sockets.some((s) => s.kind === 'interact')).toBe(true);
      const store = new ProjectStore(newProjectFiles({ name: 'T' }));
      const bus = registerAll(new CommandBus(store));
      expect(bus.execute([{ type: 'asset.create', payload: { asset: next } }], { source: 'user' }).ok, kind).toBe(true);
    }
  });
  it('keeps an asset’s own states, bricks shown in one state, and what E already does', () => {
    const def: Asset = {
      ...base(),
      states: ['shut', 'wide'],
      initialState: 'shut',
      sockets: [{ id: 'e', kind: 'interact', pos: [0, 1, 0] }],
      interactions: [{ socket: 'e', do: [{ do: 'setState', state: 'wide' }] }],
    };
    const next = makeMover(def, 0, 'door') as Asset;
    expect(next.states).toEqual(['shut', 'wide']);
    expect(Object.keys(next.parts![0]!.pose!)).toEqual(['wide']);
    expect(next.interactions).toEqual(def.interactions);
    // a one-state asset: bricks only in its old state stay in the new first one
    const one = { ...base(), states: ['default'], initialState: 'default', onlyIn: { default: [0] } };
    expect((makeMover(one, 0, 'lid') as Asset).onlyIn).toEqual({ closed: [0] });
    expect(makeMover(base(), 5, 'door')).toMatch(/not in the asset/);
  });
  it('puts the hinge where each mover turns', () => {
    const lo: [number, number, number] = [0, 0, 0];
    const hi: [number, number, number] = [4, 1.2, 1];
    expect(moverPose('door', lo, hi).hinge).toEqual([0, 0, 0.5]);
    expect(moverPose('drawbridge', lo, hi)).toMatchObject({ hinge: [2, 0, 0], closed: { turn: [-90, 0, 0] } });
    expect(moverPose('gate', lo, hi).open).toEqual({ move: [0, 1.14, 0] });
    expect(moverPose('hatch', lo, hi).hinge).toEqual([2, 1.2, 0]);
    expect(partBox(base(), [999])).toBeNull();
  });
});
