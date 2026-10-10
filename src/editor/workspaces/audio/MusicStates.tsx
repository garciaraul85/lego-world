import { useState } from 'preact/hooks';
import type { Music } from '../../../core/schema';
import type { EditorState } from '../../state';
import { data, isBuiltinMusicId, mediaChoices, mediaName, ownsMusic } from './model';

type State = Music['states'][string];

/** A music state (layers, loop) plus the project's crossfade and stingers (P5.4). */
export function MusicStates({ ed, id }: { ed: EditorState; id: string }) {
  const d = data(ed);
  const st = d.music.states[id];
  const [playing, setPlaying] = useState(false);
  if (!st) return <div class="placeholder">That music was deleted.</div>;
  const save = (patch: Partial<State>, label?: string) =>
    ed.exec({ type: 'audio.setMusic', payload: { id, state: { ...st, ...patch } } }, label ? { label } : {});
  const builtin = isBuiltinMusicId(id);
  return (
    <div class="scroll au-editor">
      <div class="sec">
        <div class="row">
          <input
            class="inp"
            aria-label="Music name"
            value={st.name ?? id}
            onChange={(e) => save({ name: (e.target as HTMLInputElement).value.trim().slice(0, 60) || id })}
          />
          <button
            type="button"
            class={`btn ${playing ? '' : 'on'}`}
            onClick={() => {
              ed.audio.previewMusic(playing ? null : id);
              setPlaying(!playing);
            }}
          >
            {playing ? '■ Stop' : '▶ Audition'}
          </button>
        </div>
        <div class="muted small mono">
          {id}
          {builtin ? (ownsMusic(ed, id) ? ' · built-in, edited' : ' · built-in') : ''}
        </div>
      </div>
      <div class="sec">
        <div class="sech">
          <span>Layers</span>
        </div>
        {st.layers.map((l, i) => (
          <div class="au-clip">
            <span class="asset-name">{mediaName(ed, l.media)}</span>
            <input
              class="inp mono"
              type="number"
              min={-60}
              max={12}
              step={1}
              value={l.volume}
              aria-label={`Layer ${i + 1} volume`}
              style={{ width: '70px' }}
              onChange={(e) =>
                save({
                  layers: st.layers.map((x, j) =>
                    j === i ? { ...x, volume: Number((e.target as HTMLInputElement).value) } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              class="link"
              disabled={st.layers.length === 1}
              aria-label={`Remove layer ${i + 1}`}
              onClick={() => save({ layers: st.layers.filter((_, j) => j !== i) }, 'Remove layer')}
            >
              ×
            </button>
          </div>
        ))}
        <select
          class="inp"
          aria-label="Add a layer"
          value=""
          onChange={(e) => {
            const ref = (e.target as HTMLSelectElement).value;
            if (ref) save({ layers: [...st.layers, { media: ref, volume: 0 }] }, 'Add music layer');
          }}
        >
          <option value="">+ Add a layer…</option>
          {mediaChoices(ed).map((m) => (
            <option value={m.ref}>{m.name}</option>
          ))}
        </select>
        <label class="row small">
          <input
            type="checkbox"
            checked={st.loop}
            onChange={(e) => save({ loop: (e.target as HTMLInputElement).checked })}
          />
          Loop
        </label>
        <p class="hint">Layers start together and loop in sync (stems: drums, bass, melody).</p>
      </div>
      <div class="sec">
        <div class="sech">
          <span>All music</span>
        </div>
        <label class="field">
          <span>
            Crossfade <span class="mono small">{d.music.crossfade} s</span>
          </span>
          <input
            type="range"
            min={0}
            max={6}
            step={0.25}
            value={d.music.crossfade}
            aria-label="Crossfade seconds"
            onChange={(e) =>
              ed.exec({
                type: 'audio.setMusicSettings',
                payload: { crossfade: Number((e.target as HTMLInputElement).value) },
              })
            }
          />
        </label>
        <div class="sech">
          <span>Stingers</span>
        </div>
        {Object.entries(d.music.stingers).map(([name, ref]) => (
          <div class="au-clip">
            <button
              type="button"
              class="btn icon"
              aria-label={`Play stinger ${name}`}
              onClick={() => ed.audio.previewMedia(ref)}
            >
              ▶
            </button>
            <span class="asset-name">
              <strong>{name}</strong> · {mediaName(ed, ref)}
            </span>
          </div>
        ))}
        <p class="hint">
          A stinger plays once over the music and ducks it (logic: Play stinger; screens use splash / game over).
        </p>
      </div>
      <div class="sec" style={{ borderBottom: 0 }}>
        {builtin ? (
          <button
            type="button"
            class="btn wide"
            disabled={!ownsMusic(ed, id)}
            onClick={() => ed.exec({ type: 'audio.setMusic', payload: { id, state: null, builtin: true } })}
          >
            Reset to built-in
          </button>
        ) : (
          <button
            type="button"
            class="btn wide danger"
            onClick={() => {
              if (ed.exec({ type: 'audio.setMusic', payload: { id, state: null } }).ok)
                ed.audioSel.value = { kind: 'music', id: null };
            }}
          >
            Delete music
          </button>
        )}
      </div>
    </div>
  );
}
