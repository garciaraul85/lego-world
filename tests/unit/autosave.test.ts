import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { serializeFile } from '../../src/core/json/stable';
import { migrate } from '../../src/core/migrate';
import { Autosave } from '../../src/core/project/autosave';
import { type FileBackend, MemoryBackend, type WriteBatch } from '../../src/core/project/backend';
import { loadProject, saveAll } from '../../src/core/project/load';
import { ProjectStore } from '../../src/core/project/store';
import { paths } from '../../src/core/schema';
import { IdbBackend } from '../../src/platform/idb-backend';

const NOW = '2026-10-09T00:00:00.000Z';

/** Manual clock: timers run only when tick() is called. */
function manualTimers() {
  let id = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  let t = 0;
  return {
    setTimer: (fn: () => void, ms: number) => {
      due.set(++id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void due.delete(h as number),
    async tick(ms: number) {
      t += ms;
      for (const [k, v] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (v.at <= t) {
          due.delete(k);
          v.fn();
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    },
  };
}

async function setup(backend: FileBackend = new MemoryBackend()) {
  const save = JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'));
  const store = new ProjectStore(migrate(save, { now: NOW }).files);
  await saveAll(backend, store, serializeFile);
  const bus = registerAll(new CommandBus(store));
  const timers = manualTimers();
  const autosave = new Autosave(store, backend, { ...timers, now: () => NOW });
  const map = store.manifest.entry.map;
  const place = (x: number) =>
    bus.execute(
      {
        type: 'bricks.place',
        payload: { map, bricks: [{ type: 'brick1x1', x, y: 40, z: 0, rot: 0, color: '#d20c20' }] },
      },
      { source: 'user' },
    );
  return { store, bus, autosave, timers, map, place, backend };
}

class SpyBackend extends MemoryBackend {
  batches: WriteBatch[] = [];
  override async writeBatch(id: string, b: WriteBatch) {
    this.batches.push(b);
    return super.writeBatch(id, b);
  }
}

describe('Autosave', () => {
  it('editing one brick writes exactly that chunk and project.json, 2 s after the last change', async () => {
    const backend = new SpyBackend();
    const { place, timers, map, autosave } = await setup(backend);
    backend.batches = [];
    place(1);
    await timers.tick(1500);
    place(2); // restarts the debounce
    await timers.tick(1500);
    expect(backend.batches).toHaveLength(0);
    await timers.tick(600);
    expect(backend.batches).toHaveLength(1);
    expect(backend.batches[0]!.put.map((f) => f.path).sort()).toEqual([paths.chunk(map, 0, 0), 'project.json']);
    expect(autosave.status.state).toBe('saved');
  });

  it('keeps data dirty on failure and retries with backoff', async () => {
    const backend = new MemoryBackend();
    const { place, timers, autosave, store } = await setup(backend);
    backend.failNext = 1;
    place(1);
    await timers.tick(2000);
    expect(autosave.status.state).toBe('error');
    expect(store.dirty().size).toBeGreaterThan(0);
    await timers.tick(2000); // first backoff
    expect(autosave.status.state).toBe('saved');
    expect(store.dirty().size).toBe(0);
  });

  it('a project saved, then reloaded, has identical files and an accurate index', async () => {
    const backend = new MemoryBackend();
    const { store, place, autosave } = await setup(backend);
    place(5);
    await autosave.flush();
    const { store: again, problems } = await loadProject(backend, store.manifest.id);
    expect(problems).toEqual([]);
    const dump = (s: ProjectStore) => [...s.keys()].sort().map((p) => serializeFile(p, s.get(p)));
    expect(dump(again)).toEqual(dump(store));
    const index = again.manifest.files;
    expect(Object.keys(index).sort()).toEqual([...again.keys()].filter((p) => p !== 'project.json').sort());
  });

  it('reports a corrupted file as a problem and still opens the project', async () => {
    const backend = new MemoryBackend();
    const { store } = await setup(backend);
    const id = store.manifest.id;
    await backend.writeBatch(id, { put: [{ path: 'settings.json', text: '{"quality":"ultra"}' }], del: [] });
    const { problems } = await loadProject(backend, id);
    expect(problems).toMatchObject([{ level: 'error', code: 'load.schema', file: 'settings.json' }]);
  });
});

describe('IdbBackend (fake-indexeddb)', () => {
  it('writes atomically per batch, reads back, lists and deletes', async () => {
    const backend = new IdbBackend(`test-${Math.random()}`);
    const { store, place, autosave } = await setup(backend);
    place(9);
    await autosave.flush();
    const id = store.manifest.id;
    expect(await backend.listProjects()).toEqual([{ id, name: 'Imported LEGO World', modified: NOW }]);
    const { store: again } = await loadProject(backend, id);
    expect([...again.keys()].length).toBe([...store.keys()].length);
    expect(await backend.readFile(id, 'project.json')).toBe(serializeFile('project.json', store.manifest));
    await backend.deleteProject(id);
    expect(await backend.listProjects()).toEqual([]);
    expect((await backend.readAll(id)).size).toBe(0);
  });
});
