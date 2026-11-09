import { useEffect, useState } from 'preact/hooks';
import {
  type Bindable,
  BUTTON_NAME,
  buttonsOf,
  type Controls,
  clashOf,
  controlsOf,
  keyName,
  LAYOUT_INFO,
  LAYOUTS,
  type Layout,
  MOVES,
  PAD_NAME,
} from '../../core/controls/controls';
import { HUD_STYLE_INFO, HUD_STYLES, type HudStyle } from '../../core/controls/hud-styles';
import { paths, type Settings } from '../../core/schema';
import { EraButtons } from '../../engine/ui/widgets';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';

export const CONTROLS_HELP =
  'The game’s buttons, like Zelda’s. No action has a fixed key: the Action button does whatever fits where the hero stands (Talk, Open, Read, Rebuild, Jump…, and later Grab, Climb, Dive), and the item buttons use the item the player puts in each from the item menu. Pick a layout: Ocarina (Attack, Action and 3 item buttons, no jump button), Classic (2 item buttons, Action jumps when nothing else fits), Modern (a Jump button, 2 item buttons and an item wheel) or Custom. Keys and gamepad buttons can be changed here for the game, and players can change their own in Settings › Controls.';

/** step 11b part 1: Project › Controls — the layout, item buttons, where jumping is, and the game's keys */
export function ControlsSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  void ed.revision.value;
  const raw = ed.store.get<Settings>(paths.settings)?.controls;
  const cur: Controls = raw ?? { layout: 'modern' };
  const o = controlsOf(cur);
  const [wait, setWait] = useState<Bindable | null>(null);
  const save = (next: Controls | null, label: string) =>
    ed.exec({ type: 'project.update', payload: { controls: next } }, { label });
  useEffect(() => {
    if (!wait) return;
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const k = e.key.toLowerCase();
      setWait(null);
      if (k === 'escape') return;
      const clash = clashOf(o, wait, k);
      const keys: Partial<Record<Bindable, string[]>> = { ...(cur.keys ?? {}), [wait]: [k] };
      if (clash) keys[clash] = o.keys[clash].filter((x) => x !== k);
      save({ ...cur, keys }, `${BUTTON_NAME[wait]} key: ${keyName(k)}`);
      if (clash) ed.notify(`${keyName(k)} was ${BUTTON_NAME[clash]}'s key: it is ${BUTTON_NAME[wait]}'s now.`);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [wait]);
  const live = [...buttonsOf(cur), ...MOVES];
  return (
    <div class="sec" data-tour="project-controls" data-help="project.controls">
      <div class="sech">
        <span>
          Controls
          <FieldHelp label="Controls" text={CONTROLS_HELP} />
        </span>
      </div>
      <HudStylePicker c={c} cur={cur.hud ?? null} />
      <label class="field">
        Layout
        <select
          class="inp"
          aria-label="Button layout"
          data-tour="controls-layout"
          value={cur.layout}
          onChange={(e) => save({ ...cur, layout: (e.target as HTMLSelectElement).value as Layout }, 'Button layout')}
        >
          {LAYOUTS.map((l) => (
            <option value={l}>{LAYOUT_INFO[l].name}</option>
          ))}
        </select>
      </label>
      <p class="hint">{LAYOUT_INFO[cur.layout].about}.</p>
      {cur.layout === 'custom' && (
        <div class="row" style={{ gap: '8px' }}>
          <label class="field">
            Item buttons
            <select
              class="inp"
              aria-label="Item buttons"
              value={o.items}
              onChange={(e) => save({ ...cur, items: Number((e.target as HTMLSelectElement).value) }, 'Item buttons')}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label class="field">
            Jumping
            <select
              class="inp"
              aria-label="Jumping"
              value={o.jump}
              onChange={(e) =>
                save({ ...cur, jump: (e.target as HTMLSelectElement).value as Controls['jump'] }, 'Jumping')
              }
            >
              <option value="action">With Action (when nothing else fits)</option>
              <option value="button">A Jump button</option>
              <option value="none">No jumping</option>
            </select>
          </label>
        </div>
      )}
      <div class="ctl-binds" role="group" aria-label="Keys and gamepad buttons">
        {live.map((b) => (
          <div class="ctl-bind">
            <span role="cell">{BUTTON_NAME[b]}</span>
            <button
              type="button"
              class={`btn small ${wait === b ? 'on' : ''}`}
              data-tour={`controls-key-${b}`}
              aria-label={`${BUTTON_NAME[b]} key: ${o.keys[b].map(keyName).join(', ') || 'none'}. Press to change`}
              onClick={() => setWait(wait === b ? null : b)}
            >
              {wait === b ? 'Press a key…' : o.keys[b].map(keyName).join(', ') || '—'}
            </button>
            <select
              class="inp small"
              aria-label={`${BUTTON_NAME[b]} gamepad button`}
              value={o.pad[b][0] ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                save(
                  { ...cur, pad: { ...(cur.pad ?? {}), [b]: v === '' ? [] : [Number(v)] } },
                  `${BUTTON_NAME[b]} pad`,
                );
              }}
            >
              <option value="">—</option>
              {Object.entries(PAD_NAME).map(([i, n]) => (
                <option value={i}>{n}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button type="button" class="btn small" disabled={!raw} onClick={() => save(null, 'Controls: defaults')}>
        Back to the default controls
      </button>
    </div>
  );
}

export const HUD_STYLE_HELP =
  'HUD styles after each era of 3D adventure games, oldest first. Corner buttons (64-bit era): a green Attack, a blue Action that says what it does, three yellow item buttons in the top right, money bottom left, no jump button. Big-button cluster (cube era): a big green Action with a red Attack, two grey item buttons and a purple one. Pointer (motion era): a remote-shaped strip — tap the item button to use it, hold it for the item wheel; the attack is a swing. Second screen (tablet era): a tablet along the bottom with the map, the buttons and the items, touched to use them. Open air (today): small hints, a stamina wheel by the hero, a jump button and a quick menu. Applying one sets the button layout and arranges the HUD screen (Undo brings back what was); its looks are drawn here, original.';

/** the buttons a preview shows, as Play would (an item, its count, a live Action label) */
const PREVIEW = [
  { id: 'attack', name: 'Attack', key: 'F', label: 'Attack' },
  { id: 'action', name: 'Action', key: 'E', label: 'Open' },
  { id: 'jump', name: 'Jump', key: 'Space', label: 'Jump' },
  { id: 'item1', name: 'Item 1', key: 'J', label: 'Bow', count: 12 },
  { id: 'item2', name: 'Item 2', key: 'K', label: 'Bomb', count: 5 },
  { id: 'item3', name: 'Item 3', key: 'L', label: '' },
  { id: 'guard', name: 'Guard', key: 'Q', label: 'Guard' },
  { id: 'lock', name: 'Lock on', key: 'Z', label: 'Lock on' },
  { id: 'roll', name: 'Roll', key: 'C', label: 'Roll' },
  { id: 'wheel', name: 'Item wheel', key: 'R', label: 'Items' },
];

/** Milestone 3b (B7b): Project › Controls › HUD style — one card per era, each with its buttons drawn */
function HudStylePicker({ c, cur }: { c: ActionCtx; cur: HudStyle | null }) {
  const { ed } = c;
  const apply = (style: HudStyle | null) => {
    const r = ed.exec({ type: 'hud.applyStyle', payload: { style } });
    if (r.ok)
      ed.notify(
        style
          ? `HUD style: ${HUD_STYLE_INFO[style].name}. The HUD screen is arranged for it (Undo brings back what was).`
          : 'HUD style: plain',
      );
  };
  return (
    <div data-tour="hud-styles" data-help="project.hudStyle" role="group" aria-label="HUD style">
      <div class="sech" style={{ padding: '6px 0 4px' }}>
        <span>
          HUD style
          <FieldHelp label="HUD style" text={HUD_STYLE_HELP} />
        </span>
        <span class="small muted">{cur ? HUD_STYLE_INFO[cur].name : 'Plain'}</span>
      </div>
      <div class="hud-style-cards">
        {HUD_STYLES.map((st) => {
          const info = HUD_STYLE_INFO[st];
          return (
            <button
              type="button"
              class={`hud-style-card${cur === st ? ' on' : ''}`}
              aria-pressed={cur === st}
              aria-label={`HUD style ${info.name} (${info.era})`}
              title={info.about}
              onClick={() => apply(st)}
            >
              <span class="hud-style-preview" aria-hidden="true">
                <span class={`bw-w bw-buttons bw-hud-${st}`}>
                  <EraButtons
                    look={st}
                    list={PREVIEW}
                    host={{
                      lookup: () => undefined,
                      run: () => {},
                      sound: () => {},
                      touch: false,
                      preview: { selected: null, select: () => {} },
                    }}
                  />
                </span>
              </span>
              <strong>{info.name}</strong>
              <span class="small muted">{info.era}</span>
            </button>
          );
        })}
        <button
          type="button"
          class={`hud-style-card plain${cur === null ? ' on' : ''}`}
          aria-pressed={cur === null}
          aria-label="HUD style Plain"
          onClick={() => apply(null)}
        >
          <span class="hud-style-preview" aria-hidden="true">
            <span class="hud-plain">Attack · Open · Bow</span>
          </span>
          <strong>Plain</strong>
          <span class="small muted">the built-in HUD</span>
        </button>
      </div>
      {cur && <p class="hint">{HUD_STYLE_INFO[cur].feel}</p>}
    </div>
  );
}
