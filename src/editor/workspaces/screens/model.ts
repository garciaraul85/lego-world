import { signal } from '@preact/signals';
import type { Screen, Widget } from '../../../core/schema';

/** Widget paths: '' is the root, '0.2' is child 2 of child 0. */
const parts = (path: string) => (path === '' ? [] : path.split('.').map(Number));

export function widgetAt(root: Widget, path: string): Widget | undefined {
  let w: Widget | undefined = root;
  for (const i of parts(path)) w = w?.children?.[i];
  return w;
}

/** A copy of the tree with the widget at path replaced (or removed when next is null). */
export function replaceAt(root: Widget, path: string, next: Widget | null): Widget {
  const p = parts(path);
  if (!p.length) return next ?? root;
  const go = (w: Widget, depth: number): Widget => {
    const i = p[depth]!;
    const kids = [...(w.children ?? [])];
    if (depth === p.length - 1) {
      if (next) kids[i] = next;
      else kids.splice(i, 1);
    } else kids[i] = go(kids[i]!, depth + 1);
    return { ...w, children: kids };
  };
  return go(root, 0);
}

/** Adds a child to the panel at path (or next to a non-panel widget); returns the tree and the new path. */
export function addChild(root: Widget, path: string, child: Widget): { root: Widget; path: string } {
  let target = path;
  let w = widgetAt(root, target);
  if (w && w.type !== 'panel') {
    target = parts(path).slice(0, -1).join('.');
    w = widgetAt(root, target);
  }
  if (!w) return { root, path };
  const kids = [...(w.children ?? []), child];
  const next = replaceAt(root, target, { ...w, children: kids });
  return { root: next, path: target === '' ? String(kids.length - 1) : `${target}.${kids.length - 1}` };
}

/** Moves a widget one place earlier/later among its siblings (tree order = focus order). */
export function moveAt(root: Widget, path: string, dir: -1 | 1): { root: Widget; path: string } {
  const p = parts(path);
  if (!p.length) return { root, path };
  const parentPath = p.slice(0, -1).join('.');
  const parent = widgetAt(root, parentPath)!;
  const i = p.at(-1)!;
  const j = i + dir;
  const kids = [...(parent.children ?? [])];
  if (j < 0 || j >= kids.length) return { root, path };
  [kids[i], kids[j]] = [kids[j]!, kids[i]!];
  return { root: replaceAt(root, parentPath, { ...parent, children: kids }), path: [...p.slice(0, -1), j].join('.') };
}

export const WIDGET_TYPES: Widget['type'][] = [
  'text',
  'button',
  'panel',
  'image',
  'hearts',
  'bar',
  'list',
  'dialogue',
  'minimap',
  'slot',
];

/** A sensible new widget of each type. */
export function template(type: Widget['type'], n: number): Widget {
  const id = `${type}${n}`;
  switch (type) {
    case 'text':
      return { type, id, text: 'New text', style: { fontSize: 24, color: '#ffffff' } };
    case 'button':
      return { type, id, label: 'Button', onPress: [] };
    case 'panel':
      return {
        type,
        id,
        anchor: [0.5, 0.5],
        style: { layout: 'column', gap: 10, pad: 16, bg: '#141a2be8', radius: 12, w: 300 },
        children: [],
      };
    case 'image':
      return { type, id, text: '⭐', style: { fontSize: 64 } };
    case 'hearts':
      return { type, id, bind: ['hp', 'maxHp'] };
    case 'bar':
      return { type, id, bind: ['hp', 'maxHp'], label: 'Health', style: { w: 220, h: 18, color: '#4ade80' } };
    case 'list':
      return { type, id, bind: ['inventory'], style: { fontSize: 16, color: '#f7c900' } };
    case 'dialogue':
      return {
        type,
        id,
        bind: ['dialogue.speaker', 'dialogue.text'],
        style: { w: 700, bg: '#0b1020e8', pad: 16, radius: 12, color: '#fff' },
      };
    case 'minimap':
      return { type, id, style: { w: 150, h: 150, radius: 12 } };
    case 'slot':
      return { type, id, label: 'touch' };
  }
}

/** Values the canvas shows for {bindings} while designing. */
export const SAMPLE: Record<string, unknown> = {
  hp: 2,
  maxHp: 3,
  'hero.gear': 'Hammer',
  'hero.name': 'Hero',
  'map.name': 'Prairie',
  'game.name': 'My brick game',
  prompt: 'E · Open',
  message: '3 bricks smashed into loose pieces. Hold E nearby to put them back.',
  'dialogue.speaker': 'Mia',
  'dialogue.text': 'Lovely day for building, isn’t it?',
  inventory: new Map([
    ['coin', 12],
    ['key', 1],
  ]),
  score: 1200,
  time: 95,
};

/** P31: the canvas shows an upright (portrait) device, so layout edits go to the portrait layout */
export const canvasPortrait = signal(false);

export type Device = {
  id: string;
  name: string;
  w: number;
  h: number;
  safe: { top: number; right: number; bottom: number; left: number };
};

/** Screen sizes the canvas shows (landscape; Rotate turns any of them upright). */
export const DEVICES: Device[] = [
  { id: 'desktop', name: 'Desktop 16:9', w: 1280, h: 720, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { id: 'laptop', name: 'Laptop 16:10', w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { id: 'phone', name: 'Phone 19.5:9', w: 1560, h: 720, safe: { top: 0, right: 44, bottom: 20, left: 44 } },
  { id: 'tablet', name: 'Tablet 4:3', w: 1280, h: 960, safe: { top: 20, right: 0, bottom: 20, left: 0 } },
  { id: 'ultrawide', name: 'Ultrawide 21:9', w: 1680, h: 720, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];

/** The same device held upright: width and height swap, and so do the safe areas. */
export function rotated(d: Device): Device {
  return {
    id: `${d.id}-portrait`,
    name: `${d.name.replace(/ [\d.]+:[\d.]+$/, '')} upright`,
    w: d.h,
    h: d.w,
    safe: { top: d.safe.left, right: d.safe.bottom, bottom: d.safe.right, left: d.safe.top },
  };
}

/** Every size Check all sizes looks at: each device both ways. */
export const ALL_SIZES: Device[] = DEVICES.flatMap((d) => [d, rotated(d)]);

/**
 * P31 layout edits from the canvas and the properties: on a portrait screen they go into the widget's
 * portrait layout (only portrait screens change); otherwise into the widget itself.
 */
export function setLayout(
  w: Widget,
  portrait: boolean,
  patch: { anchor?: [number, number]; offset?: [number, number]; style?: Record<string, string | number | undefined> },
): Widget {
  const clean = (st: Record<string, string | number | undefined>) =>
    Object.fromEntries(Object.entries(st).filter(([, v]) => v !== undefined && v !== '')) as Record<
      string,
      string | number
    >;
  if (!portrait) {
    const style = patch.style ? clean({ ...(w.style ?? {}), ...patch.style }) : w.style;
    const { style: _old, ...rest } = w;
    return {
      ...rest,
      ...(patch.anchor ? { anchor: patch.anchor } : {}),
      ...(patch.offset ? { offset: patch.offset } : {}),
      ...(style && Object.keys(style).length ? { style } : {}),
    };
  }
  const p = w.portrait ?? {};
  const style = patch.style ? clean({ ...(p.style ?? {}), ...patch.style }) : p.style;
  const { style: _old, ...rest } = p;
  const next = {
    ...rest,
    ...(patch.anchor ? { anchor: patch.anchor } : {}),
    ...(patch.offset ? { offset: patch.offset } : {}),
    ...(style && Object.keys(style).length ? { style } : {}),
  };
  return { ...w, portrait: next };
}

/** The nearest of the nine anchor points to a spot (0..1 of the parent each way). */
export function nearestAnchor(fx: number, fy: number): [number, number] {
  const snap = (v: number) => (v < 1 / 3 ? 0 : v < 2 / 3 ? 0.5 : 1);
  return [snap(fx), snap(fy)];
}

export const KIND_LABEL: Record<Screen['kind'], string> = {
  splash: 'Splash',
  title: 'Title',
  hud: 'HUD',
  pause: 'Pause',
  dialogue: 'Dialogue',
  gameover: 'Game over',
  custom: 'Custom',
};

/** Widget names and one-line tips (the palette and Help). */
export const WIDGET_NAMES: Record<Widget['type'], string> = {
  text: 'Text',
  button: 'Button',
  panel: 'Panel',
  image: 'Image',
  hearts: 'Hearts',
  bar: 'Bar',
  list: 'List',
  dialogue: 'Dialogue',
  minimap: 'Minimap',
  slot: 'Slot',
};

export const WIDGET_TIPS: Record<Widget['type'], string> = {
  text: 'Words on the screen; {hp} shows a live value',
  button: 'Something to press: runs actions',
  panel: 'A box that holds other widgets in a row or column',
  image: 'A picture or icon',
  hearts: 'Health as hearts',
  bar: 'A bar that fills up: health, stamina, a timer',
  list: 'A list of things, like the inventory',
  dialogue: 'Where characters talk',
  minimap: 'A small map of the world',
  slot: 'A place for touch controls',
};
