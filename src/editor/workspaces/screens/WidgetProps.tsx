import type { Art, Screen, Widget, WidgetPin } from '../../../core/schema';
import { BUILTIN_FONTS } from '../../../engine/ui/art';
import { effectiveWidget } from '../../../engine/ui/layout';
import type { ActionCtx } from '../../actions/registry';
import { ActionListField } from '../../components/ActionListField';
import { BRICK_HEXES, ColorField } from '../../components/ColorPicker';
import { actionChoices, MusicSelect, SoundSelect } from '../../panels/AudioFields';
import { openLogicFor } from '../logic/createFromContext';
import { allArt } from './art/ArtLibrary';
import { canvasPortrait, KIND_LABEL, setLayout } from './model';

/** colours offered first for screens: UI basics, then the brick colours */
const UI_COLORS = [
  '#ffffff',
  '#000000',
  '#141a2b',
  '#0b1020',
  '#f7c900',
  '#4ade80',
  '#ef4444',
  '#3b82f6',
  ...BRICK_HEXES,
];

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
  const raw = widget;
  const isRoot = path === '';
  // P31: while the canvas shows a portrait screen, place / size / style edits go to the portrait layout
  const portrait = canvasPortrait.value && !isRoot;
  const w = effectiveWidget(raw, portrait);
  const set = (p: Partial<Widget>, label?: string) => onChange({ ...raw, ...p }, label);
  const setPlace = (p: { anchor?: [number, number]; offset?: [number, number] }, label?: string) =>
    portrait ? onChange(setLayout(raw, true, p), label) : set(p, label);
  const style = (k: string, v: string | number | undefined) => {
    if (portrait) return onChange(setLayout(raw, true, { style: { [k]: v } }));
    const s = { ...(raw.style ?? {}) };
    if (v === undefined || v === '') delete s[k];
    else s[k] = v;
    set({ style: s });
  };
  const str = (k: string) => (typeof w.style?.[k] === 'string' ? (w.style[k] as string) : '');
  const art = allArt(ed);
  const artSelect = (k: string, label: string, kinds: Art['kind'][], none: string) => (
    <label>
      {label}
      <select
        class="inp"
        aria-label={label}
        value={str(k)}
        onChange={(e) => style(k, (e.target as HTMLSelectElement).value || undefined)}
      >
        <option value="">{none}</option>
        {art
          .filter((a) => kinds.includes(a.kind))
          .map((a) => (
            <option value={`art:${a.id}`}>
              {a.name}
              {kinds.length > 1 ? ` (${a.kind})` : ''}
            </option>
          ))}
        {str(k) && !art.some((a) => `art:${a.id}` === str(k)) && <option value={str(k)}>(missing) {str(k)}</option>}
      </select>
    </label>
  );
  const ids: string[] = [];
  const walk = (x: Widget) => {
    if (x.id && x.id !== raw.id) ids.push(x.id);
    for (const k of x.children ?? []) walk(k);
  };
  walk(screen.root);
  const setPin = (p: Partial<WidgetPin> | null) =>
    set(
      { pin: p === null ? undefined : ({ side: 'below', ...(raw.pin ?? {}), ...p } as WidgetPin) },
      p ? 'Pin widget' : 'Unpin widget',
    );
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
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the colour field's button
    <label>
      {label}
      <ColorField
        label={label}
        alpha
        clearable
        palette={UI_COLORS}
        value={typeof w.style?.[k] === 'string' ? (w.style[k] as string) : undefined}
        onChange={(hex) => style(k, hex)}
      />
    </label>
  );
  return (
    <>
      {portrait && (
        <div class="sc-mode-note" role="note">
          <strong>Portrait layout.</strong> Place, size and style changes here only apply on tall screens.
          {raw.portrait && (
            <button
              type="button"
              class="link"
              data-tip="Forget the portrait changes: tall screens use the normal layout again"
              onClick={() => onChange({ ...raw, portrait: undefined }, 'Use landscape layout')}
            >
              Use the normal layout
            </button>
          )}
        </div>
      )}
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
                  disabled={portrait}
                  title={
                    portrait
                      ? 'Switch to a wide screen to put it back in the row / column'
                      : "In the parent's row / column"
                  }
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
                      onClick={() => setPlace({ anchor: [x, y] })}
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
                      setPlace({ offset: [Number((e.target as HTMLInputElement).value), w.offset?.[1] ?? 0] })
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
                      setPlace({ offset: [w.offset?.[0] ?? 0, Number((e.target as HTMLInputElement).value)] })
                    }
                  />
                </label>
              </div>
            )}
            <div class="field">
              Place next to
              <div class="row" style={{ gap: '4px', flexWrap: 'wrap' }}>
                <select
                  class="inp"
                  aria-label="Place next to widget"
                  data-tip="Keep this widget next to another one, like Android constraints: it follows when the other moves or grows"
                  value={raw.pin?.to ?? ''}
                  onChange={(e) => {
                    const to = (e.target as HTMLSelectElement).value;
                    setPin(to ? { to } : null);
                  }}
                >
                  <option value="">Nothing (free)</option>
                  {ids.map((id) => (
                    <option value={id}>{id}</option>
                  ))}
                  {raw.pin && !ids.includes(raw.pin.to) && <option value={raw.pin.to}>(missing) {raw.pin.to}</option>}
                </select>
                {raw.pin && (
                  <>
                    <select
                      class="inp"
                      aria-label="Pin side"
                      value={raw.pin.side}
                      onChange={(e) => setPin({ side: (e.target as HTMLSelectElement).value as WidgetPin['side'] })}
                    >
                      <option value="below">below</option>
                      <option value="above">above</option>
                      <option value="right">right of</option>
                      <option value="left">left of</option>
                    </select>
                    <select
                      class="inp"
                      aria-label="Pin align"
                      value={raw.pin.align ?? 'start'}
                      onChange={(e) => setPin({ align: (e.target as HTMLSelectElement).value as WidgetPin['align'] })}
                    >
                      <option value="start">
                        {raw.pin.side === 'left' || raw.pin.side === 'right' ? 'top' : 'left'} edges
                      </option>
                      <option value="center">centres</option>
                      <option value="end">
                        {raw.pin.side === 'left' || raw.pin.side === 'right' ? 'bottom' : 'right'} edges
                      </option>
                    </select>
                    <label class="row small">
                      gap
                      <input
                        class="inp mono"
                        type="number"
                        style={{ width: '64px' }}
                        aria-label="Pin gap"
                        value={raw.pin.gap ?? 8}
                        onChange={(e) => setPin({ gap: Number((e.target as HTMLInputElement).value) || 0 })}
                      />
                    </label>
                  </>
                )}
              </div>
              {!ids.length && <span class="hint">Give other widgets an id to place this one next to them.</span>}
            </div>
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
      <div class="sec">
        <div class="sech">
          <span>Pictures and font</span>
          <button
            type="button"
            class="link"
            data-tip="Import, generate or draw backgrounds, icons and fonts"
            onClick={() => document.querySelector<HTMLButtonElement>('.screens-ws [role="tab"]:nth-child(2)')?.click()}
          >
            Art…
          </button>
        </div>
        <div class="grid2">
          {w.type !== 'image' && artSelect('bgArt', 'Background picture', ['background', 'icon'], 'None')}
          {w.type !== 'image' && str('bgArt') && (
            <label>
              Fit
              <select
                class="inp"
                aria-label="Background fit"
                value={str('bgFit') || 'cover'}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  style('bgFit', v === 'cover' ? undefined : v);
                }}
              >
                <option value="cover">Fill</option>
                <option value="fit">Fit inside</option>
                <option value="tile">Repeat</option>
              </select>
            </label>
          )}
          {w.type === 'image' && artSelect('src', 'Picture', ['icon', 'background'], 'None (shows the icon text)')}
          {w.type === 'button' && artSelect('icon', 'Icon', ['icon'], 'No icon')}
          {['text', 'button', 'bar', 'slot', 'list', 'dialogue', 'panel'].includes(w.type) && (
            <label>
              Font
              <select
                class="inp"
                aria-label="Font"
                value={str('font')}
                onChange={(e) => style('font', (e.target as HTMLSelectElement).value || undefined)}
              >
                <option value="">Same as parent</option>
                {Object.entries(BUILTIN_FONTS).map(([k, f]) => (
                  <option value={k}>{f.name}</option>
                ))}
                {art
                  .filter((a) => a.kind === 'font')
                  .map((a) => (
                    <option value={`art:${a.id}`}>{a.name}</option>
                  ))}
              </select>
            </label>
          )}
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
