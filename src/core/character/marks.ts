import { z } from 'zod';
import { hairError } from './hair';

/**
 * Milestone 3, 10d: drawings described in words — “a red star on her left cheek”, “number 7 on the back of his
 * shirt”, “freckles”, “tiger stripes on his arms”. A mark is a shape (or a few letters) on a side of a part,
 * at a place, of a size and colour. The editor draws marks into v68 part paint (the Draw tab's pictures), so
 * the AI makers can draw without drawing pixels: Claude says what goes where, the editor puts it there.
 */

/** v68's paintable parts (the Draw tab's Part list) */
export const PAINT_PARTS = [
  'head',
  'hair',
  'hat',
  'torso',
  'dress',
  'leftArm',
  'rightArm',
  'leftHand',
  'rightHand',
  'leftLeg',
  'rightLeg',
  'leftFoot',
  'rightFoot',
  'glasses',
  'back',
  'cape',
  'accessory',
  'held',
] as const;
export type PaintPart = (typeof PAINT_PARTS)[number];
/** a part's six sides, in v68's order (left and right as you look at the figure's front) */
export const PAINT_SIDES = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
export const MARK_SHAPES = [
  'star',
  'heart',
  'circle',
  'ring',
  'dot',
  'square',
  'triangle',
  'cross',
  'plus',
  'lightning',
  'drop',
  'stripe',
  'stripes',
  'spots',
  'freckles',
  'scar',
  'text',
  'fill',
] as const;
export type MarkShape = (typeof MARK_SHAPES)[number];

export const Mark = z.strictObject({
  shape: z.enum(MARK_SHAPES),
  part: z.enum(PAINT_PARTS),
  side: z.enum(PAINT_SIDES).default('front'),
  /** the middle of the mark on the side, 0–1 from the left and from the top (as you look at that side) */
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
  /** how big, as a share of the side (0.05 a freckle, 0.3 a cheek star, 1 the whole side) */
  size: z.number().min(0.03).max(1).default(0.25),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#c91a09'),
  /** degrees, clockwise */
  turn: z.number().min(-180).max(180).default(0),
  /** for text: up to 10 letters or digits */
  text: z.string().max(10).optional(),
});
export type Mark = z.infer<typeof Mark>;
export const MAX_MARKS = 16;

/** Keeps only marks the editor can draw, in range (an unknown shape or part drops the mark; numbers are clamped). */
export function cleanMarks(raw: unknown): Mark[] {
  if (!Array.isArray(raw)) return [];
  const out: Mark[] = [];
  for (const r of raw.slice(0, MAX_MARKS * 2)) {
    if (!r || typeof r !== 'object') continue;
    const m = { ...(r as Record<string, unknown>) };
    for (const [k, lo, hi] of [
      ['x', 0, 1],
      ['y', 0, 1],
      ['size', 0.03, 1],
      ['turn', -180, 180],
    ] as const)
      if (typeof m[k] === 'number') m[k] = Math.max(lo, Math.min(hi, m[k] as number));
    if (typeof m.text === 'string') m.text = m.text.slice(0, 10);
    if (typeof m.side === 'string') m.side = m.side.toLowerCase();
    if (typeof m.color === 'string') m.color = m.color.toLowerCase();
    const ok = Mark.safeParse(m);
    if (ok.success) out.push(ok.data);
    if (out.length >= MAX_MARKS) break;
  }
  return out;
}

/** places by name, on a part's front: [part, x, y] (left and right are the figure's own) */
const SPOTS: [RegExp, PaintPart, number, number, (typeof PAINT_SIDES)[number]][] = [
  [/\bleft cheek\b/, 'head', 0.76, 0.6, 'front'],
  [/\bright cheek\b/, 'head', 0.24, 0.6, 'front'],
  [/\bcheeks?\b/, 'head', 0.76, 0.6, 'front'],
  [/\bforehead\b/, 'head', 0.5, 0.3, 'front'],
  [/\bchin\b/, 'head', 0.5, 0.86, 'front'],
  [/\b(left eye)\b/, 'head', 0.68, 0.47, 'front'],
  [/\b(right eye)\b/, 'head', 0.3, 0.47, 'front'],
  [/\b(face)\b/, 'head', 0.5, 0.55, 'front'],
  [/\bback of (his|her|its|the) (shirt|torso|body)|\bon (his|her|its|the) back\b|\bback\b/, 'torso', 0.5, 0.42, 'back'],
  [/\b(chest|shirt|torso|front|belly|t-shirt|tshirt)\b/, 'torso', 0.5, 0.4, 'front'],
  [/\b(left arm|left shoulder)\b/, 'leftArm', 0.5, 0.4, 'left'],
  [/\b(right arm|right shoulder)\b/, 'rightArm', 0.5, 0.4, 'right'],
  [/\barms?\b/, 'leftArm', 0.5, 0.45, 'left'],
  [/\b(left leg)\b/, 'leftLeg', 0.5, 0.45, 'front'],
  [/\b(right leg)\b/, 'rightLeg', 0.5, 0.45, 'front'],
  [/\blegs?\b/, 'leftLeg', 0.5, 0.45, 'front'],
  [/\b(hat|cap|helmet)\b/, 'hat', 0.5, 0.5, 'front'],
  [/\bcape\b/, 'cape', 0.5, 0.45, 'back'],
];
const SHAPE_WORDS: [RegExp, MarkShape, number][] = [
  [/\bstars?\b/, 'star', 0.3],
  [/\bhearts?\b/, 'heart', 0.3],
  [/\b(lightning|bolt)\b/, 'lightning', 0.35],
  [/\b(tear|teardrop|drop)\b/, 'drop', 0.15],
  [/\bscars?\b/, 'scar', 0.35],
  [/\bfreckles?\b/, 'freckles', 0.4],
  [/\b(spots|spotty|dots|polka)\b/, 'spots', 1],
  [/\bstripes?d?\b|\bstriped\b/, 'stripes', 1],
  [/\b(cross|x mark)\b/, 'cross', 0.3],
  [/\b(circle|target|bullseye)\b/, 'ring', 0.4],
  [/\bsquare\b/, 'square', 0.3],
  [/\btriangle\b/, 'triangle', 0.3],
  [/\b(dot|mole|beauty mark)\b/, 'dot', 0.06],
];
const MARK_COLORS: Record<string, string> = {
  red: '#c91a09',
  blue: '#0055bf',
  green: '#237841',
  yellow: '#f2cd37',
  gold: '#f2cd37',
  orange: '#fe8a18',
  purple: '#81007b',
  pink: '#fc97ac',
  black: '#1b1b1b',
  white: '#f4f4f4',
  grey: '#a0a5a9',
  gray: '#a0a5a9',
  silver: '#a0a5a9',
  brown: '#583927',
};

/**
 * Marks said in words, without Claude: “a red star on her left cheek”, “number 7 on his back”, “freckles”,
 * “a scar on his chin”, “a heart tattoo on her arm”, “tiger stripes”. Each clause (split at “and”, commas)
 * gives at most one mark; a mark needs a shape word or a number/word to print.
 */
export function marksFromWords(text: string): Mark[] {
  const out: Mark[] = [];
  for (const clause of text.toLowerCase().split(/,|;|\band\b|\bwith\b/)) {
    const c = ` ${clause.trim()} `;
    let shape: MarkShape | null = null;
    let size = 0.3;
    let label: string | undefined;
    const num = /\b(?:number|no\.?|#)\s*(\d{1,3})\b/.exec(c);
    const says = /\b(?:saying|says|reading|that says|letters?)\s+["“']?([a-z0-9!]{1,10})["”']?/.exec(c);
    if (num || says) {
      shape = 'text';
      label = (num?.[1] ?? says?.[1] ?? '').toUpperCase();
      size = num ? 0.6 : 0.45;
    } else
      for (const [re, s, sz] of SHAPE_WORDS)
        if (re.test(c)) {
          shape = s;
          size = sz;
          break;
        }
    if (!shape) continue;
    const spot = SPOTS.find(([re]) => re.test(c));
    // freckles and face paint go on the face; numbers on the back; anything else on the chest
    const [, part, x, y, side] = spot ?? [
      null,
      shape === 'freckles' || shape === 'scar' || shape === 'drop' ? 'head' : 'torso',
      shape === 'freckles' ? 0.5 : 0.5,
      shape === 'freckles' ? 0.6 : 0.42,
      shape === 'text' ? 'back' : 'front',
    ];
    const colorWord = Object.keys(MARK_COLORS).find((w) => new RegExp(`\\b${w}\\b`).test(c));
    const color =
      colorWord !== undefined
        ? MARK_COLORS[colorWord]!
        : shape === 'freckles'
          ? '#8a4b26'
          : shape === 'scar'
            ? '#7a2f25'
            : shape === 'text'
              ? '#f4f4f4'
              : '#c91a09';
    const big = /\b(big|large|huge)\b/.test(c) ? 1.5 : /\b(small|little|tiny)\b/.test(c) ? 0.6 : 1;
    const mark: Mark = {
      shape,
      part: part as PaintPart,
      side: side as (typeof PAINT_SIDES)[number],
      x,
      y,
      size: Math.max(0.03, Math.min(1, size * big)),
      color,
      turn: 0,
      ...(label ? { text: label } : {}),
    };
    out.push(mark);
    // “stripes on his arms”, “freckles on both cheeks”: both sides
    if (/\b(both|arms|legs)\b/.test(c) && /^(left|right)/.test(mark.part))
      out.push({
        ...mark,
        part: mark.part.replace(/^left|^right/, (s) => (s === 'left' ? 'right' : 'left')) as PaintPart,
        side: mark.side === 'left' ? 'right' : mark.side === 'right' ? 'left' : mark.side,
      });
    else if (/\bboth cheeks\b/.test(c) && mark.part === 'head') out.push({ ...mark, x: 1 - mark.x });
    if (out.length >= MAX_MARKS) break;
  }
  return out.slice(0, MAX_MARKS);
}

/** the words without the parts that say a drawing (“a knight with a red star on his cheek” → “a knight”) */
export function withoutMarks(text: string): string {
  const parts = text.split(/(,|;|\band\b|\bwith\b)/i);
  const keep: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i] ?? '';
    if (marksFromWords(clause).length) {
      // the joining word before a dropped clause goes too
      if (keep.length && /^(,|;|and|with)$/i.test((keep[keep.length - 1] ?? '').trim())) keep.pop();
      continue;
    }
    keep.push(clause);
    if (parts[i + 1]) keep.push(parts[i + 1]!);
  }
  return keep
    .join('')
    .replace(/\s*(,|;|\band\b|\bwith\b)\s*$/i, '')
    .trim();
}

/** v68's limits on part paint: PNG data, at most 350,000 characters a part and 1,400,000 in all */
export function paintError(paint: Record<string, string>): string | null {
  let total = 0;
  for (const [part, data] of Object.entries(paint)) {
    if (!(PAINT_PARTS as readonly string[]).includes(part)) return `There is no part “${part}” to draw on.`;
    if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))
      return `The drawing on the ${part} is not a PNG picture.`;
    if (data.length > 350_000) return `The drawing on the ${part} is too detailed.`;
    total += data.length;
  }
  return total > 1_400_000 ? 'The drawings are too detailed in all.' : null;
}

/**
 * Body shape said in words (v68's fields, in range): “curvy”, “athletic”, “busty”, “pear-shaped”, “wide hips”,
 * “a deep V-neck”, “comic style”… The chest only for a Female body (as the Look tab).
 */
export function shapeFromWords(text: string, female: boolean): Record<string, string | number> {
  const t = ` ${text.toLowerCase()} `;
  const out: Record<string, string | number> = {};
  const set = (re: RegExp, patch: Record<string, string | number>) => {
    if (re.test(t)) Object.assign(out, patch);
  };
  set(/\b(curvy|voluptuous|hourglass)\b/, {
    buttShape: 'Rounded',
    buttSize: 55,
    ...(female ? { breastShape: 'Natural', breastSize: 75 } : {}),
  });
  set(/\b(athletic|sporty|fit|toned)\b/, {
    buttShape: 'Athletic',
    buttSize: 35,
    ...(female ? { breastShape: 'Compact', breastSize: 35 } : {}),
  });
  set(/\b(muscular|strong|buff|bodybuilder)\b/, { buttShape: 'Athletic', buttSize: 45 });
  set(/\b(slim|skinny|slender|petite)\b/, {
    buttShape: 'Compact',
    buttSize: 10,
    ...(female ? { breastSize: 20 } : {}),
  });
  set(/\b(chubby|plump|round|stout)\b/, { buttShape: 'Wide', buttSize: 70 });
  set(/\bpear[- ]?shaped\b/, { buttShape: 'Pear', buttSize: 65 });
  set(/\bwide hips\b/, { buttShape: 'Wide', buttSize: 60 });
  if (female) {
    set(/\b(busty|buxom|big chest|large chest)\b/, { breastSize: 105, breastShape: 'Rounded' });
    set(/\b(flat[- ]chested|small chest)\b/, { breastSize: 10 });
    set(/\bcomic\b/, { breastMode: 'Comic' });
    set(/\bperky\b/, { breastShape: 'Perky' });
    set(/\bteardrop\b/, { breastShape: 'Teardrop' });
  }
  set(/\b(deep|plunging) v[- ]?neck/, { neckline: 'V-neck', necklineDepth: 75 });
  if (!out.neckline) set(/\bv[- ]?neck/, { neckline: 'V-neck', necklineDepth: 50 });
  set(/\bscoop[- ]?neck/, { neckline: 'Scoop', necklineDepth: 45 });
  set(/\bsweetheart\b/, { neckline: 'Sweetheart', necklineDepth: 50 });
  set(/\bkeyhole\b/, { neckline: 'Keyhole' });
  set(/\b(asymmetric|one[- ]shoulder)\b/, { neckline: 'Asymmetric' });
  return out;
}

/** v68's body shape fields with their ranges and choices (the Look tab's Body shape and neckline) */
export const SHAPE_RANGES: Record<string, number> = {
  breastSize: 150,
  buttSize: 100,
  necklineDepth: 100,
  necklineWidth: 100,
};
export const SHAPE_OPTIONS: Record<string, readonly string[]> = {
  breastMode: ['Sculpted', 'Printed', 'Comic'],
  breastShape: ['Rounded', 'Natural', 'Angular', 'Teardrop', 'Wide', 'Compact', 'Perky', 'Pointy'],
  buttShape: ['Rounded', 'Athletic', 'Wide', 'Compact', 'Pear'],
  neckline: ['Closed', 'V-neck', 'Scoop', 'Sweetheart', 'Keyhole', 'Asymmetric'],
};

/** what is wrong with a profile's body shape and drawings (v68's choices, whole numbers in range, its paint limits) */
export function lookError(profile: Record<string, unknown>): string | null {
  for (const [k, max] of Object.entries(SHAPE_RANGES)) {
    const v = profile[k];
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > max))
      return `${k} is a whole number from 0 to ${max}.`;
  }
  for (const [k, opts] of Object.entries(SHAPE_OPTIONS)) {
    const v = profile[k];
    if (v !== undefined && !opts.includes(String(v))) return `${k} is one of ${opts.join(', ')}.`;
  }
  const hair = hairError(profile);
  if (hair) return hair;
  const paint = profile.paint;
  if (paint !== undefined) {
    if (!paint || typeof paint !== 'object' || Array.isArray(paint)) return 'paint is a map of part → PNG picture.';
    return paintError(paint as Record<string, string>);
  }
  return null;
}
