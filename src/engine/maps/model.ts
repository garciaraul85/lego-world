/**
 * Milestone 3b (B7a-1): what a map shows, worked out from the world — the land seen from above (each stud's top
 * brick: its colour and height), floor by floor in a dungeon; where the hero has been; and its markers (chests,
 * keys, the boss, doors, ways out, region names, people, the player's pins, where to go next). Pure: the pause
 * map, the map in play and the editor's previews all draw from it.
 */
import { LEGACY_COLORS } from '../../core/legacy/constants';

/** a cell of where-the-hero-has-been, in studs (the same as a dungeon's rooms on the room plan) */
export const SEEN_CELL = 6;
/** a dungeon floor's height, in studs (bricks this far apart in height are on different floors) */
export const FLOOR_H = 7;

/** a height's floor (y in studs, as the hero's) */
export const floorOf = (y: number) => Math.floor((y + 1) / FLOOR_H);
/** a brick's y is in plates (0.4 studs) */
export const PLATE_Y = 0.4;
export const seenKey = (x: number, z: number, floor = 0) =>
  `${Math.floor(x / SEEN_CELL)},${Math.floor(z / SEEN_CELL)}${floor ? `@${floor}` : ''}`;

/** a marker on a map */
export type MapMarkerKind =
  | 'chest'
  | 'key'
  | 'boss-key'
  | 'boss'
  | 'door'
  | 'boss-door'
  | 'exit'
  | 'name'
  | 'person'
  | 'foe'
  | 'pin'
  | 'goal';
export type MapMarker = {
  kind: MapMarkerKind;
  x: number;
  z: number;
  y?: number;
  /** a name (a region, a way out, a pin's note) */
  label?: string;
  /** a chest opened, a door unlocked, the boss beaten */
  done?: boolean;
  /** a pin's stamp */
  stamp?: string;
  /** the compass shows it before the hero has been there (chests, keys, the boss in a dungeon) */
  compass?: boolean;
};

export { STAMPS, type Stamp } from '../../core/maps/notes';

export type MapPiece = {
  x: number;
  y: number;
  z: number;
  rows: number;
  cols: number;
  turn: number;
  color: number;
  hex?: string;
};

export type MapSource = {
  mapId: string;
  name: string;
  pieces: readonly MapPiece[];
  dungeon: boolean;
  /** where the hero has been (seenKey cells); null: all of it shows */
  seen: ReadonlySet<string> | null;
  /** the dungeon map item was found here (the whole dungeon shows) */
  hasMap?: boolean;
  /** the compass was found here (chests, keys and the boss show) */
  hasCompass?: boolean;
  markers: readonly MapMarker[];
  hero?: { x: number; y: number; z: number; heading: number };
};

/** the land seen from above: one cell per stud */
export type Top = {
  x0: number;
  z0: number;
  w: number;
  h: number;
  /** each cell's colour (#rrggbb), '' where there is no brick */
  color: string[];
  /** each cell's top height (NaN: none) */
  height: Float32Array;
  /** each cell is water (its colour is a water blue) */
  water: Uint8Array;
  lo: number;
  hi: number;
};

export type MapModel = MapSource & {
  /** the floors there are (a dungeon: each floor with bricks; else [0]) */
  floors: number[];
  /** the land of one floor (null: all floors together, from above) */
  top(floor: number | null): Top;
  /** this cell shows on the map (the hero has been there, or the map shows all) */
  shows(x: number, z: number, floor?: number): boolean;
  /** this marker shows (where it is shows, or the compass shows it) */
  showsMarker(m: MapMarker, floor?: number): boolean;
};

const colorOf = (p: MapPiece) => p.hex ?? LEGACY_COLORS[p.color]?.[1] ?? '#888888';

/** a water blue: blue clearly above red and green */
function watery(hex: string): boolean {
  const v = Number.parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return b > 110 && b > r + 40 && b > g + 10;
}

function buildTop(pieces: readonly MapPiece[], floor: number | null): Top {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of pieces) {
    const turned = p.turn % 2 === 1;
    const w = turned ? p.rows : p.cols;
    const d = turned ? p.cols : p.rows;
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x + w);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z + d);
  }
  if (!Number.isFinite(x0)) [x0, x1, z0, z1] = [-16, 16, -16, 16];
  x0 = Math.floor(x0);
  z0 = Math.floor(z0);
  const W = Math.max(1, Math.min(2048, Math.ceil(x1) - x0));
  const H = Math.max(1, Math.min(2048, Math.ceil(z1) - z0));
  const color: string[] = new Array(W * H).fill('');
  const height = new Float32Array(W * H).fill(Number.NaN);
  const water = new Uint8Array(W * H);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pieces) {
    // a floor: the bricks whose top is on it (its walls and floor), not those above or below
    if (floor !== null && floorOf(p.y * PLATE_Y) !== floor) continue;
    const turned = p.turn % 2 === 1;
    const w = turned ? p.rows : p.cols;
    const d = turned ? p.cols : p.rows;
    const c = colorOf(p);
    const wet = watery(c) ? 1 : 0;
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < d; dz++) {
        const cx = Math.floor(p.x + dx) - x0;
        const cz = Math.floor(p.z + dz) - z0;
        if (cx < 0 || cz < 0 || cx >= W || cz >= H) continue;
        const i = cz * W + cx;
        const cur = height[i]!;
        if (!(p.y < cur)) {
          height[i] = p.y;
          color[i] = c;
          water[i] = wet;
        }
      }
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  return { x0, z0, w: W, h: H, color, height, water, lo, hi };
}

/**
 * the model of a map, from what is in it; `tops`: the land worked out before, kept while the bricks are the same
 * (the map in play asks for a model every frame)
 */
export function mapModel(src: MapSource, tops: Map<string, Top> = new Map()): MapModel {
  // a dungeon's floors: those the hero has been on, and (its map found) those with a floor to stand on — many
  // bricks low in the floor's height (walls alone, reaching up from the floor below, do not make one)
  const fs = new Set<number>([0]);
  if (src.dungeon) {
    if (src.hero) fs.add(floorOf(src.hero.y));
    for (const k of src.seen ?? []) {
      const at = k.indexOf('@');
      if (at > 0) fs.add(Number(k.slice(at + 1)));
    }
    if (src.hasMap || !src.seen) {
      const low = new Map<number, number>();
      for (const p of src.pieces) {
        const y = p.y * PLATE_Y;
        const f = floorOf(y);
        if (y - f * FLOOR_H < 1.3) low.set(f, (low.get(f) ?? 0) + 1);
      }
      for (const [f, n] of low) if (n >= 30) fs.add(f);
    }
  }
  const floors = [...fs].sort((a, b) => a - b).slice(0, 9);
  const shows = (x: number, z: number, floor = 0) => {
    if (!src.seen) return true;
    if (src.dungeon && src.hasMap) return true;
    return src.seen.has(seenKey(x, z, floor));
  };
  return {
    ...src,
    floors: floors.length ? floors : [0],
    top(floor) {
      const k = String(floor);
      let t = tops.get(k);
      if (!t) {
        t = buildTop(src.pieces, floor);
        tops.set(k, t);
      }
      return t;
    },
    shows,
    showsMarker(m, floor = 0) {
      // goals and pins always show; names and ways out where the land shows
      if (m.kind === 'goal' || m.kind === 'pin') return true;
      const mf = src.dungeon && m.y !== undefined ? floorOf(m.y) : 0;
      if (src.dungeon && mf !== floor) return false;
      if (src.dungeon && src.hasCompass && (m.kind === 'chest' || m.kind.endsWith('key') || m.kind === 'boss'))
        return true;
      return shows(m.x, m.z, mf);
    },
  };
}
