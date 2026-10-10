import type { Screen, Widget } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { ActionListField } from '../../components/ActionListField';
import { actionChoices, MusicSelect, SoundSelect } from '../../panels/AudioFields';
import { openLogicFor } from '../logic/createFromContext';
import { KIND_LABEL } from './model';

const ANCHORS: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [0.5, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
];

/** Properties of the selected widget (layout, text and bindings, style, button actions). */
export function WidgetProps({
  c,
  screen,
  path,
  widget,
  onChange,
}: {
  c: ActionCtx;
  screen: Screen;
  path: string;
  widget: Widget;
  onChange: (w: Widget, label?: string) => void;
}) {
  const { ed } = c;
  const w = widget;
  const set = (p: Partial<Widget>, label?: string) => onChange({ ...w, ...p }, label);
  const style = (k: string, v: string | number | undefined) => {
    const s = { ...(w.style ?? {}) };
    if (v === undefined || v === '') delete s[k];
    else s[k] = v;
    set({ style: s });
  };
  const numStyle = (k: string, label: string) => (
    <label>
      {label}
      <input
        class="inp mono"
        type="number"
        aria-label={label}
        value={typeof w.style?.[k] === 'number' ? (w.style[k] as number) : ''}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          style(k, v === '' ? undefined : Number(v));
        }}
      />
    </label>
  );
  const colorStyle = (k: string, label: string) => (
    <label>
      {label}
      <input
        class="inp mono"
        aria-label={label}
        placeholder="#rrggbb(aa)"
        value={typeof w.style?.[k] === 'string' ? (w.style[k] as string) : ''}
        onChange={(e) => style(k, (e.target as HTMLInputElement).value.trim() || undefined)}
      />
    </label>
  );
  const isRoot = path === '';
  return (
    <>
      <div class="sec">
        <div class="sech">
          <span>{isRoot ? 'Screen root' : `${w.type} widget`}</span>
        </div>
        {!isRoot && (
          <div class="field">
            Id
            <input
              class="inp mono"
              aria-label="Widget id"
              value={w.id ?? ''}
              onChange={(e) => set({ id: (e.target as HTMLInputElement).value.trim() || undefined })}
            />
          </div>
        )}
        {!isRoot && (
          <>
            <div class="field">
              Anchor
              <div class="sc-anchors" role="radiogroup" aria-label="Anchor">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!w.anchor}
                  class={`btn ${!w.anchor ? 'on' : ''}`}
                  title="In the parent's row / column"
                  onClick={() => set({ anchor: undefined, offset: undefined })}
                >
                  flow
                </button>
                {ANCHORS.map(([x, y]) => {
                  const on = w.anchor?.[0] === x && w.anchor?.[1] === y;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`Anchor ${x} ${y}`}
                      class={`sc-anchor ${on ? 'on' : ''}`}
                      style={{ gridColumn: x * 2 + 2, gridRow: y * 2 + 1 }}
                      onClick={() => set({ anchor: [x, y] })}
                    />
                  );
                })}
              </div>
            </div>
            {w.anchor && (
              <div class="grid3">
                <label>
                  Offset X
                  <input
                    class="inp mono"
                    type="number"
                    aria-label="Offset X"
                    value={w.offset?.[0] ?? 0}
                    onChange={(e) =>
                      set({ offset: [Number((e.target as HTMLInputElement).value), w.offset?.[1] ?? 0] })
                    }
                  />
                </label>
                <label>
                  Offset Y
                  <input
                    class="inp mono"
                    type="number"
                    aria-label="Offset Y"
                    value={w.offset?.[1] ?? 0}
                    onChange={(e) =>
                      set({ offset: [w.offset?.[0] ?? 0, Number((e.target as HTMLInputElement).value)] })
                    }
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>
      {(w.type === 'text' || w.type === 'image') && (
        <div class="sec">
          <div class="field">
            {w.type === 'image' ? 'Icon (when no image)' : 'Text'}
            <input
              class="inp"
              aria-label="Widget text"
              value={w.text ?? ''}
              onChange={(e) => set({ text: (e.target as HTMLInputElement).value })}
            />
          </div>
          <p class="hint">
            {'{hp}'}, {'{map.name}'}, {'{inventory.coin}'} or any logic variable shows its live value. Logic’s Set
            screen text replaces it by id.
          </p>
        </div>
      )}
      {(w.type === 'button' || w.type === 'bar' || w.type === 'slot') && (
        <div class="sec">
          <div class="field">
            Label
            <input
              class="inp"
              aria-label="Widget label"
              value={w.label ?? ''}
              onChange={(e) => set({ label: (e.target as HTMLInputElement).value })}
            />
          </div>
        </div>
      )}
      {['hearts', 'bar', 'list', 'dialogue'].includes(w.type) && (
        <div class="sec">
          <div class="field">
            Bound to
            <input
              class="inp mono"
              aria-label="Bindings"
              value={(w.bind ?? []).join(', ')}
              onChange={(e) =>
                set({
                  bind: (e.target as HTMLInputElement).value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <p class="hint">
            {w.type === 'hearts' || w.type === 'bar'
              ? 'value, max (e.g. hp, maxHp)'
              : w.type === 'list'
                ? 'a list variable (inventory)'
                : 'speaker, text'}
          </p>
        </div>
      )}
      <div class="sec">
        <div class="sech">
          <span>Style</span>
        </div>
        <div class="grid3">
          {numStyle('w', 'Width')}
          {numStyle('h', 'Height')}
          {numStyle('fontSize', 'Font size')}
          {numStyle('pad', 'Padding')}
          {numStyle('radius', 'Corners')}
          {numStyle('gap', 'Gap')}
          {colorStyle('color', 'Color')}
          {colorStyle('bg', 'Background')}
          {colorStyle('border', 'Border')}
        </div>
        <div class="row">
          {w.type === 'panel' && (
            <select
              class="inp"
              aria-label="Layout"
              value={String(w.style?.layout ?? 'column')}
              onChange={(e) => style('layout', (e.target as HTMLSelectElement).value)}
            >
              <option value="column">Column</option>
              <option value="row">Row</option>
            </select>
          )}
          <select
            class="inp"
            aria-label="Align"
            value={String(w.style?.align ?? '')}
            onChange={(e) => style('align', (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="">Align: auto</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
          <label class="row small">
            <input
              type="checkbox"
              checked={w.style?.weight === 'bold'}
              onChange={(e) => style('weight', (e.target as HTMLInputElement).checked ? 'bold' : undefined)}
            />
            Bold
          </label>
          <label class="row small">
            <input
              type="checkbox"
              checked={!!w.style?.hideEmpty}
              onChange={(e) => style('hideEmpty', (e.target as HTMLInputElement).checked ? 1 : undefined)}
            />
            Hide when empty
          </label>
          <label class="row small">
            <input
              type="checkbox"
              checked={!!w.touchOnly}
              onChange={(e) => set({ touchOnly: (e.target as HTMLInputElement).checked || undefined })}
            />
            Touch screens only
          </label>
        </div>
      </div>
      {w.type === 'button' && (
        <div class="sec">
          <div class="sech">
            <span>When pressed</span>
          </div>
          <div class="field">
            Sound
            <SoundSelect
              ed={ed}
              label="Button sound"
              value={w.sound ?? null}
              none="Default click"
              onPick={(sound) => set({ sound: (sound ?? undefined) as Widget['sound'] })}
            />
          </div>
          <ActionListField
            value={w.onPress ?? []}
            states={[]}
            choices={actionChoices(ed)}
            onChange={(onPress) => set({ onPress }, 'Edit button actions')}
          />
          <button
            type="button"
            class="btn wide"
            disabled={!w.id}
            title={w.id ? '' : 'Give the button an id first'}
            onClick={() =>
              openLogicFor(c, `${screen.name} · ${w.id}`, 'event.onScreenButton', { screen: screen.id, button: w.id })
            }
          >
            Open in Logic: On screen button
          </button>
        </div>
      )}
    </>
  );
}

/** The screen itself: name, kind, pausing, music, actions on show / back. */
export function ScreenProps({
  c,
  screen,
  onChange,
}: {
  c: ActionCtx;
  screen: Screen;
  onChange: (s: Screen, label?: string) => void;
}) {
  const { ed } = c;
  const first = ed.store.manifest.entry.screen === screen.id;
  return (
    <div class="sec">
      <div class="sech">
        <span>Screen</span>
      </div>
      <div class="field">
        Name
        <input
          class="inp"
          aria-label="Screen name"
          value={screen.name}
          onChange={(e) =>
            onChange({ ...screen, name: (e.target as HTMLInputElement).value.trim().slice(0, 60) || screen.name })
          }
        />
      </div>
      <div class="field">
        Kind
        <select
          class="inp"
          aria-label="Screen kind"
          value={screen.kind}
          onChange={(e) => onChange({ ...screen, kind: (e.target as HTMLSelectElement).value as Screen['kind'] })}
        >
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option value={k}>{l}</option>
          ))}
        </select>
      </div>
      <label class="row small">
        <input
          type="checkbox"
          checked={screen.pausesGame}
          onChange={(e) => onChange({ ...screen, pausesGame: (e.target as HTMLInputElement).checked })}
        />
        Pauses the game while shown
      </label>
      <div class="field">
        Music
        <MusicSelect
          ed={ed}
          label="Screen music"
          value={screen.music ?? undefined}
          inherit="Keep the game music"
          onPick={(m) => onChange({ ...screen, music: (m ?? null) as Screen['music'] })}
        />
      </div>
      <div class="sech">
        <span>When shown</span>
      </div>
      <ActionListField
        value={screen.onShow ?? []}
        states={[]}
        choices={actionChoices(ed)}
        onChange={(onShow) =>
          onChange({ ...screen, onShow: onShow.length ? onShow : undefined }, 'Edit screen actions')
        }
      />
      <div class="sech">
        <span>Back (Esc / Android back)</span>
      </div>
      <ActionListField
        value={screen.onBack ?? []}
        states={[]}
        choices={actionChoices(ed)}
        onChange={(onBack) => onChange({ ...screen, onBack: onBack.length ? onBack : undefined }, 'Edit back actions')}
      />
      <p class="hint">Without back actions: Pause closes, the HUD opens Pause, dialogue closes.</p>
      <button
        type="button"
        class={`btn wide ${first ? 'on' : ''}`}
        disabled={first}
        onClick={() => ed.exec({ type: 'project.update', payload: { entryScreen: screen.id } })}
      >
        {first ? '★ The game’s first screen' : 'Make this the first screen'}
      </button>
    </div>
  );
}
