import type { Action } from '../../core/schema';

export type Choice = { id: string; name: string };
/** Pickers for sound / music / screen actions (from AudioFields.actionChoices). */
export type ActionChoices = { sounds: Choice[]; music: Choice[]; screens: Choice[]; cinematics: Choice[] };

/** The action kinds a designer can pick, with what each needs. Shared by assets, zones, screens and logic. */
const KINDS: { do: Action['do']; label: string; make: (c?: ActionChoices) => Action; needs?: keyof ActionChoices }[] = [
  { do: 'setState', label: 'Set state', make: () => ({ do: 'setState', state: 'default' }) },
  { do: 'emit', label: 'Send event', make: () => ({ do: 'emit', event: 'event' }) },
  { do: 'give', label: 'Give item', make: () => ({ do: 'give', item: 'coin', count: 1 }) },
  { do: 'addVar', label: 'Add to variable', make: () => ({ do: 'addVar', var: 'score', value: 1 }) },
  { do: 'setVar', label: 'Set variable', make: () => ({ do: 'setVar', var: 'flag', value: true }) },
  { do: 'wait', label: 'Wait', make: () => ({ do: 'wait', seconds: 1 }) },
  // P5: audio and screens
  {
    do: 'sound',
    label: 'Play sound',
    needs: 'sounds',
    make: (c) => ({ do: 'sound', event: (c?.sounds[0]?.id ?? 'snd_uiclick000') as never }),
  },
  {
    do: 'music',
    label: 'Set music',
    needs: 'music',
    make: (c) => ({ do: 'music', music: (c?.music[0]?.id ?? null) as never }),
  },
  { do: 'stinger', label: 'Play stinger', make: () => ({ do: 'stinger', stinger: 'victory' }) },
  {
    do: 'showScreen',
    label: 'Show screen',
    needs: 'screens',
    make: (c) => ({ do: 'showScreen', screen: (c?.screens[0]?.id ?? 'scr_pause00000') as never }),
  },
  {
    do: 'hideScreen',
    label: 'Hide screen',
    needs: 'screens',
    make: (c) => ({ do: 'hideScreen', screen: (c?.screens[0]?.id ?? 'scr_pause00000') as never }),
  },
  { do: 'game', label: 'Game flow', make: () => ({ do: 'game', op: 'resume' }) },
  // P6.4
  {
    do: 'cinematic',
    label: 'Play cinematic',
    needs: 'cinematics',
    make: (c) => ({ do: 'cinematic', cinematic: (c?.cinematics[0]?.id ?? 'cin_none000000') as never, once: true }),
  },
];

/**
 * Edits an ActionList. `states` fills the Set state picker; `choices` fills the sound / music / screen
 * pickers (without it those actions are kept but not offered). Travel is kept as is.
 */
export function ActionListField({
  value,
  onChange,
  states,
  choices,
}: {
  value: Action[];
  onChange: (next: Action[]) => void;
  states: string[];
  choices?: ActionChoices;
}) {
  const kinds = KINDS.filter((k) => !k.needs || (choices && (k.needs !== 'cinematics' || choices.cinematics.length)));
  const set = (i: number, a: Action) => onChange(value.map((x, j) => (j === i ? a : x)));
  return (
    <div class="actions-field">
      {value.map((a, i) => (
        <div class="action-row">
          <span class="mono small muted">{i + 1}</span>
          {kinds.some((k) => k.do === a.do) ? (
            <select
              class="inp"
              aria-label="Action"
              value={a.do}
              onChange={(e) => set(i, kinds.find((k) => k.do === (e.target as HTMLSelectElement).value)!.make(choices))}
            >
              {kinds.map((k) => (
                <option value={k.do}>{k.label}</option>
              ))}
            </select>
          ) : (
            <span class="chip">{a.do}</span>
          )}
          <ActionArgs a={a} states={states} choices={choices} onChange={(n) => set(i, n)} />
          <button
            type="button"
            class="btn icon"
            aria-label="Remove action"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" class="btn" onClick={() => onChange([...value, KINDS[0]!.make()])}>
        + Action
      </button>
    </div>
  );
}

function ActionArgs({
  a,
  states,
  choices,
  onChange,
}: {
  a: Action;
  states: string[];
  choices?: ActionChoices | undefined;
  onChange: (a: Action) => void;
}) {
  const pick = (v: string | null, label: string, list: Choice[], put: (v: string) => Action, none?: string) => (
    <select
      class="inp"
      aria-label={label}
      value={v ?? ''}
      onChange={(e) => onChange(put((e.target as HTMLSelectElement).value))}
    >
      {none !== undefined && <option value="">{none}</option>}
      {[...list, ...(v && !list.some((x) => x.id === v) ? [{ id: v, name: v }] : [])].map((o) => (
        <option value={o.id}>{o.name}</option>
      ))}
    </select>
  );
  const text = (v: string, label: string, put: (v: string) => Action) => (
    <input
      class="inp"
      aria-label={label}
      value={v}
      onChange={(e) => {
        const t = (e.target as HTMLInputElement).value.trim();
        if (t) onChange(put(t));
      }}
    />
  );
  const num = (v: number, label: string, put: (v: number) => Action) => (
    <input
      class="inp mono"
      aria-label={label}
      inputMode="decimal"
      value={String(v)}
      onChange={(e) => {
        const n = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(n)) onChange(put(n));
      }}
    />
  );
  switch (a.do) {
    case 'setState':
      return (
        <select
          class="inp"
          aria-label="State"
          value={a.state}
          onChange={(e) => onChange({ ...a, state: (e.target as HTMLSelectElement).value })}
        >
          {[...new Set([...states, a.state])].map((s) => (
            <option value={s}>{s}</option>
          ))}
        </select>
      );
    case 'emit':
      return text(a.event, 'Event name', (event) => ({ ...a, event }));
    case 'give':
      return (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {text(a.item, 'Item', (item) => ({ ...a, item }))}
          {num(a.count ?? 1, 'Count', (count) => ({ ...a, count: Math.max(1, Math.round(count)) }))}
        </span>
      );
    case 'addVar':
      return (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {text(a.var, 'Variable', (v) => ({ ...a, var: v }))}
          {num(a.value, 'Amount', (value) => ({ ...a, value }))}
        </span>
      );
    case 'setVar':
      return (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {text(a.var, 'Variable', (v) => ({ ...a, var: v }))}
          {text(JSON.stringify(a.value), 'Value', (raw) => {
            let value: unknown = raw;
            try {
              value = JSON.parse(raw);
            } catch {
              /* plain text */
            }
            return { ...a, value };
          })}
        </span>
      );
    case 'wait':
      return num(a.seconds, 'Seconds', (seconds) => ({ ...a, seconds: Math.max(0, seconds) }));
    case 'sound':
      return choices ? pick(a.event, 'Sound', choices.sounds, (event) => ({ ...a, event: event as never })) : null;
    case 'music':
      return choices
        ? pick(a.music, 'Music', choices.music, (m) => ({ ...a, music: (m || null) as never }), 'Silence')
        : null;
    case 'stinger':
      return text(a.stinger, 'Stinger', (stinger) => ({ ...a, stinger }));
    case 'showScreen':
    case 'hideScreen':
      return choices
        ? pick(a.screen, 'Screen', choices.screens, (screen) => ({ ...a, screen: screen as never }))
        : null;
    case 'cinematic':
      return choices ? (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {pick(a.cinematic, 'Cinematic', choices.cinematics, (cinematic) => ({ ...a, cinematic: cinematic as never }))}
          <label class="row small" title="Only the first time in a playthrough">
            <input
              type="checkbox"
              checked={!!a.once}
              onChange={(e) => onChange({ ...a, once: (e.target as HTMLInputElement).checked })}
            />
            once
          </label>
        </span>
      ) : null;
    case 'game':
      return (
        <select
          class="inp"
          aria-label="Game flow"
          value={a.op}
          onChange={(e) => onChange({ ...a, op: (e.target as HTMLSelectElement).value as typeof a.op })}
        >
          <option value="start">Start the game (HUD)</option>
          <option value="resume">Resume (close pause)</option>
          <option value="pause">Pause</option>
          <option value="retry">Retry from checkpoint</option>
          <option value="quit">Quit to title</option>
        </select>
      );
    default:
      return <span class="muted small">kept as is</span>;
  }
}
