import { BODY_FAMILIES, type Body, type BodyFamily, PARAM_INFO, PARAM_KEYS } from '../../../core/character/body';
import { FAMILY_INFO, FAMILY_PRESETS } from '../../../core/character/families';

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
  const first = t.split(/\b(with|who|that|and|wearing|holding)\b/i)[0]!.trim();
  const n = title(first).slice(0, 32).trim();
  return n || 'New character';
}

/**
 * Three characters from a description and the picture's main colours, without AI: words pick the family
 * (or the minifig's parts), colours said in words go where they were said, the picture's colours fill
 * the rest. The second swaps the colours round; the third tries another preset or other parts.
 */
export function localCandidates(text: string, picture: string[], cat: Catalog): Candidate[] {
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
    const fill = [...plain, ...picture];
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
    .filter(([k]) => !/nipple|breast|butt|neckline|costume|power|spell|lingerie|underwear|swimwear|heroCut/i.test(k))
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
A character is EITHER a minifig (a person, or a person with an animal theme) OR a creature body.

Minifig: "profile" with any of these fields (exact option names), and colours as "#rrggbb" for: ${cat.colorFields.filter((f) => !/nipple/i.test(f)).join(', ')}.
${minifig}

Creature: "body": { "family": one of the families below, "params": { ${params} }, "colors": { "main", "accent", "belly", "eye" as "#rrggbb" } }.
${fams}

Answer with JSON only, no other words, exactly this shape with 3 different candidates, the closest first:
{"candidates":[{"name":"a short name (max 32 letters)","profile":{...} OR "body":{...},"matched":[["part","what in the picture or words it matches"], ...]}]}
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
  }
  return { name, profile, matched };
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
