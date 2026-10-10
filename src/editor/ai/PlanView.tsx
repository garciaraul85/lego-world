import { useEffect, useRef, useState } from 'preact/hooks';
import type { Patch } from '../../core/ai/patch';
import type { ActionCtx } from '../actions/registry';
import { GhostCursor } from '../tutorial/Spotlight';
import { DiffView } from './DiffView';
import { focusStep, tabSelector } from './focus';

const PREVIEW = 'AI preview';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The proposed change, reviewed before anything is kept (P8.3). Every step says what it does and how
 * you would do it yourself. "Show me" plays a step live in its workspace — the demo pointer goes to
 * the workspace, the change happens in the real editor, Back takes it out again — so you can see and
 * understand it. Accept keeps the chosen steps as ONE undo step "AI: …"; Reject leaves the project
 * exactly as it was.
 */
export function PlanView({
  c,
  patch,
  onDone,
  onRegenerate,
}: {
  c: ActionCtx;
  patch: Patch;
  onDone: (kind: 'accepted' | 'rejected') => void;
  onRegenerate: () => void;
}) {
  const { ed } = c;
  const n = patch.steps.length;
  const [include, setInclude] = useState<boolean[]>(() => patch.steps.map(() => true));
  /** indexes of steps currently applied as preview, in order */
  const [shown, setShown] = useState<number[]>([]);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [clicking, setClicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOk, setConfirmOk] = useState(!patch.confirm);
  const [files, setFiles] = useState(false);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const chosen = include.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const nextIdx = chosen.find((i) => !shown.includes(i));
  const label = (i: number) => `${PREVIEW} ${i + 1}/${n}: ${patch.steps[i]!.title}`;

  /** our preview steps must be on top of the undo history before we take them out */
  const topIsOurs = () => {
    const top = ed.bus.history().at(-1)?.label;
    const last = shownRef.current.at(-1);
    return last !== undefined && top === label(last);
  };
  const unwind = (): boolean => {
    while (shownRef.current.length) {
      if (!topIsOurs()) {
        setError(
          'You changed something during the preview. Undo your own edits first (Ctrl Z), then accept or reject.',
        );
        return false;
      }
      ed.undo();
      shownRef.current = shownRef.current.slice(0, -1);
    }
    setShown([]);
    return true;
  };

  async function show(i: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const step = patch.steps[i]!;
    try {
      // the pointer goes to the workspace tab, "clicks", and the change happens there
      const tab = document.querySelector(tabSelector(step.workspace))?.getBoundingClientRect();
      if (tab) {
        setGhost({ x: innerWidth - 380, y: 120 });
        await wait(40);
        setGhost({ x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 });
        await wait(650);
        setClicking(true);
        await wait(200);
        setClicking(false);
      }
      focusStep(c, step);
      await wait(250);
      const r = ed.exec(step.commands, { label: label(i), source: 'ai' });
      if (!r.ok) {
        setError(`Step ${i + 1} cannot run on its own: ${r.error}. Include the steps it needs.`);
        setAuto(false);
        return;
      }
      setShown((s) => [...s, i]);
      shownRef.current = [...shownRef.current, i];
      focusStep(c, step);
    } finally {
      setGhost(null);
      setBusy(false);
    }
  }
  const back = () => {
    if (!shown.length) return;
    if (!topIsOurs()) {
      setError('Undo your own edits first (Ctrl Z), then step back.');
      return;
    }
    ed.undo();
    const rest = shown.slice(0, -1);
    setShown(rest);
    shownRef.current = rest;
    const prev = rest.at(-1);
    if (prev !== undefined) focusStep(c, patch.steps[prev]!);
  };

  useEffect(() => {
    if (!auto || busy) return;
    if (nextIdx === undefined) {
      setAuto(false);
      return;
    }
    const h = setTimeout(() => void show(nextIdx), shown.length ? 1600 : 200);
    return () => clearTimeout(h);
  }, [auto, busy, shown]);

  // leaving the review (panel closed) takes an unaccepted preview out
  useEffect(() => () => void (shownRef.current.length && unwindSilently()), []);
  const unwindSilently = () => {
    while (shownRef.current.length && topIsOurs()) {
      ed.undo();
      shownRef.current = shownRef.current.slice(0, -1);
    }
  };

  const accept = () => {
    if (!chosen.length || !confirmOk) return;
    if (!unwind()) return;
    const cmds = chosen.flatMap((i) => patch.steps[i]!.commands);
    const r = ed.exec(cmds, { label: `AI: ${patch.summary}`, source: 'ai' });
    if (!r.ok) {
      setError(`The chosen steps don't work together: ${r.error}`);
      return;
    }
    focusStep(c, patch.steps[chosen.at(-1)!]!);
    ed.notify(`Applied: ${patch.summary} (Ctrl Z undoes it)`);
    onDone('accepted');
  };
  const reject = () => {
    if (!unwind()) return;
    onDone('rejected');
  };

  return (
    <section class="aip-patch" aria-label="Proposed change">
      <GhostCursor at={ghost} clicking={clicking} />
      <header>
        <h3>{patch.summary}</h3>
        <span class="muted small">
          {n} step{n === 1 ? '' : 's'} · {patch.commandCount} command{patch.commandCount === 1 ? '' : 's'} ·{' '}
          {patch.diff.length} file{patch.diff.length === 1 ? '' : 's'} · nothing is kept until you accept
        </span>
      </header>
      {patch.warnings.map((w) => (
        <p key={w} class="aip-warn">
          ⚠ {w}
        </p>
      ))}
      {patch.confirm && (
        <label class="aip-confirm">
          <input
            type="checkbox"
            checked={confirmOk}
            onChange={(e) => setConfirmOk((e.target as HTMLInputElement).checked)}
          />
          <span>
            <strong>{patch.confirm}</strong> I understand and want this.
          </span>
        </label>
      )}
      <ol class="aip-steps">
        {patch.steps.map((s, i) => {
          const on = shown.includes(i);
          return (
            <li key={i} class={`${on ? 'shown' : ''} ${include[i] ? '' : 'skip'} ${i === nextIdx ? 'next' : ''}`}>
              <div class="aip-step-head">
                <input
                  type="checkbox"
                  aria-label={`Include step ${i + 1}`}
                  checked={include[i]}
                  disabled={on || busy}
                  onChange={(e) =>
                    setInclude(include.map((v, k) => (k === i ? (e.target as HTMLInputElement).checked : v)))
                  }
                />
                <strong>
                  {i + 1}. {s.title}
                </strong>
                <span class="chip">{s.workspace}</span>
                {on && <span class="aip-badge">✓ shown</span>}
              </div>
              <p>{s.explain}</p>
              <details>
                <summary class="muted small">
                  {s.commands.length} engine command{s.commands.length === 1 ? '' : 's'}:{' '}
                  {[...new Set(s.commands.map((x) => x.type))].join(', ')}
                </summary>
                {s.helperNote && <p class="muted small">Written as {s.helperNote}</p>}
                <pre class="aip-cmd">
                  {s.commands
                    .map(
                      (x) =>
                        `${x.type} ${JSON.stringify(x.payload).slice(0, 600)}${JSON.stringify(x.payload).length > 600 ? '…' : ''}`,
                    )
                    .join('\n')}
                </pre>
              </details>
            </li>
          );
        })}
      </ol>
      {error && (
        <p class="aip-error" role="alert">
          {error}
        </p>
      )}
      <div class="aip-walk" role="group" aria-label="Walk through the steps">
        <button type="button" class="btn" disabled={!shown.length || busy || auto} onClick={back}>
          ◀ Back
        </button>
        {nextIdx !== undefined ? (
          <>
            <button type="button" class="btn on" disabled={busy || auto} onClick={() => void show(nextIdx)}>
              👀 Show me step {nextIdx + 1}
            </button>
            <button type="button" class={`btn ${auto ? 'on' : ''}`} onClick={() => setAuto(!auto)}>
              {auto ? '❚❚ Pause' : '⏵ Show all'}
            </button>
          </>
        ) : (
          <span class="muted small">
            {shown.length ? 'All chosen steps are shown in the editor.' : 'Choose at least one step.'}
          </span>
        )}
      </div>
      <button type="button" class="link small" onClick={() => setFiles(!files)} aria-expanded={files}>
        {files ? '▾' : '▸'} Files that change ({patch.diff.length})
      </button>
      {files && <DiffView diff={patch.diff} />}
      <div class="aip-actions">
        <button type="button" class="btn go" disabled={!chosen.length || !confirmOk || busy || auto} onClick={accept}>
          ✓ Accept {chosen.length === n ? 'all' : `${chosen.length} of ${n} steps`}
        </button>
        <button type="button" class="btn" disabled={busy || auto} onClick={reject}>
          ✕ Reject
        </button>
        <button
          type="button"
          class="btn"
          disabled={busy || auto}
          onClick={() => {
            if (unwind()) onRegenerate();
          }}
        >
          ↻ Regenerate
        </button>
      </div>
    </section>
  );
}
