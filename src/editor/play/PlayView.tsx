import { useEffect, useRef, useState } from 'preact/hooks';
import { nodeDef } from '../../core/logic/catalog';
import { printGraph } from '../../core/logic/code/print';
import type { LogicGraph } from '../../core/schema';
import { PlayRenderer } from '../../engine/runtime/play-renderer';
import { PlaySession } from '../../engine/runtime/session';
import type { EditorState } from '../state';

export type PlayStart = { mapId: string; spawnId: string | null };

const SPEEDS = [0.25, 0.5, 1, 2] as const;
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'e']);

/**
 * Play-in-editor on the new engine runtime (P2). The session is built from a snapshot of the project,
 * so nothing that happens while playing reaches the project; Stop throws the session away.
 */
export function PlayView({ ed, start, onStop }: { ed: EditorState; start: PlayStart; onStop: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const paused = ed.paused.value;
  const scale = ed.timeScale.value;
  const session = ed.session.value;
  ed.playTick.value;

  useEffect(() => {
    const canvas = canvasRef.current!;
    let s: PlaySession;
    let pr: PlayRenderer;
    try {
      s = new PlaySession(ed.store.snapshot(), start);
      pr = new PlayRenderer(canvas, s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setFailed(msg);
      ed.log('ERROR', `Play could not start: ${msg}`);
      return;
    }
    const onEvent = (e: { kind: string; msg: string }) => ed.log(e.kind === 'cheat' ? 'WARN' : 'LOGIC', `▶ ${e.msg}`);
    for (const e of s.events) onEvent(e);
    s.listeners.add(onEvent);
    ed.paused.value = false;
    ed.session.value = s;
    ed.playing.value = true;
    if (ed.dock.value === 'assets') ed.dock.value = 'debug';
    // logic breakpoints (P4.5): pause the game where a graph stops
    for (const k of ed.breakpoints.value) s.logic.breakpoints.add(k);
    const unBp = ed.breakpoints.subscribe((set) => {
      s.logic.breakpoints.clear();
      for (const k of set) s.logic.breakpoints.add(k);
    });
    s.onBreak = (b) => {
      ed.paused.value = true;
      ed.logicBreak.value = b;
    };
    for (const p of s.logic.problems) ed.log('WARN', `Logic: ${p.message}${p.node ? ` (${p.node})` : ''}`);

    let raf = 0;
    let last = performance.now();
    let lastTick = 0;
    const frameMs: number[] = [];
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      s.runtime.paused = ed.paused.value;
      s.runtime.timeScale = ed.timeScale.value;
      const steps = s.runtime.advance(dt);
      pr.debug = ed.debugDraw.value;
      const t0 = performance.now();
      const st = pr.render();
      frameMs.push(dt * 1000);
      if (frameMs.length > 30) frameMs.shift();
      if (msgRef.current) {
        const text = s.clock < s.messageUntil ? s.message : '';
        if (msgRef.current.textContent !== text) msgRef.current.textContent = text;
        msgRef.current.hidden = !text;
      }
      if (promptRef.current) {
        const text = s.prompt && !s.talking ? `E · ${s.prompt.label}` : '';
        if (promptRef.current.textContent !== text) promptRef.current.textContent = text;
        promptRef.current.hidden = !text;
      }
      if (now - lastTick > 100) {
        lastTick = now;
        const avg = frameMs.reduce((a, b) => a + b, 0) / frameMs.length;
        ed.playStats.value = {
          fps: Math.round(1000 / Math.max(1, avg)),
          ticks: s.runtime.ticks,
          steps,
          ms: performance.now() - t0,
        };
        if (st) ed.stats.value = { ...st, fps: ed.playStats.value.fps };
        ed.playTick.value++;
      }
    };
    raf = requestAnimationFrame(frame);

    // ---------- keyboard ----------
    const typing = (e: KeyboardEvent) =>
      !!(e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable]');
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        onStop();
        return;
      }
      if (k === 'f5' || k === 'f6') {
        e.preventDefault();
        return;
      }
      if (k === 'e' && !e.repeat && s.interact()) {
        /* used the prompted interaction */
      } else if (MOVE_KEYS.has(k)) s.input.keys.add(k);
      else if (k === ' ') s.input.jump = true;
      else if (k === 'f' && !e.repeat) s.smash();
      else if (k === 't' && !e.repeat) s.talk();
      else if (k === 'p' && !e.repeat) ed.paused.value = !ed.paused.value;
      else if (/^[1-4]$/.test(k) && !e.repeat) s.emote(Number(k) - 1);
      else if (k === 'n' && ed.paused.value) s.runtime.stepOnce();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onUp = (e: KeyboardEvent) => s.input.keys.delete(e.key.toLowerCase());
    const onBlur = () => {
      s.input.keys.clear();
      s.input.touch.clear();
      s.rebuildHeld = false;
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);

    // ---------- camera drag / zoom ----------
    let drag: { x: number; y: number; id: number } | null = null;
    const pDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      canvas.focus();
    };
    const pMove = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      s.camYaw -= (e.clientX - drag.x) * 0.008;
      s.camPitch = Math.max(0.05, Math.min(1.25, s.camPitch + (e.clientY - drag.y) * 0.006));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const pUp = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      s.zoom = Math.max(25, Math.min(120, s.zoom * Math.exp(-e.deltaY * 0.001)));
    };
    canvas.addEventListener('pointerdown', pDown);
    canvas.addEventListener('pointermove', pMove);
    canvas.addEventListener('pointerup', pUp);
    canvas.addEventListener('pointercancel', pUp);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.focus();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      s.listeners.delete(onEvent);
      pr.dispose();
      unBp();
      ed.logicBreak.value = null;
      ed.session.value = null;
      ed.playing.value = false;
      ed.paused.value = false;
      ed.log('INFO', `Stopped playing after ${s.runtime.time.toFixed(1)} s. The project is unchanged.`);
    };
  }, []);

  const hold = (name: string, on: (s: PlaySession) => void, off: (s: PlaySession) => void) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const s = ed.session.value;
      if (s) on(s);
    },
    onPointerUp: () => {
      const s = ed.session.value;
      if (s) off(s);
    },
    onPointerCancel: () => {
      const s = ed.session.value;
      if (s) off(s);
    },
    'aria-label': name,
  });
  const dir = (name: string, key: string) =>
    hold(
      name,
      (s) => s.input.touch.add(key),
      (s) => s.input.touch.delete(key),
    );
  const tap = (name: string, fn: (s: PlaySession) => void) =>
    hold(name, fn, () => {
      /* tap */
    });

  const map = session?.world.doc.name ?? '';
  const brk = ed.logicBreak.value;
  return (
    <section class="panel playview" aria-label="Play view">
      <div class="play-bar" role="toolbar" aria-label="Play bar">
        <strong class="playing-dot">{paused ? '❚❚ Paused' : '▶ Playing'}</strong>
        <span class="chip">{map}</span>
        {brk ? (
          <button
            type="button"
            class="btn on"
            title="Run on from the breakpoint"
            onClick={() => {
              ed.logicBreak.value = null;
              ed.paused.value = false;
              ed.session.value?.continueLogic();
            }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            class={`btn ${paused ? 'on' : ''}`}
            title="Pause / resume (P)"
            onClick={() => (ed.paused.value = !paused)}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button
          type="button"
          class="btn"
          disabled={!paused}
          title="Advance one 1/60 s step (N while paused)"
          onClick={() => {
            ed.session.value?.runtime.stepOnce();
            ed.playTick.value++;
          }}
        >
          Step
        </button>
        <span class="group" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((v) => (
            <button
              type="button"
              role="radio"
              aria-checked={scale === v}
              class={`btn ${scale === v ? 'on' : ''}`}
              onClick={() => (ed.timeScale.value = v)}
            >
              {v}×
            </button>
          ))}
        </span>
        <span class="muted small opt play-hint">
          WASD move · Space jump · F smash · E use · hold E rebuild · T talk · 1-4 emotes · drag to look
        </span>
        <button type="button" class="btn go" style={{ marginLeft: 'auto' }} onClick={onStop} title="Stop (Esc)">
          ■ Stop
        </button>
      </div>
      {brk && <BreakBanner ed={ed} brk={brk} />}
      <div class="viewport-wrap">
        <canvas ref={canvasRef} class="viewport-canvas" tabIndex={0} aria-label="Game view" />
        {failed && (
          <div class="placeholder" style={{ position: 'absolute', inset: 0 }}>
            <strong>Play could not start</strong>
            <span class="muted">{failed}</span>
          </div>
        )}
        <div ref={msgRef} class="play-msg" role="status" hidden />
        <div ref={promptRef} class="play-prompt" aria-live="polite" hidden />
        <div class="touchpad" role="group" aria-label="Touch controls">
          <div class="dpad">
            <button type="button" class="tbtn up" {...dir('Move forward', 'forward')}>
              ▲
            </button>
            <button type="button" class="tbtn left" {...dir('Move left', 'left')}>
              ◀
            </button>
            <button type="button" class="tbtn right" {...dir('Move right', 'right')}>
              ▶
            </button>
            <button type="button" class="tbtn down" {...dir('Move back', 'back')}>
              ▼
            </button>
          </div>
          <div class="acts">
            <button
              type="button"
              class="tbtn"
              {...tap('Jump', (s) => {
                s.input.jump = true;
              })}
            >
              Jump
            </button>
            <button type="button" class="tbtn" {...tap('Smash', (s) => s.smash())}>
              Smash
            </button>
            <button
              type="button"
              class="tbtn"
              {...hold(
                'Rebuild (hold)',
                (s) => {
                  if (!s.interact()) s.rebuildHeld = true;
                },
                (s) => {
                  s.rebuildHeld = false;
                },
              )}
            >
              Build
            </button>
            <button type="button" class="tbtn" {...tap('Talk', (s) => s.talk())}>
              Talk
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Where logic stopped: the graph, the line of code, and the node's input values. */
function BreakBanner({ ed, brk }: { ed: EditorState; brk: NonNullable<EditorState['logicBreak']['value']> }) {
  const g = ed.store.get<LogicGraph>(`logic/${brk.graph}.json`);
  const n = g?.nodes.find((x) => x.id === brk.node);
  let code = '';
  try {
    if (g) {
      const p = printGraph(g);
      const line = p.line.get(brk.node);
      if (line) code = `${line}: ${p.code.split('\n')[line - 1]?.trim()}`;
    }
  } catch {
    /* graphs with hand-wired loops have no code view */
  }
  return (
    <div class="lg-break" role="alert">
      ● Breakpoint · <strong>{g?.name ?? brk.graph}</strong> · {nodeDef(n?.type ?? '')?.title ?? brk.node}
      {code && <code class="mono"> line {code}</code>}
      <span class="muted">
        {' '}
        ·{' '}
        {Object.entries(brk.values)
          .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
          .join(', ') || 'no inputs'}
      </span>
    </div>
  );
}
