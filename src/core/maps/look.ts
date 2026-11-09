/**
 * Milestone 3b (B7a-1): how the game's maps look — the pause map (a full screen) and the map in play (a corner of
 * the screen). Each comes in several types, each after a different Zelda game, and each is customizable: its
 * colours, frame, icons, fog, and which markers it shows. Set for the whole game in Project › Maps; a map can
 * choose its own (a dungeon uses its room plan by itself).
 */
import { z } from 'zod';

/** the pause map's types */
export const PAUSE_TYPES = ['screens', 'parchment', 'chart', 'contour', 'floors'] as const;
export type PauseType = (typeof PAUSE_TYPES)[number];
export const PAUSE_TYPE_INFO: Record<PauseType, { label: string; about: string }> = {
  screens: {
    label: 'Grid of screens',
    about: 'The world in square screens, each filled in once you have been there (the first games and the island one).',
  },
  parchment: {
    label: 'Parchment',
    about: 'A painted map on old paper, with names in ink and a compass rose (the top-down classics).',
  },
  chart: {
    label: 'Sea chart',
    about: 'A blue chart cut into lettered squares; each square is drawn in as you sail it (the sea one).',
  },
  contour: {
    label: 'Contour',
    about: 'A dark slate with height lines, a fine grid and glowing marks (the open-world ones).',
  },
  floors: {
    label: 'Room plan',
    about: 'A dungeon floor by floor: its rooms, doors, stairs, chests, keys and boss (every dungeon map).',
  },
};

/** the map in play's types */
export const MINI_TYPES = ['square', 'round', 'screens', 'off'] as const;
export type MiniType = (typeof MINI_TYPES)[number];
export const MINI_TYPE_INFO: Record<MiniType, { label: string; about: string }> = {
  square: { label: 'Square', about: 'The land around you, north up, in a corner (the 3D classics).' },
  round: {
    label: 'Round with compass',
    about: 'A round map with N, E, S, W on a ring; it can turn with the camera (the open-world ones).',
  },
  screens: {
    label: 'Grid of screens',
    about: 'The screens around the one you are on, filled in where you have been (the first games).',
  },
  off: { label: 'None', about: 'No map in play: it is only on the pause screen.' },
};

export const FRAMES = ['none', 'thin', 'wood', 'stone', 'gold', 'slate'] as const;
export const ICON_SETS = ['round', 'pixel', 'stamp'] as const;
export const FOGS = ['dark', 'paper', 'cloud', 'none'] as const;

/** what a map shows (each can be turned off) */
export const MARKER_KINDS = ['chests', 'keys', 'boss', 'doors', 'exits', 'names', 'people', 'pins', 'goal'] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];
export const MARKER_LABELS: Record<MarkerKind, string> = {
  chests: 'Chests (opened and not)',
  keys: 'Small keys and the boss key',
  boss: 'The boss (and once beaten)',
  doors: 'Locked doors and the boss door',
  exits: 'Ways out: stairs, doors to other maps',
  names: 'Region names',
  people: 'People and foes',
  pins: 'Pins and stamps the player puts down',
  goal: 'Where to go next (a tracked quest)',
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** a map's colours: the paper or ground behind it, water, walls, the fog, ink (lines, names) and its highlight */
export const MapColors = z.strictObject({
  back: hex,
  water: hex,
  wall: hex,
  fog: hex,
  ink: hex,
  accent: hex,
});
export type MapColors = z.infer<typeof MapColors>;

const Markers = z.partialRecord(z.enum(MARKER_KINDS), z.boolean());

export const PauseLook = z.strictObject({
  type: z.enum(PAUSE_TYPES),
  colors: MapColors.partial().optional(),
  frame: z.enum(FRAMES).optional(),
  icons: z.enum(ICON_SETS).optional(),
  fog: z.enum(FOGS).optional(),
  /** a lettered grid over it (A1, B2…) */
  grid: z.boolean().optional(),
  markers: Markers.optional(),
});
export type PauseLook = z.infer<typeof PauseLook>;

export const MiniLook = z.strictObject({
  type: z.enum(MINI_TYPES),
  colors: MapColors.partial().optional(),
  frame: z.enum(FRAMES).optional(),
  icons: z.enum(ICON_SETS).optional(),
  fog: z.enum(FOGS).optional(),
  /** its size on screen, in pixels (where it sits is the HUD screen's: Screens › HUD, its Minimap widget) */
  size: z.number().int().min(90).max(320).optional(),
  /** how much of the land it shows: studs across */
  span: z.number().min(16).max(400).optional(),
  /** a round map turns with the camera (else north is up) */
  turns: z.boolean().optional(),
  markers: Markers.optional(),
});
export type MiniLook = z.infer<typeof MiniLook>;

/** the game's maps (Project › Maps); `dungeon`: the pause map in dungeons (default: the room plan) */
export const MapLooks = z.strictObject({
  pause: PauseLook.optional(),
  mini: MiniLook.optional(),
  dungeon: PauseLook.optional(),
});
export type MapLooks = z.infer<typeof MapLooks>;

/** a map's own choice (Map tab): its pause map and map in play, over the game's */
export const MapLookOverride = z.strictObject({
  pause: PauseLook.optional(),
  mini: MiniLook.optional(),
});
export type MapLookOverride = z.infer<typeof MapLookOverride>;

/** each type's own colours, frame, icons and fog (what its look starts from) */
export const PAUSE_PRESETS: Record<
  PauseType,
  Required<Omit<PauseLook, 'type' | 'markers' | 'colors'>> & { colors: MapColors }
> = {
  screens: {
    colors: { back: '#1c2a1c', water: '#2f62c6', wall: '#3e3a32', fog: '#3a3f47', ink: '#f2f2e8', accent: '#e6352b' },
    frame: 'thin',
    icons: 'pixel',
    fog: 'dark',
    grid: false,
  },
  parchment: {
    colors: { back: '#e8d6ad', water: '#7fa7b5', wall: '#7a5c3a', fog: '#d9c597', ink: '#4a3420', accent: '#b0302a' },
    frame: 'wood',
    icons: 'stamp',
    fog: 'paper',
    grid: false,
  },
  chart: {
    colors: { back: '#2a6f9e', water: '#2a6f9e', wall: '#e8dcae', fog: '#1f557c', ink: '#f4f0dc', accent: '#ffd23f' },
    frame: 'gold',
    icons: 'stamp',
    fog: 'cloud',
    grid: true,
  },
  contour: {
    colors: { back: '#0f1d24', water: '#16384a', wall: '#3fd0d6', fog: '#0a1418', ink: '#bff7f5', accent: '#ffb341' },
    frame: 'slate',
    icons: 'round',
    fog: 'dark',
    grid: true,
  },
  floors: {
    colors: { back: '#0d1530', water: '#2a4fb0', wall: '#c9b98a', fog: '#05081a', ink: '#ffffff', accent: '#ff4b3b' },
    frame: 'stone',
    icons: 'pixel',
    fog: 'dark',
    grid: false,
  },
};

export const MINI_PRESETS: Record<
  MiniType,
  Required<Omit<MiniLook, 'type' | 'markers' | 'colors'>> & { colors: MapColors }
> = {
  square: {
    colors: { back: '#0b1020', water: '#2f62c6', wall: '#58534a', fog: '#05070d', ink: '#ffffff', accent: '#f7c900' },
    frame: 'thin',
    icons: 'round',
    fog: 'dark',
    size: 150,
    span: 64,
    turns: false,
  },
  round: {
    colors: { back: '#10232b', water: '#1d4a60', wall: '#7fe6e0', fog: '#081216', ink: '#e8fffd', accent: '#ffb341' },
    frame: 'slate',
    icons: 'round',
    fog: 'dark',
    size: 170,
    span: 72,
    turns: true,
  },
  screens: {
    colors: { back: '#1c2a1c', water: '#2f62c6', wall: '#3e3a32', fog: '#3a3f47', ink: '#f2f2e8', accent: '#e6352b' },
    frame: 'thin',
    icons: 'pixel',
    fog: 'dark',
    size: 140,
    span: 80,
    turns: false,
  },
  off: {
    colors: { back: '#000000', water: '#000000', wall: '#000000', fog: '#000000', ink: '#ffffff', accent: '#ffffff' },
    frame: 'none',
    icons: 'round',
    fog: 'none',
    size: 150,
    span: 64,
    turns: false,
  },
};

/** markers a type shows unless told otherwise */
const DEFAULT_MARKERS: Record<MarkerKind, boolean> = {
  chests: true,
  keys: true,
  boss: true,
  doors: true,
  exits: true,
  names: true,
  people: false,
  pins: true,
  goal: true,
};

/** a pause map's look in full: its type's preset with the game's (and the map's) choices over it */
export type FullPause = Required<Omit<PauseLook, 'markers' | 'colors'>> & {
  colors: MapColors;
  markers: Record<MarkerKind, boolean>;
};
export type FullMini = Required<Omit<MiniLook, 'markers' | 'colors'>> & {
  colors: MapColors;
  markers: Record<MarkerKind, boolean>;
};

function fullPause(l: PauseLook): FullPause {
  const p = PAUSE_PRESETS[l.type];
  return {
    type: l.type,
    colors: { ...p.colors, ...(l.colors ?? {}) } as MapColors,
    frame: l.frame ?? p.frame,
    icons: l.icons ?? p.icons,
    fog: l.fog ?? p.fog,
    grid: l.grid ?? p.grid,
    markers: { ...DEFAULT_MARKERS, ...(l.markers ?? {}) },
  };
}

/**
 * the pause map a map shows: its own choice, else (in a dungeon) the game's dungeon map or the room plan, else the
 * game's pause map (default: parchment)
 */
export function pauseLookOf(game: MapLooks | undefined, map: MapLookOverride | undefined, dungeon: boolean): FullPause {
  const l = map?.pause ?? (dungeon ? (game?.dungeon ?? { type: 'floors' }) : (game?.pause ?? { type: 'parchment' }));
  return fullPause(l);
}

/** the map in play a map shows: its own, else the game's (default: square) */
export function miniLookOf(game: MapLooks | undefined, map: MapLookOverride | undefined): FullMini {
  const l = map?.mini ?? game?.mini ?? { type: 'square' };
  const p = MINI_PRESETS[l.type];
  return {
    type: l.type,
    colors: { ...p.colors, ...(l.colors ?? {}) } as MapColors,
    frame: l.frame ?? p.frame,
    icons: l.icons ?? p.icons,
    fog: l.fog ?? p.fog,
    size: l.size ?? p.size,
    span: l.span ?? p.span,
    turns: l.turns ?? p.turns,
    markers: { ...DEFAULT_MARKERS, people: true, names: false, ...(l.markers ?? {}) },
  };
}
