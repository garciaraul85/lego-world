import { useRef, useState } from 'preact/hooks';
import type { Cinematic, Track } from '../../../core/schema';
import { audioData } from '../../../engine/audio/data';
import type { CinematicPlayer } from '../../../engine/cinematic/CinematicPlayer';
import type { EditorState } from '../../state';
import {
  type Item,
  itemLabel,
  ROW_COLOR,
  type Row,
  rowsOf,
  type Sel,
  setItem,
  snapTime,
  spanOf,
  trackIndex,
} from './model';
import { drawWave, waveform } from './waveform';

/**
 * Multitrack timeline (board 7): a row per cast role, then camera, music, sound, post and events.
 * Drag items in time (snapped to 0.1 s and to other items' edges), click to select, click the
 * ruler to move the playhead, + adds an item at the playhead.
 */
export function Tracks({
  ed,
  cin,
  player,
  time,
  sel,
  onSeek,
  onSelect,
  onChange,
  onAdd,
}: {
  ed: EditorState;
  cin: Cinematic;
  player: CinematicPlayer | null;
  time: number;
  sel: Sel;
  onSeek: (t: number) => void;
  onSelect: (s: Sel) => void;
  onChange: (c: Cinematic, label: string) => void;
  onAdd: (row: Row) => void;
}) {
  const lanes = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Cinematic | null>(null);
  const [, redraw] = useState(0);
  const view = draft ?? cin;
  const L = view.length;
  const pct = (t: number) => `${(t / L) * 100}%`;
  const tAt = (x: number) => {
    const r = lanes.current!.getBoundingClientRect();
    return Math.max(0, Math.min(L, ((x - r.left) / Math.max(1, r.width)) * L));
  };
  const edges = (skip: Item) => {
    const out = [0, L, time];
    for (const tr of view.tracks)
      for (const it of tr.items as Item[]) if (it !== skip) out.push(it.t, it.t + spanOf(view, tr, it, player));
    return out;
  };
  const dragItem = (e: PointerEvent, track: number, idx: number) => {
    e.stopPropagation();
    onSelect({ track, item: idx });
    const it = cin.tracks[track]!.items[idx] as Item;
    const start = e.clientX;
    const t0 = it.t;
    let moved = false;
    let cur = cin;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const r = lanes.current!.getBoundingClientRect();
      const dt = ((m.clientX - start) / Math.max(1, r.width)) * L;
      if (!moved && Math.abs(m.clientX - start) < 3) return;
      moved = true;
      const t = snapTime(t0 + dt, edges(it), L);
      cur = setItem(cin, track, idx, { ...it, t } as Item);
      setDraft(cur);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setDraft(null);
      if (moved) onChange(cur, 'Move item');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const ad = audioData(ed.store);
  /** music and sound items show names, not ids */
  const named = (kind: Row['kind'], it: Item) => {
    if (kind === 'music' && 'music' in it && it.music) return `♪ ${ad.music.states[it.music]?.name ?? it.music}`;
    if (kind === 'sfx' && 'event' in it) return `♫ ${ad.events[it.event as string]?.name ?? it.event}`;
    return itemLabel(kind, it);
  };
  const seconds = Array.from({ length: Math.floor(L) + 1 }, (_, i) => i);
  const rows = rowsOf(view);
  return (
    <div class="dr-tracks" role="group" aria-label="Timeline">
      <div class="dr-row dr-ruler-row">
        <span class="dr-label mono small">{time.toFixed(1)} s</span>
        <div
          class="dr-lane dr-ruler"
          ref={lanes}
          role="slider"
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={L}
          aria-valuenow={Math.round(time * 10) / 10}
          tabIndex={0}
          onPointerDown={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.setPointerCapture(e.pointerId);
            onSeek(Math.round(tAt(e.clientX) * 10) / 10);
            const mv = (m: PointerEvent) => onSeek(Math.round(tAt(m.clientX) * 10) / 10);
            const up = () => {
              el.removeEventListener('pointermove', mv);
              el.removeEventListener('pointerup', up);
            };
            el.addEventListener('pointermove', mv);
            el.addEventListener('pointerup', up);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') onSeek(Math.min(L, Math.round((time + 0.1) * 10) / 10));
            else if (e.key === 'ArrowLeft') onSeek(Math.max(0, Math.round((time - 0.1) * 10) / 10));
            else return;
            e.preventDefault();
          }}
        >
          {seconds.map((s) => (
            <span class="dr-tick" style={{ left: pct(s) }}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div class="dr-rows">
        {rows.map((row) => {
          const ti = trackIndex(view, row);
          const tr = ti >= 0 ? view.tracks[ti]! : null;
          return (
            <div class="dr-row" data-row={row.key}>
              <span class="dr-label" style={{ borderLeftColor: ROW_COLOR[row.kind] }}>
                <span class="asset-name">{row.label}</span>
                <button
                  type="button"
                  class="link"
                  aria-label={`Add to ${row.label}`}
                  title="Add an item at the playhead"
                  onClick={() => onAdd(row)}
                >
                  +
                </button>
              </span>
              <div class="dr-lane">
                {tr &&
                  (tr.items as Item[]).map((it, i) => {
                    const on = !!sel && 'track' in sel && sel.track === ti && sel.item === i;
                    const span = spanOf(view, tr, it, player);
                    return (
                      <button
                        type="button"
                        class={`dr-item ${on ? 'on' : ''}`}
                        style={{
                          left: pct(it.t),
                          width: pct(Math.min(span, L - it.t)),
                          background: `${ROW_COLOR[row.kind]}33`,
                          borderColor: ROW_COLOR[row.kind],
                        }}
                        title={`${named(row.kind, it)} · ${it.t.toFixed(1)} s`}
                        aria-label={`${row.label}: ${named(row.kind, it)} at ${it.t.toFixed(1)} s`}
                        aria-pressed={on}
                        onPointerDown={(e) => dragItem(e, ti, i)}
                      >
                        <Wave ed={ed} track={tr} item={it} onReady={() => redraw((x) => x + 1)} />
                        <span class="dr-item-label">{named(row.kind, it)}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
        <div class="dr-playhead" style={{ left: `calc(var(--dr-label) + (100% - var(--dr-label)) * ${time / L})` }} />
      </div>
    </div>
  );
}

/** Waveform thumbnail on music and sound items (drawn once per media file, shown as an image). */
const urls = new Map<string, string>();
function Wave({ ed, track, item, onReady }: { ed: EditorState; track: Track; item: Item; onReady: () => void }) {
  let media: string | undefined;
  const d = audioData(ed.store);
  if (track.kind === 'sfx' && 'event' in item) media = d.events[item.event as string]?.clips[0];
  if (track.kind === 'music' && 'music' in item && item.music) media = d.music.states[item.music]?.layers[0]?.media;
  if (!media) return null;
  let url = urls.get(media);
  if (!url && typeof document !== 'undefined') {
    const p = waveform(media, ed.audio, onReady);
    if (p) {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 22;
      drawWave(cv, p, track.kind === 'music' ? '#b9a8ff' : '#e0b8f5');
      url = cv.toDataURL();
      urls.set(media, url);
    }
  }
  return url ? <img class="dr-wave" src={url} alt="" /> : null;
}
