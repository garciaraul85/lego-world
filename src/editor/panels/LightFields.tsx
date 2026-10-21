import { LIGHT_PRESET, LIGHT_PRESETS, type LightDef, presetOf } from '../../core/lighting/light';
import type { LightInstance, MapDoc } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp, Header, TextField } from '../components/fields';
import { PreviewPicker } from '../components/PreviewPicker';
import { mapItems } from '../interact/place';

export const LIGHT_HELP = {
  light:
    'A light lights the bricks and characters around it, as in the game. Pick a kind (Torch, Candle, Lamp, Crystal, Lava glow, Moonbeam) and change it: its colour, how bright it is, how far it reaches (studs), how much it flickers like a flame, and whether bricks cast shadows from it (the nearest light that casts shadows draws them).',
  darkness:
    'How dark this map is without its lights: 0 lit by its sky as usual, 1 pitch black. A dark map shows only what its lights reach (torches, lamps, glowing effects and assets that give light).',
};

/** a light as a small round glow of its colour (the presets' pictures) */
export function LightSwatch({ light, size = 26 }: { light: Pick<LightDef, 'color' | 'brightness'>; size?: number }) {
  const a = Math.min(1, 0.35 + light.brightness * 0.3);
  return (
    <span
      class="light-swatch"
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: `radial-gradient(circle at center, #fff 0 10%, ${light.color} 28%, ${light.color}${Math.round(
          a * 120,
        )
          .toString(16)
          .padStart(2, '0')} 50%, transparent 72%), #111418`,
      }}
    />
  );
}

/**
 * P27: a light's settings: its kind (a preset), colour, brightness, reach, flicker and shadows. Used by a light
 * placed on the map, an asset that gives light and an effect that glows.
 */
export function LightFields({
  light,
  onChange,
  tour = 'light',
}: {
  light: LightDef;
  onChange: (next: LightDef, label: string) => void;
  tour?: string;
}) {
  const kind = presetOf(light) ?? '';
  const set = <K extends keyof LightDef>(k: K, v: LightDef[K], label: string) => onChange({ ...light, [k]: v }, label);
  return (
    <div class="light-fields" data-tour={`${tour}-fields`}>
      <label class="field">
        <span>
          Kind
          <FieldHelp label="Light" text={LIGHT_HELP.light} />
        </span>
        <PreviewPicker
          label="Kind of light"
          tour={`${tour}-kind`}
          value={kind}
          placeholder="My own"
          options={LIGHT_PRESETS.map((k) => ({
            value: k,
            name: LIGHT_PRESET[k].name,
            note: LIGHT_PRESET[k].about,
            thumb: <LightSwatch light={LIGHT_PRESET[k].light} size={40} />,
          }))}
          onPick={(k) => {
            const p = LIGHT_PRESET[k as keyof typeof LIGHT_PRESET];
            if (p) onChange({ ...p.light }, `Light: ${p.name}`);
          }}
        />
      </label>
      <label class="field">
        Colour
        <span class="row" style={{ gap: '6px' }}>
          <input
            type="color"
            aria-label="Light colour"
            data-tour={`${tour}-color`}
            value={light.color}
            onChange={(e) => set('color', (e.target as HTMLInputElement).value, 'Light colour')}
          />
          <LightSwatch light={light} />
        </span>
      </label>
      <label class="field">
        <span>Brightness: {light.brightness.toFixed(1)}</span>
        <input
          type="range"
          aria-label="Brightness"
          data-tour={`${tour}-brightness`}
          min={0}
          max={4}
          step={0.1}
          value={light.brightness}
          onChange={(e) => set('brightness', Number((e.target as HTMLInputElement).value), 'Light brightness')}
        />
      </label>
      <label class="field">
        <span>Reaches: {light.range} studs</span>
        <input
          type="range"
          aria-label="Reaches (studs)"
          data-tour={`${tour}-range`}
          min={2}
          max={40}
          step={1}
          value={light.range}
          onChange={(e) => set('range', Number((e.target as HTMLInputElement).value), 'Light reach')}
        />
      </label>
      <label class="field">
        <span>Flicker: {Math.round(light.flicker * 100)}%</span>
        <input
          type="range"
          aria-label="Flicker"
          data-tour={`${tour}-flicker`}
          min={0}
          max={1}
          step={0.05}
          value={light.flicker}
          onChange={(e) => set('flicker', Number((e.target as HTMLInputElement).value), 'Light flicker')}
        />
      </label>
      <label class="lbl">
        <input
          type="checkbox"
          data-tour={`${tour}-shadow`}
          checked={light.shadow}
          onChange={() => set('shadow', !light.shadow, light.shadow ? 'No shadows' : 'Casts shadows')}
        />{' '}
        Bricks cast shadows from it
      </label>
    </div>
  );
}

/** P27: a light placed on the map, selected in the Scene: its name, settings and whether it starts on. */
export function LightInspector({ c, item: it }: { c: ActionCtx; item: LightInstance }) {
  const { ed } = c;
  const map = ed.mapId.value;
  const patch = (p: Partial<LightInstance>, label = 'Edit light') =>
    ed.exec({ type: 'item.update', payload: { map, id: it.id, patch: p } }, { label });
  return (
    <>
      <Header title={it.name ?? 'Light'} sub={`Light · ${it.on ? 'on' : 'off at the start'}`} color={it.light.color} />
      <div class="sec" data-help="scene.item.light" data-tour="item-light">
        <div class="field">
          Name
          <TextField label="Light name" value={it.name ?? ''} onCommit={(name) => patch({ name: name.slice(0, 60) })} />
        </div>
        <LightFields light={it.light} onChange={(light, label) => patch({ light }, label)} />
        <label class="field">
          <span>Height: {it.pos[1].toFixed(1)}</span>
          <input
            type="range"
            aria-label="Light height"
            data-tour="light-height"
            min={0.2}
            max={30}
            step={0.2}
            value={it.pos[1]}
            onChange={(e) =>
              patch({ pos: [it.pos[0], Number((e.target as HTMLInputElement).value), it.pos[2]] }, 'Light height')
            }
          />
        </label>
        <label class="lbl">
          <input
            type="checkbox"
            data-tour="light-on"
            checked={it.on}
            onChange={() => patch({ on: !it.on }, it.on ? 'Light off at the start' : 'Light on')}
          />{' '}
          On from the start (off: logic’s Light on, or an action, switches it on)
        </label>
        <p class="muted small">
          Logic and actions switch it by its name. Drag it in the view to move it; the ring shows how far it reaches.
        </p>
      </div>
    </>
  );
}

/** P27: Scene › Map › Darkness — how dark the map is without its lights (one undo step per change) */
export function DarknessSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  const dark = m.darkness ?? 0;
  const lights = mapItems(ed).filter((i) => i.kind === 'light').length;
  return (
    <div class="sec" data-tour="map-darkness" data-help="scene.map.darkness">
      <div class="sech">
        <span>
          Darkness
          <FieldHelp label="Darkness" text={LIGHT_HELP.darkness} />
        </span>
      </div>
      <label class="field">
        <span>{dark === 0 ? 'Lit by its sky' : dark >= 1 ? 'Pitch black' : `${Math.round(dark * 100)}% dark`}</span>
        <input
          type="range"
          aria-label="Darkness"
          data-tour="darkness"
          min={0}
          max={1}
          step={0.05}
          value={dark}
          onChange={(e) =>
            ed.exec(
              {
                type: 'map.setEnvironment',
                payload: { map: m.id, darkness: Number((e.target as HTMLInputElement).value) },
              },
              { label: 'Darkness' },
            )
          }
        />
      </label>
      <p class="muted small">
        {lights
          ? `${lights} light${lights === 1 ? '' : 's'} on this map. `
          : 'No lights on this map yet: Dock › Lights, or right-click the ground: Add a light here. '}
        Assets that give light and glowing effects light it too.
      </p>
    </div>
  );
}
