import { z } from 'zod';
import type { Asset, AssetBrick } from '../schema/asset';
import { BRICK_SIZES } from '../schema/chunk';

/**
 * Milestone 3, 10d part 4: assets from words or a picture. A short description of a thing — a kind (house, tower,
 * castle, bridge, car, ship, tree, fountain, statue…), its size, floors, roof, colours and a few features — is
 * built here into ordinary bricks: shapes are filled into 1-stud cells (boxes, hollow walls, round towers, stepped
 * roofs, blobs), then cells of one colour and height are merged into the biggest bricks v68 has. Every asset made
 * this way is a normal asset: open it in the Asset studio and change any brick.
 */

export const ASSET_KINDS = [
  'house',
  'cottage',
  'shop',
  'tower',
  'castle',
  'skyscraper',
  'lighthouse',
  'windmill',
  'temple',
  'pyramid',
  'barn',
  'tent',
  'hut',
  'bridge',
  'wall',
  'fence',
  'gate',
  'arch',
  'well',
  'fountain',
  'statue',
  'tree',
  'bush',
  'rock',
  'car',
  'truck',
  'bus',
  'boat',
  'ship',
  'cart',
  'train',
  'plane',
  'bench',
  'table',
  'bed',
  'crate',
  'barrel',
  'chest',
  'lamp',
  'sign',
  'stall',
  'throne',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ROOFS = ['flat', 'gable', 'pyramid', 'dome', 'battlements', 'none'] as const;
export const ASSET_FEATURES = [
  'chimney',
  'flag',
  'door',
  'windows',
  'balcony',
  'awning',
  'columns',
  'stairs',
  'sign',
  'lamp',
  'garden',
  'sail',
  'cannons',
  'clock',
  'water',
  'spikes',
  'wheels',
] as const;
const CATEGORY: Record<AssetKind, Asset['category']> = {
  house: 'building',
  cottage: 'building',
  shop: 'building',
  tower: 'building',
  castle: 'building',
  skyscraper: 'building',
  lighthouse: 'building',
  windmill: 'building',
  temple: 'building',
  pyramid: 'structure',
  barn: 'building',
  tent: 'building',
  hut: 'building',
  bridge: 'structure',
  wall: 'structure',
  fence: 'structure',
  gate: 'structure',
  arch: 'structure',
  well: 'structure',
  fountain: 'decoration',
  statue: 'decoration',
  tree: 'nature',
  bush: 'nature',
  rock: 'nature',
  car: 'vehicle',
  truck: 'vehicle',
  bus: 'vehicle',
  boat: 'vehicle',
  ship: 'vehicle',
  cart: 'vehicle',
  train: 'vehicle',
  plane: 'vehicle',
  bench: 'prop',
  table: 'prop',
  bed: 'prop',
  crate: 'prop',
  barrel: 'prop',
  chest: 'prop',
  lamp: 'decoration',
  sign: 'decoration',
  stall: 'building',
  throne: 'prop',
};

const HEX = /^#[0-9a-f]{6}$/;
export const AssetSpec = z.strictObject({
  name: z.string().min(1).max(60),
  kind: z.enum(ASSET_KINDS),
  /** studs across (x) and deep (z) */
  width: z.number().int().min(2).max(32),
  depth: z.number().int().min(2).max(32),
  /** floors for buildings; storeys of a tower; decks of a ship */
  floors: z.number().int().min(1).max(12),
  roof: z.enum(ROOFS),
  features: z.array(z.enum(ASSET_FEATURES)).max(12),
  colors: z.strictObject({
    main: z.string().regex(HEX),
    roof: z.string().regex(HEX),
    trim: z.string().regex(HEX),
    door: z.string().regex(HEX),
    window: z.string().regex(HEX),
    accent: z.string().regex(HEX),
  }),
});
export type AssetSpec = z.infer<typeof AssetSpec>;

/** what each kind starts as: [width, depth, floors, roof, features, colours] */
const DEFAULTS: Record<
  AssetKind,
  [number, number, number, (typeof ROOFS)[number], (typeof ASSET_FEATURES)[number][], Partial<AssetSpec['colors']>]
> = {
  house: [10, 8, 2, 'gable', ['door', 'windows', 'chimney'], { main: '#f4f4f4', roof: '#c91a09', trim: '#583927' }],
  cottage: [8, 6, 1, 'gable', ['door', 'windows', 'chimney', 'garden'], { main: '#e4cd9e', roof: '#583927' }],
  shop: [
    10,
    8,
    1,
    'flat',
    ['door', 'windows', 'awning', 'sign'],
    { main: '#f2cd37', roof: '#a0a5a9', accent: '#c91a09' },
  ],
  tower: [6, 6, 5, 'battlements', ['door', 'windows', 'flag'], { main: '#a0a5a9', roof: '#6c6e68', trim: '#6c6e68' }],
  castle: [
    20,
    16,
    2,
    'battlements',
    ['door', 'flag', 'windows'],
    { main: '#a0a5a9', roof: '#6c6e68', trim: '#6c6e68' },
  ],
  skyscraper: [10, 10, 10, 'flat', ['door', 'windows'], { main: '#6c6e68', window: '#9fc3e9', roof: '#1b1b1b' }],
  lighthouse: [6, 6, 6, 'dome', ['door', 'windows', 'lamp'], { main: '#f4f4f4', accent: '#c91a09', roof: '#c91a09' }],
  windmill: [6, 6, 3, 'pyramid', ['door', 'windows', 'sail'], { main: '#e4cd9e', roof: '#583927', accent: '#f4f4f4' }],
  temple: [14, 10, 1, 'gable', ['columns', 'stairs'], { main: '#f4f4f4', roof: '#e4cd9e', trim: '#e4cd9e' }],
  pyramid: [16, 16, 1, 'pyramid', [], { main: '#e4cd9e', roof: '#e4cd9e', trim: '#f2cd37' }],
  barn: [12, 8, 1, 'gable', ['door', 'windows'], { main: '#c91a09', roof: '#6c6e68', trim: '#f4f4f4' }],
  tent: [6, 6, 1, 'pyramid', ['door'], { main: '#237841', roof: '#237841', trim: '#583927' }],
  hut: [6, 6, 1, 'pyramid', ['door'], { main: '#583927', roof: '#e4cd9e' }],
  bridge: [16, 6, 1, 'none', [], { main: '#583927', trim: '#583927', accent: '#a0a5a9' }],
  wall: [16, 2, 2, 'battlements', [], { main: '#a0a5a9', trim: '#6c6e68' }],
  fence: [12, 2, 1, 'none', [], { main: '#583927' }],
  gate: [8, 2, 3, 'battlements', ['door'], { main: '#a0a5a9', door: '#583927' }],
  arch: [8, 2, 3, 'none', [], { main: '#a0a5a9' }],
  well: [4, 4, 1, 'gable', ['water'], { main: '#a0a5a9', roof: '#583927', accent: '#0055bf' }],
  fountain: [8, 8, 1, 'none', ['water'], { main: '#a0a5a9', accent: '#9fc3e9' }],
  statue: [4, 4, 3, 'none', [], { main: '#a0a5a9', trim: '#6c6e68' }],
  tree: [6, 6, 3, 'none', [], { main: '#237841', trim: '#583927' }],
  bush: [4, 4, 1, 'none', [], { main: '#237841' }],
  rock: [6, 5, 1, 'none', [], { main: '#a0a5a9', trim: '#6c6e68' }],
  car: [8, 4, 1, 'flat', ['wheels', 'windows'], { main: '#c91a09', window: '#9fc3e9', trim: '#1b1b1b' }],
  truck: [12, 4, 1, 'flat', ['wheels', 'windows'], { main: '#0055bf', window: '#9fc3e9', trim: '#1b1b1b' }],
  bus: [16, 4, 1, 'flat', ['wheels', 'windows', 'door'], { main: '#f2cd37', window: '#9fc3e9', trim: '#1b1b1b' }],
  boat: [10, 4, 1, 'none', [], { main: '#f4f4f4', trim: '#0055bf', accent: '#583927' }],
  ship: [20, 6, 2, 'none', ['sail', 'flag'], { main: '#583927', trim: '#1b1b1b', accent: '#f4f4f4' }],
  cart: [6, 4, 1, 'none', ['wheels'], { main: '#583927', trim: '#1b1b1b' }],
  train: [16, 4, 1, 'flat', ['wheels', 'windows', 'chimney'], { main: '#237841', trim: '#1b1b1b', accent: '#f2cd37' }],
  plane: [12, 12, 1, 'none', ['windows'], { main: '#f4f4f4', accent: '#c91a09', window: '#9fc3e9' }],
  bench: [6, 2, 1, 'none', [], { main: '#583927', trim: '#1b1b1b' }],
  table: [6, 4, 1, 'none', [], { main: '#583927' }],
  bed: [4, 8, 1, 'none', [], { main: '#583927', accent: '#f4f4f4', roof: '#c91a09' }],
  crate: [4, 4, 1, 'none', [], { main: '#e4cd9e', trim: '#583927' }],
  barrel: [4, 4, 1, 'none', [], { main: '#583927', trim: '#1b1b1b' }],
  chest: [4, 3, 1, 'none', [], { main: '#583927', trim: '#f2cd37' }],
  lamp: [2, 2, 3, 'none', ['lamp'], { main: '#1b1b1b', accent: '#f2cd37' }],
  sign: [4, 2, 1, 'none', ['sign'], { main: '#583927', accent: '#e4cd9e' }],
  stall: [8, 6, 1, 'gable', ['awning'], { main: '#583927', roof: '#c91a09', accent: '#f4f4f4' }],
  throne: [4, 4, 2, 'none', [], { main: '#f2cd37', accent: '#c91a09' }],
};
const BASE_COLORS: AssetSpec['colors'] = {
  main: '#f4f4f4',
  roof: '#c91a09',
  trim: '#583927',
  door: '#583927',
  window: '#9fc3e9',
  accent: '#f2cd37',
};

/** Keeps a spec in range: an unknown kind becomes a house, numbers are clamped, unknown features are dropped. */
export function cleanAssetSpec(raw: unknown): AssetSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = (ASSET_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as AssetKind) : 'house';
  const [w, d, f, roof, feats, cols] = DEFAULTS[kind];
  const int = (v: unknown, lo: number, hi: number, def: number) =>
    Number.isFinite(Number(v)) ? Math.round(Math.max(lo, Math.min(hi, Number(v)))) : def;
  const c = (r.colors && typeof r.colors === 'object' ? r.colors : {}) as Record<string, unknown>;
  const colors = { ...BASE_COLORS, ...cols };
  for (const k of Object.keys(BASE_COLORS) as (keyof AssetSpec['colors'])[]) {
    const v = typeof c[k] === 'string' ? (c[k] as string).toLowerCase() : '';
    if (HEX.test(v)) colors[k] = v;
  }
  const features = Array.isArray(r.features)
    ? [...new Set(r.features.map(String).filter((x) => (ASSET_FEATURES as readonly string[]).includes(x)))]
    : feats;
  return AssetSpec.parse({
    name:
      String(r.name ?? '')
        .trim()
        .slice(0, 60) || kind.charAt(0).toUpperCase() + kind.slice(1),
    kind,
    width: int(r.width, 2, 32, w),
    depth: int(r.depth, 2, 32, d),
    floors: int(r.floors, 1, 12, f),
    roof: (ROOFS as readonly string[]).includes(String(r.roof)) ? r.roof : roof,
    features: features.slice(0, 12),
    colors,
  });
}

// ---------- words ----------

const KIND_WORDS: [RegExp, AssetKind][] = [
  [/\b(skyscraper|office block|high[- ]rise|tower block)\b/, 'skyscraper'],
  [/\blighthouse\b/, 'lighthouse'],
  [/\bwindmill\b/, 'windmill'],
  [/\b(castle|fortress|fort|keep|palace)\b/, 'castle'],
  [/\b(temple|shrine|church|chapel|cathedral)\b/, 'temple'],
  [/\bpyramid\b/, 'pyramid'],
  [/\bbarn\b/, 'barn'],
  [/\b(tent|teepee|tipi|yurt)\b/, 'tent'],
  [/\b(hut|shack|shed)\b/, 'hut'],
  [/\b(cottage|cabin|bungalow)\b/, 'cottage'],
  [/\b(shop|store|bakery|cafe|café|restaurant|diner|inn|tavern|pub|pharmacy|bank|post office)\b/, 'shop'],
  [/\b(market stall|stall|stand|kiosk)\b/, 'stall'],
  [/\b(tower|turret|spire)\b/, 'tower'],
  [/\b(bridge)\b/, 'bridge'],
  [/\b(gate|gatehouse|portcullis)\b/, 'gate'],
  [/\b(arch|archway)\b/, 'arch'],
  [/\b(wall|rampart)\b/, 'wall'],
  [/\b(fence|railing)\b/, 'fence'],
  [/\bwell\b/, 'well'],
  [/\bfountain\b/, 'fountain'],
  [/\b(statue|monument|sculpture|obelisk)\b/, 'statue'],
  [/\b(tree|oak|pine|palm|birch|willow)\b/, 'tree'],
  [/\b(bush|hedge|shrub)\b/, 'bush'],
  [/\b(rock|boulder|stone|cliff)\b/, 'rock'],
  [/\b(bus|coach)\b/, 'bus'],
  [/\b(truck|lorry|van|fire engine|tractor)\b/, 'truck'],
  [/\b(car|taxi|jeep|racer|race car)\b/, 'car'],
  [/\b(ship|galleon|pirate ship|frigate)\b/, 'ship'],
  [/\b(boat|canoe|rowboat|yacht|raft)\b/, 'boat'],
  [/\b(cart|wagon|carriage|wheelbarrow)\b/, 'cart'],
  [/\b(train|locomotive|engine|tram)\b/, 'train'],
  [/\b(plane|aeroplane|airplane|jet)\b/, 'plane'],
  [/\b(bench|seat)\b/, 'bench'],
  [/\b(table|desk)\b/, 'table'],
  [/\bbed\b/, 'bed'],
  [/\b(crate|box)\b/, 'crate'],
  [/\b(barrel|keg)\b/, 'barrel'],
  [/\b(chest|treasure)\b/, 'chest'],
  [/\b(lamp|street ?light|lantern|torch post)\b/, 'lamp'],
  [/\b(sign|signpost|billboard)\b/, 'sign'],
  [/\bthrone\b/, 'throne'],
  [/\b(house|home|mansion|villa|townhouse)\b/, 'house'],
];
const COLORS: Record<string, string> = {
  red: '#c91a09',
  blue: '#0055bf',
  navy: '#0a3463',
  green: '#237841',
  lime: '#bbe90b',
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
  stone: '#a0a5a9',
  silver: '#a0a5a9',
  brown: '#583927',
  wooden: '#583927',
  wood: '#583927',
  tan: '#e4cd9e',
  sand: '#e4cd9e',
  brick: '#b40000',
  teal: '#4fd1c5',
  dark: '#6c6e68',
};
/** colour words next to a part: “a red roof”, “blue door”, “white walls” */
const COLOR_PART: [RegExp, keyof AssetSpec['colors']][] = [
  [/^(roofs?|tiles|top)$/, 'roof'],
  [/^(doors?|gate)$/, 'door'],
  [/^(windows?|glass)$/, 'window'],
  [/^(trim|frames?|edges?|beams?|trunk)$/, 'trim'],
  [/^(walls?|sides?|body|hull|bricks?)$/, 'main'],
  [/^(flags?|awning|stripes?|sails?|details?|lights?|leaves|cushion)$/, 'accent'],
];
const NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ten: 10,
  twelve: 12,
};

/** a thing said in words, built from what is said: kind, size, floors, roof, colours by part, features */
export function assetSpecFromWords(text: string): AssetSpec {
  const t = ` ${text.toLowerCase()} `;
  const kind = KIND_WORDS.find(([re]) => re.test(t))?.[1] ?? 'house';
  const [w0, d0, f0] = DEFAULTS[kind];
  const raw: Record<string, unknown> = { kind };
  // floors: “three floors”, “two-storey”, “a 5 story tower”
  const fl =
    /\b(\d+|one|two|three|four|five|six|seven|eight|ten|twelve)[\s-]+(floors?|stor(?:e)?y|stor(?:e)?ys|stories|levels?|decks?)\b/.exec(
      t,
    );
  if (fl) raw.floors = /^\d+$/.test(fl[1]!) ? Number(fl[1]) : NUM[fl[1]!];
  const big = /\b(huge|giant|enormous|massive)\b/.test(t)
    ? 1.8
    : /\b(big|large|tall|grand)\b/.test(t)
      ? 1.35
      : /\b(tiny|mini)\b/.test(t)
        ? 0.6
        : /\b(small|little)\b/.test(t)
          ? 0.75
          : 1;
  raw.width = Math.round(w0 * big);
  raw.depth = Math.round(d0 * (big > 1 ? Math.sqrt(big) : big));
  if (!fl && /\btall\b/.test(t)) raw.floors = f0 + 2;
  else if (!fl && big >= 1.8) raw.floors = f0 + 1;
  // roof
  if (/\bflat roof\b/.test(t)) raw.roof = 'flat';
  else if (/\b(pointed|pointy|steep|gabled?) roof\b/.test(t)) raw.roof = 'gable';
  else if (/\b(dome|domed|round roof)\b/.test(t)) raw.roof = 'dome';
  else if (/\b(battlements|crenell?ated|castle top)\b/.test(t)) raw.roof = 'battlements';
  else if (/\b(no roof|roofless|ruin(?:ed)?)\b/.test(t)) raw.roof = 'none';
  else if (/\b(pyramid roof|cone roof|conical)\b/.test(t)) raw.roof = 'pyramid';
  // features
  const feats = new Set(DEFAULTS[kind][4]);
  for (const f of ASSET_FEATURES) {
    const re = new RegExp(
      `\\b${f === 'columns' ? 'colum?ns?|pillars?' : f === 'windows' ? 'windows?' : f === 'stairs' ? 'stairs|steps' : f === 'wheels' ? 'wheels?' : `${f}s?`}\\b`,
    );
    if (re.test(t)) feats.add(f);
  }
  if (/\bno (windows|chimney|door|flag)\b/.test(t)) feats.delete(/\bno (\w+)/.exec(t)![1] as never);
  if (/\b(pirate|sailing)\b/.test(t) && kind === 'ship') feats.add('cannons');
  raw.features = [...feats];
  // colours: by part (“a red roof”), then plain colours: the first for the walls, the second for the roof
  const colors: Record<string, string> = {};
  const ws = t.match(/[a-z]+/g) ?? [];
  const plain: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    const c = COLORS[ws[i]!];
    if (!c) continue;
    const next = ws[i + 1] ?? '';
    const part = COLOR_PART.find(([re]) => re.test(next))?.[1];
    if (part) colors[part] ??= c;
    else if (!(ws[i] === 'stone' || ws[i] === 'wooden' || ws[i] === 'wood' || ws[i] === 'brick') || !plain.length)
      plain.push(c);
  }
  for (const slot of ['main', 'roof', 'accent'] as const) {
    if (colors[slot]) continue;
    const c = plain.shift();
    if (c) colors[slot] = c;
  }
  raw.colors = colors;
  // name: the words before what it has
  const name = text
    .trim()
    .replace(/^(an?|the|my)\s+/i, '')
    .split(/\b(with|that|and|which|who)\b|,/i)[0]!
    .trim();
  raw.name = name.replace(/\b\w/g, (m) => m.toUpperCase()).slice(0, 60);
  return cleanAssetSpec(raw);
}

// ---------- building ----------

type Cell = { color: string; h: 1 | 3; kind: 'brick' | 'plate' | 'tile' };
/** 1-stud cells, by x, y (plates) and z */
class Cells {
  readonly map = new Map<string, Cell & { x: number; y: number; z: number }>();
  set(x: number, y: number, z: number, color: string, h: 1 | 3 = 3, kind: Cell['kind'] = h === 3 ? 'brick' : 'plate') {
    // things in front of a wall (sails, awnings, wheels) go below 0: the asset is moved to start at 0 after
    if (x < -16 || z < -16 || y < 0 || x >= 80 || z >= 80 || y > 270) return;
    // a taller cell clears the plates it covers; one cell per spot
    for (let k = 0; k < h; k++) {
      const key = `${x},${y + k},${z}`;
      const there = this.map.get(key);
      if (there) this.unset(there);
    }
    const c = { x, y, z, color, h, kind };
    this.map.set(`${x},${y},${z}`, c);
    for (let k = 1; k < h; k++) this.map.set(`${x},${y + k},${z}`, c);
  }
  private unset(c: Cell & { x: number; y: number; z: number }) {
    for (let k = 0; k < c.h; k++) this.map.delete(`${c.x},${c.y + k},${c.z}`);
  }
  clear(x: number, y: number, z: number) {
    const c = this.map.get(`${x},${y},${z}`);
    if (c) this.unset(c);
  }
  has(x: number, y: number, z: number) {
    return this.map.has(`${x},${y},${z}`);
  }
  cells() {
    return [...new Set(this.map.values())];
  }
}

/** shapes filled into cells (y in plates; a brick layer is 3 plates) */
class Shaper {
  readonly c = new Cells();
  /** a solid box of bricks (h in brick layers) */
  box(x: number, y: number, z: number, w: number, d: number, layers: number, color: string) {
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this.c.set(x + i, y + l * 3, z + j, color);
  }
  /** a layer of plates (or tiles, smooth on top) */
  plate(x: number, y: number, z: number, w: number, d: number, color: string, kind: 'plate' | 'tile' = 'plate') {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this.c.set(x + i, y, z + j, color, 1, kind);
  }
  /** four walls one stud thick */
  walls(x: number, y: number, z: number, w: number, d: number, layers: number, color: string) {
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < w; i++)
        for (let j = 0; j < d; j++)
          if (i === 0 || j === 0 || i === w - 1 || j === d - 1) this.c.set(x + i, y + l * 3, z + j, color);
  }
  /** a round column or ring (r studs), stepped */
  disc(cx: number, y: number, cz: number, r: number, layers: number, color: string, hollow = false) {
    for (let l = 0; l < layers; l++)
      for (let i = -Math.ceil(r); i <= Math.ceil(r); i++)
        for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) {
          const d = Math.hypot(i + 0.5, j + 0.5);
          if (d > r + 0.2) continue;
          if (hollow && d < r - 1.1) continue;
          this.c.set(Math.floor(cx + i), y + l * 3, Math.floor(cz + j), color);
        }
  }
  /** a blob (a tree top, a bush, a rock): a squashed ball of bricks */
  blob(cx: number, y: number, cz: number, rx: number, layers: number, rz: number, color: string) {
    for (let l = 0; l < layers; l++) {
      const t = (l + 0.5) / layers;
      const k = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * 0.6 + 0.4;
      for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++)
        for (let j = -Math.ceil(rz); j <= Math.ceil(rz); j++)
          if (((i + 0.5) / (rx * k)) ** 2 + ((j + 0.5) / (rz * k)) ** 2 <= 1)
            this.c.set(Math.floor(cx + i), y + l * 3, Math.floor(cz + j), color);
    }
  }
  hole(x: number, y: number, z: number, w: number, d: number, layers: number) {
    for (let l = 0; l < layers * 3; l++)
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this.c.clear(x + i, y + l, z + j);
  }
}

/** a roof over x..x+w, z..z+d at height y */
function roof(
  s: Shaper,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  style: AssetSpec['roof'],
  color: string,
  trim: string,
) {
  if (style === 'none') return y;
  if (style === 'flat') {
    s.plate(x, y, z, w, d, color, 'tile');
    return y + 1;
  }
  if (style === 'battlements') {
    s.plate(x, y, z, w, d, trim);
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++)
        if ((i === 0 || j === 0 || i === w - 1 || j === d - 1) && (i + j) % 2 === 0)
          s.c.set(x + i, y + 1, z + j, color);
    return y + 4;
  }
  if (style === 'gable') {
    // steps rising from front and back to a ridge along x
    const steps = Math.ceil(d / 2);
    for (let k = 0; k < steps; k++) {
      s.plate(x - (k === 0 ? 1 : 0), y + k, z + k, w + (k === 0 ? 2 : 0), 1, color);
      s.plate(x - (k === 0 ? 1 : 0), y + k, z + d - 1 - k, w + (k === 0 ? 2 : 0), 1, color);
      // the gable ends
      if (k > 0)
        for (let j = z + k; j < z + d - k; j++) for (const xi of [x, x + w - 1]) s.c.set(xi, y + k - 1, j, trim, 1);
    }
    return y + steps;
  }
  if (style === 'pyramid') {
    let k = 0;
    for (; 2 * k < Math.min(w, d); k++) s.plate(x + k, y + k, z + k, w - 2 * k, d - 2 * k, color);
    return y + k;
  }
  // dome: shrinking rings of bricks
  const r = Math.min(w, d) / 2;
  let k = 0;
  for (; k < 3; k++)
    s.disc(x + w / 2 - 0.5, y + k * 3, z + d / 2 - 0.5, r * Math.cos((k / 3) * (Math.PI / 2)) + 0.3, 1, color);
  s.c.set(Math.floor(x + w / 2 - 0.5), y + 9, Math.floor(z + d / 2 - 0.5), trim);
  return y + 12;
}

/** windows along the walls of a floor (every few studs, one brick tall), and the door in front */
function openings(s: Shaper, spec: AssetSpec, x: number, y: number, z: number, w: number, d: number, floor: number) {
  const { colors } = spec;
  const wants = spec.features.includes('windows');
  if (wants)
    for (const [len, at] of [
      [w, (i: number) => [x + i, z] as const],
      [w, (i: number) => [x + i, z + d - 1] as const],
      [d, (i: number) => [x, z + i] as const],
      [d, (i: number) => [x + w - 1, z + i] as const],
    ] as const)
      for (let i = 2; i < len - 2; i += 3) {
        const [wx, wz] = at(i);
        if (floor === 0 && spec.features.includes('door') && wz === z && Math.abs(wx - (x + Math.floor(w / 2))) <= 1)
          continue;
        s.c.set(wx, y + 3, wz, colors.window, 3, 'brick');
      }
  if (floor === 0 && spec.features.includes('door')) {
    const dx = x + Math.floor(w / 2) - 1;
    for (let i = 0; i < 2; i++) for (let l = 0; l < 2; l++) s.c.set(dx + i, y + l * 3, z, colors.door, 3);
  }
}

/** Builds a spec into cells: each kind its own recipe from boxes, walls, discs, blobs and roofs. */
function shape(spec: AssetSpec): Shaper {
  const s = new Shaper();
  const { width: w, depth: d, floors: f, colors: col, features: F } = spec;
  const has = (x: (typeof ASSET_FEATURES)[number]) => F.includes(x);
  const flag = (x: number, y: number, z: number) => {
    for (let l = 0; l < 3; l++) s.c.set(x, y + l * 3, z, '#1b1b1b');
    s.c.set(x + 1, y + 6, z, col.accent);
    s.c.set(x + 2, y + 6, z, col.accent);
  };
  switch (spec.kind) {
    case 'house':
    case 'cottage':
    case 'shop':
    case 'barn':
    case 'skyscraper':
    case 'temple':
    case 'castle':
    case 'stall':
    case 'hut':
    case 'tent': {
      s.plate(0, 0, 0, w, d, spec.kind === 'castle' ? col.trim : '#6c6e68');
      let y = 1;
      const floorLayers = spec.kind === 'skyscraper' ? 2 : 3;
      if (spec.kind === 'temple') {
        // steps, columns, a beam
        s.plate(0, 0, 0, w, d, col.main);
        s.plate(1, 1, 1, w - 2, d - 2, col.main);
        y = 2;
        for (let i = 1; i < w - 1; i += 3) for (const zz of [1, d - 2]) s.box(i, y, zz, 1, 1, 4, col.main);
        s.plate(0, y + 12, 0, w, d, col.trim);
        roof(s, 0, y + 13, 0, w, d, spec.roof, col.roof, col.trim);
        break;
      }
      if (spec.kind === 'stall') {
        s.plate(0, 0, 0, w, d, col.main);
        for (const [cx, cz] of [
          [0, 0],
          [w - 1, 0],
          [0, d - 1],
          [w - 1, d - 1],
        ] as const)
          s.box(cx, 1, cz, 1, 1, 3, col.main);
        s.box(1, 1, 0, w - 2, 1, 1, col.accent);
        s.plate(0, 10, 0, w, d, col.roof);
        roof(s, 0, 11, 0, w, d, 'gable', col.roof, col.accent);
        break;
      }
      for (let fl = 0; fl < f; fl++) {
        s.walls(0, y, 0, w, d, floorLayers, col.main);
        openings(s, spec, 0, y, 0, w, d, fl);
        y += floorLayers * 3;
        if (fl < f - 1) {
          s.plate(0, y, 0, w, d, col.trim);
          y += 1;
        }
      }
      if (spec.kind === 'castle') {
        // corner towers taller than the walls
        for (const [cx, cz] of [
          [0, 0],
          [w - 3, 0],
          [0, d - 3],
          [w - 3, d - 3],
        ] as const) {
          s.box(cx, 1, cz, 3, 3, f * 3 + 2, col.main);
          roof(s, cx, 1 + (f * 3 + 2) * 3, cz, 3, 3, 'battlements', col.main, col.trim);
        }
        if (has('flag')) flag(1, 1 + (f * 3 + 2) * 3 + 4, 1);
      }
      if (has('awning')) for (let i = 0; i < w; i++) s.c.set(i, 7, -1, i % 2 ? col.accent : '#f4f4f4', 1);
      if (has('sign')) s.box(Math.floor(w / 2) - 2, y - 3, -1, 4, 1, 1, col.accent);
      if (has('balcony') && f > 1) s.plate(1, 1 + floorLayers * 3, -2, w - 2, 2, col.trim);
      const top = roof(s, 0, y, 0, w, d, spec.roof, col.roof, col.trim);
      if (has('chimney'))
        s.box(w - 3, y, Math.max(1, Math.floor(d / 4)), 1, 1, Math.max(2, Math.ceil((top - y) / 3) + 1), col.trim);
      if (has('flag') && spec.kind !== 'castle') flag(1, top, 1);
      if (has('clock')) s.c.set(Math.floor(w / 2), y - 3, -1, '#f4f4f4');
      if (has('garden')) for (let i = 0; i < w; i += 2) s.c.set(i, 0, -2, i % 4 ? '#c91a09' : '#237841', 1);
      break;
    }
    case 'tower':
    case 'lighthouse':
    case 'windmill': {
      const r = Math.min(w, d) / 2;
      let y = 0;
      for (let fl = 0; fl < f; fl++) {
        for (let l = 0; l < 2; l++) {
          const stripe = spec.kind === 'lighthouse' && fl % 2 === 1 ? col.accent : col.main;
          s.disc(r - 0.5, y, r - 0.5, r, 1, stripe, true);
          y += 3;
        }
        if (has('windows') && fl > 0) s.c.set(Math.floor(r), y - 6, 0, col.window, 3);
      }
      if (has('door')) {
        s.c.set(Math.floor(r) - 1, 0, 0, col.door);
        s.c.set(Math.floor(r), 0, 0, col.door);
        s.c.set(Math.floor(r) - 1, 3, 0, col.door);
        s.c.set(Math.floor(r), 3, 0, col.door);
      }
      if (spec.kind === 'lighthouse' || has('lamp')) {
        s.disc(r - 0.5, y, r - 0.5, r - 1, 1, '#f2cd37');
        y += 3;
      }
      const top = roof(s, 0, y, 0, w, d, spec.roof, col.roof, col.trim);
      if (spec.kind === 'windmill' || has('sail')) {
        // four sails on the front: a cross of bricks, each arm as long as the mill is wide
        const hub = y - 6;
        const arm = Math.max(4, Math.round(r) + 3);
        s.c.set(Math.floor(r), hub, -1, col.trim);
        for (let k = 1; k <= arm; k++) {
          s.c.set(Math.floor(r) + k, hub, -1, col.accent);
          s.c.set(Math.floor(r) - k, hub, -1, col.accent);
          if (hub + k * 3 < 270) s.c.set(Math.floor(r), hub + k * 3, -1, col.accent);
          if (hub - k * 3 >= 0) s.c.set(Math.floor(r), hub - k * 3, -1, col.accent);
        }
      }
      if (has('flag')) flag(Math.floor(r), top, Math.floor(r));
      break;
    }
    case 'pyramid': {
      roof(s, 0, 0, 0, w, d, 'pyramid', col.main, col.trim);
      s.c.set(Math.floor(w / 2), Math.floor(Math.min(w, d) / 2), Math.floor(d / 2), col.trim, 1);
      break;
    }
    case 'bridge': {
      const span = w;
      for (let i = 0; i < span; i++) {
        const lift = Math.round(Math.sin((i / (span - 1)) * Math.PI) * 3);
        s.plate(i, 6 + lift, 0, 1, d, col.main);
        s.c.set(i, 7 + lift, 0, col.trim, 3);
        s.c.set(i, 7 + lift, d - 1, col.trim, 3);
      }
      for (const px of [0, span - 1]) for (const pz of [0, d - 1]) s.box(px, 0, pz, 1, 1, 2, col.accent);
      break;
    }
    case 'wall':
    case 'fence':
    case 'gate':
    case 'arch': {
      const layers = spec.kind === 'fence' ? 1 : f;
      if (spec.kind === 'fence') {
        for (let i = 0; i < w; i += 3) s.box(i, 0, 0, 1, 1, 2, col.main);
        s.plate(0, 4, 0, w, 1, col.main);
        break;
      }
      s.box(0, 0, 0, w, d, layers, col.main);
      if (spec.kind !== 'wall') {
        const dw = Math.max(2, Math.floor(w / 3));
        s.hole(Math.floor((w - dw) / 2), 0, 0, dw, d, layers - 1);
        if (spec.kind === 'gate') for (let i = 0; i < dw; i++) s.c.set(Math.floor((w - dw) / 2) + i, 0, 0, col.door, 3);
      }
      roof(s, 0, layers * 3, 0, w, d, spec.roof === 'battlements' ? 'battlements' : 'none', col.main, col.trim);
      break;
    }
    case 'well':
    case 'fountain': {
      const r = Math.min(w, d) / 2;
      s.disc(r - 0.5, 0, r - 0.5, r, 1, col.main, true);
      s.disc(r - 0.5, 0, r - 0.5, r - 1.2, 1, col.accent);
      if (spec.kind === 'fountain') {
        s.box(Math.floor(r) - 1, 3, Math.floor(r) - 1, 2, 2, 2, col.main);
        s.disc(r - 0.5, 9, r - 0.5, 1.6, 1, col.accent);
      } else {
        for (const px of [0, w - 1]) s.box(px, 3, Math.floor(r), 1, 1, 2, col.trim);
        roof(s, 0, 9, 0, w, d, 'gable', col.roof, col.trim);
      }
      break;
    }
    case 'statue':
    case 'throne': {
      s.box(0, 0, 0, w, d, 1, col.trim);
      if (spec.kind === 'throne') {
        s.box(0, 3, 0, w, d, 1, col.main);
        s.box(0, 6, d - 1, w, 1, 2, col.main);
        s.plate(1, 6, 0, w - 2, d - 1, col.accent);
        break;
      }
      // a figure on a plinth: legs, body, head
      const cx = Math.floor(w / 2) - 1;
      const cz = Math.floor(d / 2) - 1;
      s.box(cx, 3, cz, 2, 1, f + 1, col.main);
      s.box(cx - 1, 3 + (f + 1) * 3, cz, 4, 1, 2, col.main);
      s.box(cx, 3 + (f + 3) * 3, cz, 2, 1, 1, col.main);
      break;
    }
    case 'tree':
    case 'bush':
    case 'rock': {
      if (spec.kind === 'tree') {
        const cx = Math.floor(w / 2);
        s.box(cx - 1, 0, Math.floor(d / 2) - 1, 2, 2, f + 1, col.trim);
        s.blob(w / 2, (f + 1) * 3, d / 2, w / 2, f + 1, d / 2, col.main);
      } else if (spec.kind === 'bush') s.blob(w / 2, 0, d / 2, w / 2, 2, d / 2, col.main);
      else {
        s.blob(w / 2, 0, d / 2, w / 2, 2, d / 2, col.main);
        s.blob(w / 2 + 0.5, 3, d / 2, w / 3, 1, d / 3, col.trim);
      }
      break;
    }
    case 'car':
    case 'truck':
    case 'bus':
    case 'train':
    case 'cart': {
      s.plate(0, 2, 0, w, d, col.trim);
      const cab = spec.kind === 'truck' ? 4 : spec.kind === 'car' ? Math.ceil(w / 2) : w;
      if (spec.kind === 'cart') s.walls(0, 3, 0, w, d, 1, col.main);
      else {
        s.box(0, 3, 0, w, d, 1, col.main);
        const cx = spec.kind === 'car' ? Math.floor((w - cab) / 2) : 0;
        s.box(cx, 6, 0, cab, d, 1, col.main);
        if (has('windows'))
          for (let i = cx; i < cx + cab; i += 2) for (const zz of [0, d - 1]) s.c.set(i, 6, zz, col.window);
        s.plate(cx, 9, 0, cab, d, col.main, 'tile');
        if (spec.kind === 'truck') s.walls(cab, 6, 0, w - cab, d, 1, col.accent);
        if (spec.kind === 'train' && has('chimney')) s.box(1, 9, Math.floor(d / 2), 1, 1, 2, col.trim);
      }
      // wheels on both sides
      for (let i = 1; i < w - 1; i += Math.max(2, Math.floor((w - 2) / 2)))
        for (const zz of [-1, d]) s.box(i, 0, zz, 1, 1, 1, '#1b1b1b');
      break;
    }
    case 'boat':
    case 'ship': {
      // a hull: narrower at the keel and at the bow (x high), its sides rising above the deck
      const deep = spec.kind === 'ship' ? f + 1 : 1;
      for (let l = 0; l < deep; l++)
        for (let i = 0; i < w; i++) {
          const narrow = Math.max(0, i - (w - Math.ceil(d / 2) - 1));
          const shrink = Math.min(Math.floor(d / 2) - 1, Math.max(0, deep - 1 - l) + narrow);
          for (let j = shrink; j < d - shrink; j++) s.c.set(i, l * 3, j, l === deep - 1 ? col.main : col.trim);
        }
      const deck = deep * 3;
      s.plate(0, deck, 1, w - Math.ceil(d / 2), d - 2, col.trim, 'tile');
      // the sides above the deck
      for (let i = 0; i < w - Math.ceil(d / 2); i++) for (const zz of [0, d - 1]) s.c.set(i, deck, zz, col.main);
      if (spec.kind === 'ship') {
        // a cabin at the stern
        s.box(0, deck + 1, 1, 3, d - 2, 1, col.main);
        s.plate(0, deck + 4, 0, 4, d, col.trim);
      }
      if (spec.kind === 'ship' || has('sail')) {
        const mx = Math.floor(w / 2);
        const mz = Math.floor(d / 2);
        const tall = spec.kind === 'ship' ? 9 : 5;
        s.box(mx, deck + 1, mz, 1, 1, tall, col.trim);
        // a square sail across the ship, in front of the mast
        const half = Math.max(2, Math.floor(d / 2) + 1);
        for (let l = 2; l < tall - 1; l++)
          for (let j = -half; j <= half; j++) s.c.set(mx + 1, deck + 1 + l * 3, mz + j, col.accent, 3);
        if (has('flag')) flag(mx, deck + 1 + tall * 3, mz);
      }
      if (has('cannons'))
        for (let i = 4; i < w - 5; i += 3) for (const zz of [-1, d]) s.c.set(i, deck - 3, zz, '#1b1b1b');
      break;
    }
    case 'plane': {
      const cz = Math.floor(d / 2) - 1;
      s.box(0, 3, cz, w, 2, 1, col.main);
      s.plate(Math.floor(w / 2) - 2, 6, 0, 4, d, col.main);
      s.plate(0, 6, cz - 2, 2, 6, col.accent);
      s.box(0, 6, cz, 1, 2, 1, col.accent);
      if (has('windows')) for (let i = 3; i < w - 2; i += 2) s.c.set(i, 3, cz, col.window);
      for (const zz of [cz - 1, cz + 2]) s.box(Math.floor(w / 2), 0, zz, 1, 1, 1, '#1b1b1b');
      break;
    }
    case 'bench':
    case 'table':
    case 'bed': {
      for (const [cx, cz] of [
        [0, 0],
        [w - 1, 0],
        [0, d - 1],
        [w - 1, d - 1],
      ] as const)
        s.box(cx, 0, cz, 1, 1, 1, spec.kind === 'bench' ? col.trim : col.main);
      s.plate(0, 3, 0, w, d, col.main, spec.kind === 'table' ? 'tile' : 'plate');
      if (spec.kind === 'bench') s.box(0, 4, d - 1, w, 1, 1, col.main);
      if (spec.kind === 'bed') {
        s.plate(0, 4, 0, w, d, col.accent, 'tile');
        s.plate(0, 5, 0, w, Math.max(1, Math.floor(d / 4)), col.roof, 'tile');
        s.box(0, 4, 0, w, 1, 1, col.main);
      }
      break;
    }
    case 'crate':
    case 'chest':
    case 'barrel': {
      if (spec.kind === 'barrel') {
        const r = Math.min(w, d) / 2;
        s.disc(r - 0.5, 0, r - 0.5, r, f + 1, col.main);
        s.disc(r - 0.5, 3, r - 0.5, r, 1, col.trim, true);
        break;
      }
      s.box(0, 0, 0, w, d, f, col.main);
      if (spec.kind === 'chest') s.plate(0, f * 3, 0, w, d, col.trim, 'tile');
      else for (let i = 0; i < w; i++) s.c.set(i, 0, 0, col.trim);
      break;
    }
    case 'lamp':
    case 'sign': {
      if (spec.kind === 'lamp') {
        s.box(0, 0, 0, 1, 1, f + 1, col.main);
        s.c.set(0, (f + 1) * 3, 0, col.accent);
        s.plate(0, (f + 2) * 3, 0, 1, 1, col.main, 'tile');
      } else {
        s.box(Math.floor(w / 2), 0, 0, 1, 1, 2, col.main);
        s.box(0, 6, 0, w, 1, 1, col.accent);
      }
      break;
    }
  }
  return s;
}

/** the sizes v68 has, biggest first, as [cols (x), rows (z)] either way round */
const SIZES = [...BRICK_SIZES]
  .flatMap(([r, c]) =>
    r === c
      ? [[c, r, r, c]]
      : [
          [c, r, r, c],
          [r, c, r, c],
        ],
  )
  .sort((a, b) => b[0]! * b[1]! - a[0]! * a[1]!) as [number, number, number, number][];

/** cells merged into the biggest bricks of one colour and height that fit; never overlapping */
function mesh(cells: Cells): { type: string; x: number; y: number; z: number; rot: number; color: string }[] {
  const out: { type: string; x: number; y: number; z: number; rot: number; color: string }[] = [];
  const left = new Map<string, Cell & { x: number; y: number; z: number }>();
  for (const c of cells.cells()) left.set(`${c.x},${c.y},${c.z}`, c);
  const same = (a: Cell, x: number, y: number, z: number) => {
    const b = left.get(`${x},${y},${z}`);
    return !!b && b.color === a.color && b.h === a.h && b.kind === a.kind;
  };
  const order = [...left.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  for (const c of order) {
    if (!left.has(`${c.x},${c.y},${c.z}`)) continue;
    for (const [w, d, rows, cols] of SIZES) {
      let fits = true;
      for (let i = 0; i < w && fits; i++)
        for (let j = 0; j < d && fits; j++) if (!same(c, c.x + i, c.y, c.z + j)) fits = false;
      if (!fits) continue;
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) left.delete(`${c.x + i},${c.y},${c.z + j}`);
      // rot 0 lays the columns along x; rot 1 turns them along z
      const rot = w === cols && d === rows ? 0 : 1;
      out.push({ type: `${c.kind}${rows}x${cols}`, x: c.x, y: c.y, z: c.z, rot, color: c.color });
      break;
    }
  }
  return out;
}

/** An asset (bricks, palette, footprint) built from a spec, ready for asset.create. */
export function composeAsset(spec: AssetSpec, id: string): Asset {
  const bricks = mesh(shape(spec).c);
  // to the origin, ground at 0
  const x0 = Math.min(...bricks.map((b) => b.x));
  const z0 = Math.min(...bricks.map((b) => b.z));
  const y0 = Math.min(...bricks.map((b) => b.y));
  const types: string[] = [];
  const colors: string[] = [];
  const idx = (arr: string[], v: string) => {
    const i = arr.indexOf(v);
    return i >= 0 ? i : arr.push(v) - 1;
  };
  let w = 0;
  let d = 0;
  const out: AssetBrick[] = bricks.map((b) => {
    const m = /(\d+)x(\d+)$/.exec(b.type)!;
    const [rows, cols] = [Number(m[1]), Number(m[2])];
    const [bw, bd] = b.rot % 2 ? [rows, cols] : [cols, rows];
    w = Math.max(w, b.x - x0 + bw);
    d = Math.max(d, b.z - z0 + bd);
    return [idx(types, b.type), b.x - x0, b.y - y0, b.z - z0, b.rot, idx(colors, b.color), 0];
  });
  return {
    id: id as Asset['id'],
    name: spec.name,
    category: CATEGORY[spec.kind],
    bricks: out,
    palette: { types, colors },
    pivot: [0, 0, 0],
    footprint: [w, d],
    sockets: [],
    states: ['default'],
    initialState: 'default',
    interactions: [],
    smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
    generator: null,
    origin: 'user',
  };
}

/** what a spec is, in a few words for a match card: kind, size, floors, roof, features */
export function describeSpec(s: AssetSpec): [string, string][] {
  const out: [string, string][] = [['Kind', s.kind]];
  out.push([
    'Size',
    `${s.width} × ${s.depth} studs${s.floors > 1 ? `, ${s.floors} ${s.kind === 'ship' ? 'decks' : 'floors'}` : ''}`,
  ]);
  if (s.roof !== 'none') out.push(['Roof', s.roof]);
  if (s.features.length) out.push(['Has', s.features.join(', ')]);
  return out;
}
