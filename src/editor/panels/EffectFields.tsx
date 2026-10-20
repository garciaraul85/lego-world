import type { EffectInstance } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { Header, Num, TextField } from '../components/fields';
import { EffectThumb } from '../components/previews';
import { allEffects } from '../workspaces/effects/EffectsStudio';

/** P23: an effect placed on the map, selected in the Scene: which effect, size, tint, when it plays. */
export function EffectInspector({ c, item: it }: { c: ActionCtx; item: EffectInstance }) {
  const { ed } = c;
  const map = ed.mapId.value;
  const patch = (p: Partial<EffectInstance>) =>
    ed.exec({ type: 'item.update', payload: { map, id: it.id, patch: p } }, { label: 'Edit effect' });
  const { own, builtin } = allEffects(ed.store);
  const def = [...own, ...builtin].find((e) => e.id === it.effect);
  return (
    <>
      <Header
        title={it.name ?? 'Effect'}
        sub={`Effect · ${def?.name ?? 'missing'} · ${def?.mode ?? ''}`}
        color="#ff8a3d"
      />
      <div class="sec" data-help="scene.item.effect">
        <div class="field">
          Name
          <TextField
            label="Effect name"
            value={it.name ?? ''}
            onCommit={(name) => patch({ name: name.slice(0, 60) })}
          />
        </div>
        <label class="field">
          Effect
          <span class="row pv-row">
            <select
              class="inp"
              aria-label="Which effect"
              data-tour="item-effect"
              value={it.effect}
              onChange={(e) => patch({ effect: (e.target as HTMLSelectElement).value as EffectInstance['effect'] })}
            >
              {own.length > 0 && (
                <optgroup label="This game’s">
                  {own.map((e) => (
                    <option value={e.id}>{e.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Built-in">
                {builtin.map((e) => (
                  <option value={e.id}>{e.name}</option>
                ))}
              </optgroup>
            </select>
            {def && <EffectThumb effect={def} size={30} />}
          </span>
        </label>
        <button
          type="button"
          class="link"
          onClick={() => {
            ed.effectId.value = it.effect;
            c.ui.workspace('Effects');
          }}
        >
          Open it in Effects ↗
        </button>
        <div class="grid2">
          <Num label="Size ×" value={it.scale} onCommit={(v) => patch({ scale: Math.max(0.1, Math.min(5, v)) })} />
          <Num
            label="Plays within (studs)"
            value={it.maxDistance}
            onCommit={(v) => patch({ maxDistance: Math.max(4, Math.min(200, v)) })}
          />
        </div>
        <label class="field">
          Tint
          <span class="row" style={{ gap: '6px' }}>
            <input
              type="color"
              aria-label="Tint"
              value={it.tint ?? '#ffffff'}
              onChange={(e) => patch({ tint: (e.target as HTMLInputElement).value })}
            />
            {it.tint && (
              <button type="button" class="link" onClick={() => patch({ tint: undefined })}>
                As made
              </button>
            )}
          </span>
        </label>
        {def?.mode !== 'stream' && (
          <div class="grid2">
            <Num
              label="Every (s) from"
              value={it.interval[0]}
              onCommit={(v) => patch({ interval: [Math.max(0.1, Math.min(120, v)), it.interval[1]] })}
            />
            <Num
              label="to"
              value={it.interval[1]}
              onCommit={(v) => patch({ interval: [it.interval[0], Math.max(0.1, Math.min(120, v))] })}
            />
          </div>
        )}
        <label class="lbl">
          <input
            type="checkbox"
            data-tour="item-effect-playing"
            checked={it.playing}
            onChange={() => patch({ playing: !it.playing })}
          />{' '}
          Plays from the start (off: logic’s Start effect switches it on)
        </label>
        <p class="muted small">
          {def?.mode === 'stream'
            ? 'A stream keeps going while the hero is near.'
            : 'A burst plays again every few seconds while the hero is near.'}{' '}
          Logic and actions name it “{it.name ?? it.id}”.
        </p>
      </div>
      <div class="sec" style={{ borderBottom: 0 }}>
        <button
          type="button"
          class="btn wide danger"
          onClick={() => {
            if (ed.exec({ type: 'item.remove', payload: { map, id: it.id } }).ok) ed.selectedItem.value = null;
          }}
        >
          Delete effect
        </button>
      </div>
    </>
  );
}
