import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ActionCtx } from '../actions/registry';
import { keysFor } from '../platform';
import { commandMatches, STATE_TESTS } from './checks';
import { courseTokens, fillCode } from './coding';
import { perform } from './doers';
import { type Track, trackOf } from './index';
import { GhostCursor, type Rect, Spotlight, useTargetRect } from './Spotlight';
import { type Check, type Do, howLines, type Step } from './schema';
import { storyText } from './story';

/** demo: Show me is running; shown: the demo waits for My turn; try: your turn; done: waits for Next */
type Phase = 'demo' | 'shown' | 'try' | 'done';
const KEY = 'brickworlds.tutorial';
const keyOf = (track: Track) => (track === 'editor' ? KEY : `${KEY}.${track}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadProgress(project: string, track: Track): number {
  try {
    const v = JSON.parse(localStorage.getItem(keyOf(track)) ?? 'null') as { project: string; index: number } | null;
    return v?.project === project ? Math.min(trackOf(track).steps.length - 1, v.index) : 0;
  } catch {
    return 0;
  }
}
function saveProgress(project: string, index: number, track: Track) {
  try {
    localStorage.setItem(keyOf(track), JSON.stringify({ project, index }));
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
  track = 'editor',
  onClose,
}: {
  c: ActionCtx;
  mode: 'show' | 'try';
  track?: Track;
  onClose: () => void;
}) {
  const { ed, ui } = c;
  const project = ed.store.manifest.id;
  const STEPS = trackOf(track).steps;
  const [index, setIndex] = useState(() => loadProgress(project, track));
  const [mode, setMode] = useState(mode0);
  const [phase, setPhase] = useState<Phase>('try');
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [clicking, setClicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [min, setMin] = useState(false);
  const busy = useRef(false);
  /** the card's height (it is placed so it never covers the target) and where you dragged it, if you did */
  const card = useRef<HTMLElement>(null);
  const [cardH, setCardH] = useState(300);
  const [moved, setMoved] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const h = card.current?.offsetHeight ?? 300;
    if (Math.abs(h - cardH) > 4) setCardH(h);
  });
  /** resolves the demo's pause when you press My turn */
  const myTurn = useRef<(() => void) | null>(null);
  /** true while Show me or Do it for me is still working (buttons wait for it) */
  const [working, setWorking] = useState(false);
  const step = STEPS[index]!;
  /** during Show me: the control the pointer is on now, so the spotlight follows each click */
  const [focus, setFocus] = useState<string | null>(null);
  /** during Show me: which line of the click-by-click list is being done (0-based) */
  const [howAt, setHowAt] = useState(-1);
  const rect = useTargetRect(focus ?? step.target);
  const doneRef = useRef(false);

  const go = (i: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, i));
    saveProgress(project, n, track);
    setIndex(n);
  };
  const indexRef = useRef(index);
  indexRef.current = index;
  /** completes step `at` (the step a check or Do it for me started on); a late call for an earlier step is ignored */
  const complete = (at = indexRef.current) => {
    if (at !== indexRef.current || doneRef.current) return;
    doneRef.current = true;
    setPhase('done');
    setNote(null);
    // you decide when to go on: Next moves to the next step (nothing moves by itself)
  };

  // entering a step: open its workspace, then demo it (Show me first) or arm the check
  useEffect(() => {
    doneRef.current = false;
    setNote(null);
    setGhost(null);
    // a target a step drew on the stage belongs to that step only
    ed.tutorialSpot.value = null;
    if (step.workspace && ed.workspace.value !== step.workspace && !ed.session.value) ui.workspace(step.workspace);
    // a setup that cannot run says so on the card (Do it for me would fail the same way)
    for (const d of step.setup ?? [])
      perform(c, d).catch((e) => setNote(`This step could not get ready: ${e instanceof Error ? e.message : e}`));
    // the demo waits for Show me, so there is time to read the step first
    setPhase('try');
  }, [index]);

  // leaving the tutorial during a demo lets it put everything back
  useEffect(
    () => () => {
      myTurn.current?.();
      ed.tutorialSpot.value = null;
    },
    [],
  );

  // P32: a step whose click-by-click lines have checks is done one line at a time, in order
  const lines = howLines(step);
  const lineChecked = lines.some((l) => l.check);
  const [linesDone, setLinesDone] = useState<boolean[]>([]);
  useEffect(() => setLinesDone([]), [index]);
  /** the line being worked on: the first one with a check that has not passed yet (-1 when all have) */
  const current = lineChecked ? lines.findIndex((l, i) => l.check && !linesDone[i]) : -1;

  // the check, armed while it is the user's turn
  // (not while Do it for me is still working: its own clicks would end this step early, or the next one)
  useEffect(() => {
    if (phase !== 'try' || working) return;
    const at = index;
    if (!lineChecked) return arm(step.check, c, () => complete(at));
    if (current < 0) {
      complete(at);
      return;
    }
    return arm(lines[current]!.check!, c, () => {
      if (at !== indexRef.current) return;
      setLinesDone((d) => {
        const next = [...d];
        next[current] = true;
        return next;
      });
    });
  }, [phase, index, working, current]);

  const target = (sel = step.target): { x: number; y: number } => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
    const b = el?.getBoundingClientRect();
    return b?.width
      ? { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 40) }
      : { x: innerWidth / 2, y: innerHeight / 2 };
  };

  /** Show me: perform the step with the demo pointer, show the result, then put everything back. */
  /** P32: one line of the step at a time: its actions, then its check must pass (Show me and Do it for me). */
  async function runScript(show: boolean) {
    const parts = scriptOf(step);
    for (const part of parts) {
      if (part.line !== null) setHowAt(part.line);
      // armed before the actions, so a command they cause is seen
      // a big map can keep the editor busy for a while (the Director reloads its preview): 20 s before giving up
      const verified = part.check ? verify(part.check, c, 20000) : null;
      for (const d of part.actions) {
        const said = d as { say?: string };
        if (show) {
          const sel =
            'click' in d ? d.click : 'choose' in d ? d.choose : 'fill' in d ? d.fill : 'show' in d ? d.show : null;
          if (sel) setFocus(sel);
          setNote(
            said.say
              ? storyText(ed, said.say)
              : part.text
                ? `Step ${(part.line ?? 0) + 1}: ${storyText(ed, part.text)}`
                : null,
          );
          await wait(sel ? 120 : 0);
          setGhost(target(sel ?? step.target));
          await wait(sel ? 1400 : 750);
          if (!('show' in d)) {
            setClicking(true);
            await wait(220);
            setClicking(false);
          }
        }
        await perform(c, d);
        await wait(show ? 350 : 150);
      }
      if (verified && !(await verified.done))
        throw new Error(
          `step ${(part.line ?? 0) + 1} did not happen${part.text ? ` (“${part.text.slice(0, 80)}…”)` : ''}. ${verified.why()}`,
        );
      verified?.stop();
      if (part.line !== null) {
        const n = part.line;
        setLinesDone((d) => {
          const next = [...d];
          next[n] = true;
          return next;
        });
      }
      await wait(show ? 500 : 200);
    }
  }

  /** Show me: perform the step line by line with the demo pointer, show the result, then put everything back. */
  async function demo() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setPhase('demo');
    setNote('Watch: this is how it is done…');
    const snap = snapshot(c);
    const before = ed.bus.history().length;
    try {
      setGhost({ x: innerWidth - 120, y: innerHeight - 80 });
      await wait(60);
      await runScript(true);
      // look at the result as long as you like; My turn puts everything back
      setPhase('shown');
      setNote('That’s how it’s done. Look around, then press My turn: everything goes back so you can do it yourself.');
      await new Promise<void>((r) => {
        myTurn.current = r;
      });
      myTurn.current = null;
    } catch (e) {
      setNote(`The demo could not run here: ${e instanceof Error ? e.message : e}`);
      await wait(2500);
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
      setFocus(null);
      setHowAt(-1);
      setLinesDone([]);
      busy.current = false;
      setWorking(false);
      setNote(`Your turn: ${storyText(ed, step.task)}`);
      setPhase('try');
    }
  }

  /** Do it for me: the same lines, one at a time, each checked before the next. */
  async function doIt() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    const at = indexRef.current;
    try {
      await runScript(false);
      complete(at);
    } catch (e) {
      setNote(`Could not do it automatically: ${e instanceof Error ? e.message : e}`);
    } finally {
      setHowAt(-1);
      busy.current = false;
      setWorking(false);
    }
  }

  /** Show me and Do it for me have something to do: the step's do-list, or its lines' actions */
  const scripted = scriptOf(step).some((p) => p.actions.length);
  const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter);
  const k = chapterSteps.indexOf(step) + 1;
  const last = index === STEPS.length - 1;
  return (
    <>
      {!min && <Spotlight rect={rect} />}
      <GhostCursor at={ghost} clicking={clicking} />
      <aside
        ref={card}
        class={`tut-card ${min ? 'min' : ''} ${phase}`}
        style={
          moved && !min
            ? { left: `${moved.x}px`, top: `${moved.y}px`, width: `${Math.min(W, innerWidth - 16)}px` }
            : cardPos(rect, step, min, cardH, innerWidth, innerHeight, workAreas())
        }
        aria-label="Tutorial"
      >
        <header
          class="tut-drag"
          title="Drag to move the card"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            const b = card.current!.getBoundingClientRect();
            const off = { x: e.clientX - b.left, y: e.clientY - b.top };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const mv = (ev: PointerEvent) =>
              setMoved({
                x: Math.max(0, Math.min(innerWidth - 80, ev.clientX - off.x)),
                y: Math.max(0, Math.min(innerHeight - 40, ev.clientY - off.y)),
              });
            const up = () => {
              window.removeEventListener('pointermove', mv);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', mv);
            window.addEventListener('pointerup', up);
          }}
        >
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
            <h3>{keysFor(step.title)}</h3>
            <p>{keysFor(storyText(ed, step.body))}</p>
            <p class={`tut-task ${phase}`}>
              {phase === 'done'
                ? last
                  ? '✓ Done! That was the last step.'
                  : '✓ Done! Press Next when you are ready.'
                : phase === 'demo' || phase === 'shown'
                  ? '👀 Watch:'
                  : '👉 Your turn:'}{' '}
              {phase === 'done' ? '' : keysFor(storyText(ed, step.task))}
            </p>
            {lines.length > 0 && phase !== 'done' && (
              <ol class="tut-how" aria-label="Click by click">
                {lines.map((h, i) => {
                  // a line is done when its check passed (by hand, Show me or Do it for me), or (no check) when a
                  // later checked line is reached
                  const done =
                    !!linesDone[i] || (phase === 'try' && lineChecked && !h.check && (current < 0 || i < current));
                  const on = howAt >= 0 ? i === howAt : phase === 'try' && i === current;
                  return (
                    <li class={`${on ? 'on' : ''} ${done ? 'done' : ''}`} aria-current={on ? 'step' : undefined}>
                      {done && <span class="tut-tick">✓ </span>}
                      {keysFor(storyText(ed, h.text))}
                    </li>
                  );
                })}
              </ol>
            )}
            {step.code && (
              <figure class="tut-figure" aria-label="Code to type">
                <pre class="tut-code">{fillCode(step.code, courseTokens(ed))}</pre>
              </figure>
            )}
            {step.tip && <p class="muted small">Tip: {keysFor(step.tip)}</p>}
            {note && phase !== 'done' && <p class="tut-note">{keysFor(note)}</p>}
            <div class="tut-actions">
              <button
                type="button"
                class="btn"
                disabled={index === 0 || phase === 'demo' || phase === 'shown'}
                onClick={() => go(index - 1)}
              >
                ◀ Back
              </button>
              {phase === 'shown' ? (
                <button type="button" class="btn on" onClick={() => myTurn.current?.()}>
                  My turn ▶
                </button>
              ) : (
                scripted && (
                  <button
                    type="button"
                    class={`btn ${mode === 'show' && phase === 'try' && !working ? 'on' : ''}`}
                    disabled={phase !== 'try' || working}
                    onClick={() => void demo()}
                  >
                    👀 Show me
                  </button>
                )
              )}
              {scripted && (
                <button type="button" class="btn" disabled={phase !== 'try' || working} onClick={() => void doIt()}>
                  Do it for me
                </button>
              )}
              {step.check.kind === 'manual' || phase === 'done' ? (
                <button
                  type="button"
                  class="btn on"
                  disabled={working}
                  onClick={() => (last ? onClose() : go(index + 1))}
                >
                  {last ? 'Finish ✓' : 'Next ▶'}
                </button>
              ) : (
                <button
                  type="button"
                  class="btn"
                  disabled={phase === 'demo' || phase === 'shown' || working}
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
                Suggest Show me on each step
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
function arm(check: Check, c: ActionCtx, done: () => void, anySource = false): () => void {
  const { ed } = c;
  switch (check.kind) {
    case 'manual':
      return () => {};
    case 'command':
      return ed.bus.onExecute((cmds, source) => {
        if ((anySource || source !== 'tutorial') && commandMatches(cmds, check.type, check.where)) done();
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
/**
 * Where the card goes: never on top of what the step points at. It tries the step's side, then the other
 * sides and the corners, and takes the first spot that leaves the target fully visible (or the one that
 * covers the least of it, for a target as big as the screen).
 */
/**
 * P32: where you click to build (the asset build plate, the 3D view): the card stays off them when it can,
 * so it never sits on the bricks you are asked to click.
 */
function workAreas(): Rect[] {
  return ['.studio-plate', '[data-tour="viewport"]'].flatMap((sel) => {
    const b = document.querySelector(sel)?.getBoundingClientRect();
    return b && b.width > 0 ? [{ x: b.left, y: b.top, w: b.width, h: b.height }] : [];
  });
}

export function cardPos(
  r: Rect | null,
  step: Pick<Step, 'placement'>,
  min: boolean,
  h = 300,
  vw = innerWidth,
  vh = innerHeight,
  /** areas to keep clear too, after the target (the build plate) */
  keep: Rect[] = [],
): Record<string, string> {
  if (min) return { right: '16px', bottom: '40px', width: '260px' };
  const w = Math.min(W, vw - 16);
  if (!r || vw < 700) return { right: '16px', bottom: '40px', width: `${w}px` };
  const clamp = (x: number, y: number): [number, number] => [
    Math.max(8, Math.min(vw - w - 8, x)),
    Math.max(8, Math.min(vh - h - 8, y)),
  ];
  const sides: Record<string, [number, number]> = {
    bottom: [r.x, r.y + r.h + 14],
    top: [r.x, r.y - h - 14],
    right: [r.x + r.w + 16, r.y],
    left: [r.x - w - 16, r.y],
  };
  const corners: [number, number][] = [
    [vw - w - 16, vh - h - 40],
    [vw - w - 16, 56],
    [16, vh - h - 40],
    [16, 56],
  ];
  const order = [
    ...(step.placement && step.placement !== 'center' ? [sides[step.placement]!] : []),
    ...Object.values(sides),
    ...corners,
  ].map(([x, y]) => clamp(x, y));
  const area = ([x, y]: [number, number], a: Rect) =>
    Math.max(0, Math.min(x + w, a.x + a.w) - Math.max(x, a.x)) *
    Math.max(0, Math.min(y + h, a.y + a.h) - Math.max(y, a.y));
  // covering the target is far worse than covering a work area; a work area the target is in does not count
  const clear = keep.filter((a) => !(r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h));
  const overlap = (p: [number, number]) => area(p, r) * 1000 + clear.reduce((s, a) => s + area(p, a), 0);
  let best = order[0]!;
  for (const p of order) {
    if (overlap(p) === 0) {
      best = p;
      break;
    }
    if (overlap(p) < overlap(best)) best = p;
  }
  return { left: `${best[0]}px`, top: `${best[1]}px`, width: `${w}px` };
}

type ScriptPart = { line: number | null; text: string; actions: Do[]; check: Check | null };
/**
 * P32: what Show me and Do it for me run. A step whose click-by-click lines have their own actions runs them
 * line by line, each verified by the line's check; other steps run their do-list as one part.
 */
export function scriptOf(step: Step): ScriptPart[] {
  const lines = howLines(step);
  if (lines.some((l) => l.do?.length))
    return lines.flatMap((l, i): ScriptPart[] =>
      l.do?.length || l.check ? [{ line: i, text: l.text, actions: l.do ?? [], check: l.check ?? null }] : [],
    );
  return [{ line: null, text: '', actions: step.doItForMe, check: null }];
}

/** Waits for a check to pass (any source of change counts), up to `ms`. */
function verify(check: Check, c: ActionCtx, ms: number) {
  let stop = () => {};
  let passed = false;
  const done = new Promise<boolean>((resolve) => {
    const t = setTimeout(() => {
      stop();
      resolve(false);
    }, ms);
    stop = arm(
      check,
      c,
      () => {
        passed = true;
        clearTimeout(t);
        stop();
        resolve(true);
      },
      true,
    );
  });
  return {
    done,
    stop: () => stop(),
    why: () =>
      passed
        ? ''
        : `Its check (${check.kind === 'state' ? check.test : check.kind === 'command' ? check.type : check.kind}) did not pass.`,
  };
}
