import { useState } from 'preact/hooks';
import { BUILTIN_SCREEN_EFFECTS, DEFAULT_SCREEN_EVENTS } from '../../../builtin/screen-effects';
import {
  PART_INFO,
  SCREEN_EVENT_INFO,
  SCREEN_EVENTS,
  SCREEN_PARTS,
  type ScreenEffect,
  type ScreenHooks,
  type ScreenPart,
} from '../../../core/effects/screen';
import { newId } from '../../../core/ids';
import { paths } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { FieldHelp } from '../../components/fields';
import { ScreenEffectThumb } from '../../components/previews';
import { matches, NoMatch, SearchBox, SearchSelect } from '../../components/SearchBox';
import { EffectsTabs, Num } from './shared';

/** the screen effects of a game: its own (screenfx/), then the built-in ones */
export function allScreenEffects(store: { list(p: string): string[]; get<T>(p: string): T | undefined }) {
  const own = store
    .list(paths.screenEffectDir)
    .map((p) => store.get<ScreenEffect>(p)!)
    .filter(Boolean);
  return { own, builtin: BUILTIN_SCREEN_EFFECTS };
}

export const SCREEN_FX_HELP = {
  library:
    'Screen effects change the whole view, not things in the world: the camera shakes, the screen flashes or fades, the game freezes for a split second (hit-stop) or runs in slow motion. Built-in ones are ready to use; make a copy to change one.',
  parts:
    'Tick what the effect does; one effect can do several at once (a big hit: shake, a white flash and a hit-stop). Each part has its own length; the effect lasts as long as its longest part.',
  hooks:
    'Which screen effect plays when things happen in the game: the hero is hurt or beaten, lands a charged hit, levels up, beats an enemy, lands from high up, or breaks bricks. Built-in uses the editor’s own; None plays nothing. Red edges pulse while the hero has a quarter of its hearts or less.',
  reduce:
    'Players can turn on Reduce motion in the game’s Settings screen: shakes are a quarter as strong, flashes faint, hit-stops and slow motion shorter. Tick it here to see what they see.',
} as const;

/** P23 part 2: Effects › Screen — the library, a live preview, the settings, and the game's screen effects. */
export function ScreenEffectsStudio({ c }: { c: ActionCtx }) {
  const [q, setQ] = useState('');
  const { ed } = c;
  ed.revision.value;
  const { own, builtin } = allScreenEffects(ed.store);
  const id = ed.screenEffectId.value ?? builtin[0]!.id;
  const effect = own.find((e) => e.id === id) ?? builtin.find((e) => e.id === id) ?? builtin[0]!;
  const isOwn = own.some((e) => e.id === effect.id);
  const [replay, setReplay] = useState(0);
  const [reduce, setReduce] = useState(false);
  const save = (next: ScreenEffect, label: string) =>
    ed.exec({ type: 'screenEffect.put', payload: { effect: next } }, { label }).ok;
  const copy = (from: ScreenEffect) => {
    const next = { ...structuredClone(from), id: newId('screenEffect'), name: `${from.name} copy`.slice(0, 40) };
    if (save(next, `Copy screen effect ${from.name}`)) ed.screenEffectId.value = next.id;
  };
  return (
    <div class="studio fx-studio">
      <section class="panel studio-lib" aria-label="Screen effects library">
        <EffectsTabs ed={ed} />
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            type="button"
            class="btn on"
            data-tour="sfx-new"
            onClick={() =>
              copy({ ...BUILTIN_SCREEN_EFFECTS.find((e) => e.name === 'Big hit')!, name: 'My screen effect' })
            }
          >
            + New screen effect
          </button>
        </div>
        <div style={{ padding: '0 8px 6px' }}>
          <SearchBox label="screen effects" value={q} onInput={setQ} tour="sfx-search" />
        </div>
        <div class="scroll" role="listbox" aria-label="Screen effects">
          <NoMatch q={[...own, ...builtin].some((e) => matches(q, e.name)) ? '' : q} what="screen effects" />
          <div class="lib-head">
            Mine
            <FieldHelp label="Screen effects" text={SCREEN_FX_HELP.library} />
          </div>
          {!own.length && (
            <div class="hint" style={{ padding: '4px 10px' }}>
              None yet: copy a built-in one, or + New screen effect.
            </div>
          )}
          {own
            .filter((e) => matches(q, e.name))
            .map((e) => (
              <Row e={e} on={e.id === effect.id} onPick={() => (ed.screenEffectId.value = e.id)} />
            ))}
          <div class="lib-head">Built-in</div>
          {builtin
            .filter((e) => matches(q, e.name))
            .map((e) => (
              <Row e={e} on={e.id === effect.id} onPick={() => (ed.screenEffectId.value = e.id)} />
            ))}
        </div>
      </section>

      <section class="panel studio-main" aria-label="Screen effect preview">
        <div class="ptabs studio-head">
          <strong class="studio-title">{effect.name}</strong>
          <span class="muted small">{isOwn ? 'this game’s own' : 'built-in'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <label class="lbl small" title={SCREEN_FX_HELP.reduce}>
              <input
                type="checkbox"
                data-tour="sfx-reduce"
                checked={reduce}
                onChange={(e) => setReduce((e.target as HTMLInputElement).checked)}
              />{' '}
              As with Reduce motion
            </label>
            <button type="button" class="btn" data-tour="sfx-replay" onClick={() => setReplay(replay + 1)}>
              ▶ Play again
            </button>
          </span>
        </div>
        <div class="sfx-stage" data-tour="sfx-preview">
          <ScreenEffectThumb
            key={`${effect.id}:${replay}:${reduce}`}
            effect={effect}
            width={480}
            play
            reduce={reduce}
          />
          <p class="muted small">
            The preview plays over and over. The ball rolls at the game’s speed: it stops for a hit-stop and slows in
            slow motion.
          </p>
        </div>
      </section>

      <section class="panel right studio-props" aria-label="Screen effect settings">
        <div class="scroll">
          <div class="sec" data-tour="sfx-settings" data-help="effects.screen.settings">
            <div class="sech">
              <span>
                What it does
                <FieldHelp label="What it does" text={SCREEN_FX_HELP.parts} />
              </span>
            </div>
            {isOwn ? (
              <ScreenFields effect={effect} save={save} />
            ) : (
              <>
                <p class="muted small">{describe(effect)}</p>
                <p class="muted small">A built-in screen effect: make a copy to change it.</p>
                <button type="button" class="btn on" data-tour="sfx-copy" onClick={() => copy(effect)}>
                  Make a copy to change it
                </button>
              </>
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
                    if (
                      ed.exec(
                        { type: 'screenEffect.delete', payload: { id: effect.id } },
                        { label: 'Delete screen effect' },
                      ).ok
                    )
                      ed.screenEffectId.value = null;
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <GameScreenEffects c={c} own={own} />
        </div>
      </section>
    </div>
  );
}

function Row({ e, on, onPick }: { e: ScreenEffect; on: boolean; onPick(): void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      data-name={e.name}
      class={`lib-item ${on ? 'on' : ''}`}
      onClick={onPick}
    >
      <ScreenEffectThumb effect={e} width={40} />
      <span class="asset-name">{e.name}</span>
    </button>
  );
}

/** what a screen effect does, in words */
export function describe(e: ScreenEffect): string {
  const out: string[] = [];
  if (e.shake) out.push(`${e.shake.rumble ? 'rumbles' : 'shakes'} for ${e.shake.seconds} s`);
  if (e.flash) out.push(`flashes ${e.flash.color} for ${e.flash.seconds} s`);
  if (e.fade)
    out.push(
      e.fade.mode === 'out'
        ? `fades to ${e.fade.color} over ${e.fade.seconds} s`
        : e.fade.mode === 'in'
          ? `fades in from ${e.fade.color} over ${e.fade.seconds} s`
          : `fades out and back in over ${e.fade.seconds} s`,
    );
  if (e.hitStop) out.push(`freezes the game for ${e.hitStop} s`);
  if (e.slowMo) out.push(`slows the game to ${Math.round(e.slowMo.speed * 100)}% for ${e.slowMo.seconds} s`);
  const s = out.join(', ');
  return s ? `It ${s}.` : '';
}

/** a new part, as it starts when ticked */
const START: { [K in ScreenPart]: NonNullable<ScreenEffect[K]> } = {
  shake: { strength: 0.3, seconds: 0.4, rumble: false },
  flash: { color: '#ffffff', alpha: 0.6, seconds: 0.3 },
  fade: { color: '#000000', mode: 'outIn', seconds: 1 },
  hitStop: 0.08,
  slowMo: { speed: 0.4, seconds: 1.5 },
};

function ScreenFields({
  effect: e,
  save,
}: {
  effect: ScreenEffect;
  save: (next: ScreenEffect, label: string) => boolean;
}) {
  const put = <K extends keyof ScreenEffect>(k: K, v: ScreenEffect[K] | undefined, label: string) => {
    const next = { ...e } as ScreenEffect;
    if (v === undefined) delete next[k];
    else next[k] = v;
    save(next, label);
  };
  const on = (part: ScreenPart) => e[part] !== undefined;
  return (
    <>
      <label class="field">
        Name
        <input
          class="inp"
          aria-label="Screen effect name"
          value={e.name}
          onChange={(x) => {
            const name = (x.target as HTMLInputElement).value.trim().slice(0, 40);
            if (name) put('name', name, 'Rename screen effect');
          }}
        />
      </label>
      {SCREEN_PARTS.map((part) => (
        <div class={`sfx-part ${on(part) ? 'on' : ''}`} data-tour={`sfx-part-${part}`}>
          <label class="lbl" title={PART_INFO[part].about}>
            <input
              type="checkbox"
              aria-label={PART_INFO[part].label}
              checked={on(part)}
              onChange={(x) =>
                put(
                  part,
                  ((x.target as HTMLInputElement).checked ? START[part] : undefined) as never,
                  `${PART_INFO[part].label} ${(x.target as HTMLInputElement).checked ? 'on' : 'off'}`,
                )
              }
            />{' '}
            <strong>{PART_INFO[part].label}</strong>
          </label>
          {part === 'shake' && e.shake && (
            <div class="grid2">
              <Num
                label="Strength"
                value={e.shake.strength}
                lo={0.02}
                hi={3}
                step={0.05}
                onSet={(strength) => put('shake', { ...e.shake!, strength }, 'Shake strength')}
              />
              <Num
                label="Shake for s"
                value={e.shake.seconds}
                lo={0.05}
                hi={5}
                onSet={(seconds) => put('shake', { ...e.shake!, seconds }, 'Shake length')}
              />
              <label class="lbl small">
                <input
                  type="checkbox"
                  aria-label="Slow rumble"
                  checked={e.shake.rumble}
                  onChange={(x) =>
                    put('shake', { ...e.shake!, rumble: (x.target as HTMLInputElement).checked }, 'Shake rumble')
                  }
                />{' '}
                Slow rumble
              </label>
            </div>
          )}
          {part === 'flash' && e.flash && (
            <div class="grid2">
              <label class="field">
                Colour
                <input
                  type="color"
                  aria-label="Flash colour"
                  value={e.flash.color}
                  onChange={(x) =>
                    put('flash', { ...e.flash!, color: (x.target as HTMLInputElement).value }, 'Flash colour')
                  }
                />
              </label>
              <Num
                label="Strength 0–1"
                value={e.flash.alpha}
                lo={0.05}
                hi={1}
                step={0.05}
                onSet={(alpha) => put('flash', { ...e.flash!, alpha }, 'Flash strength')}
              />
              <Num
                label="Flash for s"
                value={e.flash.seconds}
                lo={0.05}
                hi={3}
                onSet={(seconds) => put('flash', { ...e.flash!, seconds }, 'Flash length')}
              />
            </div>
          )}
          {part === 'fade' && e.fade && (
            <div class="grid2">
              <label class="field">
                Fade
                <select
                  class="inp"
                  aria-label="Fade how"
                  value={e.fade.mode}
                  onChange={(x) =>
                    put(
                      'fade',
                      { ...e.fade!, mode: (x.target as HTMLSelectElement).value as 'out' | 'in' | 'outIn' },
                      'Fade how',
                    )
                  }
                >
                  <option value="out">Out (to the colour, and stays)</option>
                  <option value="in">In (from the colour)</option>
                  <option value="outIn">Out and back in</option>
                </select>
              </label>
              <label class="field">
                Colour
                <input
                  type="color"
                  aria-label="Fade colour"
                  value={e.fade.color}
                  onChange={(x) =>
                    put('fade', { ...e.fade!, color: (x.target as HTMLInputElement).value }, 'Fade colour')
                  }
                />
              </label>
              <Num
                label="Fade over s"
                value={e.fade.seconds}
                lo={0.1}
                hi={5}
                onSet={(seconds) => put('fade', { ...e.fade!, seconds }, 'Fade length')}
              />
            </div>
          )}
          {part === 'hitStop' && e.hitStop !== undefined && (
            <Num
              label="Freeze for s"
              value={e.hitStop}
              lo={0.02}
              hi={0.5}
              step={0.01}
              onSet={(v) => put('hitStop', v, 'Hit-stop length')}
            />
          )}
          {part === 'slowMo' && e.slowMo && (
            <div class="grid2">
              <Num
                label="Speed 0.1–0.9"
                value={e.slowMo.speed}
                lo={0.1}
                hi={0.9}
                step={0.05}
                onSet={(speed) => put('slowMo', { ...e.slowMo!, speed }, 'Slow motion speed')}
              />
              <Num
                label="Slow for s"
                value={e.slowMo.seconds}
                lo={0.1}
                hi={5}
                onSet={(seconds) => put('slowMo', { ...e.slowMo!, seconds }, 'Slow motion length')}
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** the game's screen effects for things that happen, and the low-health edges */
function GameScreenEffects({ c, own }: { c: ActionCtx; own: ScreenEffect[] }) {
  const { ed } = c;
  const hooks: ScreenHooks = ed.store.manifest.screenEffects ?? {};
  const all = [...own, ...BUILTIN_SCREEN_EFFECTS];
  const name = (id: string) => all.find((e) => e.id === id)?.name ?? id;
  const put = (next: ScreenHooks) =>
    ed.exec({ type: 'project.update', payload: { screenEffects: next } }, { label: 'Game screen effects' });
  const setEvent = (ev: string, v: string) => {
    const events = { ...(hooks.events ?? {}) } as Record<string, string>;
    if (v) events[ev] = v;
    else delete events[ev];
    const next: ScreenHooks = { ...hooks, events };
    if (!Object.keys(events).length) delete next.events;
    put(next);
  };
  return (
    <div class="sec" data-tour="sfx-hooks" data-help="effects.screen.hooks">
      <div class="sech">
        <span>
          Game screen effects
          <FieldHelp label="Game screen effects" text={SCREEN_FX_HELP.hooks} />
        </span>
      </div>
      {SCREEN_EVENTS.map((ev) => {
        const v = hooks.events?.[ev];
        const shown = v === 'none' ? null : all.find((e) => e.id === (v || DEFAULT_SCREEN_EVENTS[ev]));
        return (
          <label class="field">
            {SCREEN_EVENT_INFO[ev]}
            <span class="row pv-row">
              <SearchSelect label="screen effects">
                <select
                  class="inp"
                  aria-label={`Screen: ${SCREEN_EVENT_INFO[ev]}`}
                  data-tour={`sfx-event-${ev}`}
                  value={v ?? ''}
                  onChange={(x) => setEvent(ev, (x.target as HTMLSelectElement).value)}
                >
                  <option value="">Built-in: {name(DEFAULT_SCREEN_EVENTS[ev])}</option>
                  <option value="none">None</option>
                  {own.map((e) => (
                    <option value={e.id}>{e.name}</option>
                  ))}
                  {BUILTIN_SCREEN_EFFECTS.filter((e) => e.id !== DEFAULT_SCREEN_EVENTS[ev]).map((e) => (
                    <option value={e.id}>{e.name}</option>
                  ))}
                </select>
              </SearchSelect>
              {shown && <ScreenEffectThumb effect={shown} width={36} />}
            </span>
          </label>
        );
      })}
      <label class="lbl">
        <input
          type="checkbox"
          data-tour="sfx-lowhealth"
          checked={hooks.lowHealth !== false}
          onChange={(x) => {
            const next = { ...hooks };
            if ((x.target as HTMLInputElement).checked) delete next.lowHealth;
            else next.lowHealth = false;
            put(next);
          }}
        />{' '}
        Red edges when the hero is low on health
      </label>
    </div>
  );
}
