import { describe, expect, it, vi } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, paths } from '../../src/core/schema';
import type { ActionCtx, EditorUi } from '../../src/editor/actions/registry';
import { assetLibrary } from '../../src/editor/assets';
import { helpPages } from '../../src/editor/help/pages';
import {
  closeMenu,
  type MenuSpec,
  openMenu,
  openMenuState,
  type ResolvedEntry,
  type ResolvedItem,
  resolveMenu,
  runMenuItem,
} from '../../src/editor/interact/menu';
import { placeSpawnAt, placeZoneAt } from '../../src/editor/interact/place';
import {
  groundMenu,
  itemMenu,
  objectMenu,
  sceneMenuFor,
  selectedInstance,
  selectionTarget,
  spawnMenu,
  zoneMenu,
} from '../../src/editor/interact/scene-menus';
import { EditorState } from '../../src/editor/state';

function setup(): ActionCtx & { ui: EditorUi & Record<string, ReturnType<typeof vi.fn>> } {
  const store = new ProjectStore(
    newProjectFiles({ name: 'Menus', generate: { environments: ['city'], size: 16, seed: 3 } }),
  );
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  const autosave = new Autosave(store, backend);
  const ed = new EditorState({ store, bus, autosave, backend });
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  const ui = new Proxy(fns, {
    get: (t, k: string) => {
      t[k] ??= vi.fn();
      return t[k];
    },
  }) as unknown as EditorUi & Record<string, ReturnType<typeof vi.fn>>;
  return { ed, ui };
}

const items = (es: ResolvedEntry[]) => es.filter((e): e is ResolvedItem => !('sep' in e));
const ids = (es: ResolvedEntry[]) => items(es).map((e) => e.id);
const shape = (es: ResolvedEntry[]) => es.map((e) => ('sep' in e ? '—' : e.id));
const GROUND = { x: 4, y: 0, z: 4 };

function checkRules(c: ActionCtx, spec: MenuSpec) {
  const r = resolveMenu(c, spec);
  // no separator first, last or twice in a row
  expect('sep' in r[0]!).toBe(false);
  expect('sep' in r.at(-1)!).toBe(false);
  for (let i = 1; i < r.length; i++) expect('sep' in r[i]! && 'sep' in r[i - 1]!).toBe(false);
  // Help is always there and points at a real page
  const help = items(r).find((x) => x.id === 'help.about-this');
  expect(help, spec.title).toBeTruthy();
  expect(helpPages().some((p) => p.id === spec.help!.page)).toBe(true);
  // Delete, when present, is last
  if (ids(r).includes('edit.delete')) expect(ids(r).at(-1)).toBe('edit.delete');
  return r;
}

describe('P31 menu resolution', () => {
  it('takes labels, shortcuts and enabled states from the action registry', () => {
    const c = setup();
    c.ed.select([]);
    const r = resolveMenu(c, {
      title: 'T',
      entries: [
        { kind: 'action', id: 'edit.duplicate' },
        { kind: 'action', id: 'view.frame', label: 'Zoom to it' },
      ],
    });
    expect(items(r)[0]).toMatchObject({ label: 'Duplicate', key: 'Ctrl D', disabled: true });
    expect(items(r)[1]).toMatchObject({ label: 'Zoom to it', key: 'F', disabled: false });
  });

  it('puts Help near the end, Delete last after a separator, and drops extra separators', () => {
    const c = setup();
    const r = resolveMenu(c, {
      title: 'T',
      help: { page: 'scene', label: 'Help about the scene' },
      entries: [
        { kind: 'sep' },
        { kind: 'action', id: 'edit.delete' },
        { kind: 'item', id: 'a', label: 'A', run: () => {} },
        { kind: 'sep' },
        { kind: 'sep' },
        { kind: 'item', id: 'b', label: 'B', run: () => {} },
        { kind: 'sep' },
      ],
    });
    expect(shape(r)).toEqual(['a', '—', 'b', '—', 'help.about-this', '—', 'edit.delete']);
    expect(items(r).at(-1)!.danger).toBe(true);
  });

  it('refuses unknown actions so menus cannot drift from the registry', () => {
    const c = setup();
    expect(() => resolveMenu(c, { title: 'T', entries: [{ kind: 'action', id: 'nope.nothing' }] })).toThrow(/unknown/);
  });

  it('runs items through runMenuItem, closes first, and skips disabled ones', () => {
    const c = setup();
    const run = vi.fn();
    openMenu(
      c,
      {
        title: 'T',
        help: { page: 'logic', label: 'Help' },
        entries: [
          { kind: 'item', id: 'go', label: 'Go', run },
          { kind: 'item', id: 'off', label: 'Off', run, disabled: true },
        ],
      },
      10,
      10,
    );
    expect(runMenuItem('off')).toBe(false);
    expect(openMenuState.value).not.toBeNull();
    expect(runMenuItem('go')).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(openMenuState.value).toBeNull();
    openMenu(c, { title: 'T', help: { page: 'logic', label: 'Help' }, entries: [] }, 0, 0);
    runMenuItem('help.about-this');
    expect(c.ui.help).toHaveBeenCalledWith('logic');
    closeMenu();
  });
});

describe('P31 scene menus', () => {
  it('ground menu adds zones, spawns, sounds and signs where you clicked, each one undoable', () => {
    const c = setup();
    const { ed } = c;
    const spec = groundMenu(c, GROUND);
    checkRules(c, spec);
    const zones = ed.mapDoc.value!.zones.length;
    openMenu(c, spec, 0, 0);
    expect(runMenuItem('ground.zone')).toBe(true);
    expect(ed.mapDoc.value!.zones.length).toBe(zones + 1);
    expect(ed.selectedZone.value).toBe(ed.mapDoc.value!.zones.at(-1)!.id);
    ed.undo();
    expect(ed.mapDoc.value!.zones.length).toBe(zones);

    const spawns = ed.mapDoc.value!.spawns.length;
    openMenu(c, groundMenu(c, GROUND), 0, 0);
    runMenuItem('ground.spawn');
    expect(ed.mapDoc.value!.spawns.length).toBe(spawns + 1);

    const before = ed.store.get<Instances>(paths.instances(ed.mapId.value))?.items.length ?? 0;
    openMenu(c, groundMenu(c, GROUND), 0, 0);
    runMenuItem('ground.sound');
    openMenu(c, groundMenu(c, GROUND), 0, 0);
    runMenuItem('ground.sign');
    const after = ed.store.get<Instances>(paths.instances(ed.mapId.value))!.items;
    expect(after.length).toBe(before + 2);
    expect(after.at(-1)!.kind).toBe('ui');
    expect(ed.selectedItem.value).toBe(after.at(-1)!.id);
  });

  it('P28: the ground menu plays from that spot (test)', () => {
    const c = setup();
    const calls: unknown[] = [];
    (c.ui as { play: (...a: unknown[]) => void }).play = (...a: unknown[]) => void calls.push(a);
    openMenu(c, groundMenu(c, { x: 3, y: 2, z: 5 }), 0, 0);
    runMenuItem('ground.playHere');
    expect(calls).toEqual([['engine', { map: c.ed.mapId.value, at: [3, 0.8, 5] }]]);
  });

  it('ground menu places the dock asset only once one is picked', () => {
    const c = setup();
    const { ed } = c;
    const off = items(resolveMenu(c, groundMenu(c, GROUND))).find((x) => x.id === 'ground.asset')!;
    expect(off.disabled).toBe(true);
    const lib = assetLibrary(ed).find((a) => a.asset.bricks.length < 60)!.asset;
    ed.assetBrush.value = { asset: lib.id, rot: 0 };
    const count = ed.scene.value!.count;
    // drop a ray straight down to find the ground, as the 3D view does; try a few spots on a crowded map
    let placed = false;
    for (let i = 0; i < 64 && !placed; i++) {
      const x = 4 + (i % 8) * 6;
      const z = 4 + Math.floor(i / 8) * 6;
      const hit = ed.scene.value!.surface({ o: [x + 0.5, 200, z + 0.5], d: [0, -1, 0] });
      if (!hit) continue;
      openMenu(c, groundMenu(c, hit), 0, 0);
      expect(items(openMenuState.value!.items).find((x) => x.id === 'ground.asset')!.label).toContain(lib.name);
      runMenuItem('ground.asset');
      placed = ed.scene.value!.count > count;
    }
    expect(ed.scene.value!.count).toBe(count + lib.bricks.length);
  });

  it('asset copies get Edit in the Assets screen and Logic entries; loose bricks get Make an asset', () => {
    const c = setup();
    const { ed } = c;
    const s = ed.scene.value!;
    const owned = s.all().find((b) => s.ownerOf(b.id));
    expect(owned).toBeTruthy();
    ed.selectObject(owned!);
    if (!selectedInstance(c)) ed.select(s.ownerOf(owned!.id)!.bricks.map((b) => b.id));
    const inst = selectedInstance(c)!;
    expect(inst).toBeTruthy();
    const r = checkRules(c, objectMenu(c));
    expect(ids(r)).toEqual(expect.arrayContaining(['asset.edit', 'logic.interact', 'asset.duplicate', 'edit.delete']));
    // P32: the Scene places whole assets; nothing turns a copy back into loose bricks
    expect(ids(r)).not.toContain('asset.unpack');
    openMenu(c, objectMenu(c), 0, 0);
    runMenuItem('asset.edit');
    expect(c.ui.editAsset).toHaveBeenCalledWith(inst.def.id);

    const loose = s.all().find((b) => !s.ownerOf(b.id))!;
    ed.select([loose.id]);
    const lr = checkRules(c, objectMenu(c));
    expect(ids(lr)).not.toContain('bricks.paint');
    expect(ids(lr)).toContain('bricks.makeAsset');
    expect(ids(lr)).not.toContain('asset.edit');
    expect(items(lr).find((x) => x.id === 'edit.duplicate')!.disabled).toBe(false);
    // loose bricks become an asset placed where they were, to change in the Assets screen
    const assets = ed.store.list('assets/').length;
    const copies = ed.scene.value!.instances.length;
    openMenu(c, objectMenu(c), 0, 0);
    expect(runMenuItem('bricks.makeAsset')).toBe(true);
    expect(ed.store.list('assets/').length).toBe(assets + 1);
    expect(ed.scene.value!.instances.length).toBe(copies + 1);
  });

  it('zone, spawn and item menus delete the right thing, and Delete undoes', () => {
    const c = setup();
    const { ed } = c;
    const zone = placeZoneAt(ed, GROUND)!;
    const zr = checkRules(c, zoneMenu(c, zone));
    expect(ids(zr)).toEqual(expect.arrayContaining(['logic.enter', 'logic.exit']));
    openMenu(c, zoneMenu(c, zone), 0, 0);
    expect(runMenuItem('edit.delete')).toBe(true);
    expect(ed.mapDoc.value!.zones.some((z) => z.id === zone)).toBe(false);
    ed.undo();
    expect(ed.mapDoc.value!.zones.some((z) => z.id === zone)).toBe(true);

    const sp = placeSpawnAt(ed, GROUND)!;
    ed.select([]);
    ed.selectedSpawn.value = sp;
    const sr = checkRules(c, spawnMenu(c, sp));
    expect(ids(sr)).toEqual(expect.arrayContaining(['play.here', 'spawn.start']));
    openMenu(c, spawnMenu(c, sp), 0, 0);
    runMenuItem('spawn.start');
    expect(ed.store.manifest.entry.spawn).toBe(sp);
    expect(items(resolveMenu(c, spawnMenu(c, sp))).find((x) => x.id === 'spawn.start')!.disabled).toBe(true);
  });

  it('every kind of thing in the 3D view has a menu that follows the rules', () => {
    const c = setup();
    const { ed } = c;
    const zone = placeZoneAt(ed, GROUND)!;
    expect(selectionTarget(c)).toEqual({ kind: 'zone', id: zone });
    const sound = (openMenu(c, groundMenu(c, GROUND), 0, 0), runMenuItem('ground.sound'), ed.selectedItem.value!);
    expect(selectionTarget(c)).toEqual({ kind: 'item', id: sound });
    checkRules(c, itemMenu(c, sound));
    const sp = placeSpawnAt(ed, GROUND)!;
    const brick = ed.scene.value!.all()[0]!.id;
    for (const t of [
      { kind: 'ground', at: GROUND },
      { kind: 'zone', id: zone },
      { kind: 'item', id: sound },
      { kind: 'spawn', id: sp },
      { kind: 'object', brick },
    ] as const) {
      if (t.kind === 'object') ed.select([brick]);
      checkRules(c, sceneMenuFor(c, t));
    }
  });
});
