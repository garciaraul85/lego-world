/**
 * P32 Help entries: one per element of the editor (workspace, area, tool, button, field, list, menu item,
 * command, logic node, widget, setting, shortcut). Written once as data, read by people (Help pages, F1 on
 * any control, screen guides) and by the AI (Brix and the AI builder read the same text).
 */

/** The screens Help knows: the shell around everything, each workspace, the Art tab, Play and dialogs. */
export const SCREENS = [
  { id: 'shell', name: 'Editor window', workspace: null },
  { id: 'scene', name: 'Scene', workspace: 'Scene' },
  { id: 'world', name: 'World graph', workspace: 'World graph' },
  { id: 'logic', name: 'Logic', workspace: 'Logic' },
  { id: 'characters', name: 'Characters', workspace: 'Characters' },
  { id: 'assets', name: 'Assets', workspace: 'Assets' },
  { id: 'screens', name: 'Screens', workspace: 'Screens' },
  { id: 'art', name: 'Art', workspace: 'Screens' },
  { id: 'cinematics', name: 'Cinematics', workspace: 'Cinematics' },
  { id: 'audio', name: 'Audio', workspace: 'Audio' },
  { id: 'play', name: 'Play', workspace: null },
] as const;
export type ScreenId = (typeof SCREENS)[number]['id'];

export type HelpKind =
  | 'screen'
  | 'area'
  | 'tool'
  | 'button'
  | 'field'
  | 'list'
  | 'menu'
  | 'command'
  | 'node'
  | 'widget'
  | 'setting'
  | 'shortcut'
  | 'view';

export const KIND_LABEL: Record<HelpKind, string> = {
  screen: 'Screen',
  area: 'Area',
  tool: 'Tool',
  button: 'Button',
  field: 'Field',
  list: 'List',
  menu: 'Menu item',
  command: 'Command',
  node: 'Logic node',
  widget: 'Screen widget',
  setting: 'Setting',
  shortcut: 'Shortcut',
  view: 'View',
};

/**
 * How Help finds an entry's control on screen. Every given part must hold:
 * - `in`: CSS selector of a container the control sits in (closest container wins ties)
 * - `name`: the control's accessible name starts with this text (any case), or matches this pattern
 * - `role`: button, textbox, checkbox, slider, combobox, option, radio, tab, treeitem, menuitem, canvas…
 * - `sel`: a CSS selector the control itself matches
 */
export type Match = { in?: string; name?: string | RegExp; role?: string; sel?: string };

export type HelpEntry = {
  /** `screen.thing`, e.g. `scene.tool.place` */
  id: string;
  screen: ScreenId;
  kind: HelpKind;
  name: string;
  /** what it is and what it does, one or two sentences */
  purpose: string;
  /** how to use it, step by step */
  steps?: string[];
  /** choices it offers and what each does */
  options?: [string, string][];
  tips?: string[];
  /** ids of related entries */
  related?: string[];
  /** engine commands it runs (what the AI can do instead) */
  commands?: string[];
  /** keyboard shortcut */
  key?: string;
  /** how to find its control(s); entries without one (commands, nodes…) are reference only */
  match?: Match[];
  /** search words that aren't in the text (other names people use) */
  also?: string[];
};

/** A screen guide: a labelled picture of the whole screen, what each area is for, the 5 things done most. */
export type ScreenGuide = {
  screen: ScreenId;
  intro: string;
  /** numbered areas: the entry describing each area (kind 'area', with a match) */
  areas: string[];
  /** the five things people do here most, each pointing at the entry that explains it */
  top: [string, string][];
};

/** `[aria-label="…"]` — most areas of the editor are labelled regions. */
export const area = (label: string) => `[aria-label="${label}"]`;
