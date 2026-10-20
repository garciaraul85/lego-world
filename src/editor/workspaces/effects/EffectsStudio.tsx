import { useRef, useState } from 'preact/hooks';
import { BUILTIN_EFFECTS, DEFAULT_EFFECT_EVENTS, DEFAULT_HITS } from '../../../builtin/effects';
import { DAMAGE_TYPES } from '../../../core/combat/damage';
import {
  DIRECTIONS,
  EFFECT_EVENTS,
  type Effect,
  type EffectHooks,
  EVENT_INFO,
  PARTICLE_SHAPES,
  SPAWN_SHAPES,
} from '../../../core/effects/schema';
import { newId } from '../../../core/ids';
import { paths } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { FieldHelp } from '../../components/fields';
import { EffectThumb } from '../../components/previews';
import { placeEffectAt } from '../../interact/place';
import { EffectPreview } from './EffectPreview';

/**
 * P23 part 1: the Effects screen — the built-in library and the game's own effects, a live preview, the
 * effect's settings (simple: shape, colours, size, amount, speed; Advanced: every one), and which effect
 * plays for hits by damage type and for things that happen. Built-in effects are copied to be changed.
 * Each edit is one effect.put (or project.update), one undo step.
 */
export const EFFECTS_HELP = {
  library:
    'Effects are particles made of tiny bricks, plates, tiles and studs. The built-in ones are ready to use; Make a copy to change one, or + New effect to start from sparks.',
  settings:
    'Shape and colours (colour over life: first at birth, last at death), size, amount and speed. Advanced shows every setting: burst or stream, where they start, which way they fly, life, gravity, drag and bouncing off bricks.',
  hooks:
    'Which effect plays when something is hit (by its damage type: a sword slashes, a hammer is blunt, a bomb explosive…) and when things happen: a level up, healing, picking up treasure, bricks breaking, an enemy beaten.',
} as const;

const SHAPE_LABEL: Record<Effect['shape'], string> = { brick: 'Bricks', plate: 'Plates', tile: 'Tiles', stud: 'Studs' };
const DAMAGE_LABEL: Record<(typeof DAMAGE_TYPES)[number], string> = {
  slash: 'Slash (swords, axes)',
  blunt: 'Blunt (hammers, fists)',
  pierce: 'Pierce (arrows, spears)',
  fire: 'Fire',
  explosive: 'Explosive',
  electric: 'Electric',
};

export function allEffects(store: { list(p: string): string[]; get<T>(p: string): T | undefined }) {
  const own = store
    .list(paths.effectDir)
    .map((p) => store.get<Effect>(p)!)
    .filter(Boolean);
  return { own, builtin: BUILTIN_EFFECTS };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function EffectsStudio({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const { own, builtin } = allEffects(ed.store);
  const id = ed.effectId.value ?? builtin[0]!.id;
  const effect = own.find((e) => e.id === id) ?? builtin.find((e) => e.id === id) ?? builtin[0]!;
  const isOwn = own.some((e) => e.id === effect.id);
  const shown = useRef<Effect | null>(effect);
  shown.current = effect;
  const [replay, setReplay] = useState(0);
  const adv = ed.effectsAdvanced.value;

  const save = (next: Effect, label: string) =>
    ed.exec({ type: 'effect.put', payload: { effect: next } }, { label }).ok;
  const copy = (from: Effect) => {
    const next = { ...structuredClone(from), id: newId('effect'), name: `${from.name} copy`.slice(0, 40) };
    if (save(next, `Copy effect ${from.name}`)) ed.effectId.value = next.id;
  };
  const set = <K extends keyof Effect>(k: K, v: Effect[K]) => save({ ...effect, [k]: v }, `Effect ${String(k)}`);

  return (
    <div class="studio fx-studio">
      <section class="panel studio-lib" aria-label="Effects library">
        <div class="ptabs">
          <span class="tab on">Effects</span>
        </div>
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            type="button"
            class="btn on"
            data-tour="fx-new"
            onClick={() => copy({ ...builtin.find((e) => e.name === 'Sparks')!, name: 'My effect' })}
          >
            + New effect
          </button>
        </div>
        <div class="scroll" role="listbox" aria-label="Effects">
          <div class="lib-head">
            Mine
            <FieldHelp label="Effects" text={EFFECTS_HELP.library} />
          </div>
          {!own.length && (
            <div class="hint" style={{ padding: '4px 10px' }}>
              None yet: copy a built-in one, or + New effect.
            </div>
          )}
          {own.map((e) => (
            <EffectRow e={e} on={e.id === effect.id} onPick={() => (ed.effectId.value = e.id)} />
          ))}
          <div class="lib-head">Built-in</div>
          {builtin.map((e) => (
            <EffectRow e={e} on={e.id === effect.id} onPick={() => (ed.effectId.value = e.id)} />
          ))}
        </div>
      </section>

      <section class="panel studio-main" aria-label="Effect preview">
        <div class="ptabs studio-head">
          <strong class="studio-title">{effect.name}</strong>
          <span class="muted small">{isOwn ? 'this game’s own' : 'built-in'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button type="button" class="btn" data-tour="fx-replay" onClick={() => setReplay(replay + 1)}>
              ▶ Play again
            </button>
            <button
              type="button"
              class="btn"
              data-tour="fx-place"
              title="Put it on the map beside where the player starts (then move it in the Scene)"
              onClick={() => {
                const sp = ed.mapDoc.value?.spawns[0]?.pos ?? [0, 0, 0];
                if (placeEffectAt(ed, { x: sp[0]! + 3, y: Math.round(sp[1]! / 0.4), z: sp[2]! + 3 }, effect.id))
                  c.ui.workspace('Scene');
              }}
            >
              Place on the map
            </button>
          </span>
        </div>
        <div class="studio-plate">
          <div class="viewport-wrap">
            <EffectPreview effect={shown} replay={replay} />
          </div>
        </div>
        <div class="studio-foot muted small">
          {effect.mode === 'burst'
            ? `A burst of ${effect.count}, played again in the preview after the last is gone.`
            : `A stream of ${effect.rate} a second${effect.duration ? ` for ${effect.duration} s` : ' while it plays'}.`}{' '}
          Drag to turn, wheel to zoom.
        </div>
      </section>

      <section class="panel right studio-props" aria-label="Effect settings">
        <div class="scroll">
          <div class="sec" data-tour="fx-settings" data-help="effects.settings">
            <div class="sech">
              <span>
                Settings
                <FieldHelp label="Settings" text={EFFECTS_HELP.settings} />
              </span>
              <label class="lbl small">
                <input
                  type="checkbox"
                  data-tour="fx-advanced"
                  checked={adv}
                  onChange={() => (ed.effectsAdvanced.value = !adv)}
                />{' '}
                Advanced
              </label>
            </div>
            {!isOwn ? (
              <>
                <p class="muted small">
                  A built-in effect: use it as it is anywhere, or make a copy to change it (the copy is this game’s
                  own).
                </p>
                <button type="button" class="btn on" data-tour="fx-copy" onClick={() => copy(effect)}>
                  Make a copy to change it
                </button>
              </>
            ) : (
              <EffectFields effect={effect} adv={adv} set={set} />
            )}
            {isOwn && (
              <div class="row" style={{ marginTop: '8px', gap: '6px' }}>
                <button type="button" class="btn" onClick={() => copy(effect)}>
                  Duplicate
                </button>
                <button
                  type="button"
                  class="btn danger"
                  onClick={() => {
                    if (ed.exec({ type: 'effect.delete', payload: { id: effect.id } }, { label: 'Delete effect' }).ok)
                      ed.effectId.value = null;
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <GameEffects c={c} own={own} />
        </div>
      </section>
    </div>
  );
}

function EffectRow({ e, on, onPick }: { e: Effect; on: boolean; onPick(): void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      data-name={e.name}
      class={`lib-item ${on ? 'on' : ''}`}
      onClick={onPick}
    >
      <EffectThumb effect={e} size={30} />
      <span class="asset-name">{e.name}</span>
      <span class="mono small muted">{e.mode}</span>
    </button>
  );
}

function Num({
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

function EffectFields({
  effect: e,
  adv,
  set,
}: {
  effect: Effect;
  adv: boolean;
  set: <K extends keyof Effect>(k: K, v: Effect[K]) => boolean;
}) {
  // the simple view's three sliders scale the ranges, keeping their shape
  const sizeMid = (e.size[0] + e.size[1]) / 2;
  const speedMid = (e.speed[0] + e.speed[1]) / 2;
  return (
    <>
      <label class="field">
        Name
        <input
          class="inp"
          aria-label="Effect name"
          value={e.name}
          onChange={(x) => {
            const v = (x.target as HTMLInputElement).value.trim().slice(0, 40);
            if (v) set('name', v);
          }}
        />
      </label>
      <div class="field">
        Made of
        <div class="seg" role="radiogroup" aria-label="Made of">
          {PARTICLE_SHAPES.map((s) => (
            <button
              type="button"
              role="radio"
              aria-checked={e.shape === s}
              class={`chip ${e.shape === s ? 'on' : ''}`}
              data-tour={`fx-shape-${s}`}
              onClick={() => set('shape', s)}
            >
              {SHAPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        Colours <span class="muted small">birth → death</span>
        <div class="fx-colors">
          {e.colors.map((col, i) => (
            <span class="fx-color">
              <input
                type="color"
                aria-label={`Colour ${i + 1}`}
                data-tour={`fx-color-${i}`}
                value={col}
                onChange={(x) =>
                  set(
                    'colors',
                    e.colors.map((c, j) => (j === i ? (x.target as HTMLInputElement).value : c)),
                  )
                }
              />
              {e.colors.length > 1 && (
                <button
                  type="button"
                  class="link"
                  aria-label={`Remove colour ${i + 1}`}
                  onClick={() =>
                    set(
                      'colors',
                      e.colors.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {e.colors.length < 4 && (
            <button
              type="button"
              class="btn small"
              data-tour="fx-color-add"
              onClick={() => set('colors', [...e.colors, e.colors.at(-1)!])}
            >
              +
            </button>
          )}
        </div>
      </div>
      <label class="field">
        <span>
          Size <span class="mono muted">{r2(sizeMid)}</span>
        </span>
        <input
          type="range"
          aria-label="Size"
          data-tour="fx-size"
          min={0.05}
          max={2}
          step={0.01}
          value={sizeMid}
          onChange={(x) => {
            const v = Number((x.target as HTMLInputElement).value);
            const k = v / Math.max(0.001, sizeMid);
            set('size', [r2(clamp(e.size[0] * k, 0.02, 3)), r2(clamp(e.size[1] * k, 0.02, 3))]);
          }}
        />
      </label>
      <label class="field">
        <span>
          {e.mode === 'burst' ? 'How many' : 'How many a second'}{' '}
          <span class="mono muted">{e.mode === 'burst' ? e.count : e.rate}</span>
        </span>
        <input
          type="range"
          aria-label="How many"
          data-tour="fx-amount"
          min={1}
          max={e.mode === 'burst' ? 400 : 200}
          step={1}
          value={e.mode === 'burst' ? e.count : e.rate}
          onChange={(x) => {
            const v = Number((x.target as HTMLInputElement).value);
            if (e.mode === 'burst') set('count', Math.round(v));
            else set('rate', v);
          }}
        />
      </label>
      <label class="field">
        <span>
          Speed <span class="mono muted">{r2(speedMid)}</span>
        </span>
        <input
          type="range"
          aria-label="Speed"
          data-tour="fx-speed"
          min={0}
          max={30}
          step={0.1}
          value={speedMid}
          onChange={(x) => {
            const v = Number((x.target as HTMLInputElement).value);
            const k = speedMid > 0.001 ? v / speedMid : 1;
            set(
              'speed',
              speedMid > 0.001 ? [r2(clamp(e.speed[0] * k, 0, 60)), r2(clamp(e.speed[1] * k, 0, 60))] : [v, v],
            );
          }}
        />
      </label>
      {adv && (
        <div class="fx-adv" role="group" aria-label="Every setting">
          <label class="field">
            Plays as
            <select
              class="inp"
              aria-label="Plays as"
              value={e.mode}
              onChange={(x) => set('mode', (x.target as HTMLSelectElement).value as Effect['mode'])}
            >
              <option value="burst">A burst (all at once)</option>
              <option value="stream">A stream (keeps going)</option>
            </select>
          </label>
          <div class="grid2">
            <Num
              label="Burst count"
              value={e.count}
              lo={1}
              hi={400}
              step={1}
              onSet={(v) => set('count', Math.round(v))}
            />
            <Num label="Stream rate /s" value={e.rate} lo={0} hi={400} onSet={(v) => set('rate', v)} />
            <Num
              label="Stream length s (0: endless)"
              value={e.duration}
              lo={0}
              hi={60}
              onSet={(v) => set('duration', v)}
            />
          </div>
          <div class="grid2">
            <label class="field">
              Starts from
              <select
                class="inp"
                aria-label="Starts from"
                value={e.spawn}
                onChange={(x) => set('spawn', (x.target as HTMLSelectElement).value as Effect['spawn'])}
              >
                {SPAWN_SHAPES.map((s) => (
                  <option value={s}>{s === 'point' ? 'a point' : `a ${s}`}</option>
                ))}
              </select>
            </label>
            <Num label="Radius" value={e.radius} lo={0} hi={20} onSet={(v) => set('radius', v)} />
            <label class="field">
              Flies
              <select
                class="inp"
                aria-label="Flies"
                value={e.direction}
                onChange={(x) => set('direction', (x.target as HTMLSelectElement).value as Effect['direction'])}
              >
                {DIRECTIONS.map((d) => (
                  <option value={d}>
                    {d === 'out' ? 'out from the middle' : d === 'forward' ? 'forward (the way it faces)' : d}
                  </option>
                ))}
              </select>
            </label>
            <Num label="Spread °" value={e.spread} lo={0} hi={180} step={1} onSet={(v) => set('spread', v)} />
          </div>
          <div class="grid2">
            <Num
              label="Speed from"
              value={e.speed[0]}
              lo={0}
              hi={60}
              onSet={(v) => set('speed', [v, Math.max(v, e.speed[1])])}
            />
            <Num
              label="Speed to"
              value={e.speed[1]}
              lo={0}
              hi={60}
              onSet={(v) => set('speed', [Math.min(v, e.speed[0]), v])}
            />
            <Num
              label="Life from s"
              value={e.life[0]}
              lo={0.05}
              hi={20}
              onSet={(v) => set('life', [v, Math.max(v, e.life[1])])}
            />
            <Num
              label="Life to s"
              value={e.life[1]}
              lo={0.05}
              hi={20}
              onSet={(v) => set('life', [Math.min(v, e.life[0]), v])}
            />
            <Num
              label="Size at birth"
              value={e.size[0]}
              lo={0.02}
              hi={3}
              step={0.01}
              onSet={(v) => set('size', [v, e.size[1]])}
            />
            <Num
              label="Size at death"
              value={e.size[1]}
              lo={0.02}
              hi={3}
              step={0.01}
              onSet={(v) => set('size', [e.size[0], v])}
            />
          </div>
          <div class="grid3">
            <Num label="Gravity" value={e.gravity} lo={-40} hi={40} onSet={(v) => set('gravity', v)} />
            <Num label="Drag" value={e.drag} lo={0} hi={10} onSet={(v) => set('drag', v)} />
            <Num label="Bounce" value={e.bounce} lo={0} hi={1} step={0.05} onSet={(v) => set('bounce', v)} />
          </div>
        </div>
      )}
    </>
  );
}

/** Which effect plays for hits by damage type and for things that happen. */
function GameEffects({ c, own }: { c: ActionCtx; own: Effect[] }) {
  const { ed } = c;
  const hooks: EffectHooks = ed.store.manifest.effects ?? {};
  const name = (id: string) => [...own, ...BUILTIN_EFFECTS].find((e) => e.id === id)?.name ?? id;
  const setHook = (group: 'hits' | 'events', key: string, v: string) => {
    const g = { ...(hooks[group] ?? {}) } as Record<string, string>;
    if (v) g[key] = v;
    else delete g[key];
    const next: EffectHooks = { ...hooks, [group]: g };
    if (!Object.keys(g).length) delete next[group];
    ed.exec({ type: 'project.update', payload: { effects: next } }, { label: 'Game effects' });
  };
  const shown = (v: string | undefined, def: string) => {
    if (v === 'none') return null;
    const e = [...own, ...BUILTIN_EFFECTS].find((x) => x.id === (v || def));
    return e ? <EffectThumb effect={e} size={26} /> : null;
  };
  const options = (def: string) => (
    <>
      <option value="">Built-in: {name(def)}</option>
      <option value="none">None</option>
      {own.map((e) => (
        <option value={e.id}>{e.name}</option>
      ))}
      {BUILTIN_EFFECTS.filter((e) => e.id !== def).map((e) => (
        <option value={e.id}>{e.name}</option>
      ))}
    </>
  );
  return (
    <div class="sec" data-tour="fx-hooks" data-help="effects.hooks">
      <div class="sech">
        <span>
          Game effects
          <FieldHelp label="Game effects" text={EFFECTS_HELP.hooks} />
        </span>
      </div>
      <p class="muted small">When something is hit, by its damage type:</p>
      {DAMAGE_TYPES.map((t) => (
        <label class="field">
          {DAMAGE_LABEL[t]}
          <span class="row pv-row">
            <select
              class="inp"
              aria-label={`Hit: ${t}`}
              data-tour={`fx-hit-${t}`}
              value={hooks.hits?.[t] ?? ''}
              onChange={(x) => setHook('hits', t, (x.target as HTMLSelectElement).value)}
            >
              {options(DEFAULT_HITS[t])}
            </select>
            {shown(hooks.hits?.[t], DEFAULT_HITS[t])}
          </span>
        </label>
      ))}
      <p class="muted small">When things happen:</p>
      {EFFECT_EVENTS.map((ev) => (
        <label class="field">
          {EVENT_INFO[ev]}
          <span class="row pv-row">
            <select
              class="inp"
              aria-label={`When: ${EVENT_INFO[ev]}`}
              data-tour={`fx-event-${ev}`}
              value={hooks.events?.[ev] ?? ''}
              onChange={(x) => setHook('events', ev, (x.target as HTMLSelectElement).value)}
            >
              {options(DEFAULT_EFFECT_EVENTS[ev])}
            </select>
            {shown(hooks.events?.[ev], DEFAULT_EFFECT_EVENTS[ev])}
          </span>
        </label>
      ))}
    </div>
  );
}
