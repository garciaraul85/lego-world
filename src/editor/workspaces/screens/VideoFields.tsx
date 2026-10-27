import { useRef } from 'preact/hooks';
import { ACCEPT_OF, importMedia } from '../../../core/media/import';
import { sizeText } from '../../../core/media/uses';
import { type MediaIndex, paths, type Widget } from '../../../core/schema';
import { ActionListField } from '../../components/ActionListField';
import { PreviewPicker } from '../../components/PreviewPicker';
import { actionChoices } from '../../panels/AudioFields';
import type { EditorState } from '../../state';

/**
 * Step 11 (P24 part 3): a Video widget's settings — which imported video, Loop, Sound, Click to skip, Fill or Fit,
 * and what happens when it ends (for an intro: show the title screen).
 */
export function VideoFields({
  ed,
  w,
  set,
  style,
}: {
  ed: EditorState;
  w: Widget;
  set: (p: Partial<Widget>, label?: string) => void;
  style: (k: string, v: string | number | undefined) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const items = ed.store.get<MediaIndex>(paths.media)?.items ?? {};
  const videos = Object.entries(items).filter(([, m]) => m.kind === 'video');
  const src = typeof w.style?.src === 'string' ? w.style.src : '';
  const on = (k: string) => !!w.style?.[k];
  const flag = (k: string, label: string, tip: string) => (
    <label class="row small" title={tip}>
      <input
        type="checkbox"
        checked={on(k)}
        data-tour={`video-${k}`}
        onChange={(e) => style(k, (e.target as HTMLInputElement).checked ? 1 : undefined)}
      />
      {label}
    </label>
  );
  const importVideo = async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const r = await importMedia(f.name, bytes, { index: ed.store.get<MediaIndex>(paths.media) });
    if (!r.ok) {
      ed.notify(r.error, true);
      return;
    }
    if (r.entry.kind !== 'video') {
      ed.notify(`${f.name} is not a video.`, true);
      return;
    }
    ed.media?.put(r.ref, new Blob([bytes], { type: r.entry.mime }));
    if (!r.duplicate) ed.exec({ type: 'media.register', payload: { ref: r.ref, entry: r.entry } });
    style('src', r.ref);
    for (const x of r.warnings) ed.notify(x);
  };
  return (
    <div class="sec" data-tour="video-fields" data-help="screens.video">
      <div class="sech">
        <span>Video</span>
      </div>
      <div class="pv-label">
        Clip
        <PreviewPicker
          label="Video clip"
          value={src}
          options={[
            { value: '', name: 'None', thumb: <span class="pv-none">∅</span> },
            ...videos.map(([ref, m]) => ({
              value: ref,
              name: m.name,
              note: `${m.duration ? `${m.duration.toFixed(1)} s · ` : ''}${m.w && m.h ? `${m.w}×${m.h} · ` : ''}${sizeText(m.bytes)}`,
              thumb: <span class="pv-none">🎬</span>,
            })),
          ]}
          onPick={(v) => style('src', v || undefined)}
        />
      </div>
      <button type="button" class="btn small" data-tour="video-import" onClick={() => file.current?.click()}>
        Import a video… (.mp4, .webm)
      </button>
      <input
        ref={file}
        type="file"
        hidden
        accept={ACCEPT_OF('video')}
        aria-label="Video file"
        onChange={(e) => {
          const input = e.target as HTMLInputElement;
          const f = input.files?.[0];
          if (f) void importVideo(f);
          input.value = '';
        }}
      />
      <div class="col" style={{ gap: '2px' }}>
        {flag('loop', 'Loop', 'Plays again and again (a moving background); its end actions never run')}
        {flag('sound', 'Sound', 'Plays its sound (off: silent, like a background)')}
        {flag('skip', 'Click or Enter skips it', 'A click, Enter, Space or Escape ends it early')}
        <label class="row small">
          <input
            type="checkbox"
            checked={w.style?.fit === 'fit'}
            data-tour="video-fit"
            onChange={(e) => style('fit', (e.target as HTMLInputElement).checked ? 'fit' : undefined)}
          />
          Show it whole (black bars), not filling the widget
        </label>
      </div>
      {!on('loop') && (
        <>
          <div class="sech">
            <span>When it ends</span>
          </div>
          <ActionListField
            value={w.onEnd ?? []}
            states={[]}
            choices={actionChoices(ed)}
            onChange={(onEnd) => set({ onEnd: onEnd.length ? onEnd : undefined }, 'Edit video end actions')}
          />
        </>
      )}
      <p class="hint">Imported videos are in File › Media library, with their size and who made them.</p>
    </div>
  );
}
