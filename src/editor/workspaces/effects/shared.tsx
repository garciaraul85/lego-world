import type { ActionCtx } from '../../actions/registry';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Particles (things in the world) or Screen (the whole view) */
export function EffectsTabs({ ed }: { ed: ActionCtx['ed'] }) {
  const tab = ed.effectsTab.value;
  return (
    <div class="ptabs" role="tablist" aria-label="Kind of effect">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'particles'}
        class={`tab ${tab === 'particles' ? 'on' : ''}`}
        data-tour="fx-tab-particles"
        onClick={() => (ed.effectsTab.value = 'particles')}
      >
        Particles
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'screen'}
        class={`tab ${tab === 'screen' ? 'on' : ''}`}
        data-tour="fx-tab-screen"
        onClick={() => (ed.effectsTab.value = 'screen')}
      >
        Screen
      </button>
    </div>
  );
}

export function Num({
  label,
  value,
  lo,
  hi,
  step = 0.1,
  onSet,
}: {
  label: string;
  value: number;
  lo: number;
  hi: number;
  step?: number;
  onSet(v: number): void;
}) {
  return (
    <label class="field">
      {label}
      <input
        class="inp mono"
        type="number"
        aria-label={label}
        key={String(value)}
        defaultValue={String(value)}
        min={lo}
        max={hi}
        step={step}
        onChange={(e) => {
          const n = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(n)) onSet(r2(clamp(n, lo, hi)));
        }}
      />
    </label>
  );
}
