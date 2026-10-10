import { useState } from 'preact/hooks';
import { ACCEPT, extOf, importMedia } from '../../core/media/import';
import { type MediaIndex, paths } from '../../core/schema';
import { Modal } from '../shell/Shell';
import type { EditorState } from '../state';
import { newSoundEvent } from '../workspaces/audio/model';

type Row = { name: string; state: 'ok' | 'dup' | 'error'; msg: string };

/**
 * Import .wav/.mp3/.ogg/.m4a/.png (P5.2): each file is hashed (sha256) and probed; the same bytes
 * twice are stored once. Audio can become a sound event right away.
 */
export function ImportMedia({
  ed,
  onClose,
  onEvent,
}: {
  ed: EditorState;
  onClose: () => void;
  onEvent?: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [makeEvents, setMakeEvents] = useState(true);
  const run = async (files: FileList) => {
    setBusy(true);
    const out: Row[] = [];
    ed.audio.init();
    const ctx = ed.audio.ctx;
    for (const f of [...files]) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const r = await importMedia(f.name, bytes, {
        index: ed.store.get<MediaIndex>(paths.media),
        ...(ctx ? { decode: (b: ArrayBuffer) => ctx.decodeAudioData(b) } : {}),
      });
      if (!r.ok) {
        out.push({ name: f.name, state: 'error', msg: r.error });
        continue;
      }
      ed.media?.put(r.ref, new Blob([bytes], { type: r.entry.mime }));
      if (!r.duplicate) ed.exec({ type: 'media.register', payload: { ref: r.ref, entry: r.entry } });
      let msg = r.duplicate
        ? 'already in the project (stored once)'
        : `imported${r.entry.duration ? ` · ${r.entry.duration.toFixed(2)} s` : ''}`;
      if (makeEvents && r.entry.kind === 'audio' && !r.duplicate) {
        const ev = newSoundEvent(ed, f.name.replace(/\.[^.]+$/, ''), [r.ref]);
        if (ev) {
          msg += ' · sound event created';
          onEvent?.(ev.id);
        }
      }
      if (r.warnings.length) msg += ` · ${r.warnings.join(' ')}`;
      out.push({ name: f.name, state: r.duplicate ? 'dup' : 'ok', msg });
      ed.log('AUDIO', `${f.name}: ${msg}`);
    }
    setRows((x) => [...out, ...x]);
    setBusy(false);
  };
  return (
    <Modal title="Import media" onClose={onClose}>
      <p class="muted">
        Sounds and music: .wav .mp3 .ogg .m4a · images for screens: .png. Up to 20 MB per file and 200 MB per project.
      </p>
      <label class="row small">
        <input
          type="checkbox"
          checked={makeEvents}
          onChange={(e) => setMakeEvents((e.target as HTMLInputElement).checked)}
        />
        Make a sound event for each audio file
      </label>
      <label class="btn on" style={{ alignSelf: 'flex-start' }}>
        {busy ? 'Importing…' : 'Choose files…'}
        <input
          type="file"
          hidden
          multiple
          accept={ACCEPT}
          aria-label="Media files"
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            if (input.files?.length) void run(input.files);
            input.value = '';
          }}
        />
      </label>
      {rows.map((r) => (
        <div class={`au-import ${r.state}`}>
          <strong>{r.name}</strong> <span class="muted small">{extOf(r.name)}</span>
          <div class="small">{r.msg}</div>
        </div>
      ))}
    </Modal>
  );
}
