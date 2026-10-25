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
  set(
    x: number,
    y: number,
    z: number,
    color: string,
    h: 1 | 3 = 3,
    kind: Cell['kind'] = h === 3 ? 'brick' : 'plate',
    soft = false,
  ) {
    // things in front of a wall (sails, awnings, wheels) go below 0: the asset is moved to start at 0 after
    if (x < -16 || z < -16 || y < 0 || x >= 80 || z >= 80 || y > 270) return;
    // a soft cell (a roof, a floor) does not cut into what is already built
    if (soft) for (let k = 0; k < h; k++) if (this.map.has(`${x},${y + k},${z}`)) return;
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
  plate(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: string,
    kind: 'plate' | 'tile' = 'plate',
    soft = false,
  ) {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this.c.set(x + i, y, z + j, color, 1, kind, soft);
  }
  /** a ring of plates one stud wide (a floor on the walls; the inside is not seen) */
  ring(x: number, y: number, z: number, w: number, d: number, color: string) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++)
        if (i === 0 || j === 0 || i === w - 1 || j === d - 1) this.c.set(x + i, y, z + j, color, 1, 'plate', true);
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
  /** the top of what is built in a column (0: the ground) — where something stood there rests */
  topOf(x: number, z: number) {
    let top = 0;
    for (const c of this.c.cells()) if (c.x === x && c.z === z && c.kind !== 'tile') top = Math.max(top, c.y + c.h);
    return top;
  }
  /** a pole of bricks standing on whatever is below (x, z), `layers` tall */
  post(x: number, z: number, layers: number, color: string, from?: number) {
    const y = from ?? this.topOf(x, z);
    for (let l = 0; l < layers; l++) this.c.set(x, y + l * 3, z, color);
    return y + layers * 3;
  }
  hole(x: number, y: number, z: number, w: number, d: number, layers: number) {
    for (let l = 0; l < layers * 3; l++)
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this.c.clear(x + i, y + l, z + j);
  }
}

/**
 * a roof over x..x+w, z..z+d resting at height y; returns the top. Every step overlaps the one below (studs hold
 * it): a gable rises in shrinking plates from the front and back to a ridge, a pyramid from every side.
 */
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
    // plates on the walls, smooth tiles on them
    s.plate(x, y, z, w, d, trim, 'plate', true);
    s.plate(x + 1, y + 1, z + 1, Math.max(1, w - 2), Math.max(1, d - 2), color, 'tile', true);
    return y + 1;
  }
  if (style === 'battlements') {
    s.ring(x, y, z, w, d, trim);
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++)
        if ((i === 0 || j === 0 || i === w - 1 || j === d - 1) && (i + j) % 2 === 0)
          s.c.set(x + i, y + 1, z + j, color, 3, 'brick', true);
    return y + 1;
  }
  if (style === 'gable') {
    let k = 0;
    for (; 2 * k < d; k++) s.plate(x, y + k, z + k, w, d - 2 * k, color, 'plate', true);
    return y + k;
  }
  if (style === 'pyramid') {
    let k = 0;
    for (; 2 * k < Math.min(w, d); k++) s.plate(x + k, y + k, z + k, w - 2 * k, d - 2 * k, color, 'plate', true);
    return y + k;
  }
  // dome: shrinking discs of bricks, each on the one below
  const r = Math.min(w, d) / 2;
  for (let k = 0; k < 3; k++)
    s.disc(
      x + w / 2 - 0.5,
      y + k * 3,
      z + d / 2 - 0.5,
      Math.max(0.6, r * Math.cos((k / 3) * (Math.PI / 2)) + 0.3),
      1,
      color,
    );
  return y + 9;
}

/** windows along the walls of a floor (every few studs, one brick tall), and the door in front */
function openings(s: Shaper, spec: AssetSpec, x: number, y: number, z: number, w: number, d: number, floor: number) {
  const { colors } = spec;
  if (spec.features.includes('windows'))
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

/** Builds a spec into cells: each kind its own recipe, every brick resting on studs. */
function shape(spec: AssetSpec): Shaper {
  const s = new Shaper();
  const { width: w, depth: d, floors: f, colors: col, features: F } = spec;
  const has = (x: (typeof ASSET_FEATURES)[number]) => F.includes(x);
  /** a flag on a pole standing on whatever is at (x, z) */
  const flag = (x: number, z: number) => {
    const top = s.post(x, z, 3, '#1b1b1b');
    // the cloth: a plate on the pole's top, reaching out
    s.plate(x, top, z, 3, 1, col.accent);
  };
  switch (spec.kind) {
    case 'house':
    case 'cottage':
    case 'shop':
    case 'barn':
    case 'skyscraper':
    case 'castle':
    case 'hut':
    case 'tent': {
      s.plate(0, 0, 0, w, d, spec.kind === 'castle' ? col.trim : '#6c6e68');
      let y = 1;
      const floorLayers = spec.kind === 'skyscraper' ? 2 : 3;
      for (let fl = 0; fl < f; fl++) {
        s.walls(0, y, 0, w, d, floorLayers, col.main);
        openings(s, spec, 0, y, 0, w, d, fl);
        if (fl === 0 && has('clock')) s.c.set(Math.floor(w / 2), y + floorLayers * 3 - 3, 0, '#f4f4f4');
        y += floorLayers * 3;
        // a floor plate on the walls (the balcony is the floor reaching out at the front)
        if (fl < f - 1) {
          s.ring(0, y, 0, w, d, col.trim);
          if (has('balcony') && fl === 0) s.plate(1, y, -2, Math.min(8, w - 2), 3, col.trim);
          y += 1;
        }
      }
      if (spec.kind === 'castle') {
        // corner towers taller than the walls, flags on them
        const th = f * 3 + 2;
        for (const [cx, cz] of [
          [0, 0],
          [w - 3, 0],
          [0, d - 3],
          [w - 3, d - 3],
        ] as const) {
          s.box(cx, 1, cz, 3, 3, th, col.main);
          roof(s, cx, 1 + th * 3, cz, 3, 3, 'battlements', col.main, col.trim);
        }
        if (has('flag')) flag(1, 1);
      }
      if (has('garden'))
        for (let i = 0; i < w; i += 2) {
          s.plate(i, 0, -3, 2, 2, '#237841');
          s.c.set(i, 1, -3, i % 4 ? '#c91a09' : '#f2cd37', 1);
        }
      // a sign on a post in front
      if (has('sign')) {
        const sx = Math.max(0, Math.floor(w / 2) - 4);
        const top = s.post(sx, -4, 2, col.trim, 0);
        s.box(sx - 1, top, -4, 4, 1, 1, col.accent);
      }
      const top = roof(s, 0, y, 0, w, d, spec.roof, col.roof, col.trim);
      // a shop's awning: striped plates on the roof's front edge, reaching out over the door
      if (has('awning'))
        for (let i = 0; i < w; i++) {
          const ay = s.topOf(i, 0);
          for (let j = -2; j <= 0; j++) s.c.set(i, ay, j, i % 2 ? col.accent : '#f4f4f4', 1, 'plate', true);
        }
      // a chimney on the back wall, up through the roof
      if (has('chimney')) s.post(w - 2, d - 1, Math.max(2, Math.ceil((top - y) / 3) + 1), col.trim, y);
      if (has('flag') && spec.kind !== 'castle') flag(Math.floor(w / 2), Math.floor(d / 2));
      break;
    }
    case 'temple': {
      // steps, a floor, columns, a beam on them, a roof
      s.plate(0, 0, 0, w, d, col.main);
      s.plate(1, 1, 1, w - 2, d - 2, col.main);
      for (let i = 1; i < w - 1; i += 3) for (const zz of [1, d - 2]) s.box(i, 2, zz, 1, 1, 4, col.main);
      s.plate(0, 14, 0, w, d, col.trim);
      roof(s, 0, 15, 0, w, d, spec.roof === 'none' ? 'gable' : spec.roof, col.roof, col.trim);
      break;
    }
    case 'stall': {
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
      if (has('door'))
        for (const dx of [Math.floor(r) - 1, Math.floor(r)]) for (const l of [0, 3]) s.c.set(dx, l, 0, col.door);
      // a floor across the top, then the lamp room
      s.plate(0, y, 0, w, d, col.trim);
      y += 1;
      const lamp = spec.kind === 'lighthouse' || has('lamp');
      if (lamp) {
        s.disc(r - 0.5, y, r - 0.5, Math.max(1, r - 1), 1, '#f2cd37');
        y += 3;
      }
      // the roof on the lamp room is as wide as the lamp
      const top = lamp
        ? roof(s, 1, y, 1, Math.max(1, w - 2), Math.max(1, d - 2), spec.roof, col.roof, col.trim)
        : roof(s, 0, y, 0, w, d, spec.roof, col.roof, col.trim);
      if (spec.kind === 'windmill' || has('sail')) {
        // four sails in front: the lower one a post from the ground, across it one 8-stud plate, the upper on it
        const ax = Math.floor(r);
        const hub = s.post(ax, -2, Math.max(2, Math.floor((y - 6) / 3)), col.accent, 0);
        s.plate(ax - 4, hub, -2, 8, 1, col.accent);
        s.post(ax, -2, 4, col.accent, hub + 1);
      }
      if (has('flag')) flag(Math.floor(r), Math.floor(r));
      void top;
      break;
    }
    case 'pyramid': {
      roof(s, 0, 0, 0, w, d, 'pyramid', col.main, col.trim);
      break;
    }
    case 'bridge': {
      // a deck on piers every few studs, railings on it
      for (let i = 0; i < w; i += 4) for (const pz of [0, d - 1]) s.box(Math.min(i, w - 1), 0, pz, 1, 1, 2, col.accent);
      s.box(w - 1, 0, 0, 1, 1, 2, col.accent);
      s.box(w - 1, 0, d - 1, 1, 1, 2, col.accent);
      s.plate(0, 6, 0, w, d, col.main);
      for (let i = 0; i < w; i++) for (const zz of [0, d - 1]) s.c.set(i, 7, zz, col.trim, 3);
      break;
    }
    case 'fence': {
      for (let i = 0; i < w; i += 3) s.box(i, 0, 0, 1, 1, 2, col.main);
      s.box(w - 1, 0, 0, 1, 1, 2, col.main);
      s.plate(0, 6, 0, w, 1, col.main);
      break;
    }
    case 'wall':
    case 'gate':
    case 'arch': {
      const layers = Math.max(2, f);
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
      s.disc(r - 0.5, 0, r - 0.5, Math.max(0.6, r - 1.2), 1, col.accent);
      if (spec.kind === 'fountain') {
        s.box(Math.floor(r) - 1, 3, Math.floor(r) - 1, 2, 2, 2, col.main);
        s.plate(Math.floor(r) - 2, 9, Math.floor(r) - 2, 4, 4, col.accent);
      } else {
        for (const px of [0, w - 1]) s.box(px, 3, Math.floor(r), 1, 1, 2, col.trim);
        s.plate(0, 9, 0, w, d, col.trim);
        roof(s, 0, 10, 0, w, d, 'gable', col.roof, col.trim);
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
      const cx = Math.max(0, Math.floor(w / 2) - 1);
      const cz = Math.max(0, Math.floor(d / 2) - 1);
      s.box(cx, 3, cz, 2, 1, f + 1, col.main);
      s.box(cx - 1, 3 + (f + 1) * 3, cz, 4, 1, 2, col.main);
      s.box(cx, 3 + (f + 3) * 3, cz, 2, 1, 1, col.main);
      break;
    }
    case 'tree':
    case 'bush':
    case 'rock': {
      if (spec.kind === 'tree') {
        const cx = Math.max(0, Math.floor(w / 2) - 1);
        const cz = Math.max(0, Math.floor(d / 2) - 1);
        s.box(cx, 0, cz, 2, 2, f + 1, col.trim);
        // the leaves: layers of plates and bricks, each wider in the middle, all over the trunk
        const base = (f + 1) * 3;
        const layers = f + 1;
        for (let l = 0; l < layers; l++) {
          const k = Math.sin(((l + 0.5) / layers) * Math.PI) * 0.55 + 0.45;
          const rw = Math.max(1, Math.round((w / 2) * k));
          const rd = Math.max(1, Math.round((d / 2) * k));
          s.box(cx + 1 - rw, base + l * 3, cz + 1 - rd, rw * 2, rd * 2, 1, col.main);
        }
      } else if (spec.kind === 'bush') {
        s.box(0, 0, 0, w, d, 1, col.main);
        if (w > 2 && d > 2) s.box(1, 3, 1, w - 2, d - 2, 1, col.main);
      } else {
        s.box(0, 0, 0, w, d, 1, col.main);
        if (w > 2 && d > 2) s.box(1, 3, 1, w - 2, d - 2, 1, col.trim);
      }
      break;
    }
    case 'car':
    case 'truck':
    case 'bus':
    case 'train':
    case 'cart': {
      // wheels under the corners, a chassis on them, the body on the chassis
      const step = Math.max(2, Math.floor((w - 2) / 2));
      for (let i = 1; i < w - 1; i += step) for (const zz of [0, d - 1]) s.box(i, 0, zz, 1, 1, 1, '#1b1b1b');
      s.plate(0, 3, 0, w, d, col.trim);
      if (spec.kind === 'cart') s.walls(0, 4, 0, w, d, 1, col.main);
      else {
        s.box(0, 4, 0, w, d, 1, col.main);
        const cab = spec.kind === 'truck' ? Math.min(4, w) : spec.kind === 'car' ? Math.ceil(w / 2) : w;
        const cx = spec.kind === 'car' ? Math.floor((w - cab) / 2) : 0;
        s.box(cx, 7, 0, cab, d, 1, col.main);
        if (has('windows'))
          for (let i = cx; i < cx + cab; i += 2) for (const zz of [0, d - 1]) s.c.set(i, 7, zz, col.window);
        s.plate(cx, 10, 0, cab, d, col.main);
        if (spec.kind === 'truck' && w > cab) s.walls(cab, 7, 0, w - cab, d, 1, col.accent);
        if (spec.kind === 'train' && has('chimney')) s.post(1, Math.floor(d / 2), 2, col.trim, 11);
      }
      break;
    }
    case 'boat':
    case 'ship': {
      // a hull: each layer wider than the one under it, narrower at the bow (x high)
      const deep = spec.kind === 'ship' ? f + 1 : 1;
      for (let l = 0; l < deep; l++)
        for (let i = 0; i < w; i++) {
          const narrow = Math.max(0, i - (w - Math.ceil(d / 2) - 1));
          const shrink = Math.min(
            Math.floor(d / 2) - 1,
            Math.max(0, deep - 1 - l) + Math.max(0, narrow - (deep - 1 - l)),
          );
          for (let j = shrink; j < d - shrink; j++) s.c.set(i, l * 3, j, l === deep - 1 ? col.main : col.trim);
        }
      const deck = deep * 3;
      s.plate(0, deck, 1, w - Math.ceil(d / 2), Math.max(1, d - 2), col.trim);
      for (let i = 0; i < w - Math.ceil(d / 2); i++) for (const zz of [0, d - 1]) s.c.set(i, deck, zz, col.main);
      if (spec.kind === 'ship') {
        s.box(0, deck + 1, 1, 3, Math.max(1, d - 2), 1, col.main);
        s.plate(0, deck + 4, 1, 3, Math.max(1, d - 2), col.trim);
      }
      if (spec.kind === 'ship' || has('sail')) {
        const mx = Math.floor(w / 2) - 1;
        const mz = Math.floor(d / 2);
        const tall = spec.kind === 'ship' ? 8 : 4;
        const top = s.post(mx, mz, tall, col.trim, deck + 1);
        // a yard across the mast's top (one plate), the sail hanging from it
        // the yard is one 2×4 or 2×6 plate, so the whole sail hangs from the mast
        const span = d >= 6 ? 6 : 4;
        const z0 = mz - span / 2;
        s.plate(mx, top, z0, 2, span, col.trim);
        for (let l = 1; l < tall - 1; l++)
          for (let j = 0; j < span; j++) s.c.set(mx + 1, top - l * 3, z0 + j, col.accent, 3);
        if (has('flag')) flag(mx, mz);
      }
      if (has('cannons'))
        for (let i = 4; i < w - Math.ceil(d / 2) - 1; i += 3)
          for (const zz of [1, d - 2]) s.c.set(i, deck + 1, zz, '#1b1b1b');
      break;
    }
    case 'plane': {
      const cz = Math.max(3, Math.floor(d / 2) - 1);
      // wheels under the body, the body, wings across it (one plate a side of the body), a tail
      // wheels at the front, middle and back; a solid lower body on them; windows in the upper body
      for (const wx of [1, Math.floor(w / 2), w - 2]) s.box(wx, 0, cz, 1, 2, 1, '#1b1b1b');
      s.box(0, 3, cz, w, 2, 1, col.main);
      s.box(0, 6, cz, w, 2, 1, col.main);
      if (has('windows')) for (let i = 3; i < w - 2; i += 2) s.c.set(i, 6, cz, col.window);
      const mid = Math.floor(w / 2) - 2;
      s.plate(mid, 9, cz - 3, 4, 8, col.main);
      s.plate(0, 9, cz - 1, 2, 4, col.accent);
      s.box(0, 10, cz, 1, 2, 1, col.accent);
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
        s.plate(0, 4, 1, w, d - 1, col.accent);
        s.plate(0, 5, 1, w, Math.max(1, Math.floor(d / 4)), col.roof, 'tile');
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
        s.disc(r - 0.5, 3, r - 0.5, r, 1, col.trim);
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
        const px = Math.floor(w / 2);
        const top = s.post(px, 0, 2, col.main, 0);
        s.box(Math.max(0, px - 2), top, 0, Math.min(4, w), 1, 1, col.accent);
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

/**
 * Only the bricks held by studs to the ground (y 0) through one another — v68's rule for every build; a brick
 * a recipe left touching only at its side is dropped rather than make the asset impossible to place.
 */
export function heldBricks<T extends { type: string; x: number; y: number; z: number; rot: number }>(list: T[]): T[] {
  const tops = new Map<string, number[]>();
  const bottoms = new Map<string, number[]>();
  const add = (m: Map<string, number[]>, k: string, i: number) => {
    const l = m.get(k);
    if (l) l.push(i);
    else m.set(k, [i]);
  };
  list.forEach((b, i) => {
    const m = /(\d+)x(\d+)$/.exec(b.type)!;
    const [rows, cols] = [Number(m[1]), Number(m[2])];
    const [w, d] = b.rot % 2 ? [rows, cols] : [cols, rows];
    const h = b.type.startsWith('brick') ? 3 : 1;
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        add(bottoms, `${b.x + x},${b.y},${b.z + z}`, i);
        if (!b.type.startsWith('tile')) add(tops, `${b.x + x},${b.y + h},${b.z + z}`, i);
      }
  });
  const adj: number[][] = list.map(() => []);
  for (const [k, under] of tops)
    for (const over of bottoms.get(k) ?? [])
      for (const u of under)
        if (u !== over) {
          adj[u]!.push(over);
          adj[over]!.push(u);
        }
  const y0 = Math.min(...list.map((b) => b.y));
  const seen = new Uint8Array(list.length);
  const queue: number[] = [];
  list.forEach((b, i) => {
    if (b.y === y0) {
      seen[i] = 1;
      queue.push(i);
    }
  });
  for (let j = 0; j < queue.length; j++)
    for (const n of adj[queue[j]!]!)
      if (!seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
  return list.filter((_, i) => seen[i]);
}

type Placed = { type: string; x: number; y: number; z: number; rot: number; color: string };
const dims = (b: Placed) => {
  const m = /(\d+)x(\d+)$/.exec(b.type)!;
  const [rows, cols] = [Number(m[1]), Number(m[2])];
  return { w: b.rot % 2 ? rows : cols, d: b.rot % 2 ? cols : rows, h: b.type.startsWith('brick') ? 3 : 1 };
};
/**
 * A brick nothing holds (the middle of a long table, a wide chassis, a big roof) gets a thin support column of
 * 1×1 bricks and plates down to the ground under it, where that column is free — an extra leg or post.
 */
function underpin(list: Placed[], color: string): Placed[] {
  let out = list;
  for (let round = 0; round < 4; round++) {
    const held = new Set(heldBricks(out));
    const loose = out.filter((b) => !held.has(b));
    if (!loose.length) break;
    const filled = new Set<string>();
    for (const b of out) {
      const { w, d, h } = dims(b);
      for (let i = 0; i < w; i++)
        for (let j = 0; j < d; j++) for (let k = 0; k < h; k++) filled.add(`${b.x + i},${b.y + k},${b.z + j}`);
    }
    const y0 = Math.min(...out.map((b) => b.y));
    const added: Placed[] = [];
    for (const b of loose) {
      const { w, d } = dims(b);
      // the middle first, then the corners
      const spots = [
        [Math.floor(w / 2), Math.floor(d / 2)],
        [0, 0],
        [w - 1, d - 1],
        [w - 1, 0],
        [0, d - 1],
      ];
      for (const [i, j] of spots) {
        const x = b.x + i!;
        const z = b.z + j!;
        // it stands on whatever is highest below (or the ground)
        let base = y0;
        for (let y = b.y - 1; y >= y0; y--)
          if (filled.has(`${x},${y},${z}`)) {
            base = y + 1;
            break;
          }
        if (base >= b.y) continue;
        let y = base;
        while (y < b.y) {
          const tall = b.y - y >= 3;
          added.push({ type: tall ? 'brick1x1' : 'plate1x1', x, y, z, rot: 0, color });
          for (let k = 0; k < (tall ? 3 : 1); k++) filled.add(`${x},${y + k},${z}`);
          y += tall ? 3 : 1;
        }
        break;
      }
    }
    if (!added.length) break;
    out = [...out, ...added];
  }
  return out;
}

/** An asset (bricks, palette, footprint) built from a spec, ready for asset.create. */
export function composeAsset(spec: AssetSpec, id: string): Asset {
  const bricks = heldBricks(underpin(mesh(shape(spec).c), spec.colors.trim));
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

/** for tests: the bricks a spec meshes into before the stud rule */
export const __mesh = (spec: AssetSpec) => underpin(mesh(shape(spec).c), spec.colors.trim);
