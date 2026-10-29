import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_MODEL_FILES } from '../../builtin/models/data';
import {
  accessibleName,
  entryForElement,
  entryRects,
  helpEntries,
  roleOf,
  visibleControls,
} from '../../editor/help/entries';
import { fromBase64, prepareModel } from '../../engine/model/prepare';
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
import { activeView } from '../../editor/viewport/active';
import { initPhysics } from '../../engine/physics/physics';
import { gpuReady, initGpu, setGpuOffscreen } from '../../engine/render/gpu/gpu-renderer';
import { PlayRenderer } from '../../engine/runtime/play-renderer';
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
  // Milestone 2b: the physics core (WebAssembly) loads while the project opens; Play uses it once it is ready
  const physics = initPhysics().catch((e) => console.warn('Physics engine did not load; v68 debris is used.', e));
  // Milestone 2b, 10c: a WebGPU device, if this browser has one (WebGL draws otherwise)
  // (tests: ?gpu=offscreen draws WebGPU into a picture of its own, where a browser cannot show it on the page)
  if (new URLSearchParams(location.search).get('gpu') === 'offscreen') setGpuOffscreen(true);
  const gpu = initGpu();
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
    async startTutorial(mode, track = 'editor') {
      const s = new ProjectStore(
        track === 'coding'
          ? newProjectFiles({
              name: 'Coding course sandbox',
              mapName: 'Code island',
              generate: { environments: ['forest', 'prairie'], size: 16, seed: 2024 },
            })
          : track === 'pack' || track === 'templates'
            ? // step 11, 4a: the Starter pack courses need ground for their neighbours and enemies to stand on
              // (4c: room for an arena and waves too)
              newProjectFiles({
                name: 'Tutorial sandbox',
                mapName: 'Practice map',
                generate: { environments: ['prairie'], size: track === 'templates' ? 32 : 16, seed: 2024 },
              })
            : newProjectFiles({ name: 'Tutorial sandbox', mapName: 'Practice map' }),
      );
      await saveAll(backend, s, serializeFile);
      writeIntent({ kind: 'tutorial', project: s.manifest.id, mode, track });
      reopen(s.manifest.id);
    },
    async newProject(genre) {
      const files = newProjectFiles({
        name: 'New brick game',
        ...(genre ? { genre } : {}),
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
  // e2e: the 3D view last worked in (its camera and what draws it)
  (window as unknown as { __view: typeof activeView }).__view = activeView;
  // e2e: draw a game in a canvas of the test's own (WebGL against WebGPU)
  (window as unknown as { __PlayRenderer: typeof PlayRenderer }).__PlayRenderer = PlayRenderer;
  // tests: the built-in models and how a model file is made ready to draw
  (window as unknown as { __models: unknown }).__models = {
    BUILTIN_MODEL_FILES,
    prepareModel: (id: string) => prepareModel(id.includes(':') ? id : `builtin:${id}`, null),
    fromBase64,
  };
  // the built-in asset library, for e2e tests that place a built-in asset by name
  (window as unknown as { __builtinAssets: typeof BUILTIN_ASSETS }).__builtinAssets = BUILTIN_ASSETS;
  // and the built-in characters (step 11, 4a: the starter pack's cast)
  (window as unknown as { __builtinCharacters: typeof BUILTIN_CHARACTERS }).__builtinCharacters = BUILTIN_CHARACTERS;
  // e2e helpers: place a built-in asset the way the dock does
  (window as unknown as { __assets: unknown }).__assets = {
    placeCommands,
    chestId: BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')?.id,
  };
  // P32 help coverage and screenshots: which Help entry describes a control
  (window as unknown as { __help: unknown }).__help = {
    entryFor: (el: Element) => entryForElement(el, helpEntries())?.id ?? null,
    name: accessibleName,
    role: roleOf,
    controls: () => visibleControls(),
    rects: () => entryRects(helpEntries()),
  };
  (window as unknown as { __helpEntries: unknown }).__helpEntries = helpEntries().map((e) => ({
    id: e.id,
    screen: e.screen,
  }));
  await physics;
  await gpu;
  ed.gpuWorks.value = gpuReady();
  render(<App ed={ed} host={host} />, root);
}

void boot();
