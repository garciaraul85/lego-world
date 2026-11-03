import type { LiftDef, WindDef } from '../../../core/puzzles/puzzle';
import type { Asset } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';

export const WIND_HELP = {
  wind: 'It blows wind straight out of its front (the way it is turned), always or in one of its states: a fan. The air pushes what it meets as real air does, by drag: light things (loose crates, bricks, bombs) are blown along, heavy ones stay put; the hero leans into it, walks into it more slowly and in a strong wind is blown back; on ice or in the air it drifts with it. A wall stops the wind. It spins pinwheels (switches Turned by the wind) and blows small flames out (a lit torch stand, a burning stick), as the fans of Zelda’s wind temples do.',
  lift: 'The hero can lift it (Action, as a bomb), carry it over its head, put it down (standing still) or throw it (walking). Thrown, it flies in an arc and the physics engine rolls it to rest; a switch it strikes is hit (a crystal switch turns), and lying on a floor switch it weighs on it. Breaks: it breaks where it lands or on what it hits, dropping what it holds (a clay pot’s hearts).',
};

/**
 * Step 12c-2: the Asset studio's Wind and lifting section: Wind (where it blows from, in which state, how fast, how
 * far, how wide and tall) and Lift (breaks, weight). Each change is one undo step.
 */
export function WindSection({ def, reset }: { def: Asset; reset: (to: Asset, label: string) => void }) {
  const set = <K extends 'wind' | 'lift'>(k: K, v: Asset[K] | undefined, label: string) => {
    const { [k]: _old, ...rest } = def;
    reset((v === undefined ? rest : { ...rest, [k]: v }) as Asset, label);
  };
  const w = def.wind;
  const l = def.lift;
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const [fw, fd] = def.footprint ?? [2, 2];
  const range = (
    key: 'speed' | 'reach' | 'width' | 'height',
    label: string,
    unit: string,
    min: number,
    max: number,
    step: number,
    first: number,
  ) =>
    w && (
      <label class="field" style={{ minWidth: '120px' }}>
        <span>
          {label} {w[key] ?? first} {unit}
        </span>
        <input
          type="range"
          aria-label={`Wind ${label.toLowerCase()}`}
          min={min}
          max={max}
          step={step}
          value={w[key] ?? first}
          onChange={(e) => set('wind', { ...w, [key]: num(e) }, `Wind ${label.toLowerCase()}`)}
        />
      </label>
    );
  return (
    <div class="sec" data-help="asset.wind" data-tour="asset-wind-sec">
      <div class="sech">
        <span>Wind and lifting</span>
      </div>
      <label class="lbl" data-tour="asset-wind">
        <input
          type="checkbox"
          checked={!!w}
          onChange={() =>
            set(
              'wind',
              w ? undefined : ({ at: [fw / 2, 0.4, fd], width: Math.max(1, fw - 1), height: 3.6 } satisfies WindDef),
              'Wind',
            )
          }
        />{' '}
        Blows wind (a fan){w ? `: ${w.speed ?? 16} studs a second, ${w.reach ?? 16} studs` : ''}
        <FieldHelp label="Wind" text={WIND_HELP.wind} />
      </label>
      {w && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px', alignItems: 'end' }}>
          {range('speed', 'Speed', 'studs/s', 2, 60, 1, 16)}
          {range('reach', 'Reach', 'studs', 2, 64, 1, 16)}
          {range('width', 'Width', 'studs', 1, 16, 1, 3)}
          {range('height', 'Height', 'studs', 1, 16, 0.4, 3)}
          <label class="field" style={{ minWidth: '130px' }}>
            <span>Blows</span>
            <select
              class="inp"
              aria-label="Wind blows in"
              value={w.when ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const { when: _w, ...rest } = w;
                set('wind', v ? { ...w, when: v } : rest, 'Wind blows in');
              }}
            >
              <option value="">Always</option>
              {def.states.map((s) => (
                <option value={s}>In “{s}”</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label class="lbl" data-tour="asset-lift">
        <input
          type="checkbox"
          checked={!!l}
          onChange={() => set('lift', l ? undefined : ({} satisfies LiftDef), 'Lift and throw')}
        />{' '}
        Lift and throw (a rock, a pot)
        <FieldHelp label="Lift and throw" text={WIND_HELP.lift} />
      </label>
      {l && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px', alignItems: 'end' }}>
          <label class="lbl">
            <input
              type="checkbox"
              checked={!!l.breaks}
              onChange={() => set('lift', { ...l, breaks: !l.breaks }, 'Breaks')}
            />{' '}
            Breaks where it lands
          </label>
          <label class="field" style={{ width: '90px' }}>
            <span>Weight</span>
            <input
              class="inp"
              type="number"
              aria-label="Lift weight"
              min={1}
              max={5}
              value={l.weight ?? 1}
              onChange={(e) => set('lift', { ...l, weight: Math.max(1, Math.min(5, Math.round(num(e)))) }, 'Weight')}
            />
          </label>
        </div>
      )}
    </div>
  );
}
