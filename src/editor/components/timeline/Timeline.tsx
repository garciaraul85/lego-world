import { useRef, useState } from 'preact/hooks';
import type { Clip } from '../../../core/schema';
import { ALL_TRACKS } from '../../../engine/character/clip-params';
import { sampleTrack } from '../../../engine/character/routine';

type Key = Clip['tracks'][number]['keys'][number];
type Sel = { kind: 'key'; track: number; key: number } | { kind: 'event'; index: number } | null;

const SNAP = 1 / 30;
const EASES: Key[2][] = ['easeInOut', 'linear', 'easeIn', 'easeOut', 'step'];
const BONE_NAMES: Record<string, string> = {
  root: 'Body',
  hips: 'Hips',
  torso: 'Torso',
  head: 'Head',
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  leftForearm: 'Left elbow',
  rightForearm: 'Right elbow',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
  leftShin: 'Left knee',
  rightShin: 'Right knee',
  prop: 'Prop',
};
export const trackLabel = (bone: string, prop: string) => `${BONE_NAMES[bone] ?? bone} · ${prop || 'value'}`;

/**
 * Keyframe timeline (P3.6, shared with the Cinematics director in P6.3): one lane per track, keys
 * dragged in time (snapped to 1/30 s), an event lane for emit / sound markers, a playhead to scrub,
 * and a key editor with the selected track's curve.
 */
export function Timeline({
  clip,
  time,
  readOnly,
  onSeek,
  onChange,
  choices,
}: {
  clip: Clip;
  time: number;
  readOnly: boolean;
  onSeek: (t: number) => void;
  onChange: (next: Clip, label: string) => void;
  /** sound events and cinematics for marker pickers (P5 / P6.4) */
  choices?: { sounds: { id: string; name: string }[]; cinematics: { id: string; name: string }[] };
}) {
  const [sel, setSel] = useState<Sel>(null);
  const [trackSel, setTrackSel] = useState(0);
  const [snap, setSnap] = useState(true);
  const lanes = useRef<HTMLDivElement>(null);
  const L = clip.length;
  const q = (t: number) => Math.max(0, Math.min(L, snap ? Math.round(t / SNAP) * SNAP : t));
  const tAt = (clientX: number) => {
    const r = lanes.current!.getBoundingClientRect();
    return ((clientX - r.left) / Math.max(1, r.width)) * L;
  };
  const pct = (t: number) => `${(t / L) * 100}%`;

  const setKeys = (ti: number, keys: Key[], label: string) =>
    onChange({ ...clip, tracks: clip.tracks.map((t, i) => (i === ti ? { ...t, keys } : t)) }, label);

  /** drag a key or event marker; one change when the pointer is released */
  const dragFrom = (start: PointerEvent, apply: (t: number) => void) => {
    if (readOnly) return;
    start.stopPropagation();
    const el = start.currentTarget as HTMLElement;
    el.setPointerCapture(start.pointerId);
    let t = q(tAt(start.clientX));
    const move = (e: PointerEvent) => {
      t = q(tAt(e.clientX));
      el.style.left = pct(t);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      apply(t);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const scrub = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    onSeek(q(tAt(e.clientX)));
    const move = (m: PointerEvent) => onSeek(q(tAt(m.clientX)));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const track = clip.tracks[trackSel];
  const key = sel?.kind === 'key' ? clip.tracks[sel.track]?.keys[sel.key] : null;
  const ev = sel?.kind === 'event' ? clip.events[sel.index] : null;
  const unused = ALL_TRACKS.filter((a) => !clip.tracks.some((t) => t.bone === a.bone && t.prop === a.prop));

  return (
    <div class="timeline">
      <div class="tl-bar" role="toolbar" aria-label="Timeline tools">
        <span class="mono small">
          {time.toFixed(2)} / {L.toFixed(2)} s
        </span>
        <label class="lbl small">
          <input type="checkbox" checked={snap} onChange={() => setSnap(!snap)} /> Snap 1/30 s
        </label>
        <label class="lbl small">
          Length
          <input
            class="inp mono"
            style={{ width: '64px' }}
            aria-label="Clip length in seconds"
            disabled={readOnly}
            value={L}
            onChange={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              if (!(v > 0)) return;
              onChange(
                {
                  ...clip,
                  length: v,
                  tracks: clip.tracks
                    .map((t) => ({ ...t, keys: t.keys.filter((k) => k[0] <= v) }))
                    .filter((t) => t.keys.length),
                  events: clip.events.filter((x) => x.t <= v),
                },
                'Clip length',
              );
            }}
          />
        </label>
        <label class="lbl small">
          <input
            type="checkbox"
            checked={clip.loop}
            disabled={readOnly}
            onChange={() => onChange({ ...clip, loop: !clip.loop }, 'Clip loop')}
          />{' '}
          Loop
        </label>
        {!readOnly && (
          <>
            <select
              class="inp"
              style={{ width: 'auto' }}
              aria-label="Add a track"
              value=""
              onChange={(e) => {
                const a = unused[Number((e.target as HTMLSelectElement).value)];
                if (!a) return;
                onChange(
                  {
                    ...clip,
                    tracks: [...clip.tracks, { bone: a.bone, prop: a.prop, keys: [[q(time), 0, 'easeInOut']] }],
                  },
                  'Add track',
                );
                setTrackSel(clip.tracks.length);
              }}
            >
              <option value="">+ Track…</option>
              {unused.map((a, i) => (
                <option value={i}>{trackLabel(a.bone, a.prop)}</option>
              ))}
            </select>
            <button
              type="button"
              class="btn"
              disabled={!track}
              title="Key the selected track at the playhead"
              onClick={() => {
                if (!track) return;
                const t = q(time);
                const keys = track.keys.filter((k) => Math.abs(k[0] - t) > 1e-6);
                setKeys(trackSel, [...keys, [t, sampleTrack(track.keys, t), 'easeInOut']], 'Add key');
              }}
            >
              ◆ Key
            </button>
            <button
              type="button"
              class="btn"
              onClick={() =>
                onChange({ ...clip, events: [...clip.events, { t: q(time), emit: 'marker' }] }, 'Add event')
              }
            >
              + Event
            </button>
            <button
              type="button"
              class="btn"
              title="A sound event plays when the playhead passes the marker"
              onClick={() =>
                onChange(
                  {
                    ...clip,
                    events: [...clip.events, { t: q(time), sound: choices?.sounds[0]?.id ?? 'snd_step000000' }],
                  },
                  'Add sound marker',
                )
              }
            >
              + Sound
            </button>
            {!!choices?.cinematics.length && (
              <button
                type="button"
                class="btn"
                title="Starts a cinematic when the playhead passes the marker (in Play)"
                onClick={() =>
                  onChange(
                    { ...clip, events: [...clip.events, { t: q(time), cinematic: choices.cinematics[0]!.id }] },
                    'Add cinematic marker',
                  )
                }
              >
                + Cinematic
              </button>
            )}
          </>
        )}
      </div>
      <div class="tl-body">
        <div class="tl-labels">
          <div class="tl-label head">Events</div>
          {clip.tracks.map((t, i) => (
            <button
              type="button"
              class={`tl-label ${i === trackSel ? 'on' : ''}`}
              onClick={() => setTrackSel(i)}
              title={`${t.keys.length} keys`}
            >
              {trackLabel(t.bone, t.prop)}
            </button>
          ))}
        </div>
        <div class="tl-lanes" ref={lanes} onPointerDown={scrub}>
          <div class="tl-lane head">
            {clip.events.map((e, i) => (
              <button
                type="button"
                class={`tl-event ${sel?.kind === 'event' && sel.index === i ? 'on' : ''}`}
                style={{ left: pct(e.t) }}
                title={markerLabel(e)}
                aria-label={`${'emit' in e ? 'Event' : 'sound' in e ? 'Sound' : 'Cinematic'} marker at ${e.t.toFixed(2)} s`}
                onPointerDown={(p) => {
                  setSel({ kind: 'event', index: i });
                  dragFrom(p, (t) =>
                    onChange({ ...clip, events: clip.events.map((x, j) => (j === i ? { ...x, t } : x)) }, 'Move event'),
                  );
                }}
              >
                {'emit' in e ? '⚑' : '♪'}
              </button>
            ))}
          </div>
          {clip.tracks.map((t, ti) => (
            <div class={`tl-lane ${ti === trackSel ? 'on' : ''}`}>
              {t.keys.map((k, ki) => (
                <button
                  type="button"
                  class={`tl-key ${sel?.kind === 'key' && sel.track === ti && sel.key === ki ? 'on' : ''}`}
                  style={{ left: pct(k[0]) }}
                  aria-label={`Key ${trackLabel(t.bone, t.prop)} at ${k[0].toFixed(2)} s`}
                  onPointerDown={(p) => {
                    setSel({ kind: 'key', track: ti, key: ki });
                    setTrackSel(ti);
                    dragFrom(p, (time2) =>
                      setKeys(
                        ti,
                        t.keys.map((x, j) => (j === ki ? [time2, x[1], x[2]] : x)),
                        'Move key',
                      ),
                    );
                  }}
                />
              ))}
            </div>
          ))}
          <div class="tl-playhead" style={{ left: pct(time) }} aria-hidden="true" />
        </div>
      </div>
      <div class="tl-foot">
        {key && sel?.kind === 'key' && (
          <span class="row">
            <span class="small">{trackLabel(clip.tracks[sel.track]!.bone, clip.tracks[sel.track]!.prop)}</span>
            <label class="lbl small">
              at
              <input
                class="inp mono"
                style={{ width: '64px' }}
                disabled={readOnly}
                value={key[0].toFixed(3)}
                onChange={(e) => {
                  const v = q(Number((e.target as HTMLInputElement).value));
                  setKeys(
                    sel.track,
                    clip.tracks[sel.track]!.keys.map((x, j) => (j === sel.key ? [v, x[1], x[2]] : x)),
                    'Move key',
                  );
                }}
              />
            </label>
            <label class="lbl small">
              value
              <input
                class="inp mono"
                style={{ width: '72px' }}
                disabled={readOnly}
                value={Math.round(key[1] * 1000) / 1000}
                onChange={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (Number.isFinite(v))
                    setKeys(
                      sel.track,
                      clip.tracks[sel.track]!.keys.map((x, j) => (j === sel.key ? [x[0], v, x[2]] : x)),
                      'Key value',
                    );
                }}
              />
            </label>
            <select
              class="inp"
              style={{ width: 'auto' }}
              aria-label="Ease to next key"
              disabled={readOnly}
              value={key[2]}
              onChange={(e) =>
                setKeys(
                  sel.track,
                  clip.tracks[sel.track]!.keys.map((x, j) =>
                    j === sel.key ? [x[0], x[1], (e.target as HTMLSelectElement).value as Key[2]] : x,
                  ),
                  'Key ease',
                )
              }
            >
              {EASES.map((x) => (
                <option value={x}>{x}</option>
              ))}
            </select>
            {!readOnly && (
              <button
                type="button"
                class="btn"
                onClick={() => {
                  const keys = clip.tracks[sel.track]!.keys.filter((_, j) => j !== sel.key);
                  if (keys.length) setKeys(sel.track, keys, 'Delete key');
                  else onChange({ ...clip, tracks: clip.tracks.filter((_, j) => j !== sel.track) }, 'Delete track');
                  setSel(null);
                }}
              >
                Delete key
              </button>
            )}
          </span>
        )}
        {ev && sel?.kind === 'event' && (
          <span class="row">
            <span class="small">
              {'emit' in ev ? 'Sends event' : 'sound' in ev ? 'Plays sound' : 'Starts cinematic'}
            </span>
            {'emit' in ev || !choices ? (
              <input
                class="inp"
                style={{ width: '160px' }}
                disabled={readOnly}
                aria-label="Marker name"
                value={'emit' in ev ? ev.emit : 'sound' in ev ? ev.sound : ev.cinematic}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (!v) return;
                  if ('sound' in ev && !/^snd_[0-9a-z]{10}$/.test(v)) return;
                  if ('cinematic' in ev && !/^cin_[0-9a-z]{10}$/.test(v)) return;
                  const next =
                    'emit' in ev
                      ? { t: ev.t, emit: v }
                      : 'sound' in ev
                        ? { t: ev.t, sound: v }
                        : { t: ev.t, cinematic: v };
                  onChange({ ...clip, events: clip.events.map((x, j) => (j === sel.index ? next : x)) }, 'Edit event');
                }}
              />
            ) : (
              <select
                class="inp"
                style={{ width: '180px' }}
                disabled={readOnly}
                aria-label="Marker target"
                value={'sound' in ev ? ev.sound : ev.cinematic}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  const next = 'sound' in ev ? { t: ev.t, sound: v } : { t: ev.t, cinematic: v };
                  onChange({ ...clip, events: clip.events.map((x, j) => (j === sel.index ? next : x)) }, 'Edit event');
                }}
              >
                {('sound' in ev ? choices.sounds : choices.cinematics).map((o) => (
                  <option value={o.id}>{o.name}</option>
                ))}
              </select>
            )}
            {!readOnly && (
              <button
                type="button"
                class="btn"
                onClick={() => {
                  onChange({ ...clip, events: clip.events.filter((_, j) => j !== sel.index) }, 'Delete event');
                  setSel(null);
                }}
              >
                Delete marker
              </button>
            )}
          </span>
        )}
        {track && <Curve keys={track.keys} length={L} time={time} />}
      </div>
    </div>
  );
}

/** The selected track's curve, sampled the way the animator plays it. */
function Curve({ keys, length, time }: { keys: Key[]; length: number; time: number }) {
  const N = 90;
  const vals = Array.from({ length: N + 1 }, (_, i) => sampleTrack(keys, (i / N) * length));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / N) * 200},${36 - ((v - lo) / span) * 32 - 2}`).join(' ');
  return (
    <svg class="tl-curve" viewBox="0 0 200 38" preserveAspectRatio="none" aria-label="Curve of the selected track">
      <polyline points={pts} fill="none" stroke="#f2b632" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <line
        x1={(time / length) * 200}
        x2={(time / length) * 200}
        y1="0"
        y2="38"
        stroke="#4fd1c5"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
}

function markerLabel(e: Clip['events'][number]) {
  if ('emit' in e) return `Event ${e.emit}`;
  if ('sound' in e) return `Sound ${e.sound}`;
  return `Cinematic ${e.cinematic}`;
}
