import type { Button, Layout } from './controls';

/**
 * Milestone 3b (B7b): HUD styles after each era of 3D adventure games, oldest first — the corner buttons of the
 * 64-bit era, the big-button cluster of the cube era, the pointer and motion era, the two-screen tablet era and
 * today's open-air layout. Each is a button layout (which buttons there are), the face each button wears on the
 * HUD (its letter or shape and colour), how its buttons behave (the pointer era's item button opens the item wheel
 * when held; the tablet era's items are touched on its second screen; the open-air era jumps with a button of its
 * own and picks items from a quick menu), and a HUD screen arranged like the games of that era. All looks are
 * drawn here; nothing is taken from any game.
 */
export const HUD_STYLES = ['corner64', 'cube', 'pointer', 'tablet', 'openair'] as const;
export type HudStyle = (typeof HUD_STYLES)[number];
/** v144: a game that has not picked a style plays with the open-air look (there is no plain look any more) */
export const DEFAULT_HUD_STYLE: HudStyle = 'openair';

export type ButtonFace = {
  /** what it wears: a letter, or a shape (▲ ▼ ◀ ▶ ✚ 〰) */
  glyph: string;
  /** its colour */
  color: string;
  /** its size on the HUD: big for the main buttons */
  size?: 'big' | 'mid' | 'small';
};

export type HudStyleInfo = {
  name: string;
  era: string;
  about: string;
  /** the button layout it uses */
  layout: Layout;
  /** each button's face on the HUD (buttons not listed show plainly) */
  face: Partial<Record<Button, ButtonFace>>;
  /** how its buttons behave, in a line, for the Controls panel and Help */
  feel: string;
};

const BLUE = '#3f74e6';
const GREEN = '#2fae4e';
const YELLOW = '#f3c233';
const RED = '#d8483c';
const GREY = '#b8bfcc';
const PURPLE = '#7b5ad8';
const WHITE = '#eef2f8';

export const HUD_STYLE_INFO: Record<HudStyle, HudStyleInfo> = {
  corner64: {
    name: 'Corner buttons',
    era: '64-bit era',
    about:
      'Hearts and magic at the top left, money at the bottom left, the buttons in the top right corner — a green Attack, a blue Action that says what it does, and three yellow item buttons — and a square map in the bottom right.',
    layout: 'ocarina',
    face: {
      attack: { glyph: 'B', color: GREEN, size: 'big' },
      action: { glyph: 'A', color: BLUE, size: 'big' },
      item1: { glyph: '◀', color: YELLOW },
      item2: { glyph: '▼', color: YELLOW },
      item3: { glyph: '▶', color: YELLOW },
      lock: { glyph: 'Z', color: GREY, size: 'small' },
      guard: { glyph: 'R', color: GREY, size: 'small' },
    },
    feel: 'No jump button: the hero jumps by itself off ledges. The Action button changes with the moment; three item buttons, filled from the item menu.',
  },
  cube: {
    name: 'Big-button cluster',
    era: 'cube era',
    about:
      'A cluster in the top right around one big green Action button: a red Attack, two grey item buttons and a purple one, each item drawn in its button. Hearts and magic at the top left, money at the bottom left, a sea-chart map in the bottom right.',
    layout: 'cube',
    face: {
      action: { glyph: 'A', color: GREEN, size: 'big' },
      attack: { glyph: 'B', color: RED },
      item1: { glyph: 'X', color: GREY },
      item2: { glyph: 'Y', color: GREY },
      item3: { glyph: 'Z', color: PURPLE, size: 'small' },
      guard: { glyph: 'R', color: GREY, size: 'small' },
      lock: { glyph: 'L', color: GREY, size: 'small' },
    },
    feel: 'No jump button (the hero jumps by itself); the big Action button does what fits; three item buttons.',
  },
  pointer: {
    name: 'Pointer and motion',
    era: 'motion era',
    about:
      'A tall remote-shaped strip on the right: the Action button on top, the item button under it (hold it for the item wheel), and the swing to attack. Hearts at the top left with a stamina ring that shows by the hero, the map in the bottom right.',
    layout: 'pointer',
    face: {
      action: { glyph: 'A', color: WHITE, size: 'big' },
      item1: { glyph: 'B', color: WHITE },
      attack: { glyph: '〰', color: '#9fd8ff' },
      lock: { glyph: 'Z', color: GREY, size: 'small' },
      guard: { glyph: 'C', color: GREY, size: 'small' },
      wheel: { glyph: '−', color: GREY, size: 'small' },
    },
    feel: 'Tap the item button to use its item; hold it and the item wheel opens to pick another (point and let go). The attack is a swing.',
  },
  tablet: {
    name: 'Second screen',
    era: 'tablet era',
    about:
      'Little on the game itself — hearts at the top left and the main buttons in the top right — and a second screen at the bottom: the map and the items, touched to use them.',
    layout: 'tablet',
    face: {
      action: { glyph: 'A', color: GREEN, size: 'big' },
      attack: { glyph: 'B', color: RED },
      item1: { glyph: 'X', color: GREY },
      item2: { glyph: 'Y', color: GREY },
      item3: { glyph: 'R', color: GREY },
      lock: { glyph: 'L', color: GREY, size: 'small' },
    },
    feel: 'The items are on the second screen: touch one to use it (or press its button); the map is there too, always open.',
  },
  openair: {
    name: 'Open air',
    era: 'open-air era',
    about:
      'Hearts in a row at the top left, a stamina wheel beside the hero while it runs or climbs, a round-cornered map in the bottom right, and small button hints in the bottom right corner — Action says what it does, the rest only their names.',
    layout: 'modern',
    face: {
      action: { glyph: 'A', color: WHITE, size: 'small' },
      jump: { glyph: 'X', color: WHITE, size: 'small' },
      attack: { glyph: 'Y', color: WHITE, size: 'small' },
      roll: { glyph: 'B', color: WHITE, size: 'small' },
      guard: { glyph: 'ZR', color: WHITE, size: 'small' },
      lock: { glyph: 'ZL', color: WHITE, size: 'small' },
      item1: { glyph: 'R', color: WHITE, size: 'small' },
      item2: { glyph: 'L', color: WHITE, size: 'small' },
      wheel: { glyph: '✚', color: WHITE, size: 'small' },
    },
    feel: 'A jump button of its own; the quick menu (✚) picks what goes in the two item buttons; the stamina wheel shows only while it is used.',
  },
};

/** v144: the face of a button an era does not draw (a layout with more item buttons than the era had) */
export const plainFace = (b: string): ButtonFace => ({
  glyph: /^item(\d)$/.test(b) ? b.slice(4) : (b[0] ?? '?').toUpperCase(),
  color: '#8a93a6',
  size: 'small',
});

/** the face a button wears in a style (none: shown plainly) */
export const faceOf = (style: HudStyle | undefined, b: string): ButtonFace | null =>
  style ? ((HUD_STYLE_INFO[style].face as Record<string, ButtonFace | undefined>)[b] ?? null) : null;
