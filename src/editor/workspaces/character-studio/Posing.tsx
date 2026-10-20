import type { Clip } from '../../../core/schema';
import {
  addPose,
  type Ease,
  easeAt,
  easePose,
  JOINTS,
  mirrorPose,
  movedJoints,
  movePose,
  poseAt,
  poseTimes,
  removePose,
  restOf,
  setPose,
} from '../../../engine/character/posing';
import { FieldHelp } from '../../components/fields';
import type { EditorState } from '../../state';
import { CharacterThumb } from './thumbs';

export const POSING_HELP =
  'Animation by posing: put the playhead where a pose goes, press + Pose here, and move the joints with the sliders. Each pose keys every joint at that moment; the motion between two poses is filled in by its ease (Smooth slows in and out, Even keeps one speed, Hold jumps at the next pose). Moving a slider between poses makes a pose there.';

export const EASE_NAMES: [Ease, string][] = [
  ['easeInOut', 'Smooth'],
  ['linear', 'Even'],
  ['easeIn', 'Speeding up'],
  ['easeOut', 'Slowing down'],
  ['step', 'Hold, then jump'],
];

const near = (a: number, b: number) => Math.abs(a - b) < 1e-3;
const fmt = (t: number) => `${Math.round(t * 100) / 100} s`;

/**
 * P23 part 4: the clip editor pose by pose — the poses as pictures along the clip, + Pose here, a slider for
 * each joint of the pose under the playhead, mirror, copy and paste, the ease into the next pose, and where the
 * pose is. Every change is one clip.update (one undo).
 */
export function PosePanel({
  ed,
  clip,
  profile,
  time,
  readOnly,
  onSeek,
  onChange,
}: {
  ed: EditorState;
  clip: Clip;
  profile: Record<string, unknown>;
  time: number;
  readOnly: boolean;
  onSeek: (t: number) => void;
  onChange: (next: Clip, label: string) => void;
}) {
  const times = poseTimes(clip);
  const here = times.find((t) => near(t, time));
  const onPose = here !== undefined;
  const pose = poseAt(clip, time);
  const ease = onPose ? easeAt(clip, here) : null;
  const idx = onPose ? times.indexOf(here) : -1;
  const copied = ed.poseClipboard.value;
  return (
    <div class="pose-panel" data-tour="clip-poses" data-help="clips.poses">
      <div class="sech">
        <span>
          Poses
          <FieldHelp label="Poses" text={POSING_HELP} />
        </span>
        <span class="muted small">
          {onPose ? `Pose ${idx + 1} of ${times.length} at ${fmt(here)}` : `Between poses, at ${fmt(time)}`}
        </span>
      </div>
      <div class="pose-strip" role="listbox" aria-label="Poses" data-tour="pose-list">
        {times.map((t, i) => (
          <button
            type="button"
            role="option"
            aria-selected={near(t, time)}
            aria-label={`Pose ${i + 1} at ${fmt(t)}`}
            class={`pose-card ${near(t, time) ? 'on' : ''}`}
            data-tour={`pose-${i + 1}`}
            data-tip={`Go to pose ${i + 1} (${fmt(t)})`}
            onClick={() => onSeek(t)}
          >
            <CharacterThumb profile={profile} size={44} pose={{ clip, time: t }} />
            <span class="mono small">{fmt(t)}</span>
          </button>
        ))}
        {!times.length && <span class="hint">No poses yet. Put the playhead at the start and press + Pose here.</span>}
      </div>
      <label class="lbl pose-playhead">
        Playhead{' '}
        <input
          type="range"
          aria-label="Playhead"
          data-tour="pose-playhead"
          min={0}
          max={clip.length}
          step={0.05}
          value={time}
          onInput={(e) => onSeek(Number((e.target as HTMLInputElement).value))}
        />{' '}
        <span class="mono small">{fmt(time)}</span>
      </label>
      <div class="row pose-tools" style={{ gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          class="btn"
          data-tour="pose-add"
          disabled={readOnly || onPose}
          data-tip="Make a pose at the playhead: every joint is keyed where it is now"
          onClick={() => onChange(addPose(clip, time), `Pose at ${fmt(time)}`)}
        >
          + Pose here
        </button>
        <button
          type="button"
          class="btn"
          data-tour="pose-mirror"
          disabled={readOnly || !onPose}
          data-tip="Swap left and right in this pose (turns and tilts go the other way)"
          onClick={() => onChange(mirrorPose(clip, here!), `Mirror pose ${idx + 1}`)}
        >
          ⇆ Mirror
        </button>
        <button
          type="button"
          class="btn"
          data-tour="pose-copy"
          disabled={!onPose}
          data-tip="Remember this pose to paste it at another moment (or in another clip)"
          onClick={() => {
            ed.poseClipboard.value = movedJoints(pose);
            ed.notify(`Pose ${idx + 1} copied.`);
          }}
        >
          Copy pose
        </button>
        <button
          type="button"
          class="btn"
          data-tour="pose-paste"
          disabled={readOnly || !copied}
          data-tip="Put the copied pose at the playhead"
          onClick={() => {
            // joints the copied pose leaves standing go back to standing here too
            const rest = Object.fromEntries(JOINTS.map((j) => [j.key, restOf(j.key)]));
            onChange(setPose(clip, time, { ...rest, ...copied }), `Paste pose at ${fmt(time)}`);
          }}
        >
          Paste pose
        </button>
        <button
          type="button"
          class="btn danger"
          data-tour="pose-delete"
          disabled={readOnly || !onPose}
          data-tip="Take this pose out; the motion goes straight from the pose before to the pose after"
          onClick={() => onChange(removePose(clip, here!), `Delete pose ${idx + 1}`)}
        >
          Delete pose
        </button>
      </div>
      {onPose && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap' }}>
          <label class="lbl">
            Into the next pose{' '}
            <select
              class="inp"
              data-tour="pose-ease"
              aria-label="Into the next pose"
              disabled={readOnly}
              value={ease ?? 'easeInOut'}
              onChange={(e) =>
                onChange(
                  easePose(clip, here!, (e.target as HTMLSelectElement).value as Ease),
                  `Pose ${idx + 1}: ${EASE_NAMES.find(([k]) => k === (e.target as HTMLSelectElement).value)?.[1]}`,
                )
              }
            >
              {EASE_NAMES.map(([k, n]) => (
                <option value={k}>{n}</option>
              ))}
            </select>
          </label>
          <label class="lbl">
            At{' '}
            <input
              class="inp"
              type="number"
              key={`${here}`}
              data-tour="pose-at"
              aria-label="Pose time (seconds)"
              disabled={readOnly}
              min={0}
              max={clip.length}
              step={0.05}
              defaultValue={String(here)}
              style={{ width: '70px' }}
              onChange={(e) => {
                const to = Number((e.target as HTMLInputElement).value);
                if (!Number.isFinite(to)) return;
                const next = movePose(clip, here!, to);
                if (next === clip) {
                  ed.notify('There is a pose there already (or that is where it is).', true);
                  return;
                }
                onChange(next, `Move pose ${idx + 1} to ${fmt(to)}`);
                onSeek(Math.max(0, Math.min(clip.length, to)));
              }}
            />{' '}
            s
          </label>
        </div>
      )}
      <div class="joint-grid" role="group" aria-label="Joints of this pose" data-tour="pose-joints">
        {JOINTS.map((j) => {
          const v = pose[j.key] ?? 0;
          return (
            <label class="joint" data-tour={`joint-${j.key}`}>
              <span class="small">{j.label}</span>
              <input
                type="range"
                aria-label={j.label}
                min={j.min}
                max={j.max}
                step={0.01}
                value={v}
                disabled={readOnly}
                onChange={(e) =>
                  onChange(
                    setPose(clip, time, { [j.key]: Number((e.target as HTMLInputElement).value) }),
                    `${j.label} at ${fmt(time)}`,
                  )
                }
              />
            </label>
          );
        })}
      </div>
      {readOnly && <div class="hint">A built-in clip: Duplicate to edit its poses.</div>}
    </div>
  );
}
