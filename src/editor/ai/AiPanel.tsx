import { useEffect, useRef, useState } from 'preact/hooks';
import { type AgentOutcome, runAgent } from '../../core/ai/agent-loop';
import { SCOPES, type Scope } from '../../core/ai/commands';
import type { Patch } from '../../core/ai/patch';
import { AiError, type AiTurn } from '../../core/ai/provider';
import { type AiSettings, loadAi, maskKey, recordSpend, saveAi } from '../../platform/ai/settings';
import type { ActionCtx } from '../actions/registry';
import { PlanView } from './PlanView';
import { artifactAvailable, pickProvider } from './providers';

type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; live?: boolean }
  | { kind: 'activity'; text: string; problem?: boolean }
  | { kind: 'question'; question: string; options: string[]; answered: boolean }
  | { kind: 'patch'; patch: Patch; status: 'review' | 'accepted' | 'rejected'; request: string }
  | { kind: 'error'; text: string }
  | { kind: 'note'; text: string };

const EXAMPLES = [
  'Add a coin counter to the HUD',
  'Make every chest give 3 coins and play a cheer',
  'Add a beach map and connect it with a gate',
  'Play a reward scene when the hero walks back to the start',
  'Make it a rainy night and turn the music down',
];
const TOOL_ICON: Record<string, string> = {
  read_project_summary: '📖',
  list_files: '🗂',
  read_file: '📄',
  search: '🔎',
  describe_command: '📘',
  propose_plan: '🧪',
  ask_user: '❓',
};

/**
 * The AI builder (P8.3): ask for a change in plain words; the AI plans it with the engine's own
 * commands (never engine code), the editor checks it with a dry run, and you review it step by step —
 * watching each step happen live in its workspace — before anything is kept.
 */
export function AiPanel({ c, onClose }: { c: ActionCtx; onClose: () => void }) {
  const { ed } = c;
  const [settings, setSettings] = useState<AiSettings>(loadAi);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [items, setItems] = useState<Item[]>([]);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [scope, setScope] = useState<Scope>('game');
  const [text, setText] = useState('');
  const [running, setRunning] = useState<AbortController | null>(null);
  const [setup, setSetup] = useState(false);
  const [artifact, setArtifact] = useState<boolean | null>(null);
  const [overCap, setOverCap] = useState<string | null>(null);
  const [min, setMin] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const reviewing = items.some((i) => i.kind === 'patch' && i.status === 'review');

  useEffect(() => {
    void artifactAvailable().then((ok) => {
      setArtifact(ok);
      if (!ok && !loadAi().apiKey && !(globalThis as { __aiFake?: unknown }).__aiFake) setSetup(true);
    });
  }, []);
  useEffect(() => {
    log.current?.scrollTo(0, log.current.scrollHeight);
  }, [items]);
  const update = (s: AiSettings) => {
    setSettings(s);
    saveAi(s);
  };
  const push = (...x: Item[]) => setItems((cur) => [...cur, ...x]);

  async function send(request: string, force = false) {
    const req = request.trim();
    if (!req || running || reviewing) return;
    const s = settingsRef.current;
    if (!force && s.dailyCap > 0 && s.spent.tokens >= s.dailyCap) {
      setOverCap(req);
      return;
    }
    setOverCap(null);
    const provider = await pickProvider(() => settingsRef.current);
    if (!provider) {
      setSetup(true);
      push({
        kind: 'error',
        text: 'Choose how the AI builder talks to Claude first: add your Anthropic API key below (it stays on this device).',
      });
      return;
    }
    const ctl = new AbortController();
    setRunning(ctl);
    setText('');
    push({ kind: 'user', text: req }, { kind: 'assistant', text: 'Thinking…', live: true });
    const setLive = (t: string) =>
      setItems((cur) => cur.map((i) => (i.kind === 'assistant' && i.live ? { ...i, text: t } : i)));
    let out: AgentOutcome | null = null;
    try {
      out = await runAgent({
        provider,
        store: ed.store,
        bus: ed.bus,
        request: req,
        scope,
        history: turns.slice(-12),
        currentMap: ed.mapId.value,
        signal: ctl.signal,
        onEvent: (e) => {
          if (e.kind === 'text') setLive(e.text);
          else
            setItems((cur) => {
              const live = cur.findIndex((i) => i.kind === 'assistant' && i.live);
              const it: Item =
                e.kind === 'problems'
                  ? { kind: 'activity', text: `The editor refused that plan:\n${e.text}`, problem: true }
                  : { kind: 'activity', text: `${TOOL_ICON[e.name] ?? '•'} ${e.detail}` };
              return live < 0 ? [...cur, it] : [...cur.slice(0, live), it, ...cur.slice(live)];
            });
        },
      });
    } catch (e) {
      const msg =
        e instanceof AiError
          ? e.code === 'cancelled'
            ? 'Stopped.'
            : e.message
          : (e as { code?: string }).code === 'cancelled'
            ? 'Stopped.'
            : `Something went wrong: ${e instanceof Error ? e.message : e}`;
      setItems((cur) => [
        ...cur
          .filter((i) => !(i.kind === 'assistant' && i.live && i.text === 'Thinking…'))
          .map((i) => (i.kind === 'assistant' && i.live ? { ...i, live: false } : i)),
        { kind: 'error', text: msg },
      ]);
      if (e instanceof AiError && e.code === 'no-key') setSetup(true);
    } finally {
      setRunning(null);
    }
    if (!out) return;
    const o = out;
    setTurns(o.turns.slice(-12));
    if (o.usage.requests) {
      const tokens = o.usage.inputTokens + o.usage.outputTokens;
      update(recordSpend(settingsRef.current, tokens, o.usage.requests));
    }
    setItems((cur) => {
      const done = cur.map((i) => (i.kind === 'assistant' && i.live ? { ...i, live: false, text: o.text || '…' } : i));
      const extra: Item[] = [];
      if (o.kind === 'patch') extra.push({ kind: 'patch', patch: o.patch, status: 'review', request: req });
      if (o.kind === 'question')
        extra.push({ kind: 'question', question: o.question, options: o.options, answered: false });
      if (o.kind === 'failed')
        extra.push({ kind: 'error', text: `No plan could pass the editor's checks:\n${o.problems}` });
      const spend = o.usage.requests
        ? `${o.usage.requests} request${o.usage.requests === 1 ? '' : 's'} · ${(o.usage.inputTokens + o.usage.outputTokens).toLocaleString('en')} tokens`
        : provider.id === 'artifact'
          ? 'Answered on your Claude plan'
          : '';
      if (spend) extra.push({ kind: 'note', text: spend });
      return [...done, ...extra];
    });
  }

  const setPatchStatus = (p: Patch, status: 'accepted' | 'rejected') =>
    setItems((cur) => cur.map((i) => (i.kind === 'patch' && i.patch === p ? { ...i, status } : i)));

  return (
    <aside class={`aip ${min ? 'min' : ''}`} aria-label="AI builder">
      <header>
        <strong>✦ AI builder</strong>
        <span class="muted small">uses only the engine's own commands · you approve every change</span>
        <button
          type="button"
          class="btn icon"
          aria-label="AI builder settings"
          aria-expanded={setup}
          onClick={() => setSetup(!setup)}
        >
          ⚙
        </button>
        <button
          type="button"
          class="btn icon"
          aria-label={min ? 'Expand the AI builder' : 'Minimize the AI builder'}
          onClick={() => setMin(!min)}
        >
          {min ? '▴' : '▾'}
        </button>
        <button type="button" class="btn icon" aria-label="Close the AI builder" disabled={!!running} onClick={onClose}>
          ✕
        </button>
      </header>
      {!min && (
        <>
          {setup && <Setup s={settings} artifact={artifact} onChange={update} />}
          <div class="aip-log" ref={log} aria-live="polite">
            {!items.length && (
              <div class="aip-intro">
                <p>
                  Describe a change to your game. The AI plans it as steps using the same commands you use in the
                  editor, the editor checks the plan, and you <strong>watch each step happen</strong> in its workspace
                  before you accept it. It never changes the engine itself.
                </p>
                <div class="aip-examples">
                  {EXAMPLES.map((e) => (
                    <button key={e} type="button" class="chip-btn" onClick={() => setText(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {items.map((it, k) => {
              switch (it.kind) {
                case 'user':
                  return (
                    <p key={k} class="aip-msg user">
                      {it.text}
                    </p>
                  );
                case 'assistant':
                  return (
                    <p key={k} class={`aip-msg ai ${it.live ? 'live' : ''}`}>
                      {it.text}
                    </p>
                  );
                case 'activity':
                  return (
                    <p key={k} class={`aip-act ${it.problem ? 'problem' : ''}`}>
                      {it.text}
                    </p>
                  );
                case 'note':
                  return (
                    <p key={k} class="aip-act muted">
                      {it.text}
                    </p>
                  );
                case 'error':
                  return (
                    <p key={k} class="aip-error" role="alert">
                      {it.text}
                    </p>
                  );
                case 'question':
                  return (
                    <div key={k} class="aip-question">
                      <strong>{it.question}</strong>
                      <div class="row">
                        {it.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            class="btn"
                            disabled={it.answered || !!running}
                            onClick={() => {
                              setItems((cur) => cur.map((x) => (x === it ? { ...it, answered: true } : x)));
                              void send(o);
                            }}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                case 'patch':
                  return it.status === 'review' ? (
                    <PlanView
                      key={k}
                      c={c}
                      patch={it.patch}
                      onDone={(kind) => setPatchStatus(it.patch, kind)}
                      onRegenerate={() => {
                        setPatchStatus(it.patch, 'rejected');
                        setTimeout(() => void send(`${it.request}\n(Try again with a different approach.)`), 0);
                      }}
                    />
                  ) : (
                    <p key={k} class={`aip-act ${it.status}`}>
                      {it.status === 'accepted'
                        ? `✓ Applied “${it.patch.summary}” — Ctrl Z undoes it.`
                        : `✕ Rejected “${it.patch.summary}”.`}
                    </p>
                  );
                default:
                  return null;
              }
            })}
          </div>
          {overCap && (
            <div class="aip-warn" role="alert">
              You have used {settings.spent.tokens.toLocaleString('en')} tokens today, over your soft cap of{' '}
              {settings.dailyCap.toLocaleString('en')}.{' '}
              <button type="button" class="link" onClick={() => void send(overCap, true)}>
                Send anyway
              </button>
            </div>
          )}
          <form
            class="aip-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <label class="row small">
              Scope
              <select
                value={scope}
                onChange={(e) => setScope((e.target as HTMLSelectElement).value as Scope)}
                aria-label="Scope"
              >
                {SCOPES.map((s) => (
                  <option key={s.id} value={s.id} title={s.hint}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              value={text}
              rows={3}
              aria-label="Ask the AI builder"
              placeholder={
                reviewing
                  ? 'Accept or reject the proposed change first'
                  : 'What should change? e.g. “Add a coin counter to the HUD”'
              }
              disabled={reviewing}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
                if (e.key === 'Escape' && running) running.abort();
              }}
            />
            <div class="row">
              {running ? (
                <button type="button" class="btn" onClick={() => running.abort()}>
                  ■ Stop
                </button>
              ) : (
                <button type="submit" class="btn on" disabled={!text.trim() || reviewing}>
                  Plan it ✦
                </button>
              )}
              <span class="muted small">
                Today: {settings.spent.tokens.toLocaleString('en')} tokens
                {settings.dailyCap ? ` of ${settings.dailyCap.toLocaleString('en')}` : ''}
              </span>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}

function Setup({
  s,
  artifact,
  onChange,
}: {
  s: AiSettings;
  artifact: boolean | null;
  onChange: (s: AiSettings) => void;
}) {
  const [key, setKey] = useState('');
  return (
    <div class="aip-setup" role="group" aria-label="AI builder settings">
      <div class="row small">
        <strong>Who answers</strong>
        <select
          aria-label="AI provider"
          value={s.provider}
          onChange={(e) =>
            onChange({ ...s, provider: (e.target as HTMLSelectElement).value as AiSettings['provider'] })
          }
        >
          <option value="auto">Automatic</option>
          <option value="artifact">Claude in this artifact {artifact === false ? '(not available here)' : ''}</option>
          <option value="anthropic-api">My Anthropic API key</option>
        </select>
      </div>
      <p class="muted small">
        {artifact
          ? 'Running as a Claude artifact: Claude answers on your own plan, no key needed (you are asked once to allow it).'
          : 'Outside Claude, use your own Anthropic API key. It is stored only in this browser — never in your project, exports or logs — and sent only to api.anthropic.com.'}
      </p>
      <div class="row small">
        <label class="row">
          API key
          <input
            type="password"
            autocomplete="off"
            aria-label="Anthropic API key"
            placeholder={s.apiKey ? maskKey(s.apiKey) : 'sk-ant-…'}
            value={key}
            onInput={(e) => setKey((e.target as HTMLInputElement).value)}
          />
        </label>
        <button
          type="button"
          class="btn"
          disabled={!key.trim()}
          onClick={() => {
            onChange({ ...s, apiKey: key.trim() });
            setKey('');
          }}
        >
          Save key
        </button>
        {s.apiKey && (
          <button type="button" class="btn" onClick={() => onChange({ ...s, apiKey: '' })}>
            Forget key
          </button>
        )}
      </div>
      <div class="row small">
        <label class="row">
          Model
          <input
            aria-label="Model"
            value={s.model}
            onChange={(e) => onChange({ ...s, model: (e.target as HTMLInputElement).value.trim() })}
          />
        </label>
        <label class="row">
          Artifact tier
          <select
            aria-label="Artifact model tier"
            value={s.tier}
            onChange={(e) => onChange({ ...s, tier: (e.target as HTMLSelectElement).value as AiSettings['tier'] })}
          >
            <option value="quick">Quick</option>
            <option value="default">Default</option>
            <option value="complex">Complex</option>
          </select>
        </label>
      </div>
      <div class="row small">
        <label class="row">
          Daily soft cap (tokens, 0 = none)
          <input
            type="number"
            min={0}
            step={10000}
            aria-label="Daily soft cap"
            value={s.dailyCap}
            onChange={(e) =>
              onChange({ ...s, dailyCap: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })
            }
          />
        </label>
        <span class="muted">
          Today: {s.spent.tokens.toLocaleString('en')} tokens in {s.spent.requests} requests
        </span>
      </div>
    </div>
  );
}
