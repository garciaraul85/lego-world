import { useState } from 'preact/hooks';

export type Choice = { value: string; label: string; note?: string };
const TYPE = '__type__';

/**
 * P32: a value picked from what the project has (placed objects, an asset's states, asset names) — or typed,
 * for a name that is not there yet. “Type a name…” turns the list into a text box; Enter keeps it, Esc goes back.
 * A value that is in no option still shows (marked “not found”), so a typo is visible.
 */
export function ChoiceOrText({
  label,
  value,
  choices,
  onChange,
  tour,
  disabled,
  empty = 'choose…',
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (v: string) => void;
  tour?: string;
  disabled?: boolean;
  empty?: string;
}) {
  const [typing, setTyping] = useState(false);
  if (typing)
    return (
      <input
        class="inp"
        aria-label={`${label} (type a name)`}
        data-tour={tour ? `${tour}-text` : undefined}
        // biome-ignore lint/a11y/noAutofocus: the box appears because the person asked to type a name now
        autoFocus
        defaultValue={value}
        onKeyDown={(e) => {
          const t = e.target as HTMLInputElement;
          if (e.key === 'Enter') {
            if (t.value.trim()) onChange(t.value.trim());
            setTyping(false);
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            setTyping(false);
          }
        }}
        onBlur={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (v && v !== value) onChange(v);
          setTyping(false);
        }}
      />
    );
  const known = choices.some((c) => c.value === value);
  return (
    <select
      class="inp"
      aria-label={label}
      data-tour={tour}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === TYPE) setTyping(true);
        else onChange(v);
      }}
    >
      {!value && <option value="">{empty}</option>}
      {value && !known && <option value={value}>{value} (not found)</option>}
      {choices.map((c) => (
        <option value={c.value} title={c.note}>
          {c.note ? `${c.label} — ${c.note}` : c.label}
        </option>
      ))}
      <option value={TYPE}>＋ Type a name…</option>
    </select>
  );
}
