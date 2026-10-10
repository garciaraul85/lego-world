import { useEffect, useRef, useState } from 'preact/hooks';
import type { ActionCtx } from '../actions/registry';
import { commandMatches, STATE_TESTS } from './checks';
import { perform } from './doers';
import { STEPS } from './index';
import { GhostCursor, type Rect, Spotlight, useTargetRect } from './Spotlight';
import type { Check, Step } from './schema';

type Phase = 'demo' | 'try' | 'done';
const KEY = 'brickworlds.tutorial';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadProgress(project: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { project: string; index: number } | null;
    return v?.project === project ? Math.min(STEPS.length - 1, v.index) : 0;
  } catch {
    return 0;
  }
}
function saveProgress(project: string, index: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ project, index }));
  } catch {
    /* storage blocked */
  }
}

/**
 * The guided tutorial (P7.3, with “watch, then do”): each step spotlights a control and explains it.
 * Show me plays the step with a demo pointer, then undoes it so you can repeat it yourself; the step
 * completes when the check sees you do it. Do it for me does it for you; Skip and Back always work.
 */
export function TutorialRunner({
  c,
  mode: mode0,
  onClose,
}: {
  c: ActionCtx;
  mode: 'show' | 'try';
  onClose: () => void;
}) {
  const { ed, ui } = c;
  const project = ed.store.manifest.id;
  const [index, setIndex] = useState(() => loadProgress(project));
  const [mode, setMode] = useState(mode0);
  const [phase, setPhase] = useState<Phase>('try');
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [clicking, setClicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [min, setMin] = useState(false);
  const busy = useRef(false);
  const step = STEPS[index]!;
  const rect = useTargetRect(step.target);
  const doneRef = useRef(false);

  const go = (i: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, i));
    saveProgress(project, n);
    setIndex(n);
  };
  const complete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('done');
    setNote(null);
    if (index < STEPS.length - 1) setTimeout(() => go(index + 1), 900);
  };

  // entering a step: open its workspace, then demo it (Show me first) or arm the check
  useEffect(() => {
    doneRef.current = false;
    setNote(null);
    setGhost(null);
    if (step.workspace && ed.workspace.value !== step.workspace && !ed.session.value) ui.workspace(step.workspace);
    if (mode === 'show' && step.doItForMe.length) void demo();
    else setPhase('try');
  }, [index]);

  // the check, armed while it is the user's turn
  useEffect(() => {
    if (phase !== 'try') return;
    return arm(step.check, c, complete);
  }, [phase, index]);

  const target = (): { x: number; y: number } => {
    const el = document.querySelector(step.target) as HTMLElement | null;
    const b = el?.getBoundingClientRect();
    return b?.width
      ? { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 40) }
      : { x: innerWidth / 2, y: innerHeight / 2 };
  };

  /** Show me: perform the step with the demo pointer, show the result, then put everything back. */
  async function demo() {
    if (busy.current) return;
    busy.current = true;
    setPhase('demo');
    setNote('Watch: this is how it is done…');
    const snap = snapshot(c);
    const before = ed.bus.history().length;
    try {
      setGhost({ x: innerWidth - 120, y: innerHeight - 80 });
      await wait(60);
      setGhost(target());
      await wait(750);
      setClicking(true);
      await wait(220);
      setClicking(false);
      for (const d of step.doItForMe) {
        await perform(c, d);
        await wait(250);
      }
      setNote('That’s it. Now everything is put back so you can do it yourself.');
      await wait(1700);
    } catch (e) {
      setNote(`The demo could not run here: ${e instanceof Error ? e.message : e}`);
      await wait(1200);
    } finally {
      // undo (or redo) back to where we were, then restore the panels
      let diff = ed.bus.history().length - before;
      while (diff > 0 && ed.bus.canUndo()) {
        ed.undo();
        diff--;
      }
      while (diff < 0 && ed.bus.canRedo()) {
        ed.redo();
        diff++;
      }
      restore(c, snap);
      setGhost(null);
      busy.current = false;
      setNote(`Your turn: ${step.task}`);
      setPhase('try');
    }
  }

  async function doIt() {
    if (busy.current) return;
    busy.current = true;
    try {
      for (const d of step.doItForMe) {
        await perform(c, d);
        await wait(120);
      }
      complete();
    } catch (e) {
      setNote(`Could not do it automatically: ${e instanceof Error ? e.message : e}`);
    } finally {
      busy.current = false;
    }
  }

  const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter);
  const k = chapterSteps.indexOf(step) + 1;
  const last = index === STEPS.length - 1;
  return (
    <>
      {!min && <Spotlight rect={rect} />}
      <GhostCursor at={ghost} clicking={clicking} />
      <aside class={`tut-card ${min ? 'min' : ''} ${phase}`} style={cardPos(rect, step, min)} aria-label="Tutorial">
        <header>
          <span class="tut-chapter">
            {step.chapterTitle} · {k}/{chapterSteps.length}
          </span>
          <span class="mono small muted">
            {index + 1}/{STEPS.length}
          </span>
          <button
            type="button"
            class="btn icon"
            aria-label={min ? 'Expand the tutorial' : 'Minimize the tutorial'}
            onClick={() => setMin(!min)}
          >
            {min ? '▴' : '▾'}
          </button>
        </header>
        <div class="tut-progress" aria-hidden="true">
          <i style={{ width: `${((index + (phase === 'done' ? 1 : 0)) / STEPS.length) * 100}%` }} />
        </div>
        {!min && (
          <>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <p class={`tut-task ${phase}`}>
              {phase === 'done' ? '✓ Done!' : phase === 'demo' ? '👀 Watch' : '👉 Your turn:'}{' '}
              {phase === 'done' ? '' : step.task}
            </p>
            {step.tip && <p class="muted small">Tip: {step.tip}</p>}
            {note && phase !== 'done' && <p class="tut-note">{note}</p>}
            <div class="tut-actions">
              <button
                type="button"
                class="btn"
                disabled={index === 0 || phase === 'demo'}
                onClick={() => go(index - 1)}
              >
                ◀ Back
              </button>
              {step.doItForMe.length > 0 && (
                <button type="button" class="btn" disabled={phase !== 'try'} onClick={() => void demo()}>
                  👀 Show me
                </button>
              )}
              {step.doItForMe.length > 0 && (
                <button type="button" class="btn" disabled={phase !== 'try'} onClick={() => void doIt()}>
                  Do it for me
                </button>
              )}
              {step.check.kind === 'manual' ? (
                <button type="button" class="btn on" onClick={() => (last ? onClose() : go(index + 1))}>
                  {last ? 'Finish ✓' : 'Next ▶'}
                </button>
              ) : (
                <button
                  type="button"
                  class="btn"
                  disabled={phase === 'demo'}
                  onClick={() => go(index + 1)}
                  title="Skip this step"
                >
                  Skip ▶▶
                </button>
              )}
            </div>
            <footer>
              <label class="row small">
                <input
                  type="checkbox"
                  checked={mode === 'show'}
                  onChange={(e) => setMode((e.target as HTMLInputElement).checked ? 'show' : 'try')}
                />
                Show me each step first
              </label>
              <button type="button" class="link small" onClick={onClose}>
                Leave the tutorial
              </button>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}

/** Starts watching for a check; returns the stop function. */
function arm(check: Check, c: ActionCtx, done: () => void): () => void {
  const { ed } = c;
  switch (check.kind) {
    case 'manual':
      return () => {};
    case 'command':
      return ed.bus.onExecute((cmds, source) => {
        if (source !== 'tutorial' && commandMatches(cmds, check.type, check.where)) done();
      });
    default: {
      const s0 = ed.session.value;
      const start = s0 ? { x: s0.heroState.x, z: s0.heroState.z } : null;
      const test = (): boolean => {
        if (check.kind === 'state') return !!STATE_TESTS[check.test]?.(ed, check.args);
        if (check.kind === 'dom') return !!document.querySelector(check.selector);
        const s = ed.session.value;
        if (check.event === 'running') return !!s;
        if (check.event === 'stopped') return !s;
        if (check.event === 'paused') return !!s && ed.paused.value;
        if (!s || !start) return false;
        return Math.hypot(s.heroState.x - start.x, s.heroState.z - start.z) > 1;
      };
      const h = setInterval(() => test() && done(), 250);
      return () => clearInterval(h);
    }
  }
}

type Snap = ReturnType<typeof snapshot>;
function snapshot({ ed }: ActionCtx) {
  return {
    workspace: ed.workspace.value,
    right: ed.right.value,
    dock: ed.dock.value,
    tool: ed.tool.value,
    menu: ed.menu.value,
    palette: ed.palette.value,
    logicView: ed.logicView.value,
    assetCat: ed.assetCat.value,
    assetBrush: ed.assetBrush.value,
    mapId: ed.mapId.value,
    selection: ed.selection.value,
    studioAsset: ed.studioAsset.value,
    studioCharacter: ed.studioCharacter.value,
    logicGraph: ed.logicGraph.value,
    screenId: ed.screenId.value,
    widgetPath: ed.widgetPath.value,
    cinematicId: ed.cinematicId.value,
    audioSel: ed.audioSel.value,
    exports: ed.exports.value,
    playing: !!ed.session.value,
    paused: ed.paused.value,
  };
}
function restore(c: ActionCtx, s: Snap) {
  const { ed, ui } = c;
  const playing = !!ed.session.value;
  if (playing && !s.playing) ui.stopPlay();
  if (!playing && s.playing) ui.play('engine');
  if (ed.mapId.value !== s.mapId && !s.playing) ed.openMap(s.mapId);
  if (ed.workspace.value !== s.workspace) ui.workspace(s.workspace);
  ed.right.value = s.right;
  ed.dock.value = s.dock;
  ed.tool.value = s.tool;
  ed.menu.value = s.menu;
  ed.palette.value = s.palette;
  ed.logicView.value = s.logicView;
  ed.assetCat.value = s.assetCat;
  ed.assetBrush.value = s.assetBrush;
  ed.selection.value = new Set([...s.selection].filter((id) => ed.scene.value?.byId.has(id)));
  ed.studioAsset.value = s.studioAsset;
  ed.studioCharacter.value = s.studioCharacter;
  ed.logicGraph.value = s.logicGraph;
  ed.screenId.value = s.screenId;
  ed.widgetPath.value = s.widgetPath;
  ed.cinematicId.value = s.cinematicId;
  ed.audioSel.value = s.audioSel;
  ed.exports.value = s.exports;
  ed.paused.value = s.paused;
}

const W = 360;
/** Keep the card next to its target without covering it. */
function cardPos(r: Rect | null, step: Step, min: boolean): Record<string, string> {
  if (min) return { right: '16px', bottom: '40px', width: '260px' };
  const vw = innerWidth;
  const vh = innerHeight;
  if (!r || step.placement === 'center' || vw < 700)
    return { right: '16px', bottom: '40px', width: `${Math.min(W, vw - 32)}px` };
  let x: number;
  let y: number;
  switch (step.placement ?? 'bottom') {
    case 'left':
      x = r.x - W - 16;
      y = r.y;
      break;
    case 'right':
      x = r.x + r.w + 16;
      y = r.y;
      break;
    case 'top':
      x = r.x;
      y = r.y - 300;
      break;
    default:
      x = r.x;
      y = r.y + r.h + 14;
  }
  if (x < 8 || x + W > vw - 8) x = Math.max(8, Math.min(vw - W - 8, x < 8 ? r.x + r.w + 16 : r.x - W - 16));
  x = Math.max(8, Math.min(vw - W - 8, x));
  y = Math.max(8, Math.min(vh - 340, y));
  return { left: `${x}px`, top: `${y}px`, width: `${W}px` };
}
