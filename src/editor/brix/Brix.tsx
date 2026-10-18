import { useEffect, useRef, useState } from 'preact/hooks';
import type { AiTurn } from '../../core/ai/provider';
import { sessionKey } from '../../platform/ai/keys';
import { type AiSettings, gameSpent, loadAi, recordSpend, saveAi } from '../../platform/ai/settings';
import type { ActionCtx } from '../actions/registry';
import { pickProvider } from '../ai/providers';
import { projectGenre } from '../genres/view';
import { entryNear, helpEntries, helpEntry } from '../help/entries';
import { entryPageId } from '../help/entry-pages';
import { findControl, flash } from '../help/show';
import { askBrix } from './agent';
import { answerOffline, type BrixAnswer, linkRef } from './answer';
import { type ShowStep, showSteps } from './views';

/**
 * P19 Brix: the editor's helper, a little brick in the corner. Ask how to do something and Brix answers
 * from Help (with Claude when the AI builder has a way to reach it, else by searching Help itself), links
 * the pages, and Show me walks you to the control: it points at each button and presses it the way you
 * would, then rings the control. Explain: click any part of the editor to hear what it is. Brix only reads
 * Help and moves around the editor; it never changes your project.
 */
type Msg = { from: 'you'; text: string } | { from: 'brix'; answer: BrixAnswer; explained?: boolean };

export function BrixMascot({ size = 40, mood = 'happy' }: { size?: number; mood?: 'happy' | 'think' }) {
  // an original character: a 2×2 brick with two studs, round eyes and a smile
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" class="brix-face">
      <rect x="11" y="6" width="10" height="6" rx="2" fill="#f7c948" stroke="#7a5a06" stroke-width="1.5" />
      <rect x="27" y="6" width="10" height="6" rx="2" fill="#f7c948" stroke="#7a5a06" stroke-width="1.5" />
      <rect x="6" y="11" width="36" height="29" rx="5" fill="#f2b632" stroke="#7a5a06" stroke-width="1.8" />
      <rect x="9" y="14" width="30" height="4" rx="2" fill="#ffd277" opacity="0.7" />
      {mood === 'think' ? (
        <>
          <rect x="15" y="23" width="6" height="2.4" rx="1.2" fill="#2a1d02" />
          <rect x="27" y="23" width="6" height="2.4" rx="1.2" fill="#2a1d02" />
          <circle cx="24" cy="33" r="2" fill="#2a1d02" />
        </>
      ) : (
        <>
          <circle cx="18" cy="24" r="3" fill="#2a1d02" />
          <circle cx="30" cy="24" r="3" fill="#2a1d02" />
          <circle cx="19" cy="23" r="1" fill="#fff" />
          <circle cx="31" cy="23" r="1" fill="#fff" />
          <path d="M17 31 Q24 37 31 31" fill="none" stroke="#2a1d02" stroke-width="2.2" stroke-linecap="round" />
        </>
      )}
      <rect x="2" y="24" width="5" height="8" rx="2.5" fill="#f2b632" stroke="#7a5a06" stroke-width="1.4" />
      <rect x="41" y="24" width="5" height="8" rx="2.5" fill="#f2b632" stroke="#7a5a06" stroke-width="1.4" />
    </svg>
  );
}

const withKey = (s: AiSettings): AiSettings => (s.apiKey ? s : { ...s, apiKey: sessionKey() ?? '' });

export function Brix({ c, open, onOpen, onClose }: { c: ActionCtx; open: boolean; onOpen(): void; onClose(): void }) {
  const { ed } = c;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<AbortController | null>(null);
  const [explain, setExplain] = useState(false);
  const [show, setShow] = useState<{ steps: ShowStep[]; key: number } | null>(null);
  const [useAi, setUseAi] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const history = useRef<AiTurn[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    void pickProvider(() => withKey(loadAi())).then((p) => {
      setAiReady(!!p);
      setUseAi((u) => u || !!p);
    });
  }, [open]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs]);

  // Explain: the next click anywhere in the editor is explained instead of pressed
  useEffect(() => {
    if (!explain) return;
    document.body.classList.add('brix-explain');
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.brix-panel, .brix-button, .tut-card')) return;
      e.preventDefault();
      e.stopPropagation();
      setExplain(false);
      const entry = entryNear(t, helpEntries());
      if (!entry) {
        add({
          from: 'brix',
          answer: {
            text: 'I don’t have Help for that spot. Try clicking a button, tab or panel.',
            steps: [],
            links: [],
            show: [],
            offline: true,
          },
        });
        return;
      }
      const el = findControl(entry.id);
      if (el) flash(el);
      add({ from: 'you', text: `What is this? (${entry.name})` });
      add({
        from: 'brix',
        explained: true,
        answer: {
          text: `${entry.name}: ${entry.purpose}`,
          steps: entry.steps ?? [],
          links: [{ page: entryPageId(entry.id), anchor: '', title: entry.name }],
          show: [],
          offline: true,
        },
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExplain(false);
    };
    // controls that act on press (the 3D view, sliders) do nothing while Explain waits for a click
    const hold = (e: Event) => {
      if ((e.target as HTMLElement).closest('.brix-panel, .brix-button, .tut-card')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    // capture: runs before the editor's own handlers, so the click explains instead of acting
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', hold, true);
    document.addEventListener('mousedown', hold, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.classList.remove('brix-explain');
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', hold, true);
      document.removeEventListener('mousedown', hold, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [explain]);

  const add = (m: Msg) => setMsgs((ms) => [...ms, m].slice(-30));

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setText('');
    add({ from: 'you', text: question });
    const s = withKey(loadAi());
    const game = ed.store.manifest.id;
    const capped =
      (s.dailyCap > 0 && s.spent.tokens >= s.dailyCap) || (s.gameCap > 0 && gameSpent(s, game) >= s.gameCap);
    const provider = useAi && !capped ? await pickProvider(() => s) : null;
    if (!provider) {
      const a = answerOffline(question);
      if (useAi && capped) a.text = `${a.text} (Answered from Help: today's AI spending cap is reached.)`;
      add({ from: 'brix', answer: a });
      return;
    }
    const ctl = new AbortController();
    setBusy(ctl);
    try {
      const r = await askBrix({ provider, question, history: history.current.slice(-8), signal: ctl.signal });
      history.current = r.turns;
      if (r.usage) saveAi(recordSpend(loadAi(), r.usage.inputTokens + r.usage.outputTokens, r.usage.requests, game));
      add({ from: 'brix', answer: r.answer });
    } catch (err) {
      const a = answerOffline(question);
      const why = err instanceof Error ? err.message : String(err);
      add({
        from: 'brix',
        answer: { ...a, text: `${a.text} (Claude couldn't answer: ${why}. This answer is from Help.)` },
      });
    } finally {
      setBusy(null);
    }
  }

  function showMe(entryId: string) {
    const steps = showSteps(entryId);
    if (!steps) return;
    // already on screen: just point at it
    const last = steps[steps.length - 1]!;
    setShow({ steps: findControl(entryId) && last.entry === entryId ? [last] : steps, key: Date.now() });
  }

  const genre = projectGenre(ed);

  return (
    <>
      {!ed.session.value && !open && !show && (
        <button
          type="button"
          class="brix-button"
          aria-label="Ask Brix"
          title="Ask Brix: how do I…? (Help › Ask Brix)"
          data-tour="brix"
          onClick={onOpen}
        >
          <BrixMascot size={22} />
          Ask Brix
        </button>
      )}
      {/* the panel steps aside while Show me points, so it never covers the control */}
      {open && !show && (
        <aside class="brix-panel" aria-label="Brix" data-tour="brix-panel" data-help="shell.brix.panel">
          <header>
            <BrixMascot size={30} mood={busy ? 'think' : 'happy'} />
            <strong>Brix</strong>
            <span class="muted small">{useAi && aiReady ? 'Claude, answering from Help' : 'Answers from Help'}</span>
            <button
              type="button"
              class={`btn small ${explain ? 'on' : ''}`}
              aria-pressed={explain}
              title="Click any part of the editor to hear what it is"
              onClick={() => setExplain(!explain)}
            >
              {explain ? 'Click something…' : 'Explain'}
            </button>
            <button type="button" class="btn small" aria-label="Close Brix" onClick={onClose}>
              ×
            </button>
          </header>
          <div class="brix-msgs" ref={list} aria-live="polite">
            {!msgs.length && (
              <div class="brix-hello">
                <p>
                  Hi, I’m Brix! Ask me how to do something, and I’ll show you where it is. Or press <b>Explain</b> and
                  click anything.
                </p>
                <div class="brix-chips">
                  {[
                    'How do I add a checkpoint?',
                    'How do I make an enemy?',
                    'How do I add music?',
                    'How do I play my game?',
                  ].map((q) => (
                    <button type="button" class="chip" onClick={() => void ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
                {genre.checklist.length > 0 && (
                  <details class="brix-check">
                    <summary>Checklist for a {genre.name} game</summary>
                    <ol>
                      {genre.checklist.map((x) => (
                        <li>{x}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
            {msgs.map((m, i) =>
              m.from === 'you' ? (
                <p class="brix-you" key={i}>
                  {m.text}
                </p>
              ) : (
                <div class="brix-answer" key={i} data-explained={m.explained ? '' : undefined}>
                  <p>{m.answer.text}</p>
                  {m.answer.steps.length > 0 && (
                    <ol>
                      {m.answer.steps.map((s) => (
                        <li>{s}</li>
                      ))}
                    </ol>
                  )}
                  {(m.answer.show.length > 0 || m.answer.links.length > 0) && (
                    <div class="brix-acts">
                      {m.answer.show.slice(0, 2).map((id) => (
                        <button type="button" class="btn small on" onClick={() => showMe(id)}>
                          Show me: {helpEntry(id)?.name ?? id}
                        </button>
                      ))}
                      {m.answer.links.map((l) => (
                        <button type="button" class="btn small linkish" onClick={() => c.ui.help(linkRef(l))}>
                          📖 {l.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <p class="muted small">Brix is looking in Help…</p>}
          </div>
          <form
            class="brix-ask"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input
              ref={input}
              value={text}
              aria-label="Ask Brix"
              placeholder="Ask Brix… (how do I add a checkpoint?)"
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                // Enter asks (also when the course types the question for you)
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void ask((e.target as HTMLInputElement).value);
                  return;
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  onClose();
                }
              }}
            />
            {busy ? (
              <button type="button" class="btn small" onClick={() => busy.abort()}>
                Stop
              </button>
            ) : (
              <button type="submit" class="btn small on" disabled={!text.trim()}>
                Ask
              </button>
            )}
          </form>
          {aiReady && (
            <label class="brix-ai small muted">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi((e.target as HTMLInputElement).checked)}
              />{' '}
              Ask Claude (uses your AI builder settings)
            </label>
          )}
        </aside>
      )}
      {show && <ShowMe c={c} key={show.key} steps={show.steps} onDone={() => setShow(null)} />}
    </>
  );
}

type Box = { x: number; y: number; w: number; h: number };
const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
/** where the callout's arrow sits, kept on the callout */
const arrow = (b: Box, left: number) => `${Math.max(18, Math.min(302, b.x + b.w / 2 - left))}px`;
/** Scrolls the panel the control sits in so it shows in the middle (never the page itself). */
function centerIn(el: HTMLElement) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) {
      const r = el.getBoundingClientRect();
      const box = p.getBoundingClientRect();
      p.scrollTop += r.top + r.height / 2 - (box.top + box.height / 2);
      return;
    }
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(find: () => HTMLElement | null, ms: number, alive: () => boolean): Promise<HTMLElement | null> {
  const end = Date.now() + ms;
  for (;;) {
    const el = find();
    if (el || Date.now() > end || !alive()) return el;
    await sleep(80);
  }
}

/**
 * The Show me overlay: a ring around the control, a callout with what Brix is doing and an arrow, and a
 * pointer that glides to each control and presses it. Steps that are already done are skipped.
 */
export function ShowMe({ c, steps, onDone }: { c: ActionCtx; steps: ShowStep[]; onDone(): void }) {
  const [i, setI] = useState(0);
  const [say, setSay] = useState(steps[0]?.say ?? '');
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [clicking, setClicking] = useState(false);
  const [end, setEnd] = useState<'pointing' | 'missing' | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void (async () => {
      for (let k = 0; k < steps.length && alive.current; k++) {
        const s = steps[k]!;
        const last = k === steps.length - 1;
        if (!last && s.done?.(c)) continue;
        setI(k);
        setSay(s.say);
        const found = await waitFor(s.find, s.press || last ? 2500 : 300, () => alive.current);
        if (!alive.current) return;
        if (!found) {
          if (s.run) {
            setEl(null);
            s.run(c);
            await sleep(500);
            continue;
          }
          if (last) setEnd('missing');
          continue;
        }
        centerIn(found);
        setEl(found);
        const b = boxOf(found);
        setCursor({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        await sleep(last ? 300 : 1000);
        if (!alive.current) return;
        if (s.press && !last) {
          setClicking(true);
          await sleep(220);
          found.click();
          setClicking(false);
          await sleep(450);
        } else if (last) {
          setEnd('pointing');
        }
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  // follow the control as the layout moves
  useEffect(() => {
    if (!el) {
      setBox(null);
      return;
    }
    const read = () => (el.isConnected ? setBox(boxOf(el)) : setBox(null));
    read();
    const h = setInterval(read, 200);
    return () => clearInterval(h);
  }, [el]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDone();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const entry = steps[steps.length - 1]?.entry ? helpEntry(steps[steps.length - 1]!.entry!) : null;
  const below = !box || box.y + box.h + 270 < window.innerHeight;
  const left = box ? Math.max(12, Math.min(window.innerWidth - 332, box.x + box.w / 2 - 160)) : 0;
  const pad = 6;
  return (
    <div class="brix-show" data-tour="brix-show">
      {box && (
        <div
          class="tut-spot brix-ring"
          style={{
            left: `${box.x - pad}px`,
            top: `${box.y - pad}px`,
            width: `${box.w + pad * 2}px`,
            height: `${box.h + pad * 2}px`,
          }}
        />
      )}
      {cursor && end !== 'pointing' && (
        <div
          class={`tut-ghost ${clicking ? 'click' : ''}`}
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          aria-hidden="true"
        >
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <path
              d="M4 2 L4 22 L9 17 L13 26 L17 24 L13 15 L21 15 Z"
              fill="#fff"
              stroke="#111"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <span class="tut-ripple" />
        </div>
      )}
      <section
        class={`brix-callout ${below ? 'below' : 'above'} ${box ? '' : 'center'}`}
        role="dialog"
        aria-label="Brix shows you"
        data-help="shell.brix.show"
        style={
          box
            ? below
              ? { left: `${left}px`, top: `${box.y + box.h + 14}px`, '--arrow': arrow(box, left) }
              : {
                  left: `${left}px`,
                  top: `${Math.max(8, box.y - 14)}px`,
                  transform: 'translateY(-100%)',
                  '--arrow': arrow(box, left),
                }
            : {}
        }
      >
        <header>
          <BrixMascot size={22} />
          <span class="muted small">
            Step {i + 1} of {steps.length}
          </span>
        </header>
        {end === 'pointing' && entry ? (
          <>
            <p>
              <b>{entry.name}</b> — {entry.purpose}
            </p>
            {steps[steps.length - 1]!.say !== entry.purpose && <p>{steps[steps.length - 1]!.say}</p>}
            {entry.steps?.[0] && <p class="muted small">Next: {entry.steps[0]}</p>}
          </>
        ) : end === 'missing' && entry ? (
          <p>
            {entry.name} isn’t on screen right now. {entry.steps?.[0] ?? ''}
          </p>
        ) : (
          <p>{say}</p>
        )}
        <div class="row">
          <button type="button" class="btn small on" onClick={onDone}>
            {end ? 'Done' : 'Stop'}
          </button>
          {end && entry && (
            <button
              type="button"
              class="btn small"
              onClick={() => {
                onDone();
                c.ui.help(entryPageId(entry.id));
              }}
            >
              Read more
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
