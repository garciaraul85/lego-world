import type { BodyColors, BodyPlan, MoveKind } from './body';
import { BRICK, eyes, type Made, Maker, P, tailChain, wings } from './families';

/**
 * Milestone 3, 10d part 1: any figure, however wild — a walking teapot, a three-headed robot snake, an octopus
 * chef — as a body plan of its own, made from a short description of its parts (a spec). The spec comes from
 * Claude (which reads the picture or the words) or, without AI, from the words themselves; either way it is
 * built here into ordinary bones and bricks, so the result opens in the skeleton editor like any body plan.
 */
export const CREATURE_SHAPES = [
  'blob',
  'box',
  'ball',
  'egg',
  'tower',
  'flat',
  'teapot',
  'cloud',
  'barrel',
  'star',
  'long',
] as const;
export type CreatureShape = (typeof CREATURE_SHAPES)[number];
export const CREATURE_EXTRAS = [
  'spout',
  'handle',
  'lid',
  'hat',
  'crown',
  'antenna',
  'chimney',
  'spikes',
  'fins',
  'shell',
  'mane',
  'flower',
] as const;
export type CreatureExtra = (typeof CREATURE_EXTRAS)[number];

export type CreatureSpec = {
  name: string;
  /** the main body's shape */
  shape: CreatureShape;
  /** studs: about 3 (a dog) to 10 (a giant) */
  size: number;
  heads: number;
  /** eyes on each head */
  eyes: number;
  /** legs it walks on */
  legs: number;
  arms: number;
  tentacles: number;
  wings: number;
  /** tail length in pieces (0 none) */
  tail: number;
  wheels: number;
  horns: number;
  /** neck length in plates (0: the head sits on the body) */
  neck: number;
  extras: CreatureExtra[];
  move?: MoveKind;
  colors: Required<Pick<BodyColors, 'main' | 'accent' | 'belly' | 'eye'>>;
};

const clampInt = (v: unknown, lo: number, hi: number, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.max(lo, Math.min(hi, n));
};
const hex = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : def);

/** a spec from anywhere (Claude's answer included) made safe: known shapes and extras, numbers in range */
export function cleanSpec(raw: Partial<Record<keyof CreatureSpec, unknown>>): CreatureSpec {
  const shape = CREATURE_SHAPES.includes(raw.shape as CreatureShape) ? (raw.shape as CreatureShape) : 'blob';
  const extras = Array.isArray(raw.extras)
    ? [...new Set(raw.extras.filter((e): e is CreatureExtra => CREATURE_EXTRAS.includes(e as CreatureExtra)))]
    : [];
  const c = (raw.colors ?? {}) as Record<string, unknown>;
  const moves: MoveKind[] = ['walk', 'fly', 'swim', 'slither', 'hop'];
  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'Creature',
    shape,
    size: Math.max(2, Math.min(10, typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 4)),
    heads: clampInt(raw.heads, 0, 5, 1),
    eyes: clampInt(raw.eyes, 0, 8, 2),
    legs: clampInt(raw.legs, 0, 8, 2),
    arms: clampInt(raw.arms, 0, 6, 0),
    tentacles: clampInt(raw.tentacles, 0, 8, 0),
    wings: clampInt(raw.wings, 0, 4, 0) >= 3 ? 4 : clampInt(raw.wings, 0, 4, 0) >= 1 ? 2 : 0,
    tail: clampInt(raw.tail, 0, 8, 0),
    wheels: clampInt(raw.wheels, 0, 6, 0),
    horns: clampInt(raw.horns, 0, 6, 0),
    neck: clampInt(raw.neck, 0, 12, 0),
    extras,
    ...(moves.includes(raw.move as MoveKind) ? { move: raw.move as MoveKind } : {}),
    colors: {
      main: hex(c.main, '#c91a09'),
      accent: hex(c.accent, '#f2cd37'),
      belly: hex(c.belly, '#f4f4f4'),
      eye: hex(c.eye, '#1b1b1b'),
    },
  };
}

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  twin: 2,
  double: 2,
  pair: 2,
  three: 3,
  triple: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  many: 6,
};
/** “three-headed”, “3 heads”, “six legs”, “eight-armed” → the number before the word */
function countOf(text: string, words: string): number | null {
  const re = new RegExp(`\\b(\\d+|${Object.keys(NUMBERS).join('|')})[\\s-]+(?:${words})\\b`);
  const m = re.exec(text);
  if (!m) return null;
  return /^\d+$/.test(m[1]!) ? Number(m[1]) : (NUMBERS[m[1]!] ?? null);
}

/** what things look like, by the word: a shape and the parts they come with */
const THINGS: [RegExp, Partial<CreatureSpec>][] = [
  [
    /\b(teapot|kettle|coffee ?pot)\b/,
    { shape: 'teapot', extras: ['spout', 'handle', 'lid'], heads: 0, eyes: 2, legs: 2 },
  ],
  [
    /\b(cloud|smoke|fog|steam)\b/,
    {
      shape: 'cloud',
      legs: 0,
      move: 'fly',
      heads: 0,
      eyes: 2,
    },
  ],
  [
    /\b(octopus|squid|kraken)\b/,
    {
      shape: 'ball',
      tentacles: 8,
      legs: 0,
      heads: 0,
      eyes: 2,
      move: 'hop',
    },
  ],
  [
    /\b(jellyfish)\b/,
    {
      shape: 'ball',
      tentacles: 6,
      legs: 0,
      heads: 0,
      eyes: 2,
      move: 'swim',
    },
  ],
  [
    /\b(box|crate|cube|toaster|fridge|washing machine|microwave|tv|television|computer)\b/,
    { shape: 'box', heads: 0, eyes: 2, legs: 2, arms: 2 },
  ],
  [/\b(barrel|keg|bucket|can|tin|jar|pot|mug|cup)\b/, { shape: 'barrel', heads: 0, eyes: 2, legs: 2, arms: 2 }],
  [
    /\b(egg|potato|pear|bean)\b/,
    {
      shape: 'egg',
      heads: 0,
      eyes: 2,
      legs: 2,
      arms: 2,
    },
  ],
  [
    /\b(ball|orb|planet|moon|sun|tomato|apple|orange|snowball|pumpkin|eyeball)\b/,
    { shape: 'ball', heads: 0, eyes: 2, legs: 2 },
  ],
  [
    /\b(tower|castle|lighthouse|rocket|candle|bottle|lamp)\b/,
    {
      shape: 'tower',
      heads: 0,
      eyes: 2,
      legs: 2,
      arms: 2,
    },
  ],
  [/\b(pancake|book|carpet|rug|leaf|pizza|sandwich|card)\b/, { shape: 'flat', heads: 0, eyes: 2, legs: 4 }],
  [
    /\b(star|starfish)\b/,
    {
      shape: 'star',
      heads: 0,
      eyes: 2,
      legs: 0,
      arms: 0,
      move: 'hop',
    },
  ],
  [
    /\b(snake|serpent|worm|caterpillar|train|centipede|eel)\b/,
    {
      shape: 'long',
      legs: 0,
      tail: 5,
      move: 'slither',
    },
  ],
  [/\b(dragon|wyvern)\b/, { shape: 'long', legs: 4, wings: 2, tail: 5, horns: 2, neck: 4, move: 'fly' }],
  [
    /\b(t-?rex|tyrannosaur\w*|raptor|velociraptor|allosaur\w*)\b/,
    { shape: 'long', legs: 2, arms: 2, tail: 5, neck: 1, move: 'walk' },
  ],
  [
    /\b(sauropod|brontosaur\w*|brachiosaur\w*|diplodocus|long[- ]neck)\b/,
    { shape: 'long', legs: 4, tail: 6, neck: 10, move: 'walk' },
  ],
  [
    /\b(triceratops)\b/,
    {
      shape: 'long',
      legs: 4,
      tail: 3,
      horns: 3,
      neck: 1,
      extras: ['shell'],
      move: 'walk',
    },
  ],
  [
    /\b(stegosaur\w*)\b/,
    {
      shape: 'long',
      legs: 4,
      tail: 4,
      neck: 1,
      extras: ['spikes'],
      move: 'walk',
    },
  ],
  [
    /\b(dinosaur|dino)\b/,
    {
      shape: 'long',
      legs: 2,
      arms: 2,
      tail: 5,
      neck: 1,
    },
  ],
  [
    /\b(robot|mech|droid|android|cyborg)\b/,
    {
      shape: 'box',
      legs: 2,
      arms: 2,
      extras: ['antenna'],
    },
  ],
  [
    /\b(flower|plant|tree|cactus|mushroom)\b/,
    {
      shape: 'tower',
      heads: 0,
      legs: 2,
      arms: 2,
      extras: ['flower'],
    },
  ],
  [
    /\b(ghost|spirit|phantom)\b/,
    {
      shape: 'egg',
      legs: 0,
      heads: 0,
      eyes: 2,
      move: 'fly',
    },
  ],
  [
    /\b(turtle|tortoise|snail)\b/,
    {
      shape: 'flat',
      legs: 4,
      extras: ['shell'],
      tail: 1,
    },
  ],
  [/\b(lion|unicorn|horse|pony)\b/, { shape: 'long', legs: 4, tail: 2, neck: 3, extras: ['mane'] }],
  [
    /\b(house|cottage|hut|car|truck|bus|tank)\b/,
    { shape: 'box', heads: 0, eyes: 2, legs: 0, wheels: 4, extras: ['chimney'] },
  ],
];

/** the colours a kind of thing starts with when the words name none */
const THING_COLORS: [RegExp, Partial<CreatureSpec['colors']>][] = [
  [/\b(teapot|kettle)\b/, { main: '#f4f4f4', accent: '#0055bf', belly: '#9fc3e9' }],
  [/\b(cloud|smoke|fog|steam|ghost|spirit|phantom)\b/, { main: '#f4f4f4', accent: '#9fc3e9', belly: '#f4f4f4' }],
  [/\b(octopus|squid|kraken)\b/, { main: '#81007b', accent: '#fc97ac', belly: '#fc97ac' }],
  [/\b(jellyfish)\b/, { main: '#fc97ac', accent: '#9fc3e9', belly: '#f4f4f4' }],
  [/\b(pumpkin|orange)\b/, { main: '#fe8a18', accent: '#237841', belly: '#f2cd37' }],
  [/\b(egg|potato|bean)\b/, { main: '#e4cd9e', accent: '#583927', belly: '#f4f4f4' }],
  [/\b(tower|castle|lighthouse|rocket)\b/, { main: '#f4f4f4', accent: '#c91a09', belly: '#a0a5a9' }],
  [/\b(star|starfish|sun)\b/, { main: '#f2cd37', accent: '#fe8a18', belly: '#f4f4f4' }],
  [/\b(snake|serpent|caterpillar)\b/, { main: '#237841', accent: '#bbe90b', belly: '#f2cd37' }],
  [
    /\b(t-?rex|tyrannosaur\w*|raptor|velociraptor|dinosaur|dino|stegosaur\w*|turtle|tortoise)\b/,
    { main: '#4b9f4a', accent: '#583927', belly: '#e4cd9e' },
  ],
  [/\b(sauropod|brontosaur\w*|brachiosaur\w*|diplodocus)\b/, { main: '#6c8a4a', accent: '#4b5d3a', belly: '#e4cd9e' }],
  [/\b(triceratops)\b/, { main: '#a0724b', accent: '#e4cd9e', belly: '#e4cd9e' }],
  [
    /\b(robot|mech|droid|android|toaster|fridge)\b/,
    { main: '#a0a5a9', accent: '#0055bf', belly: '#6c6e68', eye: '#c91a09' },
  ],
  [/\b(flower|plant|tree|cactus)\b/, { main: '#237841', accent: '#fc97ac', belly: '#f2cd37' }],
  [/\b(house|cottage|hut)\b/, { main: '#c91a09', accent: '#1b1b1b', belly: '#a0a5a9', eye: '#9fc3e9' }],
  [/\b(cloud)\b/, { eye: '#1b1b1b' }],
];

const COLORS: Record<string, string> = {
  red: '#c91a09',
  blue: '#0055bf',
  green: '#237841',
  yellow: '#f2cd37',
  gold: '#f2cd37',
  golden: '#f2cd37',
  orange: '#fe8a18',
  purple: '#81007b',
  pink: '#fc97ac',
  black: '#1b1b1b',
  white: '#f4f4f4',
  grey: '#a0a5a9',
  gray: '#a0a5a9',
  silver: '#a0a5a9',
  brown: '#583927',
  tan: '#e4cd9e',
  teal: '#4fd1c5',
  lime: '#bbe90b',
  rainbow: '#fe8a18',
  ice: '#9fc3e9',
  fire: '#fe8a18',
};

/**
 * A spec from the words alone (no AI): what kind of thing it is, then counts (“three-headed”, “six legs”),
 * colours (the first is its main colour) and size words. Good enough to start from; Claude does better.
 */
export function specFromWords(text: string): CreatureSpec {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9#\s-]/g, ' ')} `;
  const raw: Partial<CreatureSpec> & { extras: CreatureExtra[] } = { extras: [] };
  let thingColors: Partial<CreatureSpec['colors']> = {};
  for (const [re, part] of THINGS) {
    if (!re.test(t)) continue;
    const extras = [...raw.extras, ...(part.extras ?? [])];
    Object.assign(raw, { ...part, ...raw, extras });
  }
  for (const [re, c] of THING_COLORS) if (re.test(t)) thingColors = { ...c, ...thingColors };
  // counted parts
  const n = (words: string) => countOf(t, words);
  const heads = n('heads?|headed');
  if (heads !== null) raw.heads = heads;
  const eyesN = n('eyes?|eyed');
  if (eyesN !== null) raw.eyes = eyesN;
  else if (/\b(cyclops|one[- ]eyed)\b/.test(t)) raw.eyes = 1;
  const legs = n('legs?|legged|feet|footed');
  if (legs !== null) raw.legs = legs;
  else if (/\b(legs|legged)\b/.test(t) && !raw.legs) raw.legs = 2;
  const arms = n('arms?|armed|hands?|handed');
  if (arms !== null) raw.arms = arms;
  else if (/\b(arms|armed|hands)\b/.test(t) && !raw.arms) raw.arms = 2;
  const tent = n('tentacles?|tentacled');
  if (tent !== null) raw.tentacles = tent;
  else if (/\btentacle/.test(t) && !raw.tentacles) raw.tentacles = 6;
  const wingsN = n('wings?|winged');
  if (wingsN !== null) raw.wings = wingsN;
  else if (/\b(wings?|winged|flying|flies|fly)\b/.test(t)) raw.wings = raw.wings || 2;
  const hornsN = n('horns?|horned');
  if (hornsN !== null) raw.horns = hornsN;
  else if (/\b(horns?|horned)\b/.test(t) && !raw.horns) raw.horns = 2;
  const wheelsN = n('wheels?|wheeled');
  if (wheelsN !== null) raw.wheels = wheelsN;
  else if (/\bwheel/.test(t) && !raw.wheels) raw.wheels = 4;
  if (/\btail\b/.test(t) && !raw.tail) raw.tail = 3;
  if (/\blong[- ]neck/.test(t)) raw.neck = Math.max(raw.neck ?? 0, 8);
  for (const [re, ex] of [
    [/\b(hat|chef|wizard|top hat)\b/, 'hat'],
    [/\b(crown|king|queen|prince|princess)\b/, 'crown'],
    [/\b(antenna|alien)\b/, 'antenna'],
    [/\b(spikes?|spiky|spiked)\b/, 'spikes'],
    [/\bshell\b/, 'shell'],
  ] as [RegExp, CreatureExtra][])
    if (re.test(t) && !raw.extras.includes(ex)) raw.extras.push(ex);
  // movement
  if (/\b(swims?|swimming|underwater|sea|ocean)\b/.test(t)) raw.move = 'swim';
  else if (/\b(hops?|hopping|bounc\w*|jumpy)\b/.test(t)) raw.move = 'hop';
  else if (/\b(slither\w*|crawl\w*)\b/.test(t)) raw.move = 'slither';
  else if (raw.wings && /\b(fly|flies|flying)\b/.test(t)) raw.move = 'fly';
  // size
  const size = /\b(giant|huge|enormous|colossal|massive)\b/.test(t)
    ? 8
    : /\b(big|large|tall)\b/.test(t)
      ? 5.5
      : /\b(tiny|little|small|mini|baby)\b/.test(t)
        ? 2.5
        : 4;
  // colours: the first is its body, then its trim and belly; “red-eyed” paints the eyes
  const colors: string[] = [];
  for (const m of t.matchAll(/\b([a-z]+)\b/g)) {
    const c = COLORS[m[1]!];
    if (c && !colors.includes(c)) colors.push(c);
  }
  const eyeColor = /\b([a-z]+)[\s-]eyed\b/.exec(t);
  // its name: the words before what it has (“a walking teapot with arms” → Walking Teapot)
  const words = t
    .trim()
    .split(/\s+(?:with|that|who|which|has|having)\s+/)[0]!
    .split(/\s+/)
    .filter((w) => !['a', 'an', 'the', 'and', 'of'].includes(w));
  const name = words
    .slice(0, 4)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
  return cleanSpec({
    ...raw,
    name: name || 'Creature',
    size,
    colors: {
      main: colors[0] ?? thingColors.main,
      accent: colors[1] ?? thingColors.accent,
      belly: colors[2] ?? thingColors.belly,
      eye: eyeColor && COLORS[eyeColor[1]!] ? COLORS[eyeColor[1]!] : thingColors.eye,
    },
  });
}

/** the main body, layer by layer from the bottom: [width, depth] in studs per brick layer */
function layers(shape: CreatureShape, size: number): [number, number][] {
  const s = Math.max(2, Math.min(8, Math.round(size)));
  const f = (k: number) => Math.max(1, Math.min(8, Math.round(s * k)));
  switch (shape) {
    case 'box':
      return [
        [s, s],
        [s, s],
        [s, s],
      ];
    case 'ball':
      return [
        [f(0.6), f(0.6)],
        [s, s],
        [s, s],
        [f(0.6), f(0.6)],
      ];
    case 'egg':
      return [
        [f(0.7), f(0.7)],
        [s, s],
        [s, s],
        [f(0.8), f(0.8)],
        [f(0.5), f(0.5)],
      ];
    case 'tower':
      return Array.from({ length: Math.max(4, Math.round(s * 1.2)) }, () => [f(0.55), f(0.55)] as [number, number]);
    case 'flat':
      return [[s, Math.min(8, s + 2)]];
    case 'teapot':
      return [
        [f(0.7), f(0.7)],
        [s, s],
        [s, s],
        [f(0.7), f(0.7)],
      ];
    case 'barrel':
      return [
        [f(0.8), f(0.8)],
        [s, s],
        [s, s],
        [f(0.8), f(0.8)],
      ];
    case 'cloud':
      return [
        [s, f(0.7)],
        [f(0.8), f(0.6)],
      ];
    case 'star':
      return [[f(0.5), f(0.5)]];
    case 'long':
      return [
        [f(0.6), Math.min(8, s + 1)],
        [f(0.6), Math.min(8, s + 1)],
      ];
    default:
      return [
        [f(0.8), f(0.8)],
        [s, s],
        [f(0.7), f(0.7)],
      ];
  }
}

/** a whole body plan from a spec: bones, bricks, how it moves, its stride and hover */
export function composeCreature(spec: CreatureSpec): Made {
  const m = new Maker();
  const L = layers(spec.shape, spec.size);
  const W = Math.max(...L.map((l) => l[0]));
  const D = Math.max(...L.map((l) => l[1]));
  const H = L.length * BRICK;
  const legLen = spec.legs > 0 ? BRICK * Math.max(1, Math.round(spec.size / 3)) : 0;
  const wheelR = spec.wheels > 0 ? 0.8 : 0;
  const move: MoveKind =
    spec.move ??
    (spec.wings && !spec.legs
      ? 'fly'
      : spec.shape === 'long' && !spec.legs
        ? 'slither'
        : !spec.legs && !spec.wheels && spec.tentacles
          ? 'hop'
          : !spec.legs && !spec.wheels
            ? 'hop'
            : 'walk');
  const hover = move === 'fly' ? 2 + spec.size * 0.2 : move === 'swim' ? 1.5 : 0;
  const lift = legLen + (spec.wheels ? wheelR * 2 : 0) + (spec.tentacles && !spec.legs ? BRICK * 1.5 : 0);
  const body = m.bone('body', undefined, [0, lift, 0], 'root', 4);
  // the body
  L.forEach(([w, d], i) => m.block(body, w, d, 3, 0, i * BRICK, 0, i === 0 && L.length > 1 ? 'belly' : 'main'));
  if (spec.shape === 'cloud')
    for (const s of [-1, 1])
      m.block(body, Math.max(1, Math.round(W / 3)), Math.max(1, D - 2), 3, s * (W / 2), BRICK * 0.5, 0, 'main');
  if (spec.shape === 'star')
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as [number, number][])
      m.block(body, dx ? 2 : 1, dz ? 2 : 1, 2, (dx * (W + 2)) / 2, 0, (dz * (D + 2)) / 2, 'main');
  // heads: on necks along the top front; none means a face on the body itself
  const faces: { bone: string; w: number; front: number; top: number }[] = [];
  if (spec.heads === 0) faces.push({ bone: body, w: W, front: D / 2, top: H * 0.8 });
  else
    for (let i = 0; i < spec.heads; i++) {
      const hsz = Math.max(2, Math.min(4, Math.round(spec.size / 2)));
      // heads side by side, a little apart, however narrow the body
      const spread = spec.heads === 1 ? 0 : (i - (spec.heads - 1) / 2) * (hsz + 1);
      const hs = Math.max(2, Math.min(4, Math.round(spec.size / 2)));
      const neckPlates = spec.neck;
      const nb = m.bone(spec.heads === 1 ? 'neck' : `neck ${i + 1}`, body, [spread, H - P, D / 2 - 0.5], 'neck', 10, {
        phase: (i * 0.3) % 1,
      });
      if (neckPlates > 0) m.block(nb, 1, 1, neckPlates, 0, 0, 0, 'main');
      const hb = m.bone(spec.heads === 1 ? 'head' : `head ${i + 1}`, nb, [0, neckPlates * P, 0.6], 'head', 14, {
        phase: (i * 0.37) % 1,
      });
      const plates = Math.max(3, hs * 2);
      m.block(hb, hs, hs, plates, 0, 0, 0, 'main');
      if (spec.shape === 'long' || spec.horns || spec.size >= 5) {
        const jaw = m.bone(spec.heads === 1 ? 'jaw' : `jaw ${i + 1}`, hb, [0, 0, hs / 2], 'jaw', 16);
        m.block(jaw, Math.max(1, hs - 1), 2, 1, 0, -P, 0.5, 'accent');
      }
      for (let h = 0; h < spec.horns; h++) {
        const side = spec.horns === 1 ? 0 : (h / (spec.horns - 1) - 0.5) * (hs - 1);
        m.block(hb, 1, 1, 3, side, plates * P, -hs / 2 + 0.5, 'accent');
      }
      faces.push({ bone: hb, w: hs, front: hs / 2, top: plates * P });
    }
  // eyes on each face
  for (const f of faces) {
    if (spec.eyes === 2) eyes(m, f.bone, f.w, f.top - 2 * P, f.front);
    else
      for (let e = 0; e < spec.eyes; e++) {
        const cols = Math.min(spec.eyes, Math.max(1, f.w - 1));
        const x = cols === 1 ? 0 : ((e % cols) / (cols - 1) - 0.5) * (f.w - 1);
        const y = f.top - 2 * P - Math.floor(e / cols) * 2 * P;
        m.tile(f.bone, x, y, f.front - 0.4, 'eye');
      }
  }
  // legs: in pairs along the body's length (an odd one in the middle at the front)
  for (let i = 0; i < spec.legs; i++) {
    const pairs = Math.ceil(spec.legs / 2);
    const row = Math.floor(i / 2);
    const side = spec.legs === 1 ? 0 : i % 2 ? 1 : -1;
    const z = pairs === 1 ? 0 : (0.5 - row / (pairs - 1)) * Math.max(0, D - 1.2);
    const x = side * Math.max(0.5, W / 2 - 0.5);
    const n = m.bone(`leg ${i + 1}`, body, [x, 0, z], 'leg', 28, {
      phase: ((row + (side > 0 ? 1 : 0)) % 2) * 0.5,
      ...(side ? { side: side as -1 | 1 } : {}),
    });
    const plates = Math.round(legLen / P);
    m.block(n, 1, 1, plates - 1, 0, -legLen + P, 0, 'main');
    m.block(n, 1, 2, 1, 0, -legLen, 0.4, 'accent');
  }
  // arms from the shoulders
  for (let i = 0; i < spec.arms; i++) {
    const side = i % 2 ? 1 : -1;
    const tier = Math.floor(i / 2);
    const n = m.bone(`arm ${i + 1}`, body, [side * (W / 2 + 0.5), H - BRICK * (0.6 + tier * 0.9), 0], 'arm', 30, {
      side: side as -1 | 1,
      phase: (tier * 0.25) % 1,
    });
    m.block(n, 1, 1, 6, 0, -6 * P, 0, 'main');
    m.block(n, 1, 1, 1, 0, -7 * P, 0, 'accent');
  }
  // tentacles: whipping chains round the bottom
  for (let i = 0; i < spec.tentacles; i++) {
    const a = (i / spec.tentacles) * Math.PI * 2;
    let prev = m.bone(
      `tentacle ${i + 1}`,
      body,
      [Math.cos(a) * (W / 2 - 0.5), 0, Math.sin(a) * (D / 2 - 0.5)],
      'tail',
      26,
      {
        phase: (i / spec.tentacles) % 1,
      },
    );
    m.block(prev, 1, 1, 2, 0, -2 * P, 0, 'main');
    for (let k = 1; k < 3; k++) {
      prev = m.bone(`tentacle ${i + 1}-${k}`, prev, [Math.cos(a) * 0.5, -2 * P, Math.sin(a) * 0.5], 'tail', 26, {
        phase: (i / spec.tentacles + k * 0.15) % 1,
      });
      m.block(prev, 1, 1, 2, 0, -2 * P, 0, k === 2 ? 'accent' : 'main');
    }
  }
  // wheels under the body
  for (let i = 0; i < spec.wheels; i++) {
    const side = i % 2 ? 1 : -1;
    const pairs = Math.ceil(spec.wheels / 2);
    const row = Math.floor(i / 2);
    const z = pairs === 1 ? 0 : (0.5 - row / (pairs - 1)) * Math.max(0, D - 2);
    const n = m.bone(`wheel ${i + 1}`, body, [side * (W / 2), -wheelR, z], 'wheel', 0, { side: side as -1 | 1 });
    m.block(n, 1, 2, 4, side * 0.5, -wheelR, 0, 'dark');
  }
  if (spec.wings) {
    wings(m, body, W, Math.max(0.7, spec.size / 3), H * 0.7, 0);
    if (spec.wings === 4) {
      for (const s of [-1, 1] as const) {
        const n = m.bone(s < 0 ? 'left wing 2' : 'right wing 2', body, [s * (W / 2), H * 0.45, -1], 'wing', 34, {
          side: s,
          phase: 0.5,
        });
        m.block(
          n,
          Math.max(1, Math.round(spec.size / 2)),
          2,
          1,
          s * Math.max(1, Math.round(spec.size / 2)) * 0.5,
          0,
          0,
          'accent',
        );
      }
    }
  }
  if (spec.tail) tailChain(m, body, [0, BRICK * 0.6, -D / 2], spec.tail, spec.size >= 5 ? 2 : 1);
  // extras
  for (const ex of spec.extras) {
    switch (ex) {
      case 'spout': {
        const n = m.bone('spout', body, [0, BRICK, D / 2], 'other', 0);
        m.block(n, 1, 2, 2, 0, 0, 1, 'main');
        m.block(n, 1, 1, 2, 0, 2 * P, 2, 'main');
        break;
      }
      case 'handle': {
        const n = m.bone('handle', body, [0, BRICK, -D / 2], 'other', 0);
        m.block(n, 1, 1, 6, 0, 0, -1.5, 'main');
        m.block(n, 1, 2, 1, 0, 6 * P, -1, 'main');
        m.block(n, 1, 2, 1, 0, 0, -1, 'main');
        break;
      }
      case 'lid':
        m.block(body, Math.max(1, W - 2), Math.max(1, D - 2), 1, 0, H, 0, 'accent');
        m.block(body, 1, 1, 2, 0, H + P, 0, 'accent');
        break;
      case 'hat':
      case 'crown': {
        const top = faces[0]!;
        const hat = ex === 'crown' ? 'accent' : '#f4f4f4';
        m.block(top.bone, top.w, top.w, 1, 0, top.top, 0, hat);
        m.block(
          top.bone,
          Math.max(1, top.w - 1),
          Math.max(1, top.w - 1),
          ex === 'crown' ? 2 : 4,
          0,
          top.top + P,
          0,
          hat,
        );
        break;
      }
      case 'antenna': {
        const top = faces[0]!;
        m.block(top.bone, 1, 1, 4, 0, top.top, 0, 'dark');
        m.tile(top.bone, 0, top.top + 4 * P, 0, 'accent');
        break;
      }
      case 'chimney':
        m.block(body, 1, 1, 4, W / 2 - 1, H, -D / 2 + 1, 'dark');
        break;
      case 'spikes':
        for (let k = 0; k < Math.max(2, Math.round(D / 1.5)); k++)
          m.block(body, 1, 1, 3, 0, H, D / 2 - 0.5 - k * 1.5, 'accent');
        break;
      case 'fins':
        for (const s of [-1, 1]) m.block(body, 1, 2, 2, s * (W / 2 + 0.5), H * 0.4, 0, 'accent');
        break;
      case 'shell':
        m.block(body, Math.max(1, W - 1), Math.max(1, D - 1), 3, 0, H, -0.5, 'accent');
        break;
      case 'mane': {
        const top = faces[0]!;
        m.block(top.bone, top.w, 1, 4, 0, top.top - 2 * P, -top.w / 2 - 0.5, 'accent');
        break;
      }
      case 'flower':
        m.block(body, Math.max(2, W - 1), Math.max(2, D - 1), 1, 0, H, 0, 'accent');
        m.tile(body, 0, H + P, 0, 'belly', 2, 2);
        break;
    }
  }
  const stride = move === 'walk' ? Math.max(0.6, legLen * 1.6 || 1.2) : move === 'hop' ? 1.6 : 2;
  return { move, bones: m.bones, bricks: m.bricks.slice(0, 400), stride: Math.min(12, stride), hover };
}

/** the body plan file for a spec, under an id */
export function creaturePlan(spec: CreatureSpec, id: string): BodyPlan {
  const made = composeCreature(spec);
  return { id: id as BodyPlan['id'], name: spec.name, family: 'custom', ...made };
}
