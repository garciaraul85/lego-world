import { useState } from 'preact/hooks';
import { describeUse, type EventUse } from '../events';
import { SearchSelect } from './SearchBox';

const NEW = '__new__';

/**
 * P32: picks a custom event from the names the project already uses (so a sender and the logic that listens
 * agree on the spelling), or types a new one: “New event…” turns the list into a text box; Enter keeps the
 * name, Esc goes back to the list.
 */
export function EventPicker({
  value,
  events,
  onChange,
  label = 'Event name',
  uses,
}: {
  value: string;
  events: readonly string[];
  onChange: (event: string) => void;
  label?: string;
  /** P32: who sends and who listens to each name, shown next to it in the list */
  uses?: Map<string, EventUse>;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const list = [...new Set([...events, ...(value ? [value] : [])])].sort((a, b) => a.localeCompare(b));
  // the box's own text: a script may type and press Enter before the next redraw
  const keep = (text = draft) => {
    const name = text.trim().slice(0, 60);
    if (name) onChange(name);
    setTyping(false);
    setDraft('');
  };
  if (typing)
    return (
      <input
        class="inp"
        aria-label={`New ${label.toLowerCase()}`}
        placeholder="e.g. door-opened"
        // biome-ignore lint/a11y/noAutofocus: the box appears because the person asked to type a name now
        autoFocus
        value={draft}
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') keep((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') {
            e.stopPropagation();
            setTyping(false);
          }
        }}
        onBlur={(e) => keep((e.target as HTMLInputElement).value)}
      />
    );
  return (
    <SearchSelect label="events">
      <select
        class="inp"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v === NEW) {
            setDraft('');
            setTyping(true);
          } else if (v) onChange(v);
        }}
      >
        {!value && <option value="">choose…</option>}
        {list.map((ev) => {
          const u = uses?.get(ev);
          const note = u ? describeUse(u) : '';
          return (
            <option value={ev} title={note}>
              {note ? `${ev} — ${note.length > 70 ? `${note.slice(0, 69)}…` : note}` : ev}
            </option>
          );
        })}
        <option value={NEW}>＋ New event…</option>
      </select>
    </SearchSelect>
  );
}

/** ▶ next to a sound or music picker: plays it once so you can hear what you picked. */
export function ListenButton({ name, onPlay }: { name: string; onPlay: () => void }) {
  return (
    <button
      type="button"
      class="btn icon listen"
      aria-label={`Listen to ${name}`}
      data-tip={`Listen to ${name}`}
      onClick={(e) => {
        e.preventDefault();
        onPlay();
      }}
    >
      ▶
    </button>
  );
}
