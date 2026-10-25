import { z } from 'zod';
import { ASSET_KINDS, type AssetSpec, assetSpecFromWords, cleanAssetSpec } from '../assets/compose';
import { FOG_PRESETS } from '../lighting/atmosphere';
import { BIOMES, TIMES } from '../schema/map';

/**
 * Milestone 3, 10d part 5: a whole map from words or a picture — “a snowy mountain village with a lighthouse and
 * three houses at night, with a blacksmith and two guards”. A map spec says the land (v68's biomes, its size, the
 * time, rain or snow, fog), the buildings on it (asset specs, built from bricks by the asset composer) and the
 * people (described in words, made by the character maker with their body shape and drawings).
 */
export const MAP_SIZES = [16, 24, 32] as const;
export const MAX_BUILDINGS = 8;
export const MAX_PEOPLE = 6;

export const MapPerson = z.strictObject({
  /** who they are, in words (“a blacksmith with a long beard”, “a guard in armour”) */
  words: z.string().min(1).max(160),
  count: z.number().int().min(1).max(4),
});
export const MapBuilding = z.strictObject({ spec: z.unknown(), count: z.number().int().min(1).max(6) });

export type MapSpec = {
  name: string;
  biomes: (typeof BIOMES)[number][];
  size: (typeof MAP_SIZES)[number];
  time: (typeof TIMES)[number];
  rain: boolean;
  snow: boolean;
  fog: (typeof FOG_PRESETS)[number] | 'none';
  buildings: { spec: AssetSpec; count: number }[];
  people: { words: string; count: number }[];
};

/** Keeps a map spec in range: unknown biomes dropped (prairie if none), counts clamped, buildings cleaned. */
export function cleanMapSpec(raw: unknown): MapSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const biomes = (Array.isArray(r.biomes) ? r.biomes : [])
    .map(String)
    .filter((b): b is MapSpec['biomes'][number] => (BIOMES as readonly string[]).includes(b));
  const size = Number(r.size);
  const int = (v: unknown, lo: number, hi: number) =>
    Math.round(Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo)));
  const buildings = (Array.isArray(r.buildings) ? r.buildings : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .slice(0, MAX_BUILDINGS)
    .map((b) => ({
      spec: cleanAssetSpec(b.spec ?? b),
      count: int(b.count ?? 1, 1, 6),
    }));
  const people = (Array.isArray(r.people) ? r.people : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof p.words === 'string')
    .slice(0, MAX_PEOPLE)
    .map((p) => ({ words: String(p.words).trim().slice(0, 160) || 'a villager', count: int(p.count ?? 1, 1, 4) }));
  return {
    name:
      String(r.name ?? '')
        .trim()
        .slice(0, 60) || 'New map',
    biomes: [...new Set(biomes)].slice(0, 3).length ? [...new Set(biomes)].slice(0, 3) : ['prairie'],
    size: (MAP_SIZES as readonly number[]).includes(size) ? (size as MapSpec['size']) : 24,
    time: (TIMES as readonly string[]).includes(String(r.time)) ? (r.time as MapSpec['time']) : 'day',
    rain: r.rain === true,
    snow: r.snow === true,
    fog: (FOG_PRESETS as readonly string[]).includes(String(r.fog)) ? (r.fog as MapSpec['fog']) : 'none',
    buildings,
    people,
  };
}

const BIOME_WORDS: [RegExp, MapSpec['biomes'][number]][] = [
  // v68's city land is skyscrapers: a town or a village is open land with its own houses on it
  [/\b(city|downtown|metropolis|skyline)\b/, 'city'],
  [/\b(town|village|hamlet|suburb|neighbou?rhood)\b/, 'prairie'],
  [/\b(forest|woods?|woodland)\b/, 'forest'],
  [/\b(jungle|rainforest|tropical)\b/, 'rainforest'],
  [/\b(prairie|fields?|farm|meadow|grassland|countryside|plains?)\b/, 'prairie'],
  [/\b(mountains?|peaks?|hills?|alps|snowy|cliffs?)\b/, 'mountains'],
  [/\b(volcano(?:es)?|lava|volcanic)\b/, 'volcanoes'],
  [/\b(desert|dunes?|sahara|oasis)\b/, 'desert'],
  [/\b(beach|island|sea|ocean|coast|harbou?r|port|bay|shore|seaside|pirate)\b/, 'beach'],
  [/\b(highway|road|motorway|race ?track)\b/, 'highway'],
  [/\b(castle|kingdom|medieval|fortress)\b/, 'castle_outside'],
];
/** one of them, in words: “three red houses at night” → “a red house” (counts, plurals and where/when go) */
function oneOf(clause: string, plural: boolean): string {
  let c = clause
    .trim()
    .replace(
      /\s+\b(at|in|on|by|near|during|under)\b\s+(the\s+)?(night|evening|sunset|dusk|noon|day|morning|winter|summer|rain|snow|fog|mist|dark|middle|centre|center|edge|top|corner|square|harbou?r|shore|hill|beach)\b.*$/i,
      '',
    )
    .replace(/^(\d+|a|an|one|two|three|four|five|six|some|several|many|the)\s+/i, '');
  if (plural)
    c = c.replace(/\b(\w+?)(ies|es|s)\b(?!.*\b\w+s\b)/i, (w, stem, end) =>
      end === 'ies'
        ? `${stem}y`
        : end === 'es' && /(ch|sh|x|ss)$/.test(stem)
          ? stem
          : `${stem}${end === 'es' ? 'e' : ''}`,
    );
  return `${/^[aeiou]/i.test(c) ? 'an' : 'a'} ${c}`;
}
const NUM: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  some: 2,
  several: 3,
  many: 4,
};
/** people a map can have, said in words */
const PEOPLE =
  /\b(people|villagers?|townsfolk|guards?|knights?|pirates?|wizards?|witch(?:es)?|blacksmiths?|farmers?|shopkeepers?|merchants?|kings?|queens?|princess(?:es)?|princes?|soldiers?|sailors?|fishermen|fisherman|children|kids?|man|men|woman|women|girls?|boys?|chefs?|baker|bakers|doctors?|explorers?|astronauts?|robots?|ninjas?|cowboys?|detectives?|monks?|priests?|hunters?|miners?|builders?|captains?|neighbou?rs?|travell?ers?)\b/;

/**
 * A map said in words: its land (biomes from place words), size, time, weather and fog; its buildings (each
 * clause naming a thing to build, with its count and colours) and its people (each clause naming people).
 */
export function mapSpecFromWords(text: string): MapSpec {
  const t = ` ${text.toLowerCase()} `;
  const biomes: MapSpec['biomes'] = [];
  for (const [re, b] of BIOME_WORDS) if (re.test(t) && !biomes.includes(b)) biomes.push(b);
  const time: MapSpec['time'] = /\b(night|midnight|moonlit|dark)\b/.test(t)
    ? 'night'
    : /\b(evening|sunset|dusk|twilight)\b/.test(t)
      ? 'evening'
      : /\b(noon|midday|bright)\b/.test(t)
        ? 'noon'
        : 'day';
  const snow = /\b(snow|snowy|winter|frozen|icy|arctic)\b/.test(t);
  const rain = !snow && /\b(rain|rainy|storm|stormy|wet)\b/.test(t);
  const fog: MapSpec['fog'] = /\b(swamp|marsh|bog)\b/.test(t)
    ? 'swamp'
    : /\b(smoky|smoke|ash)\b/.test(t)
      ? 'smoke'
      : /\b(thick fog|foggy|fog)\b/.test(t)
        ? 'thick'
        : /\b(misty|mist)\b/.test(t)
          ? 'mist'
          : /\bhazy|haze\b/.test(t)
            ? 'haze'
            : 'none';
  const size: MapSpec['size'] = /\b(huge|big|large|vast|giant)\b/.test(t)
    ? 32
    : /\b(small|tiny|little)\b/.test(t)
      ? 16
      : 24;
  // the things and people, clause by clause
  const buildings: MapSpec['buildings'] = [];
  const people: MapSpec['people'] = [];
  const kinds = new RegExp(
    `\\b(${ASSET_KINDS.join('|')})(e?s)?\\b|\\b(houses|cottages|shops|towers|trees|ships|boats|cars|tents|huts|lamps|statues|fountains|bridges|wells|barrels|crates|benches|stalls|windmills|barns)\\b`,
  );
  // clauses: a clause that names no building and no people says more about the one before it (“a blacksmith with a
  // long beard”, “a house with a red roof”)
  const items: { kind: 'building' | 'person'; words: string; count: number }[] = [];
  for (const raw of text.split(/(,|;|\band\b|\bwith\b|\bwhere\b|\bnear\b|\bby\b)/i)) {
    const clause = raw.trim();
    if (!clause || /^(,|;|and|with|where|near|by)$/i.test(clause)) continue;
    const c = ` ${clause.toLowerCase()} `;
    const m = /\b(a|an|one|two|three|four|five|six|some|several|many|\d)\b/.exec(c);
    const count = m ? (/^\d$/.test(m[1]!) ? Number(m[1]) : (NUM[m[1]!] ?? 1)) : /s\b/.test(c.trim()) ? 2 : 1;
    const person = PEOPLE.test(c) && !kinds.test(c.replace(PEOPLE, ''));
    if (person) items.push({ kind: 'person', words: clause, count });
    else if (kinds.test(c)) items.push({ kind: 'building', words: clause, count });
    else if (
      items.length &&
      !BIOME_WORDS.some(([re]) => re.test(c)) &&
      !/\b(night|evening|sunset|dusk|noon|rain|snow|fog|mist)\b/.test(c)
    )
      items[items.length - 1]!.words += ` with ${clause}`;
  }
  for (const it of items) {
    if (it.kind === 'person' && people.length < MAX_PEOPLE)
      people.push({ words: oneOf(it.words, it.count > 1), count: Math.min(4, it.count) });
    if (it.kind === 'building' && buildings.length < MAX_BUILDINGS)
      buildings.push({ spec: assetSpecFromWords(oneOf(it.words, true)), count: Math.min(6, it.count) });
  }
  // a town or village with no buildings named gets a few houses; a city a few buildings of each
  if (!buildings.length && /\b(town|village|city|street)\b/.test(t))
    buildings.push({ spec: assetSpecFromWords(snow ? 'a white cottage' : 'a house'), count: 3 });
  const name = text
    .trim()
    .replace(/^(an?|the|my)\s+/i, '')
    .split(/\b(with|where|that|and)\b|,/i)[0]!
    .replace(
      /\s+\b(at|in|on|during|by)\b\s+(the\s+)?(night|evening|sunset|dusk|noon|day|morning|winter|summer|rain|snow|fog|mist)\b.*$/i,
      '',
    )
    .trim()
    .replace(/\b\w/g, (x) => x.toUpperCase())
    .slice(0, 60);
  // many buildings want room: bigger land
  const total = buildings.reduce((n, b) => n + b.count, 0);
  const room: MapSpec['size'] = total > 3 && size < 32 ? 32 : size;
  return cleanMapSpec({
    name: name || 'New map',
    biomes: biomes.length ? biomes : ['prairie'],
    size: room,
    time,
    rain,
    snow,
    fog,
    buildings,
    people,
  });
}

/** a map spec in a few words for a match card */
export function describeMap(s: MapSpec): [string, string][] {
  const out: [string, string][] = [
    [
      'Land',
      `${s.biomes.join(', ').replace('_', ' ')} — ${s.size === 16 ? 'small' : s.size === 32 ? 'big' : 'medium'}`,
    ],
    ['Sky', `${s.time}${s.rain ? ', rain' : ''}${s.snow ? ', snow' : ''}${s.fog !== 'none' ? `, ${s.fog} fog` : ''}`],
  ];
  if (s.buildings.length)
    out.push(['Buildings', s.buildings.map((b) => `${b.count > 1 ? `${b.count} × ` : ''}${b.spec.name}`).join(', ')]);
  if (s.people.length)
    out.push(['People', s.people.map((p) => `${p.count > 1 ? `${p.count} × ` : ''}${p.words}`).join('; ')]);
  return out;
}
