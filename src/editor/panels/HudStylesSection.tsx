import { useRef, useState } from 'preact/hooks';
import { BUTTON_NAME, type Button, buttonsOf, LAYOUT_INFO, LAYOUTS, type Layout } from '../../core/controls/controls';
import {
  type CustomFace,
  CustomHud,
  customFromEra,
  HUD_SIZE_PX,
  HUD_SIZES,
  type HudSize,
  hudLookOf,
  isEra,
} from '../../core/controls/hud-custom';
import { DEFAULT_HUD_STYLE, HUD_STYLE_INFO, HUD_STYLES, type HudStyle } from '../../core/controls/hud-styles';
import { newId } from '../../core/ids';
import { gatherItem } from '../../core/library/library';
import { paths, type Settings } from '../../core/schema';
import { EraButtons } from '../../engine/ui/widgets';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { library } from '../library/store';

export const HUD_STYLE_HELP =
  'HUD styles after each era of 3D adventure games, oldest first. Corner buttons (64-bit era): a green Attack, a blue Action that says what it does, three yellow item buttons in the top right, money bottom left, no jump button. Big-button cluster (cube era): a big green Action with a red Attack, two grey item buttons and a purple one. Pointer (motion era): a remote-shaped strip — tap the item button to use it, hold it for the item wheel; the attack is a swing. Second screen (tablet era): a tablet along the bottom with the map, the buttons and the items, touched to use them. Open air (today, and the look of a game that has not picked): small hints, a stamina wheel by the hero, a jump button and a quick menu. + New style makes one of your own from the style you have: each button’s letter or shape, colour and size, dragged where you want it. Applying a style sets the button layout and arranges the HUD screen (Undo brings back what was); every look is drawn here, original.';

/** the buttons a preview shows, as Play would (an item, its count, a live Action label) */
const PREVIEW = [
  { id: 'attack', name: 'Attack', key: 'F', label: 'Attack' },
  { id: 'action', name: 'Action', key: 'E', label: 'Open' },
  { id: 'jump', name: 'Jump', key: 'Space', label: 'Jump' },
  { id: 'item1', name: 'Item 1', key: 'J', label: 'Bow', count: 12 },
  { id: 'item2', name: 'Item 2', key: 'K', label: 'Bomb', count: 5 },
  { id: 'item3', name: 'Item 3', key: 'L', label: '' },
  { id: 'item4', name: 'Item 4', key: ';', label: '' },
  { id: 'guard', name: 'Guard', key: 'Q', label: 'Guard' },
  { id: 'lock', name: 'Lock on', key: 'Z', label: 'Lock on' },
  { id: 'roll', name: 'Roll', key: 'C', label: 'Roll' },
  { id: 'wheel', name: 'Item wheel', key: 'R', label: 'Items' },
];

const PREVIEW_HOST = {
  lookup: () => undefined,
  run: () => {},
  sound: () => {},
  touch: false,
  preview: { selected: null, select: () => {} },
};

/** a style's own buttons as a preview shows them */
function Preview({ st, custom }: { st: string; custom?: CustomHud }) {
  const look = hudLookOf(st, () => custom);
  const list = custom ? PREVIEW.filter((b) => b.id in custom.faces) : PREVIEW.filter((b) => b.id !== 'item4');
  return (
    <span class={`bw-w bw-buttons bw-hud-${custom ? 'custom' : st}`} style={custom ? fitOf(custom) : undefined}>
      <EraButtons look={look} list={list} host={PREVIEW_HOST} />
    </span>
  );
}
/** a style of your own scaled into its card */
const fitOf = (c: CustomHud) => ({ '--fit': String(Math.min(0.5, 120 / c.w, 70 / c.h)) }) as Record<string, string>;

/** the styles of the game's own */
export function ownStyles(c: ActionCtx): CustomHud[] {
  return c.ed.store
    .list(paths.hudStyleDir)
    .map((p) => c.ed.store.get<CustomHud>(p))
    .filter((x): x is CustomHud => !!x)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Milestone 3b (B7b): Project › Controls › HUD style — one card per era, each with its buttons drawn. v144: the
 * game's own styles beside them, + New style, and the editor for the one in use. (There is no plain look: a game
 * that has not picked plays with Open air.)
 */
export function HudStylesSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  void ed.revision.value;
  const set = ed.store.get<Settings>(paths.settings)?.controls?.hud;
  const look = hudLookOf(set, (id) => ed.store.get<CustomHud>(paths.hudStyle(id)));
  const own = ownStyles(c);
  const apply = (style: string, name: string) => {
    const r = ed.exec({ type: 'hud.applyStyle', payload: { style } });
    if (r.ok) ed.notify(`HUD style: ${name}. The HUD screen is arranged for it (Undo brings back what was).`);
  };
  const makeNew = () => {
    const n = own.length + 1;
    const from = look.custom
      ? { ...look.custom, id: newId('hudstyle') as CustomHud['id'], name: `${look.custom.name} copy`.slice(0, 40) }
      : customFromEra(look.era ?? DEFAULT_HUD_STYLE, newId('hudstyle'), `My style ${n}`);
    const r = ed.exec(
      [
        { type: 'hudstyle.put', payload: { style: from } },
        { type: 'hud.applyStyle', payload: { style: from.id } },
      ],
      { label: 'New HUD style' },
    );
    if (r.ok) ed.notify(`${from.name}: drag its buttons, and change each one’s look below.`);
    else ed.notify(r.error ?? 'Could not make a HUD style.', true);
  };
  return (
    <div data-tour="hud-styles" data-help="project.hudStyle" role="group" aria-label="HUD style">
      <div class="sech" style={{ padding: '6px 0 4px' }}>
        <span>
          HUD style
          <FieldHelp label="HUD style" text={HUD_STYLE_HELP} />
        </span>
        <span class="small muted">
          {look.custom ? look.custom.name : HUD_STYLE_INFO[look.era!].name}
          {!set ? ' (default)' : ''}
        </span>
      </div>
      <div class="hud-style-cards">
        {HUD_STYLES.map((st) => {
          const info = HUD_STYLE_INFO[st];
          const on = look.id === st;
          return (
            <button
              type="button"
              class={`hud-style-card${on ? ' on' : ''}`}
              aria-pressed={on}
              aria-label={`HUD style ${info.name} (${info.era})`}
              title={info.about}
              onClick={() => apply(st, info.name)}
            >
              <span class="hud-style-preview" aria-hidden="true">
                <Preview st={st} />
              </span>
              <strong>{info.name}</strong>
              <span class="small muted">{info.era}</span>
            </button>
          );
        })}
        {own.map((s) => {
          const on = look.id === s.id;
          return (
            <button
              type="button"
              class={`hud-style-card own${on ? ' on' : ''}`}
              aria-pressed={on}
              aria-label={`HUD style ${s.name} (your own)`}
              onClick={() => apply(s.id, s.name)}
            >
              <span class="hud-style-preview" aria-hidden="true">
                <Preview st={s.id} custom={s} />
              </span>
              <strong>{s.name}</strong>
              <span class="small muted">your own</span>
            </button>
          );
        })}
        <button
          type="button"
          class="hud-style-card new"
          data-tour="hud-new"
          aria-label="New HUD style of your own"
          title="Make a style of your own, starting from the one in use"
          onClick={makeNew}
        >
          <span class="hud-style-preview hud-style-plus" aria-hidden="true">
            +
          </span>
          <strong>New style</strong>
          <span class="small muted">from {look.custom ? look.custom.name : HUD_STYLE_INFO[look.era!].name}</span>
        </button>
      </div>
      {look.custom ? (
        <HudStyleEditor c={c} style={look.custom} />
      ) : (
        <p class="hint">{HUD_STYLE_INFO[look.era!].feel}</p>
      )}
    </div>
  );
}

const SIZE_NAME: Record<HudSize, string> = { big: 'Big', mid: 'Middle', small: 'Small' };

/**
 * v144: a style of your own, edited: its name, the layout it plays with, whose HUD arrangement it takes, and each
 * button — shown or not, its letter or shape, colour and size — dragged where it goes in its box.
 */
function HudStyleEditor({ c, style }: { c: ActionCtx; style: CustomHud }) {
  const { ed } = c;
  const [pick, setPick] = useState<Button | null>(null);
  const [drag, setDrag] = useState<{ b: Button; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = drag
    ? { ...style, faces: { ...style.faces, [drag.b]: { ...style.faces[drag.b]!, x: drag.x, y: drag.y } } }
    : style;
  // the box scaled to fit the panel (its buttons can be dragged right to its edges)
  const scale = Math.min(1, 250 / style.w, 300 / style.h);
  const put = (next: CustomHud, label: string, reapply = false) => {
    const r = CustomHud.safeParse(next);
    if (!r.success) return ed.notify(`Not valid: ${r.error.issues[0]?.message ?? ''}`, true);
    ed.exec(
      [
        { type: 'hudstyle.put', payload: { style: next } },
        ...(reapply ? [{ type: 'hud.applyStyle', payload: { style: next.id } }] : []),
      ],
      { label },
    );
  };
  const setFace = (b: Button, f: CustomFace | null, label: string) => {
    const faces = { ...style.faces };
    if (f) faces[b] = f;
    else delete faces[b];
    if (!Object.keys(faces).length) return ed.notify('A HUD style needs at least one button.', true);
    put({ ...style, faces }, label);
  };
  const buttons = buttonsOf({ layout: style.layout }).filter((b) => b !== 'menu');
  // dragging a button inside the box (in the box's own pixels)
  const down = (b: Button, e: PointerEvent) => {
    e.preventDefault();
    setPick(b);
    const f = style.faces[b]!;
    const start = { px: e.clientX, py: e.clientY, x: f.x, y: f.y };
    const px = HUD_SIZE_PX[f.size];
    const at = (ev: PointerEvent) => ({
      b,
      x: Math.round(Math.max(0, Math.min(style.w - px, start.x + (ev.clientX - start.px) / scale))),
      y: Math.round(Math.max(0, Math.min(style.h - px, start.y + (ev.clientY - start.py) / scale))),
    });
    let last = { b, x: f.x, y: f.y };
    const mv = (ev: PointerEvent) => {
      last = at(ev);
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (last.x !== f.x || last.y !== f.y) setFace(b, { ...f, x: last.x, y: last.y }, `Move ${BUTTON_NAME[b]}`);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const toLibrary = async () => {
    const it = gatherItem(ed.store, 'hudstyle', style.id, { from: ed.store.manifest.name });
    if (!it) return;
    await library().add([it]);
    ed.notify(`Saved “${style.name}” to My library: every project in this browser can use it now.`);
  };
  const remove = () => {
    const r = ed.exec({ type: 'hudstyle.delete', payload: { id: style.id } }, { label: `Delete ${style.name}` });
    if (r.ok) ed.notify(`${style.name} is deleted; the game plays with Open air (Undo brings it back).`);
  };
  return (
    <div class="hud-editor" data-tour="hud-editor" role="group" aria-label={`Edit HUD style ${style.name}`}>
      <label class="field">
        Name
        <input
          class="inp"
          aria-label="HUD style name"
          value={style.name}
          maxLength={40}
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) put({ ...style, name: v }, 'Rename HUD style');
          }}
        />
      </label>
      <div class="row" style={{ gap: '8px' }}>
        <label class="field">
          Layout
          <select
            class="inp"
            aria-label="HUD style layout"
            value={style.layout}
            onChange={(e) =>
              put({ ...style, layout: (e.target as HTMLSelectElement).value as Layout }, 'HUD style layout', true)
            }
          >
            {LAYOUTS.map((l) => (
              <option value={l}>{LAYOUT_INFO[l].name}</option>
            ))}
          </select>
        </label>
        <label class="field">
          HUD like
          <select
            class="inp"
            aria-label="HUD arrangement"
            title="Where the hearts, map, money and these buttons sit on the screen"
            value={style.base}
            onChange={(e) =>
              put({ ...style, base: (e.target as HTMLSelectElement).value as HudStyle }, 'HUD arrangement', true)
            }
          >
            {HUD_STYLES.map((s) => (
              <option value={s}>{HUD_STYLE_INFO[s].name}</option>
            ))}
          </select>
        </label>
      </div>
      <div
        class="hud-editor-stage"
        data-help="project.hudOwn"
        style={{ height: `${Math.round(style.h * scale) + 40}px` }}
        aria-label="Drag the buttons where they go"
      >
        <div
          ref={box}
          class="hud-editor-box"
          style={{ width: `${style.w}px`, height: `${style.h}px`, transform: `scale(${scale})` }}
        >
          <span class="bw-w bw-buttons bw-hud-custom">
            <EraButtons
              look={hudLookOf(style.id, () => shown)}
              list={PREVIEW.filter((b) => b.id in shown.faces)}
              host={PREVIEW_HOST}
            />
          </span>
          {(Object.keys(shown.faces) as Button[]).map((b) => {
            const f = shown.faces[b]!;
            const px = HUD_SIZE_PX[f.size];
            return (
              <button
                type="button"
                class={`hud-editor-grip${pick === b ? ' on' : ''}`}
                aria-label={`Drag ${BUTTON_NAME[b]}`}
                data-grip={b}
                style={{ left: `${f.x}px`, top: `${f.y}px`, width: `${px}px`, height: `${px}px` }}
                onPointerDown={(e) => down(b, e as unknown as PointerEvent)}
              />
            );
          })}
        </div>
      </div>
      <div class="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
        <label class="field small">
          Box width
          <input
            class="inp"
            type="number"
            min={60}
            max={600}
            aria-label="Box width"
            value={style.w}
            onChange={(e) =>
              put(
                { ...style, w: Math.max(60, Math.min(600, Number((e.target as HTMLInputElement).value) || style.w)) },
                'Box size',
              )
            }
          />
        </label>
        <label class="field small">
          Height
          <input
            class="inp"
            type="number"
            min={60}
            max={400}
            aria-label="Box height"
            value={style.h}
            onChange={(e) =>
              put(
                { ...style, h: Math.max(60, Math.min(400, Number((e.target as HTMLInputElement).value) || style.h)) },
                'Box size',
              )
            }
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={style.labels}
            onChange={(e) => put({ ...style, labels: (e.target as HTMLInputElement).checked }, 'Button words')}
          />
          Words under the buttons
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={!!style.plate}
            onChange={(e) => {
              const { plate: _p, ...rest } = style;
              put((e.target as HTMLInputElement).checked ? { ...rest, plate: '#f2f4f8' } : rest, 'Backing plate');
            }}
          />
          Plate
        </label>
        {style.plate && (
          <input
            type="color"
            aria-label="Plate colour"
            value={style.plate}
            onChange={(e) => put({ ...style, plate: (e.target as HTMLInputElement).value }, 'Plate colour')}
          />
        )}
      </div>
      <div class="hud-faces" role="table" aria-label="Each button's look">
        {buttons.map((b) => {
          const f = style.faces[b];
          return (
            <div class={`hud-face-row${pick === b ? ' on' : ''}`} role="row" data-face={b} onClick={() => setPick(b)}>
              <label class="check">
                <input
                  type="checkbox"
                  aria-label={`Show ${BUTTON_NAME[b]}`}
                  checked={!!f}
                  onChange={(e) =>
                    setFace(
                      b,
                      (e.target as HTMLInputElement).checked
                        ? { glyph: BUTTON_NAME[b][0]!.toUpperCase(), color: '#8a93a6', size: 'mid', x: 0, y: 0 }
                        : null,
                      `${(e.target as HTMLInputElement).checked ? 'Show' : 'Hide'} ${BUTTON_NAME[b]}`,
                    )
                  }
                />
                {BUTTON_NAME[b]}
              </label>
              {f && (
                <>
                  <input
                    class="inp small hud-glyph"
                    aria-label={`${BUTTON_NAME[b]} letter or shape`}
                    value={f.glyph}
                    maxLength={3}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) setFace(b, { ...f, glyph: v }, `${BUTTON_NAME[b]} face`);
                    }}
                  />
                  <input
                    type="color"
                    aria-label={`${BUTTON_NAME[b]} colour`}
                    value={f.color}
                    onChange={(e) =>
                      setFace(b, { ...f, color: (e.target as HTMLInputElement).value }, `${BUTTON_NAME[b]} colour`)
                    }
                  />
                  <select
                    class="inp small"
                    aria-label={`${BUTTON_NAME[b]} size`}
                    value={f.size}
                    onChange={(e) =>
                      setFace(
                        b,
                        { ...f, size: (e.target as HTMLSelectElement).value as HudSize },
                        `${BUTTON_NAME[b]} size`,
                      )
                    }
                  >
                    {HUD_SIZES.map((z) => (
                      <option value={z}>{SIZE_NAME[z]}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p class="hint">
        Shapes to paste: ▲ ▼ ◀ ▶ ● ■ ◆ ✚ ★ ✕ ○ 〰. A button left out is not on the HUD (its key still works).
      </p>
      <div class="row" style={{ gap: '6px' }}>
        <button type="button" class="btn small" data-tour="hud-library" onClick={() => void toLibrary()}>
          Save to My library
        </button>
        <button type="button" class="btn small" onClick={remove}>
          Delete style
        </button>
      </div>
    </div>
  );
}

/** for the Screens workspace's Look field: every style by id and name */
export function hudStyleChoices(c: ActionCtx): [string, string][] {
  return [
    ...HUD_STYLES.map((s): [string, string] => [s, HUD_STYLE_INFO[s].name]),
    ...ownStyles(c).map((s): [string, string] => [s.id, s.name]),
  ];
}
export { isEra };
