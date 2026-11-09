/**
 * Milestone 3b (B7b): the HUD screen for each HUD style, arranged like the games of its era (drawn here, original):
 *  - corner64: hearts and magic top left, money bottom left, the buttons top right, a square map bottom right;
 *  - cube: the same corners, a bigger button cluster, a sea-chart map;
 *  - pointer: hearts top left, the remote-shaped strip on the right, a stamina ring by the hero;
 *  - tablet: hearts top left, and a second screen along the bottom with the map, the buttons and the items;
 *  - openair: hearts top left, a stamina wheel by the hero, the map bottom right, small hints beside it.
 * Each is built from the built-in HUD so the widgets keep their ids (and a GameHud's showWidget still finds them).
 */
import type { HudStyle } from '../../core/controls/hud-styles';
import type { Screen, Widget } from '../../core/schema';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** a widget of the HUD by id (anywhere in it) */
function find(root: Widget, id: string): Widget | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}

const MONEY: Widget = {
  type: 'text',
  id: 'money',
  anchor: [0, 1],
  offset: [24, -24],
  text: '◆ {inventory.coin}',
  style: { fontSize: 22, weight: 'bold', color: '#7ee08a', bg: '#0b1020a0', pad: 8, radius: 10 },
};

/** the HUD screen for a style, from the built-in HUD (the style's look is the project's: the buttons follow it) */
export function hudScreenFor(style: HudStyle, base: Screen): Screen {
  const s = clone(base);
  const root = s.root;
  const kids = (root.children ??= []);
  const at = (id: string, anchor: [number, number], offset: [number, number]) => {
    const w = find(root, id);
    if (w) {
      w.anchor = anchor;
      w.offset = offset;
    }
    return w;
  };
  const drop = (id: string) => {
    const i = kids.findIndex((w) => w.id === id);
    if (i >= 0) kids.splice(i, 1);
  };
  const stamina = find(root, 'stamina');
  const status = find(root, 'status');
  const buttons = find(root, 'buttons');
  if (buttons) buttons.style = { ...(buttons.style ?? {}), fontSize: 16 };
  // the stamina wheel / ring by the hero (pointer, open air), out of the corner panel
  const ring = () => {
    if (!stamina || !status) return;
    status.children = (status.children ?? []).filter((c) => c.id !== 'stamina');
    kids.push({
      ...stamina,
      anchor: [0.5, 0.5],
      offset: [70, -60],
      label: 'Stamina',
      style: { w: 46, h: 46, color: '#7ee08a', shape: 'ring', hideFull: 1 },
    });
  };
  switch (style) {
    case 'corner64': {
      if (status) status.style = { ...(status.style ?? {}), layout: 'column', bg: '#00000000', gap: 6 };
      at('status', [0, 0], [24, 18]);
      at('buttons', [1, 0], [-24, 16]);
      at('mapname', [0.5, 0], [0, 18]);
      at('inventory', [1, 0], [-24, 200]);
      at('minimap', [1, 1], [-24, -24]);
      at('quest', [1, 1], [-24, -186]);
      kids.push(clone(MONEY));
      break;
    }
    case 'cube': {
      if (status) status.style = { ...(status.style ?? {}), layout: 'column', bg: '#00000000', gap: 6 };
      at('status', [0, 0], [24, 18]);
      at('buttons', [1, 0], [-24, 12]);
      at('mapname', [0.5, 0], [0, 18]);
      at('inventory', [1, 0], [-24, 220]);
      const m = at('minimap', [1, 1], [-24, -24]);
      if (m) m.style = { ...(m.style ?? {}), radius: 4, border: '#c9a74a' };
      at('quest', [1, 1], [-24, -186]);
      kids.push({ ...clone(MONEY), style: { ...MONEY.style, color: '#ffd23f' } });
      break;
    }
    case 'pointer': {
      at('status', [0, 0], [24, 18]);
      if (status) status.style = { ...(status.style ?? {}), bg: '#00000000' };
      at('buttons', [1, 0.5], [-20, -10]);
      at('mapname', [0.5, 0], [0, 18]);
      at('inventory', [0, 0], [24, 80]);
      at('minimap', [1, 1], [-140, -24]);
      at('quest', [1, 1], [-140, -186]);
      ring();
      kids.push({ ...clone(MONEY), anchor: [0, 1], offset: [24, -24] });
      break;
    }
    case 'tablet': {
      at('status', [0, 0], [24, 18]);
      if (status) status.style = { ...(status.style ?? {}), bg: '#00000000' };
      at('mapname', [1, 0], [-24, 20]);
      at('quest', [0.5, 0], [0, 70]);
      // the second screen: a tablet along the bottom with the map, the buttons and the items
      const mini = find(root, 'minimap');
      const btns = find(root, 'buttons');
      drop('minimap');
      drop('buttons');
      kids.push({
        type: 'panel',
        id: 'tablet',
        anchor: [0.5, 1],
        offset: [0, -12],
        style: { layout: 'row', gap: 18, bg: '#1b2030f0', pad: 14, radius: 22, border: '#ffffff30' },
        children: [
          ...(mini
            ? [{ ...mini, anchor: undefined, offset: undefined, style: { ...(mini.style ?? {}), w: 150, h: 120 } }]
            : []),
          ...(btns ? [{ ...btns, anchor: undefined, offset: undefined }] : []),
          { ...clone(MONEY), anchor: undefined, offset: undefined },
        ] as Widget[],
      });
      // the message and prompt sit above the tablet
      at('message', [0.5, 1], [0, -230]);
      at('prompt', [0.5, 1], [0, -180]);
      break;
    }
    case 'openair': {
      at('status', [0, 0], [24, 18]);
      if (status) status.style = { ...(status.style ?? {}), bg: '#00000000' };
      at('mapname', [0.5, 0], [0, 18]);
      const m = at('minimap', [1, 1], [-24, -24]);
      if (m) m.style = { ...(m.style ?? {}), radius: 28, border: '#ffffffa0' };
      at('buttons', [1, 1], [-200, -28]);
      at('quest', [1, 1], [-24, -186]);
      ring();
      break;
    }
  }
  return s;
}
