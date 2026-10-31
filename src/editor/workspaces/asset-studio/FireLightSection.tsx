import type { BeamDef, BurnDef, FlameDef } from '../../../core/puzzles/puzzle';
import type { Asset } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';

export const FIRE_LIGHT_HELP = {
  burn: 'It burns: a torch’s flame, a fire hit, a bomb’s blast or a burning thing touching it sets it alight. It burns for the seconds you set and is gone (for good: saves remember). With Spreads on, it sets burnable things touching it alight too. Logic’s On burned runs when it is gone.',
  beam: 'It shines a beam of light straight ahead (its front: the way it is turned), from the point you set, in one of its states or always. The beam stops at the first solid thing; a mirror turns it a quarter turn; a light sensor switch it reaches turns on.',
  flame:
    'A fire effect burns on it: always, or only in one of its states (a torch stand’s flame while it is “lit”). Set where it burns (its height over the middle of the asset) and how big. It is only a picture: what burns things is fire, a torch or a bomb.',
  mirror:
    'A mirror: it turns a beam a quarter turn. Its first state leans one way, its second the other (two states are added if it has one). With Turns with Action on, the hero turns it at its interact socket. Make it a push block too and it can be moved.',
};

/**
 * Step 12b: the Asset studio's Fire and light section: burnable, beam of light, mirror. (A light sensor is a switch
 * “Lit by a beam”, in the Puzzle section; a torch stand a switch hit by Fire.) Each change is one undo step.
 */
export function FireLightSection({ def, reset }: { def: Asset; reset: (to: Asset, label: string) => void }) {
  const set = <K extends 'burn' | 'beam' | 'mirror' | 'flame'>(k: K, v: Asset[K] | undefined, label: string) => {
    const { [k]: _old, ...rest } = def;
    let next = (v === undefined ? rest : { ...rest, [k]: v }) as Asset;
    // a mirror needs two states, one leaning each way
    if (v && k === 'mirror' && next.states.length < 2)
      next = { ...next, states: ['left', 'right'], initialState: 'left' };
    reset(next, label);
  };
  const burn = def.burn;
  const beam = def.beam;
  const flame = def.flame;
  const centre = (): BeamDef['at'] => [def.footprint[0] / 2, 1.6, def.footprint[1]];
  const top = (): FlameDef['at'] => {
    const y = def.bricks.reduce(
      (m, b) => Math.max(m, (b[1] + (def.palette.types[b[3]]?.startsWith('brick') ? 3 : 1)) * 0.4),
      0,
    );
    return [def.footprint[0] / 2, Math.round(y * 10) / 10, def.footprint[1] / 2];
  };
  return (
    <div class="sec" data-help="asset.fireLight" data-tour="asset-fire-light">
      <div class="sech">
        <span>Fire and light</span>
      </div>
      <label class="lbl" data-tour="asset-burn">
        <input
          type="checkbox"
          checked={!!burn}
          onChange={() => set('burn', burn ? undefined : ({ seconds: 2 } satisfies BurnDef), 'Burns')}
        />{' '}
        Burns{burn ? `: gone after ${burn.seconds ?? 2} s` : ''}
        <FieldHelp label="Burns" text={FIRE_LIGHT_HELP.burn} />
      </label>
      {burn && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="field" style={{ minWidth: '140px' }}>
            <span>Burns for {burn.seconds ?? 2} s</span>
            <input
              type="range"
              aria-label="Burns for (seconds)"
              min={0.5}
              max={10}
              step={0.5}
              value={burn.seconds ?? 2}
              onChange={(e) =>
                set('burn', { ...burn, seconds: Number((e.target as HTMLInputElement).value) }, 'Burn time')
              }
            />
          </label>
          <label class="lbl">
            <input
              type="checkbox"
              checked={burn.spreads !== false}
              aria-label="Spreads to burnable things touching it"
              onChange={() => {
                const { spreads: _s, ...rest } = burn;
                set('burn', burn.spreads === false ? rest : { ...rest, spreads: false }, 'Fire spreads');
              }}
            />{' '}
            Spreads
          </label>
        </div>
      )}

      <label class="lbl" data-tour="asset-beam">
        <input
          type="checkbox"
          checked={!!beam}
          onChange={() => set('beam', beam ? undefined : ({ at: centre() } satisfies BeamDef), 'Beam of light')}
        />{' '}
        Shines a beam{beam ? `: ${beam.when ? `while ${beam.when}` : 'always'}, ${beam.range ?? 32} studs` : ''}
        <FieldHelp label="Beam of light" text={FIRE_LIGHT_HELP.beam} />
      </label>
      {beam && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="field">
            <span>Shines</span>
            <select
              aria-label="Beam shines"
              value={beam.when ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const { when: _w, ...rest } = beam;
                set('beam', v ? { ...rest, when: v } : rest, 'Beam shines');
              }}
            >
              <option value="">Always</option>
              {def.states.map((s) => (
                <option value={s}>While “{s}”</option>
              ))}
            </select>
          </label>
          <label class="field" style={{ minWidth: '130px' }}>
            <span>Reach {beam.range ?? 32} studs</span>
            <input
              type="range"
              aria-label="Beam reach (studs)"
              min={4}
              max={96}
              step={4}
              value={beam.range ?? 32}
              onChange={(e) =>
                set('beam', { ...beam, range: Number((e.target as HTMLInputElement).value) }, 'Beam reach')
              }
            />
          </label>
          <label class="field" style={{ minWidth: '110px' }}>
            <span>Height {beam.at[1].toFixed(1)}</span>
            <input
              type="range"
              aria-label="Beam height"
              min={0.4}
              max={6}
              step={0.4}
              value={beam.at[1]}
              onChange={(e) =>
                set(
                  'beam',
                  { ...beam, at: [beam.at[0], Number((e.target as HTMLInputElement).value), beam.at[2]] },
                  'Beam height',
                )
              }
            />
          </label>
          <label class="field">
            <span>Colour</span>
            <input
              type="color"
              aria-label="Beam colour"
              value={beam.color ?? '#fff3a0'}
              onChange={(e) => set('beam', { ...beam, color: (e.target as HTMLInputElement).value }, 'Beam colour')}
            />
          </label>
        </div>
      )}

      <label class="lbl" data-tour="asset-flame">
        <input
          type="checkbox"
          checked={!!flame}
          onChange={() => set('flame', flame ? undefined : ({ at: top() } satisfies FlameDef), 'Flame')}
        />{' '}
        Flame{flame ? `: ${flame.when ? `while ${flame.when}` : 'always'}` : ''}
        <FieldHelp label="Flame" text={FIRE_LIGHT_HELP.flame} />
      </label>
      {flame && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="field">
            <span>Burns</span>
            <select
              aria-label="Flame burns"
              value={flame.when ?? ''}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const { when: _w, ...rest } = flame;
                set('flame', v ? { ...rest, when: v } : rest, 'Flame burns');
              }}
            >
              <option value="">Always</option>
              {def.states.map((s) => (
                <option value={s}>While “{s}”</option>
              ))}
            </select>
          </label>
          <label class="field" style={{ minWidth: '110px' }}>
            <span>Height {flame.at[1].toFixed(1)}</span>
            <input
              type="range"
              aria-label="Flame height"
              min={0}
              max={12}
              step={0.2}
              value={flame.at[1]}
              onChange={(e) =>
                set(
                  'flame',
                  { ...flame, at: [flame.at[0], Number((e.target as HTMLInputElement).value), flame.at[2]] },
                  'Flame height',
                )
              }
            />
          </label>
          <label class="field" style={{ minWidth: '110px' }}>
            <span>Size {(flame.size ?? 1).toFixed(1)}</span>
            <input
              type="range"
              aria-label="Flame size"
              min={0.2}
              max={4}
              step={0.1}
              value={flame.size ?? 1}
              onChange={(e) =>
                set('flame', { ...flame, size: Number((e.target as HTMLInputElement).value) }, 'Flame size')
              }
            />
          </label>
        </div>
      )}

      <label class="lbl" data-tour="asset-mirror">
        <input
          type="checkbox"
          checked={!!def.mirror}
          onChange={() => set('mirror', def.mirror ? undefined : {}, 'Mirror')}
        />{' '}
        Mirror
        <FieldHelp label="Mirror" text={FIRE_LIGHT_HELP.mirror} />
      </label>
      {def.mirror && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="lbl">
            <input
              type="checkbox"
              checked={def.mirror.turns !== false}
              aria-label="Turns with Action"
              onChange={() => set('mirror', def.mirror?.turns === false ? {} : { turns: false }, 'Mirror turns')}
            />{' '}
            Turns with Action
          </label>
          <span class="muted small">
            Leans one way in “{def.states[0]}”, the other in “{def.states[1] ?? '—'}”; draw each with Only in this
            state.
          </span>
        </div>
      )}
    </div>
  );
}
