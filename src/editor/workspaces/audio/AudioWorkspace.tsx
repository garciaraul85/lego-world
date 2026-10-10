import { useEffect, useState } from 'preact/hooks';
import { MUS } from '../../../builtin/audio';
import { usesOf } from '../../../core/audio/usage';
import { newId } from '../../../core/ids';
import { type MediaIndex, paths } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { ImportMedia } from '../../dialogs/ImportMedia';
import { EventEditor } from './EventEditor';
import { EventList } from './EventList';
import { MixerView } from './MixerView';
import { MusicStates } from './MusicStates';
import { data, newSoundEvent } from './model';

/** Audio workspace (board 8, P5.6): sound events, music states, the mixer with meters, media and "where used". */
export function AudioWorkspace({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const [importing, setImporting] = useState(false);
  const sel = ed.audioSel.value;
  const d = data(ed);
  useEffect(() => {
    ed.audio.init();
    if (sel.kind === 'event' && !sel.id) {
      const first = Object.keys(d.events)[0];
      if (first) ed.audioSel.value = { kind: 'event', id: first };
    }
    return () => ed.audio.previewMusic(null);
  }, []);
  const newEvent = () => {
    const ev = newSoundEvent(ed, `Sound ${Object.keys(d.events).length + 1}`, [Object.values(d.events)[0]!.clips[0]!]);
    if (ev) ed.audioSel.value = { kind: 'event', id: ev.id };
  };
  const newMusic = () => {
    const id = newId('music');
    const base = d.music.states[MUS.explore]!;
    if (
      ed.exec({
        type: 'audio.setMusic',
        payload: { id, state: { ...base, name: `Music ${Object.keys(d.music.states).length + 1}` } },
      }).ok
    )
      ed.audioSel.value = { kind: 'music', id };
  };
  const title =
    sel.kind === 'event'
      ? (d.events[sel.id ?? '']?.name ?? 'Sound event')
      : sel.kind === 'music'
        ? `♪ ${d.music.states[sel.id ?? '']?.name ?? 'Music'}`
        : sel.kind === 'mixer'
          ? 'Mixer'
          : 'Imported media';
  return (
    <div class="studio audio-ws">
      <EventList ed={ed} onImport={() => setImporting(true)} onNewEvent={newEvent} onNewMusic={newMusic} />
      <section class="panel studio-main" aria-label="Audio editor">
        <div class="ptabs studio-head">
          <strong class="studio-title">{title}</strong>
          <span class="muted small">Sounds play through named events; gameplay never points at files.</span>
        </div>
        {sel.kind === 'event' && sel.id && <EventEditor key={sel.id} ed={ed} id={sel.id} />}
        {sel.kind === 'music' && sel.id && <MusicStates key={sel.id} ed={ed} id={sel.id} />}
        {sel.kind === 'mixer' && (
          <div class="scroll">
            <MixerView ed={ed} />
          </div>
        )}
        {sel.kind === 'media' && <MediaList c={c} onImport={() => setImporting(true)} />}
      </section>
      <section class="panel studio-lib" aria-label="Where used and live audio">
        <div class="ptabs">
          <span class="tab on">Details</span>
        </div>
        <div class="scroll">
          {(sel.kind === 'event' || sel.kind === 'music') && sel.id && <WhereUsed c={c} id={sel.id} />}
          <div class="sec">
            <div class="sech">
              <span>Live</span>
            </div>
            <MixerView ed={ed} compact />
            <LiveStats c={c} />
          </div>
        </div>
      </section>
      {importing && (
        <ImportMedia
          ed={ed}
          onClose={() => setImporting(false)}
          onEvent={(id) => (ed.audioSel.value = { kind: 'event', id })}
        />
      )}
    </div>
  );
}

function WhereUsed({ c, id }: { c: ActionCtx; id: string }) {
  const { ed } = c;
  const uses = usesOf(ed.store, id);
  return (
    <div class="sec">
      <div class="sech">
        <span>Where used · {uses.length}</span>
      </div>
      {uses.length === 0 && (
        <p class="hint">Not used yet. Pick it in a map, zone, emitter, asset, screen, clip or logic node.</p>
      )}
      {uses.map((u) => (
        <div class="small au-use">
          {u.what} <span class="muted mono">{u.path}</span>
        </div>
      ))}
      {id.startsWith('mus_') && (
        <button
          type="button"
          class="btn wide"
          onClick={() => ed.exec({ type: 'map.setAudio', payload: { map: ed.mapId.value, music: id } })}
        >
          Use as music of {ed.mapDoc.value?.name}
        </button>
      )}
    </div>
  );
}

function LiveStats({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(h);
  }, []);
  const a = ed.audio;
  const music = a.stats.music;
  return (
    <div class="small au-live">
      <div>
        Voices <span class="mono">{a.pool.active.length} / 32</span> · stolen <span class="mono">{a.pool.stolen}</span>
      </div>
      <div>
        Music <span class="mono">{music ? (data(ed).music.states[music]?.name ?? music) : '—'}</span> · layer{' '}
        <span class="mono">{a.director.winner() ?? '—'}</span>
      </div>
      <div>
        Played <span class="mono">{a.stats.played}</span> · last{' '}
        <span class="mono">{data(ed).events[a.stats.lastEvent]?.name ?? '—'}</span>
      </div>
      {!a.ctx && <div class="muted">Audio starts after your first click (browser rule).</div>}
    </div>
  );
}

function MediaList({ c, onImport }: { c: ActionCtx; onImport: () => void }) {
  const { ed } = c;
  const items = Object.entries(ed.store.get<MediaIndex>(paths.media)?.items ?? {});
  const total = items.reduce((n, [, m]) => n + m.bytes, 0);
  return (
    <div class="scroll au-editor">
      <div class="sec">
        <div class="row">
          <button type="button" class="btn on" onClick={onImport}>
            Import…
          </button>
          <span class="muted small">
            {items.length} file{items.length === 1 ? '' : 's'} · {(total / 1048576).toFixed(1)} / 200 MB
          </span>
        </div>
      </div>
      {items.length === 0 && (
        <p class="hint" style={{ padding: '0 12px' }}>
          No imported files yet. The built-in pack (generated, CC0) covers every game sound until you add your own.
        </p>
      )}
      {items.map(([ref, m]) => (
        <div class="au-clip" style={{ padding: '4px 12px' }}>
          {m.kind === 'audio' ? (
            <button
              type="button"
              class="btn icon"
              aria-label={`Play ${m.name}`}
              onClick={() => ed.audio.previewMedia(ref)}
            >
              ▶
            </button>
          ) : (
            <span class="btn icon">🖼</span>
          )}
          <span class="asset-name">
            {m.name}
            <span class="muted small">
              {' '}
              · {(m.bytes / 1024).toFixed(0)} KB{m.duration ? ` · ${m.duration.toFixed(2)} s` : ''}
            </span>
          </span>
          <button
            type="button"
            class="link"
            aria-label={`Remove ${m.name}`}
            onClick={() => ed.exec({ type: 'media.remove', payload: { ref } })}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
