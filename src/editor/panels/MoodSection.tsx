import { DRIFT_INFO, DRIFTS, GRADE_INFO, GRADES, type Mood, NO_MOOD } from '../../core/effects/screen';
import type { MapDoc } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';

export const MOOD_HELP =
  'How this map feels: a colour over the whole view (warm, cold, night, old film…), dark edges (vignette), and something drifting across the screen (rain streaks, snow, fog, dust, embers, leaves). The game’s screens (the HUD) are never coloured. Logic’s Set screen mood changes it while the game plays.';

/** P23 part 2: Scene › Map › Screen mood — one undo step per change; shown over the Scene view while ticked */
export function MoodSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  const mood: Mood = m.mood ?? NO_MOOD;
  const set = (patch: Partial<Mood>, label: string) =>
    ed.exec({ type: 'map.setEnvironment', payload: { map: m.id, mood: { ...mood, ...patch } } }, { label });
  return (
    <div class="sec" data-tour="map-mood" data-help="scene.map.mood">
      <div class="sech">
        <span>
          Screen mood
          <FieldHelp label="Screen mood" text={MOOD_HELP} />
        </span>
      </div>
      <label class="field">
        Colour
        <select
          class="inp"
          aria-label="Mood colour"
          data-tour="mood-grade"
          value={mood.grade}
          onChange={(e) => set({ grade: (e.target as HTMLSelectElement).value as Mood['grade'] }, 'Mood colour')}
        >
          {GRADES.map((g) => (
            <option value={g}>{GRADE_INFO[g].label}</option>
          ))}
        </select>
      </label>
      <label class="field">
        Dark edges {Math.round(mood.vignette * 100)}%
        <input
          type="range"
          aria-label="Dark edges"
          data-tour="mood-vignette"
          min={0}
          max={1}
          step={0.05}
          value={mood.vignette}
          onChange={(e) => set({ vignette: Number((e.target as HTMLInputElement).value) }, 'Mood dark edges')}
        />
      </label>
      <label class="field">
        Drifting
        <select
          class="inp"
          aria-label="Drifting across the screen"
          data-tour="mood-drift"
          value={mood.drift}
          onChange={(e) => set({ drift: (e.target as HTMLSelectElement).value as Mood['drift'] }, 'Mood drifting')}
        >
          {DRIFTS.map((d) => (
            <option value={d}>{DRIFT_INFO[d]}</option>
          ))}
        </select>
      </label>
      {mood.drift !== 'none' && (
        <label class="field">
          How much {Math.round(mood.amount * 100)}%
          <input
            type="range"
            aria-label="How much drifts"
            min={0.05}
            max={1}
            step={0.05}
            value={mood.amount}
            onChange={(e) => set({ amount: Number((e.target as HTMLInputElement).value) }, 'Mood amount')}
          />
        </label>
      )}
      <label class="lbl small">
        <input
          type="checkbox"
          data-tour="mood-preview"
          checked={ed.moodPreview.value}
          onChange={(e) => (ed.moodPreview.value = (e.target as HTMLInputElement).checked)}
        />{' '}
        Show it over the Scene view
      </label>
      {m.mood && (
        <button
          type="button"
          class="link"
          onClick={() =>
            ed.exec({ type: 'map.setEnvironment', payload: { map: m.id, mood: null } }, { label: 'No mood' })
          }
        >
          No mood
        </button>
      )}
    </div>
  );
}
