import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Clip } from '../../../core/schema';
import { ALL_TRACKS } from '../../../engine/character/clip-params';
import { sampleTrack } from '../../../engine/character/routine';
import { DraftText } from '../fields';
import { PreviewPicker } from '../PreviewPicker';

type Key = Clip['tracks'][number]['keys'][number];
type Sel = { kind: 'key'; track: number; key: number } | { kind: 'event'; index: number } | null;

const SNAP = 1 / 30;
const EASES: Key[2][] = ['easeInOut', 'linear', 'easeIn', 'easeOut', 'step'];
export const BONE_NAMES: Record<string, string> = {
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
/**
 * P32: a track copied to the other side of the body: left ↔ right, with sideways turns (y, z) reversed so the
 * two sides move as mirror images (both arms reach forward; one up on the left is one up on the right).
 */
export function mirrorTrack(t: Clip['tracks'][number]): Clip['tracks'][number] {
  const bone = t.bone.startsWith('left') ? `right${t.bone.slice(4)}` : `left${t.bone.slice(5)}`;
  const flip = t.prop === 'y' || t.prop === 'z';
  return { bone, prop: t.prop, keys: t.keys.map((k) => [k[0], flip ? -k[1] : k[1], k[2]] as Key) };
}

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
  onTrackSelect,
  trackThumb,
}: {
  clip: Clip;
  time: number;
  readOnly: boolean;
  onSeek: (t: number) => void;
  onChange: (next: Clip, label: string) => void;
  /** sound events and cinematics for marker pickers (P5 / P6.4) */
  choices?: { sounds: { id: string; name: string }[]; cinematics: { id: string; name: string }[] };
  /** P32: the track picked in the timeline (a label, a key or a new track), so the preview can point at its part */
  onTrackSelect?: (track: { bone: string; prop: string } | null) => void;
  /** P32: a picture of the character with this joint moved, so “+ Track…” shows what each track does */
  trackThumb?: (bone: string, prop: string) => ComponentChildren;
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
    // a scripted click (tutorial, AI plan) has no live pointer to capture
    try {
      el.setPointerCapture(start.pointerId);
    } catch {}
    const from = q(tAt(start.clientX));
    let t = from;
    const move = (e: PointerEvent) => {
      t = q(tAt(e.clientX));
      el.style.left = pct(t);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      // a click without a drag only selects: no change, nothing to undo
      if (t !== from) apply(t);
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
  useEffect(() => onTrackSelect?.(track ? { bone: track.bone, prop: track.prop } : null), [track?.bone, track?.prop]);
  const key = sel?.kind === 'key' ? clip.tracks[sel.track]?.keys[sel.key] : null;
  const ev = sel?.kind === 'event' ? clip.events[sel.index] : null;
  const unused = ALL_TRACKS.filter((a) => !clip.tracks.some((t) => t.bone === a.bone && t.prop === a.prop));
  const addTrack = (a: { bone: string; prop: string } | undefined) => {
    if (!a) return;
    onChange(
      {
        ...clip,
        // the first key is at the start of the clip (where the joint starts out)
        tracks: [...clip.tracks, { bone: a.bone, prop: a.prop, keys: [[0, 0, 'easeInOut']] }],
      },
      'Add track',
    );
    setTrackSel(clip.tracks.length);
  };

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
          <DraftText
            class="inp mono"
            style={{ width: '64px' }}
            inputMode="decimal"
            aria-label="Clip length in seconds"
            tour="clip-length"
            disabled={readOnly}
            value={String(L)}
            same={(a, b) => Number(a) === Number(b)}
            onCommit={(text) => {
              const v = Number(text);
              if (!(v > 0) || !Number.isFinite(v)) return false;
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
            data-tour="clip-loop"
            onChange={() => onChange({ ...clip, loop: !clip.loop }, 'Clip loop')}
          />{' '}
          Loop
        </label>
        {!readOnly && (
          <>
            {trackThumb ? (
              <PreviewPicker
                label="Add a track"
                value=""
                placeholder="+ Track…"
                tour="track"
                options={unused.map((a) => ({
                  value: `${a.bone}.${a.prop}`,
                  name: trackLabel(a.bone, a.prop),
                  thumb: trackThumb(a.bone, a.prop),
                }))}
                onPick={(v) => addTrack(unused.find((a) => `${a.bone}.${a.prop}` === v))}
              />
            ) : (
              <select
                class="inp"
                style={{ width: 'auto' }}
                aria-label="Add a track"
                value=""
                onChange={(e) => addTrack(unused[Number((e.target as HTMLSelectElement).value)])}
              >
                <option value="">+ Track…</option>
                {unused.map((a, i) => (
                  <option value={i}>{trackLabel(a.bone, a.prop)}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              class="btn"
              disabled={!track}
              title="Key the selected track at the playhead"
              onClick={() => {
                if (!track) return;
                const t = q(time);
                const keys = [
                  ...track.keys.filter((k) => Math.abs(k[0] - t) > 1e-6),
                  [t, sampleTrack(track.keys, t), 'easeInOut'] as Key,
                ].sort((a, b) => a[0] - b[0]);
                setKeys(trackSel, keys, 'Add key');
                // P32: the new key is selected, so its value can be typed at once
                setSel({ kind: 'key', track: trackSel, key: keys.findIndex((k) => k[0] === t) });
              }}
            >
              ◆ Key
            </button>
            <button
              type="button"
              class="btn"
              data-tour="track-mirror"
              disabled={!track || !/^(left|right)/.test(track.bone)}
              title="Copy the selected track to the other side (left ↔ right), mirrored"
              onClick={() => {
                if (!track) return;
                const m = mirrorTrack(track);
                const at = clip.tracks.findIndex((x) => x.bone === m.bone && x.prop === m.prop);
                const tracks = at >= 0 ? clip.tracks.map((x, i) => (i === at ? m : x)) : [...clip.tracks, m];
                onChange({ ...clip, tracks }, 'Mirror track');
                setTrackSel(at >= 0 ? at : clip.tracks.length);
              }}
            >
              ⇆ Mirror
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
        {/* P32: after a click on the lanes, ← and → move the playhead 0.1 s (to reach an exact time) */}
        <div
          class="tl-lanes"
          ref={lanes}
          onPointerDown={scrub}
          tabIndex={0}
          role="slider"
          aria-label="Clip time"
          aria-valuemin={0}
          aria-valuemax={L}
          aria-valuenow={Math.round(time * 100) / 100}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const step = e.key === 'ArrowRight' ? 0.1 : e.key === 'ArrowLeft' ? -0.1 : 0;
            if (!step) return;
            e.preventDefault();
            onSeek(Math.max(0, Math.min(L, Math.round((time + step) * 10) / 10)));
          }}
        >
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
              {/* the selected lane shows each key's value next to it */}
              {ti === trackSel &&
                t.keys.map((k) => (
                  <span class="tl-keyval mono" style={{ left: pct(k[0]) }} aria-hidden="true">
                    {Math.round(k[1] * 100) / 100}
                  </span>
                ))}
              {t.keys.map((k, ki) => (
                <button
                  type="button"
                  class={`tl-key ${sel?.kind === 'key' && sel.track === ti && sel.key === ki ? 'on' : ''}`}
                  style={{ left: pct(k[0]) }}
                  title={`${trackLabel(t.bone, t.prop)} at ${k[0].toFixed(2)} s: value ${Math.round(k[1] * 1000) / 1000}`}
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
            <DraftNum
              key={`at-${sel.track}-${sel.key}`}
              label="at"
              tour="key-time"
              width="64px"
              disabled={readOnly}
              value={key[0]}
              show={(n) => n.toFixed(3)}
              onCommit={(n) => {
                const v = q(n);
                setKeys(
                  sel.track,
                  clip.tracks[sel.track]!.keys.map((x, j) => (j === sel.key ? [v, x[1], x[2]] : x)),
                  'Move key',
                );
              }}
            />
            <DraftNum
              key={`value-${sel.track}-${sel.key}`}
              label="value"
              tour="key-value"
              width="72px"
              disabled={readOnly}
              value={key[1]}
              show={(n) => String(Math.round(n * 1000) / 1000)}
              onCommit={(v) =>
                setKeys(
                  sel.track,
                  clip.tracks[sel.track]!.keys.map((x, j) => (j === sel.key ? [x[0], v, x[2]] : x)),
                  'Key value',
                )
              }
            />
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
              <DraftText
                class="inp"
                style={{ width: '160px' }}
                disabled={readOnly}
                aria-label="Marker name"
                value={'emit' in ev ? ev.emit : 'sound' in ev ? ev.sound : ev.cinematic}
                onCommit={(text) => {
                  const v = text.trim();
                  if (!v) return false;
                  if ('sound' in ev && !/^snd_[0-9a-z]{10}$/.test(v)) return false;
                  if ('cinematic' in ev && !/^cin_[0-9a-z]{10}$/.test(v)) return false;
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

/** A number box (see DraftText): keeps what is typed while the timeline redraws, changes the clip once. */
function DraftNum({
  label,
  value,
  show,
  onCommit,
  width,
  disabled,
  tour,
}: {
  tour: string;
  label: string;
  value: number;
  show: (n: number) => string;
  onCommit: (n: number) => void;
  width: string;
  disabled: boolean;
}) {
  return (
    <label class="lbl small">
      {label}
      <DraftText
        class="inp mono"
        style={{ width }}
        inputMode="decimal"
        tour={tour}
        disabled={disabled}
        value={show(value)}
        same={(a, b) => Number(a) === Number(b)}
        onCommit={(text) => {
          const n = Number(text);
          if (text.trim() === '' || !Number.isFinite(n)) return false;
          onCommit(n);
        }}
      />
    </label>
  );
}
