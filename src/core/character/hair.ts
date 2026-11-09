import { z } from 'zod';
import { id } from '../schema/common';

/**
 * Milestone 3, 10d part 3: custom hair. A hairstyle is a handful of settings — the top (smooth, spiky, curly…), how
 * long and how full it is, the parting, a fringe, how it is tied (ponytail, buns, braids…), a beard, and the colours
 * of the tips, the band and the beard — that the engine's copy of v68's model draws with v68's own shapes, so it
 * looks like the built-in hair, takes drawings (the Draw tab's Hair part) and squashes under a hat.
 *
 * A character wearing one has the v68 hair choice `Custom` and the settings in its look as `customHair`; the hair's
 * main colour stays v68's own Hair colour. Hairstyles saved to My library live in hairstyles/<id>.json with their
 * colour, and putting one on a character copies it, so changing a character's hair never changes another's.
 */
export const HAIR_TOPS = ['Smooth', 'Spiky', 'Curly', 'Afro', 'Mohawk', 'Quiff', 'Slicked back', 'Shaved'] as const;
export const HAIR_PARTINGS = ['None', 'Left', 'Middle', 'Right'] as const;
export const HAIR_FRINGES = ['None', 'Straight', 'Swept', 'Curtain'] as const;
export const HAIR_TIES = [
  'None',
  'Ponytail',
  'High ponytail',
  'Pigtails',
  'Bun',
  'Top knot',
  'Two buns',
  'Braid',
  'Two braids',
] as const;
export const HAIR_BEARDS = ['None', 'Short', 'Full', 'Long', 'Braided', 'Mutton chops'] as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const pct = z.number().int().min(0).max(100);

export const HairSettings = z.strictObject({
  top: z.enum(HAIR_TOPS),
  /** 0: short, ending at the ears; 100: down to the waist */
  length: pct,
  /** 0: close to the head; 100: big */
  volume: pct,
  parting: z.enum(HAIR_PARTINGS),
  fringe: z.enum(HAIR_FRINGES),
  tie: z.enum(HAIR_TIES),
  /** how long the ponytail, pigtails or braids hang; how big the buns are */
  tieLength: pct,
  beard: z.enum(HAIR_BEARDS),
  beardLength: pct,
  /** the ends of the hair in another colour (ombré, dyed tips) */
  tips: hex.optional(),
  /** the hair band or ties */
  band: hex.optional(),
  /** a beard of another colour than the hair */
  beardColor: hex.optional(),
});
export type HairSettings = z.infer<typeof HairSettings>;

/** in a character's look: the settings, the name it was given and the library hairstyle it came from */
export const CustomHair = HairSettings.extend({
  name: z.string().max(40).optional(),
  from: id('hairstyle').optional(),
});
export type CustomHair = z.infer<typeof CustomHair>;

/** hairstyles/<id>.json: a hairstyle in My library, with its colour */
export const HairStyle = HairSettings.extend({
  id: id('hairstyle'),
  name: z.string().min(1).max(40),
  color: hex,
});
export type HairStyle = z.infer<typeof HairStyle>;

export const MAX_HAIRSTYLES = 128;

export const HAIR_DEFAULT: HairSettings = {
  top: 'Smooth',
  length: 30,
  volume: 40,
  parting: 'Left',
  fringe: 'None',
  tie: 'None',
  tieLength: 50,
  beard: 'None',
  beardLength: 40,
};

/** hairstyles to start from (the Hair editor's first row) */
export const HAIR_PRESETS: { name: string; hair: Partial<HairSettings> }[] = [
  { name: 'Long waves', hair: { top: 'Smooth', length: 70, volume: 55, parting: 'Middle' } },
  { name: 'Curtain bangs', hair: { length: 45, parting: 'Middle', fringe: 'Curtain' } },
  { name: 'Blunt bob', hair: { length: 18, volume: 45, parting: 'None', fringe: 'Straight' } },
  { name: 'High ponytail', hair: { tie: 'High ponytail', tieLength: 70, parting: 'None' } },
  { name: 'Space buns', hair: { tie: 'Two buns', tieLength: 45, parting: 'Middle' } },
  { name: 'Top knot', hair: { tie: 'Top knot', tieLength: 40, top: 'Slicked back', parting: 'None' } },
  { name: 'Two braids', hair: { tie: 'Two braids', tieLength: 75, parting: 'Middle' } },
  { name: 'Viking', hair: { length: 55, volume: 60, tie: 'Braid', tieLength: 60, beard: 'Braided', beardLength: 70 } },
  { name: 'Big curls', hair: { top: 'Curly', length: 45, volume: 75, parting: 'None' } },
  { name: 'Afro puff', hair: { top: 'Afro', length: 0, volume: 80, parting: 'None' } },
  { name: 'Punk', hair: { top: 'Mohawk', length: 0, volume: 75, parting: 'None' } },
  { name: 'Spiky', hair: { top: 'Spiky', length: 0, volume: 60, parting: 'None' } },
  { name: 'Pompadour', hair: { top: 'Quiff', length: 0, volume: 70, parting: 'Left' } },
  { name: 'Wizard beard', hair: { length: 60, volume: 50, beard: 'Long', beardLength: 90, parting: 'Middle' } },
  { name: 'Lumberjack', hair: { length: 10, beard: 'Full', beardLength: 45, parting: 'Right' } },
  { name: 'Buzz and chops', hair: { top: 'Shaved', length: 0, beard: 'Mutton chops', beardLength: 40 } },
];

export function presetHair(name: string): HairSettings | null {
  const p = HAIR_PRESETS.find((x) => x.name === name);
  return p ? { ...HAIR_DEFAULT, ...p.hair } : null;
}

/** settings from anything (a draft, Claude's answer, an old file): unknown fields dropped, numbers clamped */
export function cleanHair(raw: unknown): CustomHair {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends readonly string[]>(v: unknown, opts: T, d: T[number]): T[number] =>
    typeof v === 'string' && (opts as readonly string[]).includes(v) ? v : d;
  const num = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d;
  const col = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
  const out: CustomHair = {
    top: pick(r.top, HAIR_TOPS, HAIR_DEFAULT.top),
    length: num(r.length, HAIR_DEFAULT.length),
    volume: num(r.volume, HAIR_DEFAULT.volume),
    parting: pick(r.parting, HAIR_PARTINGS, HAIR_DEFAULT.parting),
    fringe: pick(r.fringe, HAIR_FRINGES, HAIR_DEFAULT.fringe),
    tie: pick(r.tie, HAIR_TIES, HAIR_DEFAULT.tie),
    tieLength: num(r.tieLength, HAIR_DEFAULT.tieLength),
    beard: pick(r.beard, HAIR_BEARDS, HAIR_DEFAULT.beard),
    beardLength: num(r.beardLength, HAIR_DEFAULT.beardLength),
  };
  for (const k of ['tips', 'band', 'beardColor'] as const) {
    const c = col(r[k]);
    if (c) out[k] = c;
  }
  if (typeof r.name === 'string' && r.name.trim()) out.name = r.name.trim().slice(0, 40);
  if (typeof r.from === 'string' && /^hst_[0-9a-z]{10}$/.test(r.from)) out.from = r.from as CustomHair['from'];
  return out;
}

/** what is wrong with a look's custom hair, or null */
export function hairError(profile: Record<string, unknown>): string | null {
  const h = profile.customHair;
  if (h === undefined) return null;
  const r = CustomHair.safeParse(h);
  if (!r.success) return `customHair: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
  if (profile.hair !== 'Custom') return 'customHair is only worn with the hair choice Custom.';
  return null;
}

/** the nearest of v68's own hairstyles, for Play in v68 (its files know no custom hair) */
export function v68Hair(h: HairSettings): string {
  if (h.top === 'Afro') return 'Afro';
  if (h.top === 'Mohawk') return 'Mohawk';
  if (h.top === 'Spiky') return 'Spiky';
  if (h.top === 'Quiff') return 'Quiff';
  if (h.top === 'Shaved') return 'Buzz cut';
  if (h.tie === 'Ponytail' || h.tie === 'High ponytail') return 'Ponytail';
  if (h.tie === 'Pigtails' || h.tie === 'Two braids') return 'Pigtails';
  if (h.tie === 'Bun' || h.tie === 'Top knot' || h.tie === 'Two buns') return 'Bun';
  if (h.tie === 'Braid') return 'Braid';
  if (h.top === 'Curly') return 'Curly';
  if (h.length >= 45) return 'Long';
  if (h.length >= 15) return 'Bob';
  if (h.top === 'Slicked back') return 'Swept';
  return h.parting === 'None' ? 'Short' : 'Side part';
}

/** a look as v68's own files take it: custom hair becomes the nearest v68 hairstyle */
export function lookForV68(profile: Record<string, unknown>): Record<string, unknown> {
  if (profile.hair !== 'Custom' && profile.customHair === undefined) return profile;
  const { customHair, ...rest } = profile;
  const h = cleanHair(customHair);
  return {
    ...rest,
    hair: profile.hair === 'Custom' ? v68Hair(h) : profile.hair,
    ...(h.beard !== 'None' && rest.facialHair === 'None' ? { facialHair: 'Full beard' } : {}),
  };
}

/** short words for a hairstyle (picker labels, From a picture's matched lines) */
export function describeHair(h: HairSettings): string {
  const bits: string[] = [];
  const len = h.length >= 70 ? 'very long' : h.length >= 45 ? 'long' : h.length >= 15 ? 'shoulder' : 'short';
  const tied = h.tie !== 'None';
  if (h.top === 'Smooth') bits.push(tied ? 'smooth' : len);
  else bits.push(`${h.top.toLowerCase()}${h.length >= 15 && !tied ? `, ${len}` : ''}`);
  if (h.fringe !== 'None') bits.push(`${h.fringe.toLowerCase()} fringe`);
  if (h.tie !== 'None') bits.push(h.tie.toLowerCase());
  if (h.beard !== 'None') bits.push(h.beard === 'Mutton chops' ? 'mutton chops' : `${h.beard.toLowerCase()} beard`);
  if (h.tips) bits.push('coloured tips');
  return bits.join(', ');
}

const COLOURS: [RegExp, string][] = [
  [/\b(blue)\b/, '#1e5aa8'],
  [/\b(pink)\b/, '#e4adc8'],
  [/\b(purple|violet)\b/, '#8a4fbf'],
  [/\b(green)\b/, '#4b974b'],
  [/\b(red|crimson)\b/, '#c91a09'],
  [/\b(blond|blonde|golden)\b/, '#f2cd37'],
  [/\b(white|silver)\b/, '#e4e4da'],
  [/\b(grey|gray)\b/, '#a0a5a9'],
  [/\b(black)\b/, '#1b2a34'],
  [/\b(orange|ginger)\b/, '#e06c2b'],
  [/\b(teal|turquoise)\b/, '#36aebf'],
];
const colourIn = (s: string) => COLOURS.find(([re]) => re.test(s))?.[1];

/**
 * A custom hairstyle from words, when they say more than one of v68's hairstyles can show (two buns, a high
 * ponytail, braided beard, blue tips, a fringe…); null when the words say nothing about hair beyond v68's list.
 */
export function hairFromWords(text: string): CustomHair | null {
  const t = ` ${text.toLowerCase()} `;
  const h: CustomHair = { ...HAIR_DEFAULT, parting: 'None' };
  let custom = false;
  const has = (re: RegExp) => re.test(t);
  if (has(/\b(space buns|two buns|double buns|buns)\b/)) (h.tie = 'Two buns'), (custom = true);
  else if (has(/\btop ?knot\b|\bman ?bun\b/)) (h.tie = 'Top knot'), (custom = true);
  else if (has(/\bhigh ponytail\b/)) (h.tie = 'High ponytail'), (custom = true);
  else if (has(/\b(two braids|braids|plaits|braided pigtails)\b/)) (h.tie = 'Two braids'), (custom = true);
  else if (has(/\bponytail\b/)) h.tie = 'Ponytail';
  else if (has(/\bpigtails\b/)) h.tie = 'Pigtails';
  else if (has(/\bbraid\b/) && !has(/braided beard/)) h.tie = 'Braid';
  else if (has(/\bbun\b/)) h.tie = 'Bun';
  if (has(/\b(fringe|bangs)\b/)) {
    h.fringe = has(/\bcurtain\b/) ? 'Curtain' : has(/\bswept\b|\bside\b/) ? 'Swept' : 'Straight';
    custom = true;
  }
  if (has(/\bslicked\b/)) (h.top = 'Slicked back'), (custom = true);
  else if (has(/\bpompadour\b|\bquiff\b/)) h.top = 'Quiff';
  else if (has(/\bshaved\b|\bbuzz/)) h.top = 'Shaved';
  else if (has(/\bmohawk\b|\bpunk\b/)) h.top = 'Mohawk';
  else if (has(/\bafro\b/)) h.top = 'Afro';
  else if (has(/\bspiky\b|\bspikes\b/)) h.top = 'Spiky';
  else if (has(/\bcurly\b|\bcurls\b/)) h.top = 'Curly';
  if (has(/\b(very long|waist[- ]length|down to (his|her|their) waist)\b/)) (h.length = 90), (custom = true);
  else if (has(/\blong (hair|waves|curls|locks)\b|\bflowing\b/)) h.length = 65;
  else if (has(/\b(shoulder[- ]length|medium hair|bob)\b/)) h.length = 25;
  else if (has(/\bshort hair\b/)) h.length = 0;
  if (has(/\b(big|huge|voluminous|wild|fluffy) (hair|curls|afro)\b/)) (h.volume = 80), (custom = true);
  if (has(/\bmiddle part|centre part|center part\b/)) (h.parting = 'Middle'), (custom = true);
  else if (has(/\bside part\b/)) h.parting = 'Left';
  if (has(/\bbraided beard\b/)) (h.beard = 'Braided'), (h.beardLength = 70), (custom = true);
  else if (has(/\bmutton ?chops\b|\bsideburns\b/)) (h.beard = 'Mutton chops'), (custom = true);
  else if (has(/\b(wizard|flowing|huge|enormous) beard\b/)) (h.beard = 'Long'), (h.beardLength = 85), (custom = true);
  else if (has(/\b(bushy|thick|big|sculpted) beard\b/)) (h.beard = 'Full'), (custom = true);
  const tip = t.match(/\b(\w+)[- ](tips|ends|ombre|ombré)\b|\b(ombre|ombré|dyed tips) (in )?(\w+)/);
  if (tip) {
    const c = colourIn(tip[1] ?? tip[5] ?? '');
    if (c) (h.tips = c), (custom = true);
  }
  const band = t.match(/\b(\w+) (hair ?band|ribbon|scrunchie|hair tie)s?\b/);
  if (band && h.tie !== 'None') {
    const c = colourIn(band[1]!);
    if (c) (h.band = c), (custom = true);
  }
  const tied = h.tie !== 'None';
  if (tied && has(/\b(long|very long)\b/)) h.tieLength = 80;
  if (!custom) return null;
  // a tie or a beard said in a sentence that also wants custom hair
  return h;
}

/**
 * The v68 shapes the hair is drawn with (the engine's copy of v68's model hands its own): `part` sets the colour of
 * what follows; lathe, sphere, box and cyl are v68's; the head is 0.57 round from y 3.28 (chin) to 4.25 (top),
 * looking along +z, its own left at +x.
 */
export type HairShapes = {
  part(joint: string, color: string): void;
  lathe(x: number, z: number, profile: [number, number][], segments?: number): void;
  sphere(x: number, y: number, z: number, rx: number, ry?: number, rz?: number): void;
  box(x: number, y: number, z: number, w: number, h: number, d: number): void;
  cyl(x: number, y: number, z: number, r: number, h: number): void;
};

/** Draws a custom hairstyle with v68's shapes. `color` is the look's Hair colour. */
export function drawHair(raw: unknown, color: string, s: HairShapes): void {
  const h = cleanHair(raw);
  const v = h.volume / 100;
  const k = 1 + v * 0.22; // fuller hair stands further out
  const lift = v * 0.14;
  const tips = h.tips ?? color;
  const band = h.band ?? '#2b2b2b';
  const beardColor = h.beardColor ?? color;
  const side = h.parting === 'Left' ? 1 : h.parting === 'Right' ? -1 : 0;
  const hair = (c = color) => s.part('root', c);
  hair();

  // the cap: v68's cap, fuller with volume; close-cut when shaved, and the sides cut for a mohawk
  if (h.top === 'Shaved' || h.top === 'Mohawk')
    s.lathe(0, -0.01, [
      [0.575, 4.02],
      [0.6, 4.16],
      [0.5, 4.3],
      [0.18, 4.36],
      [0, 4.37],
    ]);
  else if (h.top === 'Slicked back')
    s.lathe(0, -0.06, [
      [0.575, 4.04],
      [0.6 * k, 4.18],
      [0.6 * k, 4.3],
      [0.46 * k, 4.42 + lift * 0.5],
      [0.16, 4.47 + lift * 0.5],
      [0, 4.48 + lift * 0.5],
    ]);
  else
    s.lathe(
      0,
      -0.025,
      [
        [0.57, 4.04],
        [0.62 * k, 4.12],
        [0.63 * k, 4.29],
        [0.5 * k, 4.47 + lift],
        [0.18 * k, 4.53 + lift],
        [0, 4.54 + lift],
      ],
      32,
    );
  // the parting: the hair heaps up on the far side of the line
  if (side && !['Shaved', 'Mohawk', 'Afro'].includes(h.top))
    s.sphere(-side * 0.2, 4.36 + lift * 0.7, 0.02, 0.4 * k, 0.2 + lift * 0.4, 0.5 * k);

  // the top
  if (h.top === 'Spiky') {
    const tall = 0.42 + v * 0.4;
    for (let x = -0.36; x < 0.4; x += 0.24)
      for (let z = -0.36; z < 0.4; z += 0.24) {
        const edge = Math.hypot(x, z) / 0.5; // the outer spikes lean out and are shorter
        s.lathe(
          x * 1.1,
          z * 1.1,
          [
            [0.17, 4.4 - edge * 0.12],
            [0.1, 4.4 + tall * (0.6 - edge * 0.15)],
            [0, 4.4 + tall * (1 - edge * 0.3)],
          ],
          10,
        );
      }
  } else if (h.top === 'Mohawk') {
    const tall = 0.3 + v * 0.45;
    for (let i = 0; i < 5; i++)
      s.lathe(
        0,
        -0.4 + i * 0.2,
        [
          [0.15, 4.3],
          [0.12, 4.3 + tall * 0.7],
          [0, 4.3 + tall],
        ],
        12,
      );
  } else if (h.top === 'Quiff') {
    s.sphere(side ? -side * 0.1 : 0, 4.46 + lift, 0.3, 0.36 * k, 0.24 + v * 0.16, 0.3);
  } else if (h.top === 'Curly') {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      s.sphere(
        Math.cos(a) * 0.5 * k,
        4.32 + (i % 3) * 0.08,
        Math.sin(a) * 0.5 * k - 0.02,
        0.19 * k,
        0.17 * k,
        0.19 * k,
      );
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s.sphere(Math.cos(a) * 0.26, 4.5 + lift, Math.sin(a) * 0.26 - 0.03, 0.18 * k);
    }
  } else if (h.top === 'Afro') {
    const r = 0.62 + v * 0.3;
    s.sphere(0, 4.4 + v * 0.12, -0.12 - v * 0.05, r, r * 0.82, r);
  }

  // the fringe, over the forehead (the brows are at y 4.0)
  if (h.fringe !== 'None' && h.top !== 'Mohawk' && h.top !== 'Shaved') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * 2 - 1; // -1 … 1 across the forehead
      const a = t * 0.95;
      let y = 4.14;
      if (h.fringe === 'Swept') y = 4.1 + (t * (side || 1) + 1) * 0.07;
      if (h.fringe === 'Curtain') y = 4.06 + (1 - Math.abs(t)) * 0.17;
      const r = 0.6 * k;
      s.sphere(Math.sin(a) * r, y + 0.06, Math.cos(a) * r - 0.05, 0.13, 0.12, 0.1);
    }
  }

  // hair hanging down (tied hair hangs from its tie instead)
  const tied = h.tie !== 'None';
  if (!tied && h.length > 0 && !['Mohawk', 'Shaved', 'Afro', 'Spiky'].includes(h.top)) {
    const L = h.length / 100;
    const bottom = 3.78 - L * 1.85; // the chin at 3.3, the shoulders at 3.1, the waist at about 2.0
    const sideBottom = Math.max(bottom, 3.2);
    const top = 4.2;
    const ombre = h.tips && L > 0.1 ? top - (top - bottom) * 0.7 : bottom;
    const curly = h.top === 'Curly';
    const panel = (x: number, z: number, w: number, d: number, y0: number, y1: number) => {
      if (y1 - y0 < 0.02) return;
      if (curly) {
        // curls: rows of balls instead of a smooth panel
        const rows = Math.max(1, Math.round((y1 - y0) / 0.2));
        const cols = Math.max(1, Math.round(w / 0.22));
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++)
            s.sphere(
              x - w / 2 + (c + 0.5) * (w / cols),
              y1 - (r + 0.5) * ((y1 - y0) / rows),
              z,
              (w / cols) * 0.62,
              ((y1 - y0) / rows) * 0.62,
              d * 0.7,
            );
      } else s.box(x, (y0 + y1) / 2, z, w, y1 - y0, d);
    };
    const hang = (y0: number, y1: number) => {
      for (const sd of [-1, 1]) panel(sd * 0.53 * k, -0.14, 0.23 * k, 0.64, Math.max(y0, sideBottom), y1);
      panel(0, -0.5 - v * 0.06, 1.08 * k, 0.23 + v * 0.08, y0, y1);
    };
    // long hair falls over the shoulders in front too (the chest's front is at z 0.39)
    const locks = (y0: number, y1: number) => {
      if (L < 0.4) return;
      for (const sd of [-1, 1]) panel(sd * (0.47 + v * 0.05), 0.2, 0.2 * k, 0.42, y0, Math.min(y1, 3.3));
    };
    hang(ombre, top);
    locks(Math.max(ombre, bottom + 0.25), top);
    if (ombre > bottom) {
      hair(tips);
      hang(bottom, ombre);
      locks(bottom + 0.25, Math.min(ombre, 3.3));
      hair();
    }
  }

  // ties
  const T = h.tieLength / 100;
  const chain = (x: number, y: number, z: number, len: number, r: number, dx = 0, braid = false, end = tips) => {
    // balls down from (x, y, z), thinning, the last third in the tips colour
    const n = Math.max(3, Math.round(len / 0.16));
    for (let i = 0; i < n; i++) {
      if (end !== color && i === Math.floor(n * 0.66)) hair(end);
      const f = i / n;
      const wob = braid ? Math.sin(i * 2) * 0.06 : 0;
      s.sphere(x + dx * f + wob, y - f * len, z - Math.sin(f * 1.2) * 0.08, r * (1 - f * 0.4), 0.13, r * (1 - f * 0.4));
    }
    hair();
  };
  const tie = (x: number, y: number, z: number) => {
    hair(band);
    s.sphere(x, y, z, 0.12, 0.09, 0.12);
    hair();
  };
  if (h.tie === 'Ponytail') {
    tie(0, 4.08, -0.64);
    chain(0, 3.98, -0.74, 0.35 + T * 1.5, 0.2 + v * 0.06);
  } else if (h.tie === 'High ponytail') {
    tie(0, 4.48, -0.48);
    s.sphere(0, 4.48, -0.66, 0.2, 0.15, 0.2);
    chain(0, 4.36, -0.8, 0.35 + T * 1.6, 0.21 + v * 0.06);
  } else if (h.tie === 'Pigtails' || h.tie === 'Two braids') {
    for (const sd of [-1, 1]) {
      tie(sd * 0.62, 4.0, -0.18);
      chain(sd * 0.68, 3.9, -0.2, 0.3 + T * 1.3, 0.17 + v * 0.05, sd * 0.05, h.tie === 'Two braids');
    }
  } else if (h.tie === 'Braid') {
    tie(0, 4.05, -0.66);
    chain(0, 3.96, -0.72, 0.4 + T * 1.6, 0.15 + v * 0.04, 0, true);
  } else if (h.tie === 'Bun') {
    s.sphere(0, 4.4, -0.55, 0.26 + T * 0.18);
  } else if (h.tie === 'Top knot') {
    const capTop =
      h.top === 'Shaved' || h.top === 'Mohawk' ? 4.37 : h.top === 'Slicked back' ? 4.48 + lift / 2 : 4.54 + lift;
    const r = 0.22 + T * 0.14;
    tie(0, capTop + 0.02, -0.06);
    s.sphere(0, capTop + r * 0.85, -0.06, r);
  } else if (h.tie === 'Two buns') {
    for (const sd of [-1, 1]) s.sphere(sd * 0.4, 4.5 + lift * 0.5, -0.12, 0.2 + T * 0.16);
  }

  // the beard, round the jaw, below the mouth (y 3.47) and up to the ears
  if (h.beard !== 'None') {
    hair(beardColor);
    const B = h.beardLength / 100;
    const jaw = (from: number, to: number, y: (a: number) => number, r: number, ry = (_a: number) => r * 1.25) => {
      // close, flattened balls make one smooth band along the jaw
      const n = Math.max(6, Math.round(Math.abs(to - from) / 0.07));
      for (let i = 0; i <= n; i++) {
        const a = from + ((to - from) * i) / n;
        s.sphere(Math.sin(a) * 0.55, y(a), Math.cos(a) * 0.55, r * 0.75, ry(a), r * 0.75);
      }
    };
    if (h.beard === 'Mutton chops') {
      // down the side of the face from the ear, wider at the jaw
      const r = 0.1 + B * 0.06;
      for (const sd of [-1, 1])
        jaw(
          sd * 1.05,
          sd * 1.5,
          () => 3.68,
          r,
          (a) => 0.2 + (1.5 - Math.abs(a)) * 0.25,
        );
    } else {
      const r = h.beard === 'Short' ? 0.07 + B * 0.03 : 0.1 + B * 0.05;
      // sideburns to the chin, the front low so the mouth shows
      // the band's top at the front stays under the mouth (y 3.4)
      jaw(
        -1.45,
        1.45,
        (a) => 3.24 + Math.abs(a) ** 1.5 * 0.42,
        r,
        (a) => Math.min(r * 1.25, 0.11 + Math.abs(a) * 0.12),
      );
      if (h.beard !== 'Short') {
        // the chin's beard: its top stays under the mouth (3.4), it hangs over the chest
        const drop = h.beard === 'Full' ? 0.2 + B * 0.25 : 0.35 + B * 0.7;
        const ry = drop / 2 + 0.06;
        s.sphere(0, 3.4 - ry, 0.45, 0.28 + v * 0.05, ry, 0.15);
        if (h.beard === 'Braided') {
          hair(band);
          s.sphere(0, 3.4 - drop - 0.02, 0.47, 0.08, 0.05, 0.08);
          hair(beardColor);
          chain(0, 3.36 - drop - 0.08, 0.47, 0.25 + B * 0.4, 0.09, 0, true, beardColor);
        }
        hair(beardColor);
      }
    }
    hair();
  }
}

/** a custom hairstyle to start from that looks like one of v68's (Make it custom) */
export function hairFromV68(name: string): CustomHair {
  const at: Record<string, Partial<HairSettings>> = {
    Bald: { top: 'Shaved', length: 0 },
    'Buzz cut': { top: 'Shaved', length: 0 },
    Short: { length: 0, parting: 'None' },
    'Side part': { length: 0, parting: 'Left' },
    Quiff: { top: 'Quiff', length: 0 },
    Spiky: { top: 'Spiky', length: 0 },
    Curly: { top: 'Curly', length: 20, volume: 55 },
    Afro: { top: 'Afro', length: 0, volume: 70 },
    Bob: { length: 18, parting: 'None' },
    Long: { length: 55 },
    Ponytail: { tie: 'Ponytail' },
    Pigtails: { tie: 'Pigtails' },
    Bun: { tie: 'Bun' },
    Braid: { tie: 'Braid' },
    Mohawk: { top: 'Mohawk', length: 0 },
    Dreadlocks: { top: 'Curly', length: 50 },
    Swept: { top: 'Slicked back', length: 0 },
    Pixie: { length: 0, fringe: 'Swept' },
  };
  return { ...HAIR_DEFAULT, ...(at[name] ?? {}) };
}
