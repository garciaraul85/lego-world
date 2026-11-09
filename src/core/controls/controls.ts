import { z } from 'zod';

/**
 * Step 11b part 1: a game's buttons, like Zelda's. No action has a fixed key: a game picks a **layout** (which
 * buttons there are), the **Action** button does whatever fits the moment (Talk, Open, Read, Grab, Climb, Dive,
 * Jump…), and **item buttons** do whatever item is put in them. Every button is bound to keys, gamepad buttons and
 * a touch button; the maker sets the game's bindings and a player can change them on their own device.
 */
export const LAYOUTS = ['ocarina', 'classic', 'modern', 'cube', 'pointer', 'tablet', 'custom'] as const;
export type Layout = (typeof LAYOUTS)[number];

/** every button a layout can have */
export const BUTTONS = [
  'action',
  'attack',
  'jump',
  'guard',
  'roll',
  'lock',
  'item1',
  'item2',
  'item3',
  'item4',
  'wheel',
  'menu',
] as const;
export type Button = (typeof BUTTONS)[number];
/** moving is bound too (the stick and the d-pad on a gamepad, the arrows on touch) */
export const MOVES = ['up', 'down', 'left', 'right', 'run'] as const;
export type Move = (typeof MOVES)[number];
export type Bindable = Button | Move;

export const ITEM_BUTTONS: Button[] = ['item1', 'item2', 'item3', 'item4'];

export const Controls = z.strictObject({
  layout: z.enum(LAYOUTS),
  /** item buttons (custom layouts; the others set their own) */
  items: z.number().int().min(0).max(4).optional(),
  /** where jumping is: the Action button when nothing else fits, a button of its own, or no jumping (Ocarina) */
  jump: z.enum(['action', 'button', 'none']).optional(),
  /** the game's keys and gamepad buttons, where they differ from the defaults */
  keys: z.partialRecord(z.enum([...BUTTONS, ...MOVES]), z.array(z.string().min(1).max(20)).max(3)).optional(),
  pad: z.partialRecord(z.enum([...BUTTONS, ...MOVES]), z.array(z.number().int().min(0).max(31)).max(2)).optional(),
  /** Milestone 3b (B7b): the HUD style (an era's look and button faces); none: the plain look */
  hud: z.enum(['corner64', 'cube', 'pointer', 'tablet', 'openair']).optional(),
});
export type Controls = z.infer<typeof Controls>;

/** a game that has not picked: today's buttons (E uses, Space jumps, F attacks), so older games play the same */
export const CONTROL_DEFAULTS: Controls = { layout: 'modern' };

export const LAYOUT_INFO: Record<
  Layout,
  { name: string; about: string; items: number; jump: 'action' | 'button' | 'none' }
> = {
  ocarina: {
    name: 'Ocarina',
    about: 'Attack, Action and 3 item buttons; jumping happens on its own at ledges (no jump button)',
    items: 3,
    jump: 'none',
  },
  classic: {
    name: 'Classic',
    about: 'Attack, Action and 2 item buttons; Action jumps when there is nothing else to do',
    items: 2,
    jump: 'action',
  },
  modern: {
    name: 'Modern',
    about: 'Attack, Action, a Jump button, 2 item buttons and an item wheel',
    items: 2,
    jump: 'button',
  },
  // Milestone 3b (B7b): the eras' layouts
  cube: {
    name: 'Big buttons',
    about: 'A big Action button, Attack and 3 item buttons; jumping happens on its own at ledges (no jump button)',
    items: 3,
    jump: 'none',
  },
  pointer: {
    name: 'Pointer',
    about:
      'Action, a swing to attack and 1 item button: hold it for the item wheel; jumping happens on its own at ledges',
    items: 1,
    jump: 'none',
  },
  tablet: {
    name: 'Second screen',
    about: 'Attack, Action and 3 item buttons, the items also touched on the second screen; no jump button',
    items: 3,
    jump: 'none',
  },
  custom: {
    name: 'Custom',
    about: 'Choose how many item buttons (0 to 4) and where jumping is',
    items: 3,
    jump: 'action',
  },
};

export const BUTTON_NAME: Record<Bindable, string> = {
  action: 'Action',
  attack: 'Attack',
  jump: 'Jump',
  guard: 'Guard',
  roll: 'Roll',
  lock: 'Lock on',
  item1: 'Item 1',
  item2: 'Item 2',
  item3: 'Item 3',
  item4: 'Item 4',
  wheel: 'Item wheel',
  menu: 'Menu',
  up: 'Forward',
  down: 'Back',
  left: 'Left',
  right: 'Right',
  run: 'Run',
};

/** keys as KeyboardEvent.key in lower case (' ' is Space) */
export const DEFAULT_KEYS: Record<Bindable, string[]> = {
  action: ['e', 't'],
  attack: ['f'],
  jump: [' '],
  guard: ['q'],
  roll: ['c'],
  lock: ['z'],
  item1: ['j'],
  item2: ['k'],
  item3: ['l'],
  item4: [';'],
  wheel: ['r'],
  menu: ['i'],
  up: ['w', 'arrowup'],
  down: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  run: ['shift'],
};
/** standard gamepad button numbers: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 View, 9 Start, 10–11 sticks, 12–15 d-pad */
export const DEFAULT_PAD: Record<Bindable, number[]> = {
  action: [0],
  attack: [2],
  jump: [3],
  guard: [6],
  roll: [1],
  lock: [4],
  item1: [5],
  item2: [3],
  item3: [7],
  item4: [11],
  wheel: [10],
  menu: [8],
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  run: [],
};
/** with no Jump button, the jump pad button is free for an item */
const PAD_NO_JUMP: Partial<Record<Bindable, number[]>> = { item2: [3] };
const PAD_JUMP: Partial<Record<Bindable, number[]>> = { item2: [7], item3: [11] };

export const PAD_NAME: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'View',
  9: 'Start',
  10: 'L stick',
  11: 'R stick',
  12: 'D-pad up',
  13: 'D-pad down',
  14: 'D-pad left',
  15: 'D-pad right',
};
export const keyName = (k: string) =>
  k === ' '
    ? 'Space'
    : k.startsWith('arrow')
      ? `${k[5]!.toUpperCase()}${k.slice(6)} arrow`
      : k.length === 1
        ? k.toUpperCase()
        : k[0]!.toUpperCase() + k.slice(1);

/** a game's controls with every gap filled */
export function controlsOf(c: Controls | undefined): Required<Pick<Controls, 'layout' | 'items' | 'jump'>> & {
  keys: Record<Bindable, string[]>;
  pad: Record<Bindable, number[]>;
} {
  const base = c ?? CONTROL_DEFAULTS;
  const info = LAYOUT_INFO[base.layout];
  const items = base.layout === 'custom' ? (base.items ?? info.items) : info.items;
  const jump = base.layout === 'custom' ? (base.jump ?? info.jump) : info.jump;
  const pad = { ...DEFAULT_PAD, ...(jump === 'button' ? PAD_JUMP : PAD_NO_JUMP) } as Record<Bindable, number[]>;
  return {
    layout: base.layout,
    items,
    jump,
    keys: { ...DEFAULT_KEYS, ...(base.keys ?? {}) } as Record<Bindable, string[]>,
    pad: { ...pad, ...(base.pad ?? {}) } as Record<Bindable, number[]>,
  };
}

/** the buttons a game has (for the HUD, touch and the Controls screen) */
export function buttonsOf(c: Controls | undefined): Button[] {
  const o = controlsOf(c);
  const out: Button[] = ['attack', 'action'];
  if (o.jump === 'button') out.push('jump');
  out.push('guard', 'roll', 'lock');
  out.push(...ITEM_BUTTONS.slice(0, o.items));
  if (o.layout === 'modern' || o.layout === 'pointer') out.push('wheel');
  out.push('menu');
  return out;
}

/** the button a key is bound to in this game (player bindings first), or null */
export function buttonForKey(
  c: ReturnType<typeof controlsOf>,
  key: string,
  player?: Partial<Record<Bindable, string[]>>,
): Bindable | null {
  const k = key.toLowerCase();
  const has = (b: Bindable) => (player?.[b] ?? c.keys[b]).includes(k);
  const live = new Set<Bindable>([...buttonsOf({ layout: c.layout, items: c.items, jump: c.jump }), ...MOVES]);
  for (const b of [...MOVES, ...BUTTONS]) if (live.has(b) && has(b)) return b;
  return null;
}

/** the button a gamepad button is bound to, or null */
export function buttonForPad(
  c: ReturnType<typeof controlsOf>,
  index: number,
  player?: Partial<Record<Bindable, number[]>>,
): Bindable | null {
  const live = new Set<Bindable>([...buttonsOf({ layout: c.layout, items: c.items, jump: c.jump }), ...MOVES]);
  for (const b of [...MOVES, ...BUTTONS]) if (live.has(b) && (player?.[b] ?? c.pad[b]).includes(index)) return b;
  return null;
}

/** a binding that another live button already uses (a clash), for the Controls screens */
export function clashOf(c: ReturnType<typeof controlsOf>, b: Bindable, key: string): Bindable | null {
  const live = [...buttonsOf({ layout: c.layout, items: c.items, jump: c.jump }), ...MOVES];
  return live.find((x) => x !== b && c.keys[x].includes(key.toLowerCase())) ?? null;
}

/** the things the Action button can do, most important first (the first that fits is what it does) */
export const ACTION_KINDS = [
  'drop',
  'talk',
  'lift',
  'use',
  'read',
  'grab',
  'climb',
  'dive',
  'swimUp',
  'rebuild',
  'jump',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number] | 'custom';

export type ActionOffer = { kind: ActionKind; label: string; priority: number };

/** picks what the Action button does: the highest priority offer (an earlier kind wins a tie) */
export function pickAction(offers: readonly ActionOffer[]): ActionOffer | null {
  let best: ActionOffer | null = null;
  for (const o of offers) if (!best || o.priority > best.priority) best = o;
  return best;
}

/** how much each kind matters (higher wins); custom labels on objects sit with Use */
export const ACTION_PRIORITY: Record<ActionKind, number> = {
  // step 12b: holding a bomb up, Action puts it down; a bomb (or a bomb plant's) in reach is picked up
  drop: 95,
  talk: 90,
  lift: 85,
  use: 80,
  custom: 80,
  read: 70,
  grab: 60,
  climb: 55,
  swimUp: 50,
  dive: 50,
  rebuild: 40,
  jump: 10,
};
