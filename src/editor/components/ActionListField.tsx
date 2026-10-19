import type { Action } from '../../core/schema';
import { EventPicker, ListenButton } from './EventPicker';

export type Choice = { id: string; name: string };
/** Pickers for sound / music / screen actions (from AudioFields.actionChoices). */
export type ActionChoices = {
  sounds: Choice[];
  music: Choice[];
  screens: Choice[];
  cinematics: Choice[];
  /** P22: the game's conversations (Start conversation) */
  conversations?: Choice[];
  /** P23: effects (built-in and the game's own), and the effects placed on maps (by name) */
  effects?: Choice[];
  placedEffects?: string[];
  /** P32: custom event names the project uses (Send event picks from them) */
  events?: string[];
  /** P32: plays a sound or a music state once, for the ▶ next to their pickers */
  preview?: { sound(id: string): void; music(id: string | null): void };
};

/** The action kinds a designer can pick, with what each needs. Shared by assets, zones, screens and logic. */
const KINDS: { do: Action['do']; label: string; make: (c?: ActionChoices) => Action; needs?: keyof ActionChoices }[] = [
  { do: 'setState', label: 'Set state', make: () => ({ do: 'setState', state: 'default' }) },
  { do: 'emit', label: 'Send event', make: () => ({ do: 'emit', event: 'event' }) },
  { do: 'give', label: 'Give item', make: () => ({ do: 'give', item: 'coin', count: 1 }) },
  { do: 'message', label: 'Show message', make: () => ({ do: 'message', text: 'Hello!', seconds: 3 }) },
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
  // P26: saving
  { do: 'save', label: 'Save game', make: () => ({ do: 'save' }) },
  { do: 'load', label: 'Load game', make: () => ({ do: 'load' }) },
  { do: 'checkpoint', label: 'Set checkpoint', make: () => ({ do: 'checkpoint' }) },
  // P26 part 2
  { do: 'achieve', label: 'Unlock achievement', make: () => ({ do: 'achieve', id: 'goal-1' }) },
  { do: 'setting', label: 'Change a player setting', make: () => ({ do: 'setting', key: 'music' }) },
  // P6.4
  {
    do: 'cinematic',
    label: 'Play cinematic',
    needs: 'cinematics',
    make: (c) => ({ do: 'cinematic', cinematic: (c?.cinematics[0]?.id ?? 'cin_none000000') as never, once: true }),
  },
  // P22 part 2
  { do: 'xp', label: 'Give experience', make: () => ({ do: 'xp', amount: 10 }) },
  { do: 'outfit', label: 'Change outfit', make: () => ({ do: 'outfit', name: '' }) },
  // P23
  {
    do: 'effect',
    label: 'Play effect',
    needs: 'effects',
    make: (c) => ({ do: 'effect', effect: (c?.effects?.[0]?.id ?? 'fx_sparks0001') as never }),
  },
  {
    do: 'effectOn',
    label: 'Start or stop a placed effect',
    make: (c) => ({ do: 'effectOn', name: c?.placedEffects?.[0] ?? 'Effect 1', on: true }),
  },
  // P22
  {
    do: 'talk',
    label: 'Start conversation',
    needs: 'conversations',
    make: (c) => ({ do: 'talk', conversation: (c?.conversations?.[0]?.id ?? 'dlg_none000000') as never }),
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
  const kinds = KINDS.filter(
    (k) =>
      !k.needs ||
      (choices &&
        (k.needs === 'cinematics'
          ? choices.cinematics.length
          : k.needs === 'conversations'
            ? choices.conversations?.length
            : k.needs === 'effects'
              ? choices.effects?.length
              : true)),
  );
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
      return choices?.events ? (
        <EventPicker value={a.event} events={choices.events} onChange={(event) => onChange({ ...a, event })} />
      ) : (
        text(a.event, 'Event name', (event) => ({ ...a, event }))
      );
    case 'message':
      return (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {text(a.text, 'Message', (t) => ({ ...a, text: t.slice(0, 200) }))}
          {num(a.seconds ?? 3, 'Seconds', (seconds) => ({ ...a, seconds: Math.min(30, Math.max(0.5, seconds)) }))}
        </span>
      );
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
      return choices ? (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {pick(a.event, 'Sound', choices.sounds, (event) => ({ ...a, event: event as never }))}
          {choices.preview && (
            <ListenButton
              name={choices.sounds.find((s) => s.id === a.event)?.name ?? 'this sound'}
              onPlay={() => choices.preview!.sound(a.event)}
            />
          )}
        </span>
      ) : null;
    case 'music':
      return choices ? (
        <span class="row" style={{ flexWrap: 'nowrap' }}>
          {pick(a.music, 'Music', choices.music, (m) => ({ ...a, music: (m || null) as never }), 'Silence')}
          {choices.preview && a.music && (
            <ListenButton
              name={choices.music.find((s) => s.id === a.music)?.name ?? 'this music'}
              onPlay={() => choices.preview!.music(a.music)}
            />
          )}
        </span>
      ) : null;
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
          <option value="continue">Continue (load the newest save)</option>
          <option value="saveMenu">Open the save slots (save)</option>
          <option value="loadMenu">Open the save slots (load)</option>
          <option value="finish">Finish the game</option>
          <option value="newGamePlus">New game plus</option>
          <option value="settingsMenu">Open Settings</option>
          <option value="achievementsMenu">Open Achievements</option>
        </select>
      );
    case 'xp':
      return num(a.amount, 'Experience', (amount) => ({ ...a, amount: Math.round(amount) }));
    case 'outfit':
      return (
        <input
          class="inp"
          aria-label="Outfit name"
          placeholder="own clothes"
          value={a.name}
          onChange={(e) => onChange({ ...a, name: (e.target as HTMLInputElement).value.trim().slice(0, 40) })}
        />
      );
    case 'effect':
      return (
        <span class="row" style={{ gap: '4px', flexWrap: 'wrap' }}>
          {pick(a.effect, 'Effect', choices?.effects ?? [], (effect) => ({ ...a, effect: effect as never }))}
          <input
            class="inp"
            aria-label="Where"
            placeholder="at the hero"
            title="Empty: at the hero; self: at this object; or the name of an object, neighbour or placed effect"
            value={a.at ?? ''}
            onChange={(e) => {
              const at = (e.target as HTMLInputElement).value.trim().slice(0, 60);
              const { at: _x, ...rest } = a;
              onChange(at ? { ...rest, at } : rest);
            }}
          />
        </span>
      );
    case 'effectOn':
      return (
        <span class="row" style={{ gap: '4px' }}>
          <select
            class="inp"
            aria-label="Start or stop"
            value={a.on ? 'on' : 'off'}
            onChange={(e) => onChange({ ...a, on: (e.target as HTMLSelectElement).value === 'on' })}
          >
            <option value="on">Start</option>
            <option value="off">Stop</option>
          </select>
          <input
            class="inp"
            aria-label="Placed effect"
            list="placed-effects"
            value={a.name}
            onChange={(e) =>
              onChange({ ...a, name: (e.target as HTMLInputElement).value.trim().slice(0, 60) || a.name })
            }
          />
          <datalist id="placed-effects">
            {(choices?.placedEffects ?? []).map((n) => (
              <option value={n} />
            ))}
          </datalist>
        </span>
      );
    case 'talk':
      return pick(a.conversation, 'Conversation', choices?.conversations ?? [], (conversation) => ({
        ...a,
        conversation: conversation as never,
      }));
    case 'save':
    case 'load':
      return (
        <select
          class="inp"
          aria-label={a.do === 'save' ? 'Save to slot' : 'Load slot'}
          value={a.slot === undefined ? '' : String(a.slot)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            const { slot: _s, ...rest } = a;
            onChange(v === '' ? (rest as Action) : ({ ...a, slot: Number(v) } as Action));
          }}
        >
          <option value="">{a.do === 'save' ? 'the slot in use' : 'the newest save'}</option>
          {a.do === 'load' && <option value="0">Autosave</option>}
          {[1, 2, 3].map((n) => (
            <option value={String(n)}>Slot {n}</option>
          ))}
        </select>
      );
    case 'slot':
      return num(a.slot, 'Slot', (slot) => ({ ...a, slot: Math.min(3, Math.max(1, Math.round(slot))) }));
    case 'checkpoint':
      return <span class="muted small">where the hero stands now</span>;
    case 'achieve':
      return text(a.id, 'Achievement id', (id) => ({ ...a, id: id.trim().toLowerCase() }));
    case 'setting':
      return (
        <select
          class="inp"
          aria-label="Player setting"
          value={a.key}
          onChange={(e) => onChange({ do: 'setting', key: (e.target as HTMLSelectElement).value as typeof a.key })}
        >
          <option value="music">Music volume (next step)</option>
          <option value="sounds">Sound volume (next step)</option>
          <option value="cameraSpeed">Camera speed (next step)</option>
          <option value="invertY">Invert camera (on/off)</option>
          <option value="textSize">Text size (normal/large)</option>
          <option value="difficulty">Difficulty (story/normal/hard)</option>
        </select>
      );
    default:
      return <span class="muted small">kept as is</span>;
  }
}
