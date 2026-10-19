import { z } from 'zod';
import { MOODS, type Mood } from '../dialogue/schema';

/**
 * P22 part 4: a minifig's face for each mood. The resting face is the Look (eyes, expression, face marks,
 * facial hair); each mood can change the expression and the eyes. In Play the speaker of a dialogue line
 * shows the face of its mood, on the figure and in the dialogue box's portrait.
 */
export const Face = z.strictObject({
  expression: z.string().min(1).max(30).optional(),
  eyes: z.string().min(1).max(30).optional(),
});
export type Face = z.infer<typeof Face>;
export const Faces = z.partialRecord(z.enum(MOODS), Face);
export type Faces = z.infer<typeof Faces>;

/** the moods a face can be set for (neutral is the resting face) */
export const FACE_MOODS = MOODS.filter((m) => m !== 'neutral') as Exclude<Mood, 'neutral'>[];
export const MOOD_LABEL: Record<Mood, string> = {
  neutral: 'Resting',
  happy: 'Happy',
  angry: 'Angry',
  sad: 'Sad',
  scared: 'Scared',
  surprised: 'Surprised',
};

/** what a mood looks like when the character has not set it */
export const MOOD_DEFAULT: Record<Mood, Face> = {
  neutral: {},
  happy: { expression: 'Big grin' },
  angry: { expression: 'Angry' },
  sad: { expression: 'Sad' },
  scared: { expression: 'Scared', eyes: 'Wide' },
  surprised: { expression: 'Surprised', eyes: 'Wide' },
};

/** The face parts a mood changes (empty: the resting face). */
export function moodFace(faces: Faces | undefined, mood: Mood): Face {
  if (mood === 'neutral') return faces?.neutral ?? {};
  return { ...MOOD_DEFAULT[mood], ...(faces?.[mood] ?? {}) };
}
