/**
 * P23 part 3: lip sync from text. A minifig's mouth has three shapes while it talks — closed, half open and
 * wide open — and each letter picks one: open vowels open wide, other letters half, lips-together letters
 * (m, b, p) and spaces or punctuation close it. Shapes last at least a short beat, so fast text does not flicker.
 */
export type Mouth = 0 | 0.5 | 1;

const WIDE = new Set('aoAOáàâäãóòôöõ');
const CLOSED = new Set('mbpMBP');

/** the mouth shape for one letter */
export function visemeOf(ch: string | undefined): Mouth {
  if (!ch || !/[\p{L}\p{N}]/u.test(ch)) return 0;
  if (CLOSED.has(ch)) return 0;
  if (WIDE.has(ch)) return 1;
  return 0.5;
}

/** how many letters make one mouth beat (about 12 beats a second at the usual 40 letters a second) */
export const LETTERS_PER_BEAT = 3;

/**
 * The mouth shape while `shown` letters of `text` have appeared (a number, it can be between letters).
 * The whole line shown (or nothing yet): closed.
 */
export function mouthAt(text: string, shown: number): Mouth {
  if (shown <= 0 || shown >= text.length) return 0;
  // the strongest shape in the current beat, so a beat with a vowel opens
  const beat = Math.floor(shown / LETTERS_PER_BEAT);
  let m: Mouth = 0;
  for (let i = beat * LETTERS_PER_BEAT; i < Math.min(text.length, (beat + 1) * LETTERS_PER_BEAT); i++) {
    const v = visemeOf(text[i]);
    if (v > m) m = v;
  }
  // every other beat closes a step, so the jaw keeps moving through a long word
  if (beat % 2 === 1) return (m === 1 ? 0.5 : 0) as Mouth;
  return m;
}

/** The mouth during a line spoken over `dur` seconds, at `t` seconds in (the last fifth stays closed). */
export function mouthOverTime(text: string, t: number, dur: number): Mouth {
  if (t < 0 || dur <= 0) return 0;
  const talking = dur * 0.8;
  if (t >= talking) return 0;
  return mouthAt(text, (t / talking) * text.length);
}
