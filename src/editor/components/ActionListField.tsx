import type { Action } from '../../core/schema';

/** The action kinds a designer can pick, with what each needs. Shared by assets, zones, screens and logic. */
const KINDS: { do: Action['do']; label: string; make: () => Action }[] = [
  { do: 'setState', label: 'Set state', make: () => ({ do: 'setState', state: 'default' }) },
  { do: 'emit', label: 'Send event', make: () => ({ do: 'emit', event: 'event' }) },
  { do: 'give', label: 'Give item', make: () => ({ do: 'give', item: 'coin', count: 1 }) },
  { do: 'addVar', label: 'Add to variable', make: () => ({ do: 'addVar', var: 'score', value: 1 }) },
  { do: 'setVar', label: 'Set variable', make: () => ({ do: 'setVar', var: 'flag', value: true }) },
  { do: 'wait', label: 'Wait', make: () => ({ do: 'wait', seconds: 1 }) },
];

/**
 * Edits an ActionList. `states` fills the Set state picker. Actions whose systems arrive in later
 * phases (screens, sounds, music, cinematics, travel) are kept and shown but not offered here yet.
 */
export function ActionListField({
  value,
  onChange,
  states,
}: {
  value: Action[];
  onChange: (next: Action[]) => void;
  states: string[];
}) {
  const set = (i: number, a: Action) => onChange(value.map((x, j) => (j === i ? a : x)));
  return (
    <div class="actions-field">
      {value.map((a, i) => (
        <div class="action-row">
          <span class="mono small muted">{i + 1}</span>
          {KINDS.some((k) => k.do === a.do) ? (
            <select
              class="inp"
              aria-label="Action"
              value={a.do}
              onChange={(e) => set(i, KINDS.find((k) => k.do === (e.target as HTMLSelectElement).value)!.make())}
            >
              {KINDS.map((k) => (
                <option value={k.do}>{k.label}</option>
              ))}
            </select>
          ) : (
            <span class="chip">{a.do}</span>
          )}
          <ActionArgs a={a} states={states} onChange={(n) => set(i, n)} />
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

function ActionArgs({ a, states, onChange }: { a: Action; states: string[]; onChange: (a: Action) => void }) {
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
    default:
      return <span class="muted small">kept as is</span>;
  }
}
