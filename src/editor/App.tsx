import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { toLegacy } from '../core/bridge/legacy-bridge';
import { packProject } from '../core/project/archive';
import type { ProjectMeta } from '../core/project/backend';
import { ACTIONS, type ActionCtx, type EditorUi, keyOf, runAction } from './actions/registry';
import { WorldGraph } from './graph/WorldGraph';
import { Dock } from './panels/Dock';
import { RightPanel } from './panels/Inspector';
import { Outliner } from './panels/Outliner';
import { PlayLayer } from './play/PlayLayer';
import { type PlayStart, PlayView } from './play/PlayView';
import {
  CommandPalette,
  MenuBar,
  Modal,
  Shortcuts,
  StatusBar,
  Toast,
  Toolbar,
  WORKSPACES,
  WorkspaceTabs,
} from './shell/Shell';
import type { EditorState } from './state';
import type { ViewportApi } from './viewport/Viewport';
import { ViewportPanel } from './viewport/Views';
import { AssetStudio } from './workspaces/asset-studio/AssetStudio';
import { CharacterStudio } from './workspaces/character-studio/CharacterStudio';
import { LogicWorkspace } from './workspaces/logic/LogicWorkspace';

export type AppHost = {
  newProject(): Promise<void>;
  openProject(id: string): void;
  listProjects(): Promise<ProjectMeta[]>;
  importBytes(name: string, bytes: Uint8Array): Promise<void>;
  download(name: string, data: Blob): void;
};

export function App({ ed, host }: { ed: EditorState; host: AppHost }) {
  const vp = useRef<ViewportApi | null>(null);
  const [modal, setModal] = useState<null | 'shortcuts' | 'open' | 'about' | 'new'>(null);
  const [play, setPlay] = useState<null | 'play' | 'edit'>(null);
  const [engine, setEngine] = useState<(PlayStart & { key: number }) | null>(null);
  const [workspace, setWorkspace] = useState('Scene');
  const [pane, setPane] = useState<'left' | 'right'>('right');
  const fileRef = useRef<HTMLInputElement>(null);

  const ui: EditorUi = useMemo(
    () => ({
      newProject: () => setModal('new'),
      openProjectDialog: () => setModal('open'),
      importFile: () => fileRef.current?.click(),
      exportProject: () => {
        const bytes = packProject(ed.store);
        host.download(
          `${slug(ed.store.manifest.name)}.bwproj`,
          new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
        );
        ed.log('INFO', `Saved ${slug(ed.store.manifest.name)}.bwproj (${(bytes.length / 1024).toFixed(0)} KB)`);
      },
      exportLegacySave: () => {
        const text = JSON.stringify(toLegacy(ed.store), null, 2);
        host.download(
          `${slug(ed.store.manifest.name)}-lego-world.json`,
          new Blob([text], { type: 'application/json' }),
        );
      },
      play: (mode, opts) => {
        void ed.autosave.flush();
        if (mode !== 'engine') {
          setEngine(null);
          setPlay(mode === 'v68' ? 'play' : 'edit');
          return;
        }
        const spawnId = opts?.fromSelectedSpawn ? ed.selectedSpawn.value : null;
        const mapId = opts?.fromSelectedSpawn ? ed.mapId.value : ed.store.manifest.entry.map;
        setWorkspace('Scene');
        setEngine({ mapId, spawnId, key: Date.now() });
      },
      stopPlay: () => setEngine(null),
      editAsset: (id) => {
        ed.studioAsset.value = id;
        setEngine(null);
        setWorkspace('Assets');
      },
      frameSelection: () => vp.current?.frameSelection(),
      fit: () => vp.current?.fit(),
      topView: () => {
        vp.current?.camera.topView();
        vp.current?.redraw();
      },
      workspace: (w) => {
        setWorkspace(w);
      },
      showShortcuts: () => setModal('shortcuts'),
      about: () => setModal('about'),
    }),
    [ed],
  );
  const c: ActionCtx = { ed, ui };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (play || modal || ed.palette.value) return;
      if (ed.session.value) {
        // While playing only the play shortcuts reach the editor; the game owns the rest of the keyboard.
        if (e.key === 'F5' || e.key === 'Escape') {
          e.preventDefault();
          setEngine(null);
        }
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable]')) return;
      const k = keyOf(e);
      const a = ACTIONS.find((x) => x.key === k);
      if (!a) return;
      e.preventDefault();
      runAction(a, c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, modal]);

  const later = WORKSPACES.find(([w]) => w === workspace)?.[1];
  return (
    <div class="app">
      <MenuBar c={c} />
      <WorkspaceTabs current={workspace} onPick={(w) => ui.workspace(w)} />
      <Toolbar c={c} />
      {(workspace === 'Assets' || workspace === 'Characters' || workspace === 'Logic') && !engine ? (
        <div class="body studio-body">
          {workspace === 'Assets' ? (
            <AssetStudio c={c} />
          ) : workspace === 'Logic' ? (
            <LogicWorkspace c={c} />
          ) : (
            <CharacterStudio c={c} />
          )}
        </div>
      ) : (
        <div class="body">
          <div class="compact-tabs" role="tablist" aria-label="Panels">
            <button type="button" class={`btn ${pane === 'left' ? 'on' : ''}`} onClick={() => setPane('left')}>
              Outliner
            </button>
            <button type="button" class={`btn ${pane === 'right' ? 'on' : ''}`} onClick={() => setPane('right')}>
              Inspector
            </button>
          </div>
          <Outliner c={c} className={pane === 'left' ? 'show' : ''} />
          <div class="center">
            {engine ? (
              <PlayView key={engine.key} ed={ed} start={engine} onStop={() => setEngine(null)} />
            ) : workspace === 'World graph' ? (
              <WorldGraph c={c} />
            ) : later ? (
              <section class="panel">
                <div class="placeholder">
                  <h2>{workspace}</h2>
                  <p class="muted">
                    The {workspace} workspace arrives in {later} of the build plan. Until then the Scene editor is fully
                    working
                    {workspace === 'Characters' ? ', and characters and neighbors can be edited in LEGO World v68' : ''}
                    .
                  </p>
                  <div class="row">
                    <button type="button" class="btn on" onClick={() => setWorkspace('Scene')}>
                      Back to Scene
                    </button>
                    {workspace === 'Characters' && (
                      <button type="button" class="btn" onClick={() => ui.play('edit')}>
                        Open in LEGO World v68
                      </button>
                    )}
                  </div>
                </div>
              </section>
            ) : (
              <ViewportPanel c={c} onApi={(a) => (vp.current = a)} />
            )}
            <Dock c={c} />
          </div>
          <RightPanel c={c} className={pane === 'right' ? 'show' : ''} />
        </div>
      )}
      <StatusBar ed={ed} />
      <Toast ed={ed} />
      {ed.palette.value && <CommandPalette c={c} />}
      {modal === 'shortcuts' && <Shortcuts onClose={() => setModal(null)} />}
      {modal === 'open' && <OpenDialog host={host} current={ed.store.manifest.id} onClose={() => setModal(null)} />}
      {modal === 'new' && (
        <Modal title="New project" onClose={() => setModal(null)}>
          <p class="muted">
            Start a new game with a freshly generated map. Your current project stays saved on this device (File › Open
            project).
          </p>
          <div class="row">
            <button
              type="button"
              class="btn on"
              onClick={async () => {
                setModal(null);
                await ed.autosave.flush();
                await host.newProject();
              }}
            >
              Create new project
            </button>
            <button type="button" class="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {modal === 'about' && (
        <Modal title="Brick Worlds Engine" onClose={() => setModal(null)}>
          <p>
            Phase 3 build: Scene editor, World graph, Asset studio and Character studio on the v5 project format, with
            Play on the new engine runtime, grown from LEGO World v68.
          </p>
          <p class="muted">
            Projects are saved as small JSON files in this browser. Guns, magic, super powers, the volcano and the
            not-yet-ported studios still run on the v68 runtime (Play in v68).
          </p>
        </Modal>
      )}
      {play && <PlayLayer ed={ed} mode={play} onClose={() => setPlay(null)} />}
      <input
        ref={fileRef}
        type="file"
        accept=".bwproj,.zip,.json,application/json,application/zip"
        hidden
        onChange={async (e) => {
          const input = e.target as HTMLInputElement;
          const f = input.files?.[0];
          input.value = '';
          if (!f) return;
          try {
            await ed.autosave.flush();
            await host.importBytes(f.name, new Uint8Array(await f.arrayBuffer()));
          } catch (err) {
            ed.notify(err instanceof Error ? err.message : String(err), true);
          }
        }}
      />
    </div>
  );
}

function OpenDialog({ host, current, onClose }: { host: AppHost; current: string; onClose: () => void }) {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  useEffect(() => {
    void host.listProjects().then(setList);
  }, []);
  return (
    <Modal title="Open project" onClose={onClose}>
      {!list && <span class="muted">Loading…</span>}
      {list?.length === 0 && <span class="muted">No projects on this device yet.</span>}
      {list?.map((p) => (
        <button type="button" class="mi" disabled={p.id === current} onClick={() => host.openProject(p.id)}>
          <span>
            {p.name}
            {p.id === current ? ' · open' : ''}
          </span>
          <span class="k">{p.modified.slice(0, 16).replace('T', ' ')}</span>
        </button>
      ))}
    </Modal>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'project';
