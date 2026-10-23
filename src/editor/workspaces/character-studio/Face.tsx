import { FACE_MOODS, type Face, MOOD_DEFAULT, MOOD_LABEL, moodFace } from '../../../core/character/faces';
import { type ResolvedBody, resolveBody } from '../../../core/character/resolve';
import type { Mood } from '../../../core/dialogue/schema';
import type { Character } from '../../../core/schema';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { portrait } from '../../../engine/render/portraits';
import { wornProfile } from '../../../engine/runtime/sheet';
import { FieldHelp } from '../../components/fields';
import { PreviewPicker } from '../../components/PreviewPicker';
import type { Props } from './Sheet';
import { VoicePreview } from './Sheet';
import { CharacterThumb } from './thumbs';

/**
 * P22 part 4: the Face tab — the resting face (head shape, eyes and their colour, expression, face marks,
 * facial hair, glasses) and a face for each mood. Dialogue lines have a mood: in Play the speaker shows that
 * face on its figure and in the dialogue box's portrait. Each edit is one character.update, one undo step.
 */
export const FACE_HELP =
  'The resting face, and how it looks for each mood (Happy, Angry, Sad, Scared, Surprised). A dialogue line’s mood shows this face on the speaker in Play and in the dialogue box’s portrait. Pick a mood to see it on the preview.';

const RESTING: [string, string][] = [
  ['head', 'Head shape'],
  ['eyes', 'Eyes'],
  ['expression', 'Expression'],
  ['face', 'Face marks'],
  ['facialHair', 'Facial hair'],
  ['glasses', 'Glasses'],
];

/** the profile with a mood's face on it (only options the minifig has) */
export function withMood(profile: Record<string, unknown>, faces: Character['faces'], mood: Mood) {
  const L = legacyRuntime();
  const f = moodFace(faces, mood);
  const out = { ...profile };
  const choices = L.CharacterCatalog.choices as Record<string, string[]>;
  for (const [k, v] of Object.entries(f)) if (v && choices[k]?.includes(v)) out[k] = v;
  return out;
}

export function FaceTab({
  c,
  chr,
  save,
  profile,
  setField,
}: Props & { profile: Record<string, unknown>; setField: (k: string, v: unknown) => void }) {
  const ed = c.ed;
  const L = legacyRuntime();
  const choices = L.CharacterCatalog.choices as Record<string, string[]>;
  const mood = ed.faceMood.value;
  const setMood = (m: Mood, k: keyof Face, v: string) => {
    const faces = { ...(chr.faces ?? {}) };
    const cur = { ...(faces[m] ?? {}) };
    // the default for the mood needs no entry
    if (!v || v === (MOOD_DEFAULT[m][k] ?? profile[k])) delete cur[k];
    else cur[k] = v;
    if (Object.keys(cur).length) faces[m] = cur;
    else delete faces[m];
    const { faces: _f, ...rest } = chr;
    save((Object.keys(faces).length ? { ...rest, faces } : rest) as Character, `${MOOD_LABEL[m]} face`);
  };
  return (
    <>
      <div class="sec" data-tour="char-face" data-help="characters.face">
        <div class="sech">
          <span>
            Face
            <FieldHelp label="Face" text={FACE_HELP} />
          </span>
        </div>
        <div class="mood-grid" role="radiogroup" aria-label="Moods">
          {(['neutral', ...FACE_MOODS] as Mood[]).map((m) => (
            <button
              type="button"
              role="radio"
              aria-checked={mood === m}
              class={`mood-card ${mood === m ? 'on' : ''}`}
              data-tour={`face-mood-${m}`}
              onClick={() => (ed.faceMood.value = m)}
            >
              <CharacterThumb profile={withMood(profile, chr.faces, m)} view="head" size={44} />
              <span>{MOOD_LABEL[m]}</span>
            </button>
          ))}
        </div>
        {/* P23 part 3: see the face talk in this mood (the preview's mouth moves with the words) */}
        <VoicePreview c={c} chr={chr} />
      </div>
      {mood === 'neutral' ? (
        <div class="sec" data-tour="face-resting">
          <div class="sech">
            <span>Resting face</span>
          </div>
          {RESTING.filter(([k]) => choices[k]).map(([k, label]) => (
            <div class="field">
              {label}
              <PreviewPicker
                label={label}
                tour={`face-${k}`}
                value={String(profile[k])}
                options={choices[k]!.map((o) => ({
                  value: o,
                  name: o,
                  thumb: <CharacterThumb profile={{ ...profile, [k]: o }} view="head" size={40} />,
                }))}
                onPick={(v) => setField(k, v)}
              />
            </div>
          ))}
          <label class="field">
            Eye colour
            <input
              type="color"
              class="inp"
              aria-label="Eye colour"
              value={String(profile.eyeColor ?? '#3b2418')}
              onChange={(e) => setField('eyeColor', (e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
      ) : (
        <div class="sec" data-tour="face-mood">
          <div class="sech">
            <span>{MOOD_LABEL[mood]} face</span>
            {chr.faces?.[mood] && (
              <button
                type="button"
                class="link"
                onClick={() => {
                  const faces = { ...(chr.faces ?? {}) };
                  delete faces[mood];
                  const { faces: _f, ...rest } = chr;
                  save(
                    (Object.keys(faces).length ? { ...rest, faces } : rest) as Character,
                    `${MOOD_LABEL[mood]} face: default`,
                  );
                }}
              >
                Default
              </button>
            )}
          </div>
          <p class="muted small">
            Lines with the mood {MOOD_LABEL[mood].toLowerCase()} show this face. The rest of the face stays the resting
            one.
          </p>
          {(['expression', 'eyes'] as const).map((k) => (
            <div class="field">
              {k === 'expression' ? 'Expression' : 'Eyes'}
              <PreviewPicker
                label={`${MOOD_LABEL[mood]} ${k}`}
                tour={`face-${mood}-${k}`}
                value={String(moodFace(chr.faces, mood)[k] ?? profile[k])}
                options={choices[k]!.map((o) => ({
                  value: o,
                  name: o,
                  thumb: (
                    <CharacterThumb profile={{ ...withMood(profile, chr.faces, mood), [k]: o }} view="head" size={40} />
                  ),
                }))}
                onPick={(v) => setMood(mood, k, v)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** The dialogue preview's portraits: the speaker of the game (by id or name) with the line's mood. */
export function editorPortrait(store: { list(p: string): string[]; get(p: string): unknown }) {
  return (who: string, mood: Mood, mouth = 0): string | null => {
    const chr = who.startsWith('chr_')
      ? (store.get(`characters/${who}.json`) as Character | undefined)
      : store
          .list('characters/')
          .map((p) => store.get(p) as Character)
          .find((c) => c?.name === who);
    if (!chr) return null;
    let body: ResolvedBody | null = null;
    try {
      body = resolveBody(chr.body, (p) => store.get(p));
    } catch {
      body = null;
    }
    const L = legacyRuntime();
    return body
      ? portrait({}, body)
      : portrait({
          ...withMood({ ...L.CharacterCatalog.defaults, ...wornProfile(chr) }, chr.faces, mood),
          ...(mouth ? { mouthOpen: mouth } : {}),
        });
  };
}
