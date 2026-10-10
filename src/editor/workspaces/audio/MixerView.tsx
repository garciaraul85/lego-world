import { DEFAULT_MIXER } from '../../../builtin/audio';
import { paths } from '../../../core/schema';
import { BUSES, dbToGain } from '../../../engine/audio/Mixer';
import type { EditorState } from '../../state';
import { Meter } from './Meters';
import { BUS_LABEL, data } from './model';

/**
 * Mixer (board 8): a fader and a live meter per bus, plus ducking rules. Dragging a fader changes the
 * volume at once (also while playing); letting go saves audio/mixer.json as one undo step.
 */
export function MixerView({ ed, compact }: { ed: EditorState; compact?: boolean }) {
  const mx = data(ed).mixer;
  const base = ed.store.get(paths.mixer) ? mx : DEFAULT_MIXER;
  const set = (p: object, label?: string) =>
    ed.exec({ type: 'audio.setMixer', payload: { base, ...p } }, label ? { label } : {});
  return (
    <div class={`au-mixer ${compact ? 'compact' : ''}`}>
      <div class="au-faders" role="group" aria-label="Mixer">
        {BUSES.map((bus) => (
          <div class="au-strip">
            <span class="au-bus">{BUS_LABEL[bus]}</span>
            <div class="au-fader-row">
              <Meter ed={ed} bus={bus} />
              <input
                type="range"
                class="au-fader"
                min={-60}
                max={12}
                step={0.5}
                value={mx.buses[bus]}
                aria-label={`${BUS_LABEL[bus]} volume`}
                onInput={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  const node = ed.audio.mixer?.buses.get(bus)?.fader;
                  if (node && ed.audio.ctx) node.gain.setTargetAtTime(dbToGain(v), ed.audio.ctx.currentTime, 0.02);
                }}
                onChange={(e) => set({ buses: { [bus]: Number((e.target as HTMLInputElement).value) } })}
              />
            </div>
            <span class="mono small">
              {mx.buses[bus] <= -60 ? '−∞' : `${mx.buses[bus] > 0 ? '+' : ''}${mx.buses[bus]} dB`}
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <div class="sec">
          <div class="sech">
            <span>Ducking</span>
            <button
              type="button"
              class="link"
              onClick={() =>
                set(
                  { duck: [...mx.duck, { when: 'voice', target: 'ambience', amount: -6, attack: 0.05, release: 0.5 }] },
                  'Add ducking rule',
                )
              }
            >
              + Rule
            </button>
          </div>
          <p class="hint">While a trigger plays (a voice line, a stinger), the target bus is pulled down.</p>
          {mx.duck.map((r, i) => {
            const patch = (p: object) =>
              set({ duck: mx.duck.map((x, j) => (j === i ? { ...x, ...p } : x)) }, 'Edit ducking');
            return (
              <div class="au-duck">
                <select
                  class="inp"
                  aria-label="When"
                  value={r.when}
                  onChange={(e) => patch({ when: (e.target as HTMLSelectElement).value })}
                >
                  <option value="voice">Voice plays</option>
                  <option value="stinger">Stinger plays</option>
                </select>
                <span class="muted small">ducks</span>
                <select
                  class="inp"
                  aria-label="Target bus"
                  value={r.target}
                  onChange={(e) => patch({ target: (e.target as HTMLSelectElement).value })}
                >
                  {BUSES.filter((b) => b !== 'master').map((b) => (
                    <option value={b}>{BUS_LABEL[b]}</option>
                  ))}
                </select>
                <label class="small">
                  dB
                  <input
                    class="inp mono"
                    type="number"
                    min={-60}
                    max={0}
                    step={1}
                    value={r.amount}
                    onChange={(e) => patch({ amount: Number((e.target as HTMLInputElement).value) })}
                  />
                </label>
                <label class="small">
                  in s
                  <input
                    class="inp mono"
                    type="number"
                    min={0}
                    step={0.05}
                    value={r.attack}
                    onChange={(e) => patch({ attack: Number((e.target as HTMLInputElement).value) })}
                  />
                </label>
                <label class="small">
                  out s
                  <input
                    class="inp mono"
                    type="number"
                    min={0}
                    step={0.05}
                    value={r.release}
                    onChange={(e) => patch({ release: Number((e.target as HTMLInputElement).value) })}
                  />
                </label>
                <button
                  type="button"
                  class="link"
                  aria-label="Remove rule"
                  onClick={() => set({ duck: mx.duck.filter((_, j) => j !== i) }, 'Remove ducking rule')}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
