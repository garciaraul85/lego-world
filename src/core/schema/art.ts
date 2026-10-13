import { z } from 'zod';
import { id, MediaRef } from './common';

/** #rrggbb or #rrggbbaa */
const Hex = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i, 'expected #rrggbb or #rrggbbaa');

/** Pixel art: one character per pixel, row by row: '.' is see-through, the rest index PIXEL_KEYS into palette. */
export const PIXEL_KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const ArtSource = z.discriminatedUnion('type', [
  /** an imported picture or icon (png, jpg, webp, svg) */
  z.strictObject({ type: z.literal('image'), media: MediaRef }),
  /** a generated background */
  z.strictObject({
    type: z.literal('pattern'),
    pattern: z.enum(['solid', 'linear', 'radial', 'stripes', 'dots', 'checks', 'bricks', 'waves', 'grid', 'stars']),
    colors: z.array(Hex).min(1).max(4),
    /** degrees, for gradients and stripes */
    angle: z.number().min(0).max(360),
    /** size of the repeat, px */
    scale: z.number().min(4).max(400),
  }),
  /** drawn pixel art (icons and drawn backgrounds) */
  z.strictObject({
    type: z.literal('pixels'),
    w: z.number().int().min(4).max(256),
    h: z.number().int().min(4).max(256),
    palette: z.array(Hex).min(1).max(62),
    data: z.string(),
  }),
  /** an imported font file (ttf, otf, woff, woff2) */
  z.strictObject({ type: z.literal('fontFile'), media: MediaRef, family: z.string().min(1).max(60) }),
  /** a pixel font designed in the editor; written out as a TrueType font */
  z.strictObject({
    type: z.literal('pixelFont'),
    cellW: z.number().int().min(3).max(16),
    cellH: z.number().int().min(4).max(20),
    /** rows above the baseline */
    baseline: z.number().int().min(1).max(20),
    /** extra columns between letters */
    spacing: z.number().int().min(0).max(4),
    /** one string of rows per character: '#' on, '.' off, rows joined with '|' */
    glyphs: z.record(z.string().length(1), z.string()),
  }),
]);

/** art/<artId>.json — a background, an icon or a font the game's screens use (P31). */
export const Art = z.strictObject({
  id: id('art'),
  name: z.string().min(1).max(60),
  kind: z.enum(['background', 'icon', 'font']),
  source: ArtSource,
});
export type Art = z.infer<typeof Art>;
export type ArtSource = z.infer<typeof ArtSource>;
