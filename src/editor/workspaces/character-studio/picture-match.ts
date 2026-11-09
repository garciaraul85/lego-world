import { BODY_FAMILIES, type Body, type BodyFamily, PARAM_INFO, PARAM_KEYS } from '../../../core/character/body';
import {
  CREATURE_EXTRAS,
  CREATURE_SHAPES,
  type CreatureSpec,
  cleanSpec,
  specFromWords,
} from '../../../core/character/compose';
import { FAMILY_INFO, FAMILY_PRESETS } from '../../../core/character/families';
import {
  cleanHair,
  describeHair,
  HAIR_BEARDS,
  HAIR_FRINGES,
  HAIR_PARTINGS,
  HAIR_TIES,
  HAIR_TOPS,
  hairFromWords,
} from '../../../core/character/hair';
import {
  cleanMarks,
  MARK_SHAPES,
  MAX_MARKS,
  type Mark,
  marksFromWords,
  PAINT_PARTS,
  PAINT_SIDES,
  SHAPE_RANGES,
  shapeFromWords,
  withoutMarks,
} from '../../../core/character/marks';

/**
 * P22 part 4: a character from a picture or a description. Whatever answers — Claude, or the editor on its
 * own — only chooses settings the editor already has (a body family with its sliders and colours, or the
 * minifig's parts and colours), so every result is an ordinary character: editable, and one Undo away.
 */
export type Candidate = {
  name: string;
  /** a minifig: its look (the v68 profile fields) */
  profile?: Record<string, unknown>;
  /** a creature: its body */
  body?: Body;
  /** Milestone 3, 10d: a figure of its own (any kind, however wild): its parts, built into a body plan */
  creature?: CreatureSpec;
  /** Milestone 3, 10d: drawings on a minifig (a star on a cheek, a number on the back), drawn by the editor */
  marks?: Mark[];
  /** what each part was matched to: [part, what it came from] */
  matched: [string, string][];
};
export type Catalog = { choices: Record<string, string[]>; colorFields: string[] };

export const COLOR_WORDS: Record<string, string> = {
  red: '#c91a09',
  crimson: '#c91a09',
  blue: '#0055bf',
  navy: '#0a3463',
  sky: '#9fc3e9',
  green: '#237841',
  lime: '#bbe90b',
  yellow: '#f2cd37',
  gold: '#f2cd37',
  golden: '#f2cd37',
  orange: '#fe8a18',
  purple: '#81007b',
  violet: '#81007b',
  pink: '#fc97ac',
  black: '#1b1b1b',
  white: '#f4f4f4',
  grey: '#a0a5a9',
  gray: '#a0a5a9',
  silver: '#a0a5a9',
  brown: '#583927',
  tan: '#e4cd9e',
  teal: '#4fd1c5',
  turquoise: '#4fd1c5',
};

const FAMILY_WORDS: [RegExp, BodyFamily][] = [
  [/\b(dragons?|wyverns?|drakes?)\b/, 'dragon'],
  [/\b(robots?|mechs?|droids?|walkers?|androids?)\b/, 'robot'],
  [/\b(spiders?|tarantulas?|arachnids?)\b/, 'spider'],
  [/\b(bugs?|beetles?|ants?|bees?|ladybirds?|ladybugs?|insects?|moths?|grasshoppers?|fireflies|firefly)\b/, 'insect'],
  [/\b(slimes?|blobs?|jelly|jellies|ooze)\b/, 'slime'],
  [/\b(snakes?|serpents?|worms?|eels?|cobras?|pythons?|vipers?)\b/, 'serpent'],
  [/\b(fish|fishes|sharks?|goldfish|tuna|piranhas?|swordfish|pufferfish)\b/, 'fish'],
  [/\b(birds?|owls?|parrots?|crows?|ducks?|eagles?|flamingos?|chickens?|penguins?|canar(y|ies))\b/, 'bird'],
  [
    /\b(dogs?|pupp(y|ies)|cats?|kittens?|horses?|pon(y|ies)|wolf|wolves|fox|foxes|cows?|pigs?|bears?|lions?|tigers?|deer|goats?|sheep)\b/,
    'fourLegs',
  ],
];
/** people stay minifigs even with an animal word (“a fox wizard” is a person; “a fox” is an animal) */
const PERSON =
  /\b(wizard|witch|knight|pirate|king|queen|prince|princess|chef|cowboy|astronaut|builder|man|woman|boy|girl|person|hero|heroine|explorer|doctor|farmer|soldier|ninja|detective|shopkeeper|blacksmith|guard|captain)\b/;

/** minifig parts said in words: [pattern, field, choice] */
const PART_WORDS: [RegExp, string, string][] = [
  [/\bwizard\b/, 'hat', 'Wizard hat'],
  [/\bwitch\b/, 'hat', 'Witch hat'],
  [/\bpirate\b/, 'hat', 'Pirate hat'],
  [/\b(king|queen|crown)\b/, 'hat', 'Crown'],
  [/\b(princess|tiara)\b/, 'hat', 'Tiara'],
  [/\bchef\b/, 'hat', 'Chef hat'],
  [/\bcowboy\b/, 'hat', 'Cowboy hat'],
  [/\bknight\b/, 'hat', 'Knight helmet'],
  [/\b(astronaut|space)\b/, 'hat', 'Space helmet'],
  [/\b(builder|construction|worker)\b/, 'hat', 'Hard hat'],
  [/\bbeanie\b/, 'hat', 'Beanie'],
  [/\b(cap|baseball)\b/, 'hat', 'Baseball cap'],
  [/\btop hat\b/, 'hat', 'Top hat'],
  [/\bfedora\b/, 'hat', 'Fedora'],
  [/\bbald\b/, 'hair', 'Bald'],
  [/\bafro\b/, 'hair', 'Afro'],
  [/\bponytail\b/, 'hair', 'Ponytail'],
  [/\bpigtails\b/, 'hair', 'Pigtails'],
  [/\bbraid/, 'hair', 'Braid'],
  [/\bmohawk\b/, 'hair', 'Mohawk'],
  [/\bdreadlocks\b/, 'hair', 'Dreadlocks'],
  [/\bcurly\b/, 'hair', 'Curly'],
  [/\bspiky\b/, 'hair', 'Spiky'],
  [/\bbun\b/, 'hair', 'Bun'],
  [/\blong hair\b/, 'hair', 'Long'],
  [/\blong beard\b/, 'facialHair', 'Long beard'],
  [/\bbeard\b/, 'facialHair', 'Full beard'],
  [/\b(moustache|mustache)\b/, 'facialHair', 'Moustache'],
  [/\bgoatee\b/, 'facialHair', 'Goatee'],
  [/\bstubble\b/, 'facialHair', 'Stubble'],
  [/\bsunglasses\b/, 'glasses', 'Sunglasses'],
  [/\bgoggles\b/, 'glasses', 'Goggles'],
  [/\bmonocle\b/, 'glasses', 'Monocle'],
  [/\beye ?patch\b/, 'glasses', 'Eye patch'],
  [/\bglasses\b/, 'glasses', 'Round'],
  [/\b(armou?r|knight)\b/, 'outfit', 'Armor'],
  [/\b(dress|gown)\b/, 'outfit', 'Dress'],
  [/\b(hoodie)\b/, 'shirt', 'Hoodie'],
  [/\b(coat|robe)\b/, 'shirt', 'Long coat'],
  [/\bjacket\b/, 'shirt', 'Jacket'],
  [/\bsweater\b/, 'shirt', 'Sweater'],
  [/\bsuit\b/, 'shirt', 'Suit'],
  [/\buniform\b/, 'shirt', 'Uniform'],
  [/\bskirt\b/, 'pants', 'Skirt'],
  [/\bshorts\b/, 'pants', 'Shorts'],
  [/\bboots\b/, 'shoes', 'Boots'],
  [/\blong scarf\b/, 'scarf', 'Long scarf'],
  [/\bscarf\b/, 'scarf', 'Short scarf'],
  [/\bbandana\b/, 'scarf', 'Bandana'],
  [/\b(royal cape)\b/, 'cape', 'Royal cape'],
  [/\bcape\b/, 'cape', 'Long cape'],
  [/\bponcho\b/, 'cape', 'Poncho'],
  [/\bjetpack\b/, 'back', 'Jetpack'],
  [/\bbackpack\b/, 'back', 'Backpack'],
  [/\bwings\b/, 'back', 'Wings'],
  [/\b(woman|girl|queen|princess|witch|heroine|she|her)\b/, 'gender', 'Female'],
  [/\b(grumpy|angry|cross)\b/, 'expression', 'Angry'],
  [/\b(happy|cheerful|jolly)\b/, 'expression', 'Big grin'],
  [/\bsad\b/, 'expression', 'Sad'],
  [/\b(sleepy|tired)\b/, 'expression', 'Sleepy'],
  [/\bscared\b/, 'expression', 'Scared'],
  [/\b(tall)\b/, 'height', 'Tall'],
  [/\b(short|small|little)\b/, 'height', 'Short'],
];
/** held items whose name is said (“with a sword”) */
const HELD_SKIP = new Set(['None', 'Map']);

/** what a colour word sits next to: [part words, minifig colour field] */
const COLOR_PARTS: [RegExp, string][] = [
  [/^(hair|beard)$/, 'hairColor'],
  [/^(hat|cap|helmet|beanie|crown)$/, 'hatColor'],
  [/^(shirt|coat|jacket|robe|top|tunic|hoodie|sweater|suit|armou?r|uniform)$/, 'shirtColor'],
  [/^(pants|trousers|jeans|skirt|shorts|leggings)$/, 'pantsColor'],
  [/^(dress|gown)$/, 'dressColor'],
  [/^(shoes|boots|trainers)$/, 'shoeColor'],
  [/^(scarf|cape|bag|backpack|tie)$/, 'accessoryColor'],
  [/^(eyes?)$/, 'eyeColor'],
  [/^(glasses|goggles|sunglasses)$/, 'glassesColor'],
  [/^(gloves?)$/, 'gloveColor'],
];

const words = (t: string) => t.toLowerCase().match(/[a-z']+/g) ?? [];
const title = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

/** Colours said in words, each with the part it is next to (“a long red scarf” → scarf red). */
export function colorWords(text: string): { color: string; word: string; part: string | null }[] {
  const w = words(text);
  const out: { color: string; word: string; part: string | null }[] = [];
  for (let i = 0; i < w.length; i++) {
    const hex = COLOR_WORDS[w[i]!];
    if (!hex) continue;
    let part: string | null = null;
    for (let j = i + 1; j <= i + 3 && j < w.length; j++) {
      const hit = COLOR_PARTS.find(([re]) => re.test(w[j]!));
      if (hit) {
        part = hit[1];
        break;
      }
      if (COLOR_WORDS[w[j]!]) break;
    }
    out.push({ color: hex, word: w[i]!, part });
  }
  return out;
}

/** The family a description is about (null: a person, a minifig). */
export function familyOf(text: string): BodyFamily | null {
  const t = text.toLowerCase();
  const fam = FAMILY_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
  if (!fam) return null;
  // “a fox wizard”, “a cat knight”: a person with an animal word stays a minifig
  if (PERSON.test(t) && fam !== 'dragon' && fam !== 'robot' && fam !== 'slime') return null;
  return fam;
}

/** A name from a description: the words after a/an, title case (“a blue fox wizard” → Blue Fox Wizard). */
export function nameOf(text: string): string {
  const t = text.trim().replace(/^(an?|the|my)\s+/i, '');
  const first = t.split(/\b(with|who|that|and|wearing|holding|in an?|in the|on (?:his|her|its|the))\b|,/i)[0]!.trim();
  const n = title(first).slice(0, 32).trim();
  return n || 'New character';
}

/**
 * Three characters from a description and the picture's main colours, without AI: words pick the family
 * (or the minifig's parts), colours said in words go where they were said, the picture's colours fill
 * the rest. The second swaps the colours round; the third tries another preset or other parts.
 */
export function localCandidates(
  text: string,
  picture: string[],
  cat: Catalog,
  opts: { personFromPhoto?: boolean } = {},
): Candidate[] {
  // what it is comes from the words without its drawings (“a knight with a red star on his cheek” is a knight)
  const what = withoutMarks(text) || text;
  const base = withShapeAndMarks(familyOrPerson(what, picture, cat, opts.personFromPhoto ?? false), text, cat);
  const wild = creatureOf(what, picture);
  // something no family or minifig is (a teapot on legs, a three-headed snake): its own figure, three ways
  if (!wild?.creature) return base;
  const w = wild.creature;
  const swapped = { ...w, colors: { ...w.colors, main: w.colors.accent, accent: w.colors.main } };
  const bigger = { ...w, size: Math.min(10, w.size * 1.6) };
  return [
    wild,
    { ...wild, creature: swapped, matched: [...wild.matched.slice(0, 1), ['Colours', 'the other way round']] },
    { ...wild, creature: bigger, matched: [...wild.matched.slice(0, 1), ['Size', 'bigger']] },
  ];
}

/**
 * Milestone 3, 10d: a person's body shape and drawings from the words (“a curvy pirate in a deep V-neck with a red
 * star on her left cheek”), added to each minifig match and listed in what it matched.
 */
function withShapeAndMarks(list: Candidate[], text: string, cat: Catalog): Candidate[] {
  return list.map((k) => {
    if (!k.profile) return k;
    const female = k.profile.gender === 'Female';
    const shape = Object.fromEntries(
      Object.entries(shapeFromWords(text, female)).filter(
        ([f, v]) => SHAPE_RANGES[f] !== undefined || cat.choices[f]?.includes(String(v)),
      ),
    );
    const marks = marksFromWords(text);
    // 10d part 3: a hairstyle v68's list has no name for (space buns, a braided beard, blue tips…)
    const hair = hairFromWords(text);
    const matched: [string, string][] = hair
      ? [...k.matched.filter(([part]) => part !== 'Hair'), ['Hair', `custom: ${describeHair(hair)}`]]
      : [...k.matched];
    if (Object.keys(shape).length)
      matched.push([
        'Body shape',
        Object.entries(shape)
          .map(([f, v]) => `${f.replace(/([A-Z])/g, ' $1').toLowerCase()} ${v}`)
          .join(', '),
      ]);
    for (const m of marks)
      matched.push([
        'Drawn',
        `${m.shape === 'text' ? `“${m.text}”` : `a ${m.shape}`} on the ${m.part.replace(/([A-Z])/g, ' $1').toLowerCase()} (${m.side})`,
      ]);
    return {
      ...k,
      profile: { ...k.profile, ...shape, ...(hair ? { hair: 'Custom', customHair: hair } : {}) },
      ...(marks.length ? { marks } : {}),
      matched,
    };
  });
}

/** a figure of its own from the words (and the picture's colours), when the words ask for one */
export function creatureOf(text: string, picture: string[]): Candidate | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  const spec = specFromWords(text);
  const counted =
    /\b(\d+|two|three|four|five|six|seven|eight|many)[\s-]+(heads?|headed|eyes?|eyed|legs?|legged|arms?|armed|tentacles?|wings?|winged|horns?|wheels?)\b/.test(
      t,
    );
  const thing = spec.shape !== 'blob' || spec.tentacles > 0 || spec.wheels > 0 || spec.extras.length > 0;
  const fam = familyOf(t);
  // a plain dog, bird or knight is better as a family or a minifig; a cyclops dog or a walking teapot is not
  if (!counted && (!thing || (fam && !/\b(t-?rex|dinosaur|dino|raptor|sauropod|triceratops|stegosaur)/.test(t))))
    return null;
  if (!counted && PERSON.test(t) && spec.shape === 'blob') return null;
  const colors = { ...spec.colors };
  const said = colorWords(t).filter((c) => !c.part);
  const free = [...picture];
  if (!said[0] && free[0]) colors.main = free.shift()!;
  if (!said[1] && free[0]) colors.accent = free.shift()!;
  const s = { ...spec, colors, name: nameOf(text) };
  const parts = (
    [
      ['Heads', s.heads],
      ['Eyes', s.eyes],
      ['Legs', s.legs],
      ['Arms', s.arms],
      ['Tentacles', s.tentacles],
      ['Wings', s.wings],
      ['Wheels', s.wheels],
      ['Horns', s.horns],
    ] as [string, number][]
  ).filter(([, n]) => n > 0);
  return {
    name: s.name,
    creature: s,
    matched: [
      ['Body', `a figure of its own: a ${s.shape} body${s.extras.length ? ` with ${s.extras.join(', ')}` : ''}`],
      ...parts.map(([p, n]) => [p, String(n)] as [string, string]),
      ['Moves', s.move ?? 'from its parts'],
    ].slice(0, 7) as [string, string][],
  };
}

function familyOrPerson(text: string, picture: string[], cat: Catalog, personFromPhoto: boolean): Candidate[] {
  const t = text.toLowerCase();
  const fam = familyOf(t);
  const said = colorWords(t);
  const name = text.trim() ? nameOf(text) : 'From the picture';
  if (fam && fam !== 'minifig') {
    const presets = FAMILY_PRESETS[fam];
    const named = presets.findIndex((p) => words(p.name).some((w) => t.includes(w) && w.length > 2));
    const first = named >= 0 ? named : 0;
    const make = (presetIndex: number, swap: boolean, label: string): Candidate => {
      const p = presets[presetIndex % presets.length]!;
      const matched: [string, string][] = [
        ['Body', `${FAMILY_INFO[fam].label}${named >= 0 && presetIndex === named ? ` (${p.name})` : ''} — ${label}`],
      ];
      const colors: Record<string, string> = { ...p.colors };
      const free = [...picture];
      const plain = said.filter((s) => !s.part);
      // colours said in words first, then the picture's
      const slots = swap ? ['accent', 'main', 'belly'] : ['main', 'accent', 'belly'];
      for (const slot of slots) {
        const w = plain.shift();
        if (w) {
          colors[slot] = w.color;
          matched.push([`${title(slot)} colour`, `“${w.word}” in the words`]);
          continue;
        }
        const pc = free.shift();
        if (pc) {
          colors[slot] = pc;
          matched.push([`${title(slot)} colour`, 'a main colour of the picture']);
        }
      }
      const eyes = said.find((s) => s.part === 'eyeColor');
      if (eyes) {
        colors.eye = eyes.color;
        matched.push(['Eyes', `“${eyes.word} eyes” in the words`]);
      }
      return { name, body: { family: fam, params: { ...(p.params ?? {}) }, colors }, matched };
    };
    return [
      make(first, false, 'the closest'),
      make(first, true, 'colours the other way round'),
      make(first + 1, false, `another kind: ${presets[(first + 1) % presets.length]!.name}`),
    ];
  }
  // a minifig
  const parts: Record<string, string> = {};
  const matched: [string, string][] = [];
  // “a long red scarf” is a long scarf: colour words are read apart
  const bare = t.replace(new RegExp(`\\b(${Object.keys(COLOR_WORDS).join('|')})\\s+`, 'g'), '');
  for (const [re, field, choice] of PART_WORDS) {
    if (parts[field] || !cat.choices[field]?.includes(choice)) continue;
    const m = re.exec(bare);
    if (m) {
      parts[field] = choice;
      matched.push([title(field.replace(/([A-Z])/g, ' $1').toLowerCase()), `“${m[0]}” in the words`]);
    }
  }
  for (const h of cat.choices.held ?? []) {
    if (HELD_SKIP.has(h) || parts.held) continue;
    if (new RegExp(`\\b${h.toLowerCase()}s?\\b`).test(t)) {
      parts.held = h;
      matched.push(['Held item', `“${h.toLowerCase()}” in the words`]);
    }
  }
  if (parts.outfit === 'Dress' && !parts.dress) parts.dress = 'Casual';
  const colorsOf = (swap: boolean): [Record<string, string>, [string, string][]] => {
    const out: Record<string, string> = {};
    const notes: [string, string][] = [];
    for (const s of said)
      if (s.part && cat.colorFields.includes(s.part) && !out[s.part]) {
        out[s.part] = s.color;
        notes.push([title(s.part.replace('Color', ' colour')), `“${s.word}” in the words`]);
      }
    const plain = said.filter((s) => !s.part).map((s) => s.color);
    // with v68's Bring your look, the photo colours each part where it is (not the picture's main colours)
    const fill = [...plain, ...(personFromPhoto ? [] : picture)];
    const order = swap
      ? ['pantsColor', 'shirtColor', 'hatColor', 'hairColor']
      : ['shirtColor', 'pantsColor', 'hatColor', 'hairColor'];
    if (parts.outfit === 'Dress') order.unshift('dressColor');
    for (const f of order) {
      if (out[f]) continue;
      const c = fill.shift();
      if (!c) break;
      out[f] = c;
      notes.push([
        title(f.replace('Color', ' colour')),
        plain.includes(c) ? 'a colour in the words' : 'a main colour of the picture',
      ]);
    }
    if (parts.cape || parts.scarf) {
      const c = fill.shift();
      if (c && !out.accessoryColor) out.accessoryColor = c;
    }
    return [out, notes];
  };
  const [c1, n1] = colorsOf(false);
  const [c2, n2] = colorsOf(true);
  // the third: other hair and a different hat or none, for a second look at it
  const alt: Record<string, string> = { ...parts };
  const hair = cat.choices.hair ?? [];
  alt.hair = parts.hair ? hair[(hair.indexOf(parts.hair) + 3) % hair.length]! : 'Long';
  if (!parts.hat) alt.hat = 'Beanie';
  return [
    { name, profile: { name, ...parts, ...c1 }, matched: [...matched, ...n1] },
    { name, profile: { name, ...parts, ...c2 }, matched: [...matched, ...n2, ['Colours', 'the other way round']] },
    {
      name,
      profile: { name, ...alt, ...c1 },
      matched: [...matched.filter(([p]) => p !== 'Hair'), ...n1, ['Hair', `another style: ${alt.hair}`]],
    },
  ];
}

/** The instructions for Claude: the settings it may choose from, and the answer's shape. */
export function aiPrompt(text: string, hasPicture: boolean, cat: Catalog, picture: string[]): string {
  const minifig = Object.entries(cat.choices)
    .filter(([k]) => !/nipple|costume|power|spell|lingerie|underwear|swimwear|heroCut/i.test(k))
    .map(([k, v]) => `  ${k}: ${v.join(' | ')}`)
    .join('\n');
  const fams = BODY_FAMILIES.filter((f) => f !== 'minifig')
    .map(
      (f) =>
        `  ${f} (${FAMILY_INFO[f].label}: ${FAMILY_INFO[f].about}); presets: ${FAMILY_PRESETS[f].map((p) => p.name).join(', ')}`,
    )
    .join('\n');
  const params = PARAM_KEYS.map(
    (k) => `${k} ${PARAM_INFO[k].lo}-${PARAM_INFO[k].hi} (normal ${PARAM_INFO[k].def})`,
  ).join(', ');
  return `You make a character for a brick-built video game editor from ${hasPicture ? 'the attached picture' : 'a description'}${hasPicture && text ? ' and a description' : ''}. You do not draw: you only choose settings the editor already has. Make an ORIGINAL character in brick style: if the picture or words are a famous character or a real person, take only general traits (colours, kind of clothes, species), never a copy, a logo or a name of theirs.

${text ? `Description: ${text}\n` : ''}${picture.length ? `The picture's main colours, most first: ${picture.join(', ')}\n` : ''}
A character is a minifig (a person, or a person with an animal theme), OR a creature body from a family, OR — for anything else, however wild (a walking teapot, a three-headed snake, an octopus chef, a living cloud, a dinosaur) — a figure of its own made from parts.

Minifig: "profile" with any of these fields (exact option names), and colours as "#rrggbb" for: ${cat.colorFields.filter((f) => !/nipple/i.test(f)).join(', ')}.
${minifig}

Minifig body shape (whole numbers): breastSize 0-${SHAPE_RANGES.breastSize} (only for gender Female; 0 flat, 60 average, 110 large), buttSize 0-${SHAPE_RANGES.buttSize}, necklineDepth and necklineWidth 0-${SHAPE_RANGES.necklineDepth}. Choose them only when the picture or words show a build (curvy, athletic, slim, a V-neck…).
Minifig custom hair: for a hairstyle the hair list has no name for (space buns, a high ponytail, a top knot, a fringe, braids, a sculpted beard, dyed tips…) set "hair": "Custom" and "customHair": { "top": ${HAIR_TOPS.join(' | ')}, "length": 0-100 (0 short, 50 shoulders, 100 waist), "volume": 0-100, "parting": ${HAIR_PARTINGS.join(' | ')}, "fringe": ${HAIR_FRINGES.join(' | ')}, "tie": ${HAIR_TIES.join(' | ')}, "tieLength": 0-100, "beard": ${HAIR_BEARDS.join(' | ')}, "beardLength": 0-100, "tips", "band", "beardColor" as "#rrggbb" (optional) }; hairColor stays the main colour.
Minifig drawings: "marks": up to ${MAX_MARKS} of { "shape": ${MARK_SHAPES.join(' | ')}, "part": ${PAINT_PARTS.join(' | ')}, "side": ${PAINT_SIDES.join(' | ')} (left/right as you look at the front), "x", "y": 0-1 its middle on that side (head front: eyes y 0.47 at x 0.3 and 0.68, cheeks y 0.6 at x 0.24 and 0.76, forehead y 0.3, mouth y 0.68, chin y 0.86; torso front: chest y 0.4), "size": 0.03-1, "color": "#rrggbb", "turn": degrees, "text": up to 10 letters for shape text }. Use marks for face paint, freckles, scars, tattoos, a logo, a number or a word on clothes — what the picture or words show that no part choice has. A logo is a simple shape, never a copy of a real brand.

Creature: "body": { "family": one of the families below, "params": { ${params} }, "colors": { "main", "accent", "belly", "eye" as "#rrggbb" } }.
${fams}

Figure of its own: "creature": { "shape": ${CREATURE_SHAPES.join(' | ')}, "size": 2-10 (studs; a dog 3, a horse 5, a giant 9), "heads": 0-5 (0: the face is on the body), "eyes": 0-8 per head, "legs": 0-8, "arms": 0-6, "tentacles": 0-8, "wings": 0 | 2 | 4, "tail": 0-8 (pieces), "wheels": 0-6, "horns": 0-6, "neck": 0-12 (plates), "extras": [${CREATURE_EXTRAS.join(', ')}], "move": walk | fly | swim | slither | hop, "colors": { "main", "accent", "belly", "eye" as "#rrggbb" } }.

Answer with JSON only, no other words, exactly this shape with 3 different candidates, the closest first:
{"candidates":[{"name":"a short name (max 32 letters)","profile":{...},"marks":[...] OR "body":{...} OR "creature":{...},"matched":[["part","what in the picture or words it matches"], ...]}]}
"matched" lists 3 to 6 parts (Hair, Hat, Shirt colour, Body, Main colour...) and what each one matches.`;
}

const HEX = /^#[0-9a-f]{6}$/i;
/** Keeps only settings the editor has: unknown fields, options and colours are dropped. */
export function sanitize(raw: unknown, cat: Catalog): Candidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name =
    String(r.name ?? 'New character')
      .trim()
      .slice(0, 32) || 'New character';
  const matched = Array.isArray(r.matched)
    ? (r.matched as unknown[])
        .filter((m): m is [string, string] => Array.isArray(m) && m.length >= 2)
        .map((m) => [String(m[0]).slice(0, 30), String(m[1]).slice(0, 120)] as [string, string])
        .slice(0, 8)
    : [];
  if (r.creature && typeof r.creature === 'object')
    return { name, creature: cleanSpec({ ...(r.creature as Record<string, unknown>), name }), matched };
  const b = r.body as Record<string, unknown> | undefined;
  if (b && typeof b === 'object' && BODY_FAMILIES.includes(b.family as BodyFamily) && b.family !== 'minifig') {
    const params: Record<string, number> = {};
    const p = (b.params ?? {}) as Record<string, unknown>;
    for (const k of PARAM_KEYS) {
      const v = Number(p[k]);
      if (Number.isFinite(v))
        params[k] = Math.round(Math.max(PARAM_INFO[k].lo, Math.min(PARAM_INFO[k].hi, v)) * 100) / 100;
    }
    const colors: Record<string, string> = {};
    const c = (b.colors ?? {}) as Record<string, unknown>;
    for (const k of ['main', 'accent', 'belly', 'eye'])
      if (typeof c[k] === 'string' && HEX.test(c[k] as string)) colors[k] = (c[k] as string).toLowerCase();
    return { name, body: { family: b.family as BodyFamily, params, colors }, matched };
  }
  const prof = (r.profile ?? {}) as Record<string, unknown>;
  const profile: Record<string, unknown> = { name };
  for (const [k, v] of Object.entries(prof)) {
    if (cat.choices[k]?.includes(String(v))) profile[k] = String(v);
    else if (cat.colorFields.includes(k) && typeof v === 'string' && HEX.test(v)) profile[k] = v.toLowerCase();
    // Milestone 3, 10d: body shape sizes, whole numbers in range
    else if (SHAPE_RANGES[k] !== undefined && Number.isFinite(Number(v)))
      profile[k] = Math.round(Math.max(0, Math.min(SHAPE_RANGES[k]!, Number(v))));
  }
  if (profile.gender !== 'Female') delete profile.breastSize;
  // 10d part 3: custom hair, cleaned (only with the hair choice Custom)
  if (profile.hair === 'Custom') profile.customHair = cleanHair(prof.customHair);
  const marks = cleanMarks(r.marks);
  return { name, profile, ...(marks.length ? { marks } : {}), matched };
}

/** The candidates in Claude's answer (the JSON may sit inside other words or a code block). */
export function parseCandidates(text: string, cat: Catalog): Candidate[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (data as { candidates?: unknown[] }).candidates;
  return Array.isArray(list)
    ? list
        .map((c) => sanitize(c, cat))
        .filter((c): c is Candidate => !!c)
        .slice(0, 3)
    : [];
}

/**
 * The main colours of a picture (most first): its pixels grouped by colour, near-white and near-black
 * backgrounds at the edges left out, similar colours merged.
 */
export function mainColors(data: Uint8ClampedArray, width: number, height: number, n = 4): string[] {
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
  // the background: the most common colour along the border
  const border = new Map<number, number>();
  const key = (r: number, g: number, b: number) => ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 20000)));
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3]! < 128) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const k = key(r, g, b);
      if (x < step || y < step || x >= width - step || y >= height - step) border.set(k, (border.get(k) ?? 0) + 1);
      const e = buckets.get(k) ?? { r: 0, g: 0, b: 0, count: 0 };
      e.r += r;
      e.g += g;
      e.b += b;
      e.count++;
      buckets.set(k, e);
    }
  let bg = -1;
  let most = 0;
  for (const [k, c] of border)
    if (c > most) {
      most = c;
      bg = k;
    }
  const list = [...buckets.entries()]
    .filter(([k]) => k !== bg)
    .map(([, e]) => ({ r: e.r / e.count, g: e.g / e.count, b: e.b / e.count, count: e.count }))
    .sort((a, b) => b.count - a.count);
  const out: { r: number; g: number; b: number }[] = [];
  for (const c of list) {
    if (out.some((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) < 60)) continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out.map((c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
}
