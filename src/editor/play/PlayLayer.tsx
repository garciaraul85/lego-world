import { useEffect, useRef, useState } from 'preact/hooks';
import legacyHtml from '../../../dist/index.html?raw';
import { toLegacy } from '../../core/bridge/legacy-bridge';
import { LEGACY_STORAGE_KEY } from '../../core/legacy/constants';
import { legacySyncCommands } from '../../core/sync/legacy-sync';
import type { EditorState } from '../state';

type Tool = { execute: (input?: unknown) => unknown };

// Captures v68's agent tools inside the frame so the editor can start exploring.
const BOOT =
  '<script>(function(){var t=new Map();window.__bwTools=t;document.modelContext={registerTool:function(x){t.set(x.name,x)}};})();</script>';

/**
 * Runs the current map in LEGO World v68 until the new runtime lands (Phase 2).
 * mode "play": starts exploring; nothing done while playing is kept (like Play-in-editor).
 * mode "edit": the full v68 UI for things not ported yet (characters, neighbors, routes);
 *              closing brings the changes back as one undoable step.
 */
export function PlayLayer({ ed, mode, onClose }: { ed: EditorState; mode: 'play' | 'edit'; onClose: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [before] = useState(() => {
    let prev: string | null = null;
    try {
      prev = localStorage.getItem(LEGACY_STORAGE_KEY);
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(toLegacy(ed.store, { activeMap: ed.mapId.value })));
    } catch {
      ed.notify('This browser blocks storage, so v68 starts with an empty world.', true);
    }
    return prev;
  });
  const srcdoc = legacyHtml.replace('<head>', `<head>${BOOT}`);

  useEffect(() => {
    const frame = ref.current!;
    const onLoad = () => {
      if (mode !== 'play') return;
      const tools = (frame.contentWindow as unknown as { __bwTools?: Map<string, Tool> }).__bwTools;
      try {
        tools?.get('explore_lego_world')?.execute({ playing: true });
      } catch (e) {
        ed.notify(`Could not start play: ${e instanceof Error ? e.message : e}`, true);
      }
      frame.focus();
    };
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
  }, []);

  const close = (keep: boolean) => {
    try {
      const text = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (keep && text) {
        const cmds = legacySyncCommands(ed.store, text);
        if (cmds.length) {
          const r = ed.exec(cmds, { label: 'Edit in LEGO World v68', source: 'legacy' });
          if (r.ok)
            ed.notify(
              `Brought back ${cmds.length} change${cmds.length === 1 ? '' : 's'} from LEGO World v68. Undo reverts them.`,
            );
        } else ed.notify('No changes in LEGO World v68.');
      }
      if (before === null) localStorage.removeItem(LEGACY_STORAGE_KEY);
      else localStorage.setItem(LEGACY_STORAGE_KEY, before);
    } catch (e) {
      ed.notify(`Could not read the v68 world: ${e instanceof Error ? e.message : e}`, true);
    }
    onClose();
  };

  return (
    <div class="play-layer" role="dialog" aria-label={mode === 'play' ? 'Playing' : 'LEGO World v68'}>
      <div class="play-bar">
        <strong>{mode === 'play' ? '▶ Playing' : 'LEGO World v68'}</strong>
        <span class="muted">
          {mode === 'play'
            ? 'Runs on the v68 runtime until Phase 2. Smashing and moving here are not saved to the project.'
            : 'Characters, neighbors, routes and connected worlds are still edited here. Close to bring changes back.'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {mode === 'edit' && (
            <button type="button" class="btn" onClick={() => close(false)}>
              Discard
            </button>
          )}
          <button type="button" class={`btn ${mode === 'edit' ? 'on' : 'go'}`} onClick={() => close(mode === 'edit')}>
            {mode === 'play' ? '■ Stop' : 'Done — bring changes back'}
          </button>
        </span>
      </div>
      <iframe ref={ref} title="LEGO World v68" srcdoc={srcdoc} allow="fullscreen" />
    </div>
  );
}
