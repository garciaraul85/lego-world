import { useEffect, useMemo, useState } from 'preact/hooks';
import { type BuildStage, buildGame } from '../../core/gamegen/generateGame';
import type { ActionCtx } from '../actions/registry';
import { type Intent, writeIntent } from './intent';

type BuildIntent = Extract<Intent, { kind: 'build' }>;

/**
 * Watch it being built (P7.2, requested addition): the generated game is replayed one stage at a
 * time in the real editor. Each stage opens the workspace it touches, says what it did and how to
 * do the same by hand, and is one undo step (Back undoes it).
 */
export function BuildViewer({ c, intent, onClose }: { c: ActionCtx; intent: BuildIntent; onClose: () => void }) {
  const { ed, ui } = c;
  const game = useMemo(() => buildGame(intent.options, intent.seed), [intent.seed]);
  const stages = game.stages;
  const [step, setStep] = useState(intent.step);
  const [auto, setAuto] = useState(false);
  const [min, setMin] = useState(false);
  const label = (i: number) => `Build ${i + 1}/${stages.length}: ${stages[i]!.title}`;

  const focus = (s: BuildStage) => {
    ui.workspace(s.workspace);
    const f = s.focus ?? {};
    if (f.map) ed.openMap(f.map);
    if (f.tab) ed.right.value = f.tab;
    if (f.logic) ed.logicGraph.value = f.logic;
    if (f.screen) {
      ed.screenId.value = f.screen;
      ed.widgetPath.value = '';
    }
    if (f.cinematic) ed.cinematicId.value = f.cinematic;
    if (f.audio) ed.audioSel.value = { kind: 'music', id: f.audio };
    if (s.workspace === 'Scene') setTimeout(() => ui.fit(), 60);
  };
  const save = (n: number) => {
    setStep(n);
    writeIntent(n >= stages.length ? null : { ...intent, step: n });
  };
  const next = () => {
    if (step >= stages.length) return;
    const s = stages[step]!;
    if (s.commands.length) {
      const r = ed.exec(s.commands, { label: label(step), source: 'generator' });
      if (!r.ok) {
        setAuto(false);
        return;
      }
    }
    focus(s);
    ed.log('INFO', `Built: ${s.title}`);
    save(step + 1);
  };
  const back = () => {
    if (step === 0) return;
    const s = stages[step - 1]!;
    if (s.commands.length) {
      if (ed.bus.history().at(-1)?.label !== label(step - 1)) {
        ed.notify('Undo your own edits first (Ctrl Z), then step back.');
        return;
      }
      ed.undo();
    }
    save(step - 1);
    if (step - 2 >= 0) focus(stages[step - 2]!);
  };
  useEffect(() => {
    if (!auto) return;
    if (step >= stages.length) {
      setAuto(false);
      return;
    }
    const h = setTimeout(next, step === 0 ? 300 : 3200);
    return () => clearTimeout(h);
  }, [auto, step]);
  useEffect(() => {
    if (step > 0) focus(stages[step - 1]!);
  }, []);

  const cur = step > 0 ? stages[step - 1]! : null;
  const upcoming = stages[step];
  const done = step >= stages.length;
  return (
    <aside class={`buildview ${min ? 'min' : ''}`} aria-label="Build steps">
      <header>
        <strong>🔍 Watching “{game.name}” being built</strong>
        <span class="mono small muted">
          {step}/{stages.length}
        </span>
        <button type="button" class="btn icon" aria-label={min ? 'Expand' : 'Minimize'} onClick={() => setMin(!min)}>
          {min ? '▴' : '▾'}
        </button>
        <button
          type="button"
          class="btn icon"
          aria-label="Close the build view"
          onClick={() => {
            writeIntent(null);
            onClose();
          }}
        >
          ✕
        </button>
      </header>
      {!min && (
        <>
          <ol class="buildview-stages">
            {stages.map((s, i) => (
              <li class={i < step ? 'done' : i === step ? 'next' : ''}>
                <span aria-hidden="true">{i < step ? '✓' : i + 1}</span> {s.title}
              </li>
            ))}
          </ol>
          <div class="buildview-card" aria-live="polite">
            {cur ? (
              <>
                <h3>
                  {step}. {cur.title} <span class="chip">{cur.workspace}</span>
                </h3>
                <p>{cur.explain}</p>
                <p class="buildview-how">
                  <strong>Do it yourself:</strong> {cur.howTo}
                </p>
                {cur.commands.length > 0 && (
                  <p class="muted small">
                    {cur.commands.length} command{cur.commands.length === 1 ? '' : 's'}:{' '}
                    {[...new Set(cur.commands.map((x) => x.type))].join(', ')} · one undo step
                  </p>
                )}
              </>
            ) : (
              <>
                <h3>Start from an empty project</h3>
                <p>
                  This is a brand-new project with one empty map. Press <strong>Next</strong> to apply the first stage,
                  or <strong>Auto</strong> to watch the whole build. Each stage opens the workspace it uses.
                </p>
              </>
            )}
          </div>
          <div class="row buildview-actions">
            <button type="button" class="btn" disabled={step === 0 || auto} onClick={back}>
              ◀ Back
            </button>
            {!done ? (
              <>
                <button type="button" class="btn on" disabled={auto} onClick={next}>
                  Next: {upcoming!.title} ▶
                </button>
                <button type="button" class={`btn ${auto ? 'on' : ''}`} onClick={() => setAuto(!auto)}>
                  {auto ? '❚❚ Pause' : '⏵ Auto'}
                </button>
              </>
            ) : (
              <button type="button" class="btn go" onClick={() => ui.play('engine', { fromEntry: true })}>
                ▶ Play the finished game
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
