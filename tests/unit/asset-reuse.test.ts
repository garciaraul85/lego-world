import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { visibleBricks } from '../../src/core/assets/expand';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, Asset as AssetSchema } from '../../src/core/schema';
import { ACTIONS, type ActionCtx, type EditorUi, runAction } from '../../src/editor/actions/registry';
import { EditorState } from '../../src/editor/state';
import {
  assetFromScratch,
  buildInto,
  initialIndex,
  scratchFor,
  turnPart,
} from '../../src/editor/workspaces/asset-studio/scratch';

/**
 * P32: the Scene places whole assets (no brick tools there); assets are built from bricks and from other
 * assets on the Asset studio's build plate.
 */
const named = (n: string) => BUILTIN_ASSETS.find((a) => a.name === n)!;

function editor(plate = false) {
  const store = new ProjectStore(newProjectFiles({ name: 'Reuse' }));
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  const autosave = new Autosave(store, backend);
  class Plate extends EditorState {
    override get buildsBricks() {
      return true;
    }
  }
  return plate ? new Plate({ store, bus, autosave, backend }) : new EditorState({ store, bus, autosave, backend });
}
const ctx = (ed: EditorState): ActionCtx => ({ ed, ui: {} as EditorUi });
const act = (id: string) => ACTIONS.find((a) => a.id === id)!;

describe('the Scene places assets; bricks are built in the Assets screen', () => {
  it('the Scene never holds a brick tool: B and the toolbar Place put down assets', () => {
    const ed = editor();
    runAction(act('tool.place'), ctx(ed));
    expect(ed.tool.value).toBe('asset');
    ed.tool.value = 'place';
    expect(ed.tool.value).toBe('asset');
    ed.tool.value = 'paint';
    expect(ed.tool.value).toBe('select');
    runAction(act('tool.paint'), ctx(ed));
    expect(ed.tool.value).toBe('select');
    expect(ed.toast.value?.msg).toMatch(/Assets screen/);
    expect(ed.assetCat.value).toBe('Assets');
  });

  it('the build plate keeps Place bricks and Color paint', () => {
    const ed = editor(true);
    runAction(act('tool.place'), ctx(ed));
    expect(ed.tool.value).toBe('place');
    runAction(act('tool.paint'), ctx(ed));
    expect(ed.tool.value).toBe('paint');
  });
});

describe('building one asset into another', () => {
  it('adds the other asset’s visible bricks next to the first, with one palette and a grown footprint', () => {
    const bench = named('Bench');
    const bush = named('Flower bush');
    const next = buildInto(bench, bush, [bench.footprint[0], 0, 0]);
    expect(AssetSchema.safeParse(next).success).toBe(true);
    const shown = visibleBricks(bush).length;
    expect(next.bricks.length).toBe(bench.bricks.length + shown);
    // the first bricks are untouched, so placed copies keep their brick ids
    expect(next.bricks.slice(0, bench.bricks.length).map((b) => next.palette.types[b[0]])).toEqual(
      bench.bricks.map((b) => bench.palette.types[b[0]]),
    );
    expect(next.footprint[0]).toBe(bench.footprint[0] + bush.footprint[0]);
    expect(new Set(next.palette.colors).size).toBe(next.palette.colors.length);
    // the original stays as it was
    expect(next.id).toBe(bench.id);
    expect(bench.bricks.length).toBeLessThan(next.bricks.length);
  });

  it('carries the other asset’s turned parts, turned with it', () => {
    const base = named('Bench');
    const other: Asset = { ...named('Mushroom'), parts: [{ name: 'Cap', bricks: [0], tilt: [30, 0, 0] }] };
    const straight = buildInto(base, other, [0, 3, 0]);
    expect(straight.parts?.at(-1)).toEqual({ name: 'Mushroom · Cap', bricks: [base.bricks.length], tilt: [30, 0, 0] });
    const turned = buildInto(base, other, [0, 3, 0], 1);
    expect(turned.parts?.at(-1)?.tilt).toEqual([0, 0, 30]);
    expect(turnPart({ tilt: [0, 0, 20], scale: [2, 1, 1] }, 1)).toEqual({ tilt: [-20, 0, 0], scale: [1, 1, 2] });
  });

  it('on the build plate: the dropped bricks become part of the asset, appended after its own', () => {
    const bench = named('Bench');
    const bush = named('Flower bush');
    const scratch = scratchFor(bench, bench.initialState);
    const store = new ProjectStore(scratch.files);
    const bus = registerAll(new CommandBus(store));
    const plate = new MapBricks(store, scratch.mapId).all();
    const start = plate.reduce((m, b) => Math.max(m, b.id), 0) + 1;
    const next = buildInto({ ...bench, bricks: [], parts: undefined } as unknown as Asset, bush, [
      bench.footprint[0],
      0,
      0,
    ]);
    const added = next.bricks.map((t, k) => ({
      id: start + k,
      type: next.palette.types[t[0]]!,
      x: t[1],
      y: t[2],
      z: t[3],
      rot: t[4],
      color: next.palette.colors[t[5]]!,
      flags: t[6],
      group: `reuse-${start}`,
    }));
    const r = bus.execute([{ type: 'bricks.place', payload: { map: scratch.mapId, bricks: added } }], {
      source: 'user',
    });
    expect(r.ok, r.error).toBe(true);
    const out = assetFromScratch(
      bench,
      new MapBricks(store, scratch.mapId).all(),
      scratch.hidden,
      initialIndex(bench, scratch.hidden),
      null,
    );
    expect(out.asset.bricks.length).toBe(bench.bricks.length + added.length);
    expect(out.indexOf.get(start)).toBe(bench.bricks.length);
    expect(AssetSchema.safeParse(out.asset).success).toBe(true);
  });
});
