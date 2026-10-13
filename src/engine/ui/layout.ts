import type { Widget } from '../../core/schema';

/** Screens are laid out at a 1280×720 reference and scaled to fit (P5.7). */
export const REF_W = 1280;
export const REF_H = 720;

export type Insets = { top: number; right: number; bottom: number; left: number };
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * scale = min(w/1280, h/720); the virtual canvas keeps the reference size on the tight axis and grows
 * on the other, so anchors still hug the real screen edges on phones and ultrawide monitors.
 * P31: a portrait screen (taller than wide) uses a 720x1280 reference, and widgets use their portrait
 * layout where they have one, so text stays readable on a phone held upright.
 */
export function screenScale(w: number, h: number, safe: Insets = NO_INSETS) {
  const iw = Math.max(1, w - safe.left - safe.right);
  const ih = Math.max(1, h - safe.top - safe.bottom);
  const portrait = ih > iw;
  const scale = portrait ? Math.min(iw / REF_H, ih / REF_W) : Math.min(iw / REF_W, ih / REF_H);
  return { scale, vw: iw / scale, vh: ih / scale, x: safe.left, y: safe.top, portrait };
}

/** The widget as laid out on this screen: its portrait layout merged in on portrait screens. */
export function effectiveWidget(w: Widget, portrait: boolean): Widget {
  if (!portrait || !w.portrait) return w;
  const p = w.portrait;
  return {
    ...w,
    ...(p.anchor ? { anchor: p.anchor } : {}),
    ...(p.offset ? { offset: p.offset } : {}),
    ...(p.style ? { style: { ...(w.style ?? {}), ...p.style } } : {}),
  };
}

export type PinRect = { x: number; y: number; w: number; h: number };

/** Where a pinned widget of size (w, h) goes next to its target's rect (same coordinates). */
export function pinPlace(pin: NonNullable<Widget['pin']>, t: PinRect, w: number, h: number): { x: number; y: number } {
  const gap = pin.gap ?? 8;
  const a = pin.align ?? 'start';
  const along = (start: number, size: number, own: number) =>
    a === 'start' ? start : a === 'center' ? start + (size - own) / 2 : start + size - own;
  switch (pin.side) {
    case 'below':
      return { x: along(t.x, t.w, w), y: t.y + t.h + gap };
    case 'above':
      return { x: along(t.x, t.w, w), y: t.y - gap - h };
    case 'right':
      return { x: t.x + t.w + gap, y: along(t.y, t.h, h) };
    case 'left':
      return { x: t.x - gap - w, y: along(t.y, t.h, h) };
  }
}

/** Pinned widget ids in an order where every target comes before what is pinned to it (cycles are dropped). */
export function pinOrder(pins: Map<string, string>): string[] {
  const out: string[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === 2) return true;
    if (s === 1) return false; // a cycle
    state.set(id, 1);
    const to = pins.get(id);
    if (to && pins.has(to) && !visit(to)) return false;
    state.set(id, 2);
    out.push(id);
    return true;
  };
  for (const id of pins.keys()) visit(id);
  return out;
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
  if (w.pin) {
    // placed next to its target after layout (ScreenView); until then it waits off to the side, unseen
    css.position = 'absolute';
    css.left = '0px';
    css.top = '0px';
  } else if (w.anchor) {
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
  // text stays on one line unless the widget has a width to wrap in
  if (num(s.w) !== undefined || num(s.maxW) !== undefined) css.whiteSpace = 'pre-wrap';
  if (s.weight === 'bold') css.fontWeight = 700;
  if (s.shadow) css.textShadow = '0 3px 12px #000a';
  if (w.type === 'panel') {
    css.display = 'flex';
    css.flexDirection = s.layout === 'row' ? 'row' : 'column';
    if (s.layout === 'row') css.alignItems = 'center';
  }
  return css;
}
