import {
  type Ambient,
  DAY_SECONDS,
  DEFAULT_DAY_MINUTES,
  FOG_PRESET,
  FOG_PRESETS,
  type Fog,
  fogPresetOf,
} from '../../core/lighting/atmosphere';
import type { MapDoc } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { PreviewPicker } from '../components/PreviewPicker';

export const ATMOSPHERE_HELP = {
  fog: 'Fog fades what is far away into its colour: where it starts and where it is thickest (studs from the eye), how thick it gets, and its colour (none: the sky’s). Ground fog lies low: thick below its height, thinning above it. Logic’s Set fog changes it while the game plays.',
  ambient:
    'The light that fills the shadows comes from the sky. Tint it to give a place its feel — green in a cave, warm red at sunset, cold blue in ice — and make it stronger or weaker (0: black shadows).',
  day: 'While the game plays the sun moves and night falls: a whole day takes this many minutes (v68: 20). 0: time stands still at the start time. Lights set to shine only at night come on as it gets dark. “See the map at” shows any hour here in the Scene, without changing the map.',
};

/** a fog as a small picture: the ground fading into the fog's colour */
export function FogSwatch({ fog, size = 40 }: { fog: Fog | null; size?: number }) {
  const c = fog?.color ?? '#b9cde0';
  const k = fog ? Math.round(fog.thickness * 255) : 0;
  return (
    <span
      class="fog-swatch"
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${Math.round(size * 0.7)}px`,
        background: `linear-gradient(to top, ${c}${k.toString(16).padStart(2, '0')}, transparent), linear-gradient(to top, #3d6b35 0 35%, #7da7d8 35%)`,
      }}
    />
  );
}

/** the name of the hour `seconds` into the day from a start time (as v68's sun goes) */
function hourName(start: MapDoc['sky']['time'], seconds: number): string {
  const starts: Record<string, number> = { day: 0.125, noon: 0.25, evening: 0.476, night: 0.75 };
  const turn = ((starts[start] ?? 0.125) + seconds / DAY_SECONDS) % 1;
  // the sun is up from 0 to 0.5 of a turn
  if (turn < 0.04 || turn > 0.97) return 'Dawn';
  if (turn < 0.2) return 'Morning';
  if (turn < 0.32) return 'Noon';
  if (turn < 0.45) return 'Afternoon';
  if (turn < 0.53) return 'Evening';
  return 'Night';
}

/** P27 part 2: Scene › Map — fog, the shadows' colour and the length of a day (one undo step per change) */
export function AtmosphereSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  const env = (payload: Record<string, unknown>, label: string) =>
    ed.exec({ type: 'map.setEnvironment', payload: { map: m.id, ...payload } }, { label });
  const fog = m.fog;
  const setFog = (patch: Partial<Fog>, label: string) => fog && env({ fog: { ...fog, ...patch } }, label);
  const amb: Ambient | undefined = m.ambient;
  const minutes = m.dayLength ?? DEFAULT_DAY_MINUTES;
  const preview = ed.skyPreview.value ?? 0;
  return (
    <>
      <div class="sec" data-tour="map-fog" data-help="scene.map.fog">
        <div class="sech">
          <span>
            Fog
            <FieldHelp label="Fog" text={ATMOSPHERE_HELP.fog} />
          </span>
        </div>
        <div class="field">
          Kind
          <PreviewPicker
            label="Fog"
            tour="fog-kind"
            value={fog ? (fogPresetOf(fog) ?? 'own') : 'none'}
            options={[
              { value: 'none', name: 'None (v68’s haze)', thumb: <FogSwatch fog={null} /> },
              ...FOG_PRESETS.map((k) => ({
                value: k,
                name: FOG_PRESET[k].name,
                note: FOG_PRESET[k].about,
                thumb: <FogSwatch fog={FOG_PRESET[k].fog} />,
              })),
              ...(fog && !fogPresetOf(fog) ? [{ value: 'own', name: 'My own', thumb: <FogSwatch fog={fog} /> }] : []),
            ]}
            onPick={(v) => {
              if (v === 'own') return;
              if (v === 'none') env({ fog: null }, 'No fog');
              else {
                const p = FOG_PRESET[v as keyof typeof FOG_PRESET];
                env({ fog: { ...p.fog } }, `Fog: ${p.name}`);
              }
            }}
          />
        </div>
        {fog && (
          <>
            <label class="field">
              <span>Starts at {fog.near} studs</span>
              <input
                type="range"
                aria-label="Fog starts at (studs)"
                data-tour="fog-near"
                min={0}
                max={200}
                step={1}
                value={fog.near}
                onChange={(e) => {
                  const near = Number((e.target as HTMLInputElement).value);
                  setFog({ near, far: Math.max(fog.far, near + 2) }, 'Fog start');
                }}
              />
            </label>
            <label class="field">
              <span>Thickest at {fog.far} studs</span>
              <input
                type="range"
                aria-label="Fog thickest at (studs)"
                data-tour="fog-far"
                min={2}
                max={400}
                step={1}
                value={fog.far}
                onChange={(e) => {
                  const far = Number((e.target as HTMLInputElement).value);
                  setFog({ far, near: Math.min(fog.near, far - 2) }, 'Fog end');
                }}
              />
            </label>
            <label class="field">
              <span>Thickness {Math.round(fog.thickness * 100)}%</span>
              <input
                type="range"
                aria-label="Fog thickness"
                data-tour="fog-thickness"
                min={0}
                max={1}
                step={0.05}
                value={fog.thickness}
                onChange={(e) => setFog({ thickness: Number((e.target as HTMLInputElement).value) }, 'Fog thickness')}
              />
            </label>
            <label class="field">
              Colour
              <span class="row" style={{ gap: '6px' }}>
                <input
                  type="color"
                  aria-label="Fog colour"
                  data-tour="fog-color"
                  value={fog.color ?? '#b9cde0'}
                  onChange={(e) => setFog({ color: (e.target as HTMLInputElement).value }, 'Fog colour')}
                />
                {fog.color && (
                  <button
                    type="button"
                    class="link"
                    onClick={() => {
                      const { color: _c, ...rest } = fog;
                      env({ fog: rest }, 'Fog: the sky’s colour');
                    }}
                  >
                    The sky’s colour
                  </button>
                )}
              </span>
            </label>
            <label class="lbl">
              <input
                type="checkbox"
                data-tour="fog-ground"
                checked={fog.height !== undefined}
                onChange={() => {
                  const { height: _h, groundThickness: _g, ...rest } = fog;
                  env(
                    { fog: fog.height !== undefined ? rest : { ...fog, height: 2.5, groundThickness: 0.8 } },
                    fog.height !== undefined ? 'No ground fog' : 'Ground fog',
                  );
                }}
              />{' '}
              Ground fog (lies low)
            </label>
            {fog.height !== undefined && (
              <div class="grid2">
                <label class="field">
                  <span>Up to {fog.height}</span>
                  <input
                    type="range"
                    aria-label="Ground fog height"
                    data-tour="fog-height"
                    min={-5}
                    max={30}
                    step={0.5}
                    value={fog.height}
                    onChange={(e) =>
                      setFog({ height: Number((e.target as HTMLInputElement).value) }, 'Ground fog height')
                    }
                  />
                </label>
                <label class="field">
                  <span>Thickness {Math.round((fog.groundThickness ?? 0.8) * 100)}%</span>
                  <input
                    type="range"
                    aria-label="Ground fog thickness"
                    min={0}
                    max={1}
                    step={0.05}
                    value={fog.groundThickness ?? 0.8}
                    onChange={(e) =>
                      setFog({ groundThickness: Number((e.target as HTMLInputElement).value) }, 'Ground fog thickness')
                    }
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      <div class="sec" data-tour="map-ambient" data-help="scene.map.ambient">
        <div class="sech">
          <span>
            Shadows’ colour
            <FieldHelp label="Shadows’ colour" text={ATMOSPHERE_HELP.ambient} />
          </span>
        </div>
        <label class="lbl">
          <input
            type="checkbox"
            data-tour="ambient-on"
            checked={!!amb}
            onChange={() =>
              env(
                { ambient: amb ? null : { color: '#6fa86a', strength: 1 } },
                amb ? 'Shadows as the sky gives' : 'Tint the shadows',
              )
            }
          />{' '}
          Tint the shadows
        </label>
        {amb && (
          <>
            <label class="field">
              Colour
              <input
                type="color"
                aria-label="Shadows’ colour"
                data-tour="ambient-color"
                value={amb.color}
                onChange={(e) =>
                  env({ ambient: { ...amb, color: (e.target as HTMLInputElement).value } }, 'Shadows’ colour')
                }
              />
            </label>
            <label class="field">
              <span>Strength {Math.round(amb.strength * 100)}%</span>
              <input
                type="range"
                aria-label="Shadows’ strength"
                data-tour="ambient-strength"
                min={0}
                max={2}
                step={0.05}
                value={amb.strength}
                onChange={(e) =>
                  env(
                    { ambient: { ...amb, strength: Number((e.target as HTMLInputElement).value) } },
                    'Shadows’ strength',
                  )
                }
              />
            </label>
          </>
        )}
      </div>

      <div class="sec" data-tour="map-day" data-help="scene.map.day">
        <div class="sech">
          <span>
            Day and night
            <FieldHelp label="Day and night" text={ATMOSPHERE_HELP.day} />
          </span>
        </div>
        <label class="field">
          <span>{minutes ? `A day lasts ${minutes} min` : 'Time stands still'}</span>
          <input
            type="range"
            aria-label="A day lasts (minutes)"
            data-tour="day-length"
            min={0}
            max={120}
            step={1}
            value={minutes}
            onChange={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              env(
                { dayLength: v === DEFAULT_DAY_MINUTES ? null : v },
                v ? `A day lasts ${v} min` : 'Time stands still',
              );
            }}
          />
        </label>
        <label class="field">
          <span>See the map at: {hourName(m.sky.time, preview)}</span>
          <input
            type="range"
            aria-label="See the map at"
            data-tour="sky-preview"
            min={0}
            max={DAY_SECONDS}
            step={10}
            value={preview}
            onInput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              ed.skyPreview.value = v ? v : null;
            }}
          />
        </label>
        {preview > 0 && (
          <button type="button" class="link" data-tour="sky-preview-reset" onClick={() => (ed.skyPreview.value = null)}>
            Back to the start time
          </button>
        )}
      </div>
    </>
  );
}
