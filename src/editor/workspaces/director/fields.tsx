import type { ComponentChildren } from 'preact';

/** Small form helpers for the Director panels (commit on change, like the rest of the editor). */
export function NumIn({
  label,
  value,
  step = 0.1,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="dr-f">
      <span>{label}</span>
      <input
        class="inp mono"
        type="number"
        aria-label={label}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        value={Math.round(value * 1000) / 1000}
        onChange={(e) => {
          const n = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(n)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)));
        }}
      />
    </label>
  );
}

export function TextIn({
  label,
  value,
  onChange,
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is one of two elements below
    <label class="dr-f">
      <span>{label}</span>
      {area ? (
        <textarea
          class="inp"
          rows={3}
          aria-label={label}
          value={value}
          onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        />
      ) : (
        <input
          class="inp"
          aria-label={label}
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        />
      )}
    </label>
  );
}

export function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label class="dr-f">
      <span>{label}</span>
      <select
        class="inp"
        aria-label={label}
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      >
        {options.map((o) => (
          <option value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="row small">
      <input type="checkbox" checked={value} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      {label}
    </label>
  );
}

export function Vec({
  label,
  value,
  onChange,
}: {
  label: string;
  value: readonly number[];
  onChange: (v: [number, number, number]) => void;
}) {
  return (
    <div class="dr-f">
      <span>{label}</span>
      <div class="grid3">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <input
            class="inp mono"
            type="number"
            step={0.5}
            aria-label={`${label} ${a}`}
            value={Math.round((value[i] ?? 0) * 100) / 100}
            onChange={(e) => {
              const n = Number((e.target as HTMLInputElement).value);
              if (!Number.isFinite(n)) return;
              const v = [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0] as [number, number, number];
              v[i] = n;
              onChange(v);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Sec({
  title,
  children,
  extra,
}: {
  title: string;
  children: ComponentChildren;
  extra?: ComponentChildren;
}) {
  return (
    <div class="sec">
      <div class="sech">
        <span>{title}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}
