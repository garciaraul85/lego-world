import { describe, expect, it } from 'vitest';
import { DEFAULT_GENRE, GENRES, genreById } from '../../src/builtin/genres';
import { CommandBus, registerAll } from '../../src/core/commands';
import { generateGame } from '../../src/core/gamegen/generateGame';
import { showsControl } from '../../src/core/genres/types';
import { upgradeManifest } from '../../src/core/migrate/v5to6';
import { MemoryBackend } from '../../src/core/project/backend';
import { loadProject } from '../../src/core/project/load';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { paths, validateFile } from '../../src/core/schema';

/** P18: every project has a genre; a genre is data that decides which controls the editor shows. */
describe('genres', () => {
  it('ships Open and Explore and collect as valid data, Open first', () => {
    expect(GENRES.map((g) => g.id)).toEqual(['open', 'explore']);
    expect(DEFAULT_GENRE).toBe('open');
    expect(genreById('nope').id).toBe('open');
    const ex = genreById('explore');
    expect(ex.tabs[0]).toBe('Scene');
    expect(ex.features).not.toContain('v68');
  });

  it('a genre shows core controls and its own features, within its level; Open shows everything', () => {
    const ex = genreById('explore');
    expect(showsControl(ex, { tags: ['core'], level: 'simple' })).toBe(true);
    expect(showsControl(ex, { tags: ['logic'], level: 'simple' })).toBe(true);
    expect(showsControl(ex, { tags: ['v68'], level: 'simple' })).toBe(false);
    expect(showsControl(ex, { tags: ['logic'], level: 'advanced' })).toBe(false);
    expect(showsControl(genreById('open'), { tags: ['v68'], level: 'advanced' })).toBe(true);
  });
});

describe('the genre field (project.json schema 6)', () => {
  it('a new project is Open unless told otherwise; a generated game is Explore and collect', () => {
    const files = newProjectFiles({ name: 'A', random: () => 0.4 });
    expect(files.get(paths.project)).toMatchObject({ schema: 6, genre: 'open' });
    expect(newProjectFiles({ name: 'B', genre: 'explore' }).get(paths.project)).toMatchObject({ genre: 'explore' });
    const game = generateGame({ theme: 'town', maps: 1, length: 'short', difficulty: 1 }, 4242);
    expect((game.files.get(paths.project) as { genre: string }).genre).toBe('explore');
  });

  it('a schema-5 project opens as Open, valid, and is saved upgraded', async () => {
    const files = newProjectFiles({ name: 'Old', random: () => 0.4 });
    const { genre: _g, ...m } = files.get(paths.project) as Record<string, unknown>;
    const old = { ...m, schema: 5 };
    expect(upgradeManifest(old)).toMatchObject({ schema: 6, genre: 'open' });
    expect(validateFile(paths.project, upgradeManifest(old))).toEqual([]);
    const store = new ProjectStore([...files.entries()].map(([p, v]) => [p, p === paths.project ? old : v]));
    expect(store.manifest.genre).toBe('open');
    expect(store.dirty().has(paths.project)).toBe(true);
    // loading from storage reports no problem for it
    const backend = new MemoryBackend();
    await backend.writeBatch(String(m.id), {
      put: [...files.entries()].map(([path, v]) => ({
        path,
        text: JSON.stringify(path === paths.project ? old : v),
      })),
      del: [],
    });
    const r = await loadProject(backend, String(m.id));
    expect(r.problems.filter((p) => p.file === paths.project)).toEqual([]);
    expect(r.store.manifest.schema).toBe(6);
  });

  it('project.update changes the genre (one undo step) and refuses an unknown one', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'G', random: () => 0.4 }));
    const bus = registerAll(new CommandBus(store));
    const r = bus.execute({ type: 'project.update', payload: { genre: 'explore' } }, { source: 'user' });
    expect(r.ok, r.error).toBe(true);
    expect(store.manifest.genre).toBe('explore');
    expect(bus.history().at(-1)?.label).toBe('Genre: Explore and collect');
    const bad = bus.execute({ type: 'project.update', payload: { genre: 'kart' } }, { source: 'user' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/No genre “kart”/);
    bus.undo();
    expect(store.manifest.genre).toBe('open');
  });
});

describe('every control is tagged (P18: views can only hide what is tagged)', () => {
  it('tabs, tools, menu actions, dock tabs, asset filters and logic nodes all have tags and a level, and no stale ones', async () => {
    const { CONTROL_TAGS } = await import('../../src/editor/genres/controls');
    const { WORKSPACES } = await import('../../src/editor/shell/Shell');
    const { TOOLS } = await import('../../src/editor/shell/tools');
    const { ACTIONS } = await import('../../src/editor/actions/registry');
    const { DOCK_TABS, ASSET_FILTERS } = await import('../../src/editor/panels/Dock');
    const { CATALOG } = await import('../../src/core/logic/catalog');
    const { FEATURES } = await import('../../src/core/genres/types');
    const have: Record<string, string[]> = {
      tab: WORKSPACES.map(([w]) => w),
      tool: TOOLS.map((t) => t.id),
      action: [...ACTIONS.map((a) => a.id), 'genre.open', 'genre.pick'],
      dock: [...DOCK_TABS],
      assetFilter: ASSET_FILTERS.map(([id]) => id),
      node: CATALOG.map((d) => d.type),
      section: ['asset.health', 'character.harm'],
    };
    for (const [kind, ids] of Object.entries(have)) {
      const table = CONTROL_TAGS[kind as keyof typeof CONTROL_TAGS];
      expect(
        ids.filter((id) => !table[id]),
        `${kind} without tags`,
      ).toEqual([]);
      expect(
        Object.keys(table).filter((id) => !ids.includes(id)),
        `${kind} tags for nothing`,
      ).toEqual([]);
      for (const [id, t] of Object.entries(table)) {
        expect(t.tags.length, `${kind} ${id}`).toBeGreaterThan(0);
        for (const f of t.tags) expect(FEATURES, `${kind} ${id}`).toContain(f);
      }
    }
  });

  it('every genre names real tabs and logic nodes, and keeps the core tabs', async () => {
    const { WORKSPACES } = await import('../../src/editor/shell/Shell');
    const { CATALOG } = await import('../../src/core/logic/catalog');
    const tabs = WORKSPACES.map(([w]) => w as string);
    for (const g of GENRES) {
      for (const t of g.tabs) expect(tabs, g.id).toContain(t);
      for (const n of g.nodesFirst)
        expect(
          CATALOG.map((d) => d.type),
          g.id,
        ).toContain(n);
      expect(g.tabs[0]).toBe('Scene');
    }
    expect(genreById('open').tabs).toEqual(tabs);
  });
});

describe('the view', () => {
  it('Explore and collect: its tabs first and the rest under More; a hidden node in use is listed', async () => {
    const { Autosave } = await import('../../src/core/project/autosave');
    const { EditorState } = await import('../../src/editor/state');
    const { tabsInView, hiddenInUse, shows } = await import('../../src/editor/genres/view');
    const { WORKSPACES } = await import('../../src/editor/shell/Shell');
    const { graph } = await import('./logic-helpers');
    const store = new ProjectStore(newProjectFiles({ name: 'V', genre: 'explore', random: () => 0.4 }));
    const bus = registerAll(new CommandBus(store));
    const backend = new MemoryBackend();
    const ed = new EditorState({ store, bus, autosave: new Autosave(store, backend), backend });
    const { main, more } = tabsInView(
      ed,
      WORKSPACES.map(([w]) => w),
    );
    expect(main).toEqual(['Scene', 'Assets', 'Characters', 'Logic', 'Cinematics', 'Screens', 'Audio']);
    expect(more).toEqual(['World graph']);
    expect(shows(ed, 'action', 'play.v68')).toBe(false);
    expect(shows(ed, 'node', 'world.give')).toBe(true);
    expect(hiddenInUse(ed)).toEqual([]);
    ed.exec({
      type: 'logic.create',
      payload: { graph: { ...graph([['misc.log', { value: 'hi' }]], []), name: 'Debug' } },
    });
    expect(hiddenInUse(ed).map((h) => `${h.id} @ ${h.where}`)).toEqual(['misc.log @ graph Debug']);
  });
});
