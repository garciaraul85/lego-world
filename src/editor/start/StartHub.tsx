import { useState } from 'preact/hooks';
import { type GeneratedGame, generateGame } from '../../core/gamegen/generateGame';
import type { GameOptions } from '../../core/gamegen/recipes';
import type { ProjectMeta } from '../../core/project/backend';
import type { EditorState } from '../state';
import { GenerateCard } from './GenerateCard';
import { hubAtStartup, setHubAtStartup } from './intent';
import { RecentProjects } from './RecentProjects';
import { Templates } from './Templates';

export type HubHost = {
  startGame(game: GeneratedGame, then: 'play' | 'build' | 'open'): Promise<void>;
  startTutorial(mode: 'show' | 'try'): Promise<void>;
  listProjects(): Promise<ProjectMeta[]>;
  openProject(id: string): void;
};

/**
 * Start hub (board 0a, P7.2): make a game in one click (play it, or watch it being built step by
 * step), start from a template, learn with the guided tutorial or the help guide, or reopen a project.
 */
export function StartHub({
  ed,
  host,
  onClose,
  onHelp,
}: {
  ed: EditorState;
  host: HubHost;
  onClose: () => void;
  onHelp: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [atStart, setAtStart] = useState(hubAtStartup());
  const [mode, setMode] = useState<'show' | 'try'>('show');
  const make = (options: GameOptions, seed: number, then: 'play' | 'build' | 'open') => {
    setBusy(then === 'build' ? 'Planning the build…' : 'Generating maps, quest, screens, cinematic and sound…');
    // let the message paint before the (synchronous) generator runs
    setTimeout(() => {
      try {
        const g = generateGame(options, seed, { now: new Date().toISOString() });
        setBusy(`Built “${g.name}” · opening…`);
        void host.startGame(g, then).catch((e) => {
          setBusy(null);
          ed.notify(e instanceof Error ? e.message : String(e), true);
        });
      } catch (e) {
        setBusy(null);
        ed.notify(e instanceof Error ? e.message : String(e), true);
      }
    }, 30);
  };
  return (
    <div class="hub-back" role="dialog" aria-modal="true" aria-label="Start hub">
      <div class="hub">
        <header class="hub-head">
          <div class="brand">
            <i aria-hidden="true" />
            <span class="name">Brick Worlds Engine</span>
          </div>
          <button type="button" class="btn" onClick={onClose}>
            Go to the editor ✕
          </button>
        </header>
        <div class="hub-body">
          <div class="hub-col">
            <GenerateCard busy={busy} onGo={make} />
            <Templates busy={!!busy} onPick={(t) => make(t.options, t.seed, 'open')} />
          </div>
          <div class="hub-col">
            <section class="hub-card" aria-label="Learn">
              <h3>Learn the editor</h3>
              <p class="muted small">
                A guided tour of every workspace and tool, in its own sandbox project (your games are never touched).
              </p>
              <div class="hub-row" role="radiogroup" aria-label="Tutorial style">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'show'}
                  class={`btn ${mode === 'show' ? 'on' : ''}`}
                  onClick={() => setMode('show')}
                >
                  👀 Show me first, then I try
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'try'}
                  class={`btn ${mode === 'try' ? 'on' : ''}`}
                  onClick={() => setMode('try')}
                >
                  ✋ I try first
                </button>
              </div>
              <button
                type="button"
                class="btn on hub-big"
                disabled={!!busy}
                onClick={() => void host.startTutorial(mode)}
              >
                🎓 Start the guided tutorial
              </button>
              <button type="button" class="btn hub-big" onClick={onHelp}>
                📖 Help guide: build a game from scratch
              </button>
              <button type="button" class="btn hub-big" disabled title="Arrives in Phase 8">
                ✦ Build with AI · Phase 8
              </button>
            </section>
            <RecentProjects
              list={host.listProjects}
              current={{ id: ed.store.manifest.id, name: ed.store.manifest.name }}
              onOpen={host.openProject}
              onClose={onClose}
            />
          </div>
        </div>
        <footer class="hub-foot">
          <label class="row small">
            <input
              type="checkbox"
              checked={atStart}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).checked;
                setAtStart(v);
                setHubAtStartup(v);
              }}
            />
            Show this at startup
          </label>
          <span class="muted small">File › Start hub opens it again.</span>
        </footer>
      </div>
    </div>
  );
}
