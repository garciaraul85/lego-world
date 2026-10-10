import { useState } from 'preact/hooks';
import type { EditorState } from '../../state';
import { data, isBuiltinEventId, isBuiltinMusicId, ownsEvent, ownsMusic } from './model';

/** The Audio workspace's left column: sound events, music, the mixer and imported media. */
export function EventList({
  ed,
  onImport,
  onNewEvent,
  onNewMusic,
}: {
  ed: EditorState;
  onImport: () => void;
  onNewEvent: () => void;
  onNewMusic: () => void;
}) {
  const [q, setQ] = useState('');
  const d = data(ed);
  const sel = ed.audioSel.value;
  const pick = (kind: 'event' | 'music' | 'mixer' | 'media', id: string | null = null) =>
    (ed.audioSel.value = { kind, id });
  const events = Object.entries(d.events)
    .filter(([id, e]) => `${e.name ?? id}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a[1].name ?? a[0]).localeCompare(b[1].name ?? b[0]));
  return (
    <section class="panel studio-lib" aria-label="Sounds and music">
      <div class="ptabs">
        <span class="tab on">Audio</span>
      </div>
      <div class="scroll">
        <div style={{ padding: '8px' }}>
          <input
            class="inp"
            placeholder="Search sounds…"
            aria-label="Search sounds"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="sech" style={{ padding: '4px 10px' }}>
          <span>Sound events · {events.length}</span>
          <button type="button" class="link" onClick={onNewEvent}>
            + New
          </button>
        </div>
        {events.map(([id, e]) => (
          <button
            type="button"
            class={`lib-item ${sel.kind === 'event' && sel.id === id ? 'on' : ''}`}
            onClick={() => pick('event', id)}
          >
            <span class="asset-name">{e.name ?? id}</span>
            <span class="mono small muted">
              {isBuiltinEventId(id) ? (ownsEvent(ed, id) ? 'edited' : 'built-in') : e.bus}
            </span>
          </button>
        ))}
        <div class="sech" style={{ padding: '8px 10px 4px' }}>
          <span>Music</span>
          <button type="button" class="link" onClick={onNewMusic}>
            + New
          </button>
        </div>
        {Object.entries(d.music.states).map(([id, m]) => (
          <button
            type="button"
            class={`lib-item ${sel.kind === 'music' && sel.id === id ? 'on' : ''}`}
            onClick={() => pick('music', id)}
          >
            <span class="asset-name">♪ {m.name ?? id}</span>
            <span class="mono small muted">
              {isBuiltinMusicId(id) ? (ownsMusic(ed, id) ? 'edited' : 'built-in') : `${m.layers.length} layer`}
            </span>
          </button>
        ))}
        <div class="sech" style={{ padding: '8px 10px 4px' }}>
          <span>Mix</span>
        </div>
        <button type="button" class={`lib-item ${sel.kind === 'mixer' ? 'on' : ''}`} onClick={() => pick('mixer')}>
          <span class="asset-name">Mixer &amp; ducking</span>
        </button>
        <button type="button" class={`lib-item ${sel.kind === 'media' ? 'on' : ''}`} onClick={() => pick('media')}>
          <span class="asset-name">Imported media</span>
        </button>
        <div style={{ padding: '8px 10px' }}>
          <button type="button" class="btn wide" onClick={onImport}>
            Import sounds…
          </button>
        </div>
      </div>
    </section>
  );
}
