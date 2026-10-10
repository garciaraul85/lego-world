import type { Widget } from '../../core/schema';

/** Screens are laid out at a 1280×720 reference and scaled to fit (P5.7). */
export const REF_W = 1280;
export const REF_H = 720;

export type Insets = { top: number; right: number; bottom: number; left: number };
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * scale = min(w/1280, h/720); the virtual canvas keeps the reference size on the tight axis and grows
 * on the other, so anchors still hug the real screen edges on phones and ultrawide monitors.
 */
export function screenScale(w: number, h: number, safe: Insets = NO_INSETS) {
  const iw = Math.max(1, w - safe.left - safe.right);
  const ih = Math.max(1, h - safe.top - safe.bottom);
  const scale = Math.min(iw / REF_W, ih / REF_H);
  return { scale, vw: iw / scale, vh: ih / scale, x: safe.left, y: safe.top };
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Where an anchored widget of size (w, h) lands inside its parent (reference px). Pivot = anchor. */
export function placeRect(widget: Pick<Widget, 'anchor' | 'offset'>, parent: Rect, w: number, h: number): Rect {
  const [ax, ay] = widget.anchor ?? [0, 0];
  const [ox, oy] = widget.offset ?? [0, 0];
  return { x: parent.x + ax * parent.w + ox - ax * w, y: parent.y + ay * parent.h + oy - ay * h, w, h };
}

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);

/** CSS for one widget: anchored widgets are absolutely placed, others flow in their parent panel. */
export function widgetCss(w: Widget): Record<string, string | number> {
  const s = w.style ?? {};
  const css: Record<string, string | number> = {};
  if (w.anchor) {
    const [ax, ay] = w.anchor;
    const [ox, oy] = w.offset ?? [0, 0];
    css.position = 'absolute';
    css.left = `${ax * 100}%`;
    css.top = `${ay * 100}%`;
    css.transform = `translate(${-ax * 100}%, ${-ay * 100}%) translate(${ox}px, ${oy}px)`;
  }
  const px = (k: string) => (num(s[k]) !== undefined ? `${s[k]}px` : undefined);
  const set = (k: string, v: string | number | undefined) => {
    if (v !== undefined) css[k] = v;
  };
  set('width', px('w'));
  set('height', px('h'));
  set('maxWidth', px('maxW'));
  set('padding', px('pad'));
  set('gap', px('gap'));
  set('fontSize', px('fontSize'));
  set('borderRadius', px('radius'));
  set('color', typeof s.color === 'string' ? s.color : undefined);
  set('background', typeof s.bg === 'string' ? s.bg : undefined);
  set('border', typeof s.border === 'string' ? `2px solid ${s.border}` : undefined);
  set('opacity', num(s.opacity));
  set('textAlign', typeof s.align === 'string' ? s.align : undefined);
  if (s.weight === 'bold') css.fontWeight = 700;
  if (s.shadow) css.textShadow = '0 3px 12px #000a';
  if (w.type === 'panel') {
    css.display = 'flex';
    css.flexDirection = s.layout === 'row' ? 'row' : 'column';
    if (s.layout === 'row') css.alignItems = 'center';
  }
  return css;
}
