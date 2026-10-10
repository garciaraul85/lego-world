import type { SoundEvent } from '../../../core/schema';
import type { EditorState } from '../../state';
import { data, isBuiltinEventId, mediaChoices, mediaName, ownsEvent } from './model';

/** One sound event: its clips, how one is picked, pitch, volume, bus, voices and cooldown (P5.3/P5.6). */
export function EventEditor({ ed, id }: { ed: EditorState; id: string }) {
  const ev = data(ed).events[id];
  if (!ev) return <div class="placeholder">That sound event was deleted.</div>;
  const builtin = isBuiltinEventId(id);
  const save = (patch: Partial<SoundEvent>, label?: string) =>
    ed.exec({ type: 'audio.setEvent', payload: { id, event: { ...ev, ...patch } } }, label ? { label } : {});
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
  return (
    <div class="scroll au-editor">
      <div class="sec">
        <div class="row">
          <input
            class="inp"
            aria-label="Sound name"
            value={ev.name ?? id}
            onChange={(e) => save({ name: (e.target as HTMLInputElement).value.trim().slice(0, 60) || id })}
          />
          <button type="button" class="btn on" onClick={() => ed.audio.previewEvent(id)}>
            ▶ Play
          </button>
        </div>
        <div class="muted small mono">
          {id}
          {builtin
            ? ownsEvent(ed, id)
              ? ' · built-in, edited in this project'
              : ' · built-in (editing saves a project copy)'
            : ''}
        </div>
      </div>
      <div class="sec">
        <div class="sech">
          <span>Clips · {ev.clips.length}</span>
        </div>
        {ev.clips.map((ref, i) => (
          <div class="au-clip">
            <button
              type="button"
              class="btn icon"
              aria-label={`Play clip ${i + 1}`}
              onClick={() => ed.audio.previewMedia(ref, ev.volume)}
            >
              ▶
            </button>
            <span class="asset-name">{mediaName(ed, ref)}</span>
            <button
              type="button"
              class="link"
              aria-label={`Remove clip ${i + 1}`}
              disabled={ev.clips.length === 1}
              onClick={() => save({ clips: ev.clips.filter((_, j) => j !== i) }, 'Remove clip')}
            >
              ×
            </button>
          </div>
        ))}
        <select
          class="inp"
          aria-label="Add a clip"
          value=""
          onChange={(e) => {
            const ref = (e.target as HTMLSelectElement).value;
            if (ref) save({ clips: [...ev.clips, ref] }, 'Add clip');
          }}
        >
          <option value="">+ Add a clip…</option>
          {mediaChoices(ed).map((m) => (
            <option value={m.ref}>{m.name}</option>
          ))}
        </select>
        <div class="field">
          Pick
          <div class="row" role="radiogroup" aria-label="Pick">
            {(['random', 'sequence', 'shuffle'] as const).map((p) => (
              <button
                type="button"
                role="radio"
                aria-checked={ev.pick === p}
                class={`btn ${ev.pick === p ? 'on' : ''}`}
                onClick={() => save({ pick: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="sec">
        <div class="sech">
          <span>Playback</span>
        </div>
        <label class="field">
          <span>
            Volume <span class="mono small">{ev.volume} dB</span>
          </span>
          <input
            type="range"
            min={-60}
            max={12}
            step={0.5}
            value={ev.volume}
            aria-label="Volume"
            onChange={(e) => save({ volume: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
        <div class="grid3">
          <label>
            Pitch from
            <input
              class="inp mono"
              type="number"
              min={0.25}
              max={4}
              step={0.05}
              value={ev.pitch[0]}
              aria-label="Pitch from"
              onChange={(e) => save({ pitch: [num((e.target as HTMLInputElement).value, 0.25, 4), ev.pitch[1]] })}
            />
          </label>
          <label>
            Pitch to
            <input
              class="inp mono"
              type="number"
              min={0.25}
              max={4}
              step={0.05}
              value={ev.pitch[1]}
              aria-label="Pitch to"
              onChange={(e) => save({ pitch: [ev.pitch[0], num((e.target as HTMLInputElement).value, 0.25, 4)] })}
            />
          </label>
          <label>
            Bus
            <select
              class="inp"
              aria-label="Bus"
              value={ev.bus}
              onChange={(e) => save({ bus: (e.target as HTMLSelectElement).value as SoundEvent['bus'] })}
            >
              {(['sfx', 'voice', 'ui', 'ambience'] as const).map((b) => (
                <option value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Max voices
            <input
              class="inp mono"
              type="number"
              min={1}
              max={32}
              value={ev.maxVoices}
              aria-label="Max voices"
              onChange={(e) => save({ maxVoices: Math.round(num((e.target as HTMLInputElement).value, 1, 32)) })}
            />
          </label>
          <label>
            Cooldown s
            <input
              class="inp mono"
              type="number"
              min={0}
              step={0.05}
              value={ev.cooldown}
              aria-label="Cooldown"
              onChange={(e) => save({ cooldown: num((e.target as HTMLInputElement).value, 0, 60) })}
            />
          </label>
        </div>
        <label class="row small">
          <input
            type="checkbox"
            checked={ev.spatial}
            onChange={(e) => save({ spatial: (e.target as HTMLInputElement).checked })}
          />
          3D: quieter far away, panned left / right
        </label>
      </div>
      <div class="sec" style={{ borderBottom: 0 }}>
        {builtin ? (
          <button
            type="button"
            class="btn wide"
            disabled={!ownsEvent(ed, id)}
            onClick={() =>
              ed.exec(
                { type: 'audio.setEvent', payload: { id, event: null, builtin: true } },
                { label: 'Reset sound to built-in' },
              )
            }
          >
            Reset to built-in
          </button>
        ) : (
          <button
            type="button"
            class="btn wide danger"
            onClick={() => {
              if (ed.exec({ type: 'audio.setEvent', payload: { id, event: null } }).ok)
                ed.audioSel.value = { kind: 'event', id: null };
            }}
          >
            Delete sound event
          </button>
        )}
      </div>
    </div>
  );
}
