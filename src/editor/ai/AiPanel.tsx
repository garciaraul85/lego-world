import { useEffect, useRef, useState } from 'preact/hooks';
import { type AgentOutcome, runAgent } from '../../core/ai/agent-loop';
import { SCOPES, type Scope } from '../../core/ai/commands';
import type { Patch } from '../../core/ai/patch';
import { AiError, type AiTurn } from '../../core/ai/provider';
import { type KeyMode, lockKey, unlockKey } from '../../platform/ai/keys';
import { type AiSettings, gameSpent, loadAi, maskKey, recordSpend, saveAi } from '../../platform/ai/settings';
import type { ActionCtx } from '../actions/registry';
import { Rich } from '../components/Rich';
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
export function AiPanel({
  c,
  prompt,
  onClose,
}: {
  c: ActionCtx;
  /** P19: a request Brix handed over, typed into the box for you to read and send */
  prompt?: { text: string; key: number } | null;
  onClose: () => void;
}) {
  const { ed } = c;
  const [settings, setSettings] = useState<AiSettings>(loadAi);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [items, setItems] = useState<Item[]>([]);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [scope, setScope] = useState<Scope>('game');
  const [text, setText] = useState(prompt?.text ?? '');
  useEffect(() => {
    if (prompt) setText(prompt.text);
  }, [prompt?.key]);
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
    const game = ed.store.manifest.id;
    if (
      !force &&
      ((s.dailyCap > 0 && s.spent.tokens >= s.dailyCap) || (s.gameCap > 0 && gameSpent(s, game) >= s.gameCap))
    ) {
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
      update(recordSpend(settingsRef.current, tokens, o.usage.requests, ed.store.manifest.id));
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
                      <Rich text={it.text} />
                    </p>
                  );
                case 'activity':
                  return (
                    <p key={k} class={`aip-act ${it.problem ? 'problem' : ''}`}>
                      <Rich text={it.text} />
                    </p>
                  );
                case 'note':
                  return (
                    <p key={k} class="aip-act muted">
                      <Rich text={it.text} />
                    </p>
                  );
                case 'error':
                  return (
                    <p key={k} class="aip-error" role="alert">
                      <Rich text={it.text} />
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

/** P33: the key, and how it is kept: locked with a passphrase, this session only, or plain (not recommended) */
function KeyFields({ s, onChange }: { s: AiSettings; onChange: (s: AiSettings) => void }) {
  const [key, setKey] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const lockedWaiting = s.keyMode === 'locked' && !!s.locked && !s.apiKey;
  const save = async () => {
    const k = key.trim();
    if (!k) return;
    if (s.keyMode === 'locked') {
      try {
        const locked = await lockKey(k, pass);
        onChange({ ...s, apiKey: k, locked });
        setMsg('Key locked with your passphrase. Next time, type the passphrase to unlock it.');
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
        return;
      }
    } else {
      const { locked: _l, ...rest } = s;
      onChange({ ...rest, apiKey: k });
      setMsg(s.keyMode === 'session' ? 'Key kept for this session only.' : 'Key stored in this browser.');
    }
    setKey('');
    setPass('');
  };
  return (
    <div class="aip-keys" role="group" aria-label="API key" data-tour="ai-key" data-help="ai.lock">
      <div class="row small">
        <strong>Keep the key</strong>
        <select
          aria-label="How the key is kept"
          value={s.keyMode}
          onChange={(e) => {
            const keyMode = (e.target as HTMLSelectElement).value as KeyMode;
            const { locked: _l, ...rest } = s;
            // changing how it is kept starts over: the key is typed again (and locked, for locked)
            onChange({ ...rest, keyMode, apiKey: keyMode === s.keyMode ? s.apiKey : '' });
            setMsg('');
          }}
        >
          <option value="locked">Locked with a passphrase (recommended)</option>
          <option value="session">This session only (don't remember)</option>
          <option value="plain">Remembered unlocked on this device</option>
        </select>
      </div>
      {lockedWaiting ? (
        <div class="row small">
          <label class="row">
            Passphrase
            <input
              type="password"
              autocomplete="off"
              aria-label="Passphrase"
              value={pass}
              onInput={(e) => setPass((e.target as HTMLInputElement).value)}
            />
          </label>
          <button
            type="button"
            class="btn"
            disabled={!pass}
            onClick={async () => {
              const k = await unlockKey(s.locked!, pass);
              if (!k) return setMsg('That passphrase does not unlock the key.');
              onChange({ ...s, apiKey: k });
              setPass('');
              setMsg('Key unlocked for this page.');
            }}
          >
            Unlock key
          </button>
          <button
            type="button"
            class="btn"
            onClick={() => {
              const { locked: _l, ...rest } = s;
              onChange({ ...rest, apiKey: '' });
            }}
          >
            Forget key
          </button>
        </div>
      ) : (
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
          {s.keyMode === 'locked' && (
            <label class="row">
              Passphrase
              <input
                type="password"
                autocomplete="off"
                aria-label="New passphrase"
                placeholder="8 characters or more"
                value={pass}
                onInput={(e) => setPass((e.target as HTMLInputElement).value)}
              />
            </label>
          )}
          <button
            type="button"
            class="btn"
            disabled={!key.trim() || (s.keyMode === 'locked' && pass.length < 8)}
            onClick={() => void save()}
          >
            Save key
          </button>
          {(s.apiKey || s.locked) && (
            <button
              type="button"
              class="btn"
              onClick={() => {
                const { locked: _l, ...rest } = s;
                onChange({ ...rest, apiKey: '' });
              }}
            >
              Forget key
            </button>
          )}
        </div>
      )}
      {s.keyMode === 'plain' && s.apiKey && (
        <p class="muted small">
          This key is stored unlocked in this browser: anyone using this computer, or a backup of it, can read it. Lock
          it with a passphrase above.
        </p>
      )}
      {msg && <p class="small">{msg}</p>}
    </div>
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
          : 'Outside Claude, use your own Anthropic API key. Lock it with a passphrase, or keep it for this session only. It is never in your project, exports, saves or logs, and this page may send it only to api.anthropic.com.'}
      </p>
      <KeyFields s={s} onChange={onChange} />
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
      <div class="row small">
        <label class="row">
          Cap per game (tokens a day, 0 = none)
          <input
            type="number"
            min={0}
            step={10000}
            aria-label="Cap per game"
            value={s.gameCap}
            onChange={(e) =>
              onChange({ ...s, gameCap: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })
            }
          />
        </label>
      </div>
    </div>
  );
}
