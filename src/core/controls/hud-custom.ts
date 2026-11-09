import { z } from 'zod';
import { id } from '../schema/common';
import { BUTTONS, type Button, LAYOUTS } from './controls';
import { type ButtonFace, DEFAULT_HUD_STYLE, HUD_STYLE_INFO, HUD_STYLES, type HudStyle } from './hud-styles';

/**
 * Milestone 3b (v144): HUD styles of the maker's own. A style is a box of buttons: each button the game has wears
 * a face of the maker's choosing (a letter, a shape or a small symbol, its colour, its size) at a place in the box;
 * a button with no face is not shown. It names the button layout it plays with and the era whose HUD arrangement
 * (hearts, map, money) it takes. Kept in hudstyles/<id>.json, so it can go to My library and into other games.
 */
export const HUD_SIZES = ['big', 'mid', 'small'] as const;
export type HudSize = (typeof HUD_SIZES)[number];
/** a face's diameter on the HUD, by size */
export const HUD_SIZE_PX: Record<HudSize, number> = { big: 70, mid: 52, small: 34 };
export const MAX_HUD_STYLES = 24;

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'expected #rrggbb');

export const CustomFace = z.strictObject({
  /** what it wears: a letter or two, a shape (▲ ◀ ✚) or a small symbol */
  glyph: z.string().min(1).max(3),
  color: Hex,
  size: z.enum(HUD_SIZES),
  /** where its top left corner is in the box (px) */
  x: z.number().min(0).max(600),
  y: z.number().min(0).max(400),
});
export type CustomFace = z.infer<typeof CustomFace>;

export const CustomHud = z.strictObject({
  id: id('hudstyle'),
  name: z.string().min(1).max(40),
  /** the button layout it plays with */
  layout: z.enum(LAYOUTS),
  /** the era whose HUD arrangement it takes (hearts, map, money, where the buttons sit) */
  base: z.enum(HUD_STYLES),
  /** the box the buttons sit in (px) */
  w: z.number().int().min(60).max(600),
  h: z.number().int().min(60).max(400),
  /** what each button says (Action's word, an item's name) under it */
  labels: z.boolean(),
  /** a backing plate behind the buttons, and its colour (none: no plate) */
  plate: Hex.optional(),
  faces: z.partialRecord(z.enum(BUTTONS), CustomFace),
});
export type CustomHud = z.infer<typeof CustomHud>;

export const isEra = (v: unknown): v is HudStyle =>
  typeof v === 'string' && (HUD_STYLES as readonly string[]).includes(v);
export const isCustomHudId = (v: unknown): v is string => typeof v === 'string' && /^hsy_[0-9a-z]{10}$/.test(v);

/** where each era puts its buttons (as its HUD draws them), for a style of your own started from it */
const ERA_AT: Partial<Record<HudStyle, { w: number; h: number; at: Partial<Record<Button, [number, number]>> }>> = {
  corner64: {
    w: 320,
    h: 170,
    at: {
      attack: [0, 44],
      action: [78, 4],
      item1: [170, 40],
      item2: [222, 86],
      item3: [274, 40],
      lock: [0, 126],
      guard: [42, 126],
    },
  },
  cube: {
    w: 280,
    h: 190,
    at: {
      action: [110, 60],
      attack: [56, 128],
      item1: [206, 66],
      item2: [126, 0],
      item3: [212, 6],
      guard: [0, 10],
      lock: [42, 10],
    },
  },
  pointer: {
    w: 100,
    h: 340,
    at: { action: [15, 18], item1: [24, 112], attack: [24, 192], wheel: [8, 258], guard: [56, 258], lock: [33, 300] },
  },
};

/** a style of your own that starts as an era's (its faces, placed as that era places them) */
export function customFromEra(era: HudStyle, styleId: string, name: string): CustomHud {
  const info = HUD_STYLE_INFO[era];
  const at = ERA_AT[era];
  const faces: CustomHud['faces'] = {};
  const list = Object.entries(info.face) as [Button, ButtonFace][];
  list.forEach(([b, f], i) => {
    const size: HudSize = f.size ?? 'mid';
    // the eras drawn in a row (tablet) or a column (open air) are laid out the same way here
    const p: [number, number] =
      at?.at[b] ?? (era === 'tablet' ? [i * 66, size === 'small' ? 18 : size === 'big' ? 0 : 9] : [100, i * 40]);
    faces[b] = { glyph: f.glyph, color: f.color, size, x: p[0], y: p[1] };
  });
  const w = at?.w ?? (era === 'tablet' ? list.length * 66 + 10 : 140);
  const h = at?.h ?? (era === 'tablet' ? 90 : list.length * 40 + 10);
  return {
    id: styleId as CustomHud['id'],
    name,
    layout: info.layout,
    base: era,
    w,
    h,
    labels: true,
    ...(era === 'pointer' ? { plate: '#f2f4f8' } : {}),
    faces,
  };
}

/** a HUD style by id, as the game reads it: an era, or a style of the maker's own */
export type HudLook = { id: string; era: HudStyle | null; custom: CustomHud | null };

/** what a project's HUD style resolves to (unset, or a style that is gone: the open-air look) */
export function hudLookOf(styleId: string | undefined, get: (id: string) => CustomHud | undefined): HudLook {
  if (isEra(styleId)) return { id: styleId, era: styleId, custom: null };
  const c = isCustomHudId(styleId) ? get(styleId) : undefined;
  if (c) return { id: c.id, era: null, custom: c };
  return { id: DEFAULT_HUD_STYLE, era: DEFAULT_HUD_STYLE, custom: null };
}

/** the face a button wears in a look (none: an era shows it plainly; a style of your own leaves it out) */
export function faceInLook(look: HudLook, b: string): (ButtonFace & { x?: number; y?: number }) | null {
  if (look.custom) return (look.custom.faces as Record<string, CustomFace | undefined>)[b] ?? null;
  return (HUD_STYLE_INFO[look.era!].face as Record<string, ButtonFace | undefined>)[b] ?? null;
}
