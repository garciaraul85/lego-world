/**
 * Editor entry (dist/editor.html, and the claude.ai artifact).
 * Opens the last project from IndexedDB, or imports an existing LEGO World v68 autosave,
 * or creates a new generated project. window.__editor exposes the state for e2e tests.
 */

import { render } from 'preact';
import { BUILTIN_ASSETS } from '../../builtin/assets';
import { CommandBus, registerAll } from '../../core/commands';
import { allCommands } from '../../core/gamegen/generateGame';
import { serializeFile } from '../../core/json/stable';
import { LEGACY_STORAGE_KEY } from '../../core/legacy/constants';
import { migrate } from '../../core/migrate';
import type { Problem } from '../../core/migrate/problems';
import { unpackMedia, unpackProject } from '../../core/project/archive';
import { Autosave } from '../../core/project/autosave';
import { loadProject, saveAll } from '../../core/project/load';
import { MediaStore } from '../../core/project/media';
import { newProjectFiles } from '../../core/project/new-project';
import { ProjectStore } from '../../core/project/store';
import { App, type AppHost } from '../../editor/App';
import { placeCommands } from '../../editor/assets';
import { hubAtStartup, readIntent, writeIntent } from '../../editor/start/intent';
import { EditorState } from '../../editor/state';
import '../../editor/theme.css';
import { saveFile } from '../../platform/downloads';
import { IdbBackend } from '../../platform/idb-backend';

const CURRENT = 'brickworlds.editor.current';
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

const DEFAULT_WORLD = { environments: ['forest', 'city', 'mountains'], size: 24 as const, seed: 73521 };

async function boot() {
  const root = document.getElementById('app')!;
  const backend = new IdbBackend();
  let store: ProjectStore | null = null;
  let problems: Problem[] = [];
  let note = '';
  const current = ls.get(CURRENT);
  const firstRun = !current;
  try {
    if (current && (await backend.readFile(current, 'project.json'))) {
      const r = await loadProject(backend, current);
      store = r.store;
      problems = r.problems;
    }
  } catch (e) {
    console.error('[editor] could not open the last project', e);
  }
  if (!store) {
    const legacy = ls.get(LEGACY_STORAGE_KEY);
    if (legacy) {
      try {
        const r = migrate(legacy, { name: 'My LEGO World' });
        store = new ProjectStore(r.files, { validateInitial: false });
        problems = r.problems;
        note = 'Imported your LEGO World build into a new project.';
      } catch (e) {
        console.warn('[editor] v68 autosave could not be imported', e);
      }
    }
  }
  if (!store) {
    store = new ProjectStore(newProjectFiles({ name: 'My brick game', generate: DEFAULT_WORLD }));
    note = 'Created a new project with a generated Forest + City + Mountains map.';
  }
  try {
    await saveAll(backend, store, serializeFile);
    ls.set(CURRENT, store.manifest.id);
  } catch (e) {
    problems = [
      ...problems,
      {
        level: 'warn',
        code: 'storage',
        message: `Could not save to this browser (${e instanceof Error ? e.message : e}). Use File › Save project file.`,
      },
    ];
  }
  const bus = registerAll(new CommandBus(store));
  const media = new MediaStore(backend, store.manifest.id);
  const autosave = new Autosave(store, backend, { media });
  const ed = new EditorState({ store, bus, autosave, backend, media, problems });
  if (note) ed.log('INFO', note);
  ed.log('INFO', `Opened “${store.manifest.name}” · ${[...store.keys()].length} files`);
  const flush = () => void autosave.flush();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
  void IdbBackend.persist();

  const reopen = (id: string) => {
    ls.set(CURRENT, id);
    // ?hub only opens the Start hub once
    const u = new URL(location.href);
    u.searchParams.delete('hub');
    location.replace(u.toString());
  };
  const host: AppHost = {
    showHub:
      !readIntent(store.manifest.id) &&
      (new URLSearchParams(location.search).has('hub') ||
        (!new URLSearchParams(location.search).has('nohub') && firstRun && hubAtStartup())),
    async startGame(game, then) {
      const s = new ProjectStore(game.files);
      if (await backend.readFile(s.manifest.id, 'project.json')) {
        const { newId } = await import('../../core/ids');
        s.put('project.json', { ...s.manifest, id: newId('project') });
      }
      if (then !== 'build') {
        const b = registerAll(new CommandBus(s));
        const r = b.execute(allCommands(game), { source: 'generator', label: `Generate ${game.name}` });
        if (!r.ok) throw new Error(r.error);
      }
      await saveAll(backend, s, serializeFile);
      const project = s.manifest.id;
      writeIntent(
        then === 'play'
          ? { kind: 'play', project }
          : then === 'build'
            ? { kind: 'build', project, seed: game.seed, options: game.options, step: 0 }
            : null,
      );
      reopen(project);
    },
    async startTutorial(mode) {
      const s = new ProjectStore(newProjectFiles({ name: 'Tutorial sandbox', mapName: 'Practice map' }));
      await saveAll(backend, s, serializeFile);
      writeIntent({ kind: 'tutorial', project: s.manifest.id, mode });
      reopen(s.manifest.id);
    },
    async newProject() {
      const files = newProjectFiles({
        name: 'New brick game',
        generate: { ...DEFAULT_WORLD, seed: Math.floor(Math.random() * 99_999_999) },
      });
      const s = new ProjectStore(files);
      await saveAll(backend, s, serializeFile);
      reopen(s.manifest.id);
    },
    openProject: reopen,
    listProjects: () => backend.listProjects(),
    async importBytes(name, bytes) {
      const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      const files = zip
        ? unpackProject(bytes)
        : migrate(new TextDecoder().decode(bytes), { name: name.replace(/\.[^.]+$/, '') }).files;
      const s = new ProjectStore(files, { validateInitial: false });
      // Imported projects get a fresh id unless they are new to this device.
      if (await backend.readFile(s.manifest.id, 'project.json')) {
        const { newId } = await import('../../core/ids');
        const id = newId('project');
        s.put('project.json', { ...s.manifest, id });
      }
      await saveAll(backend, s, serializeFile);
      if (zip) {
        const blobs = [...unpackMedia(bytes)].map(([ref, b]) => ({
          sha: ref.slice(7),
          blob: new Blob([b as Uint8Array<ArrayBuffer>]),
        }));
        if (blobs.length) await backend.writeBatch(s.manifest.id, { put: [], del: [], media: blobs });
      }
      reopen(s.manifest.id);
    },
    download(fileName, data) {
      saveFile(fileName, data)
        .then((r) =>
          ed.notify(
            r === 'declined' ? 'Save cancelled.' : r === 'saved' ? `Saved ${fileName}.` : `Downloading ${fileName}.`,
          ),
        )
        .catch((e) => ed.notify(e instanceof Error ? e.message : String(e), true));
    },
  };
  (window as unknown as { __editor: EditorState }).__editor = ed;
  // e2e helpers: place a built-in asset the way the dock does
  (window as unknown as { __assets: unknown }).__assets = {
    placeCommands,
    chestId: BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')?.id,
  };
  render(<App ed={ed} host={host} />, root);
}

void boot();
