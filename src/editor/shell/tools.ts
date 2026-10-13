import type { ToolId } from '../state';

/** The Scene tools, their keys and one-line help (toolbar, tips, Help). */
export const TOOLS: {
  id: ToolId;
  glyph: string;
  label: string;
  key: string;
  help: string;
  later?: string;
  /** shares a toolbar button with another tool (Place covers bricks and assets) */
  hidden?: boolean;
}[] = [
  {
    id: 'select',
    glyph: '↖',
    label: 'Select',
    key: 'V',
    help: 'Select: click an object (Alt: one brick, Shift: add). Drag to orbit, right-drag to pan.',
  },
  {
    id: 'move',
    glyph: '✥',
    label: 'Move',
    key: 'W',
    help: 'Move: select something, then drag the red, green or blue arrow to move it along that way. Drag the object itself to slide it on the ground.',
  },
  {
    id: 'rotate',
    glyph: '↻',
    label: 'Rotate',
    key: 'E',
    help: 'Rotate: select something, then drag a ring. A whole asset turns freely about X (red), Y (green) and Z (blue) in 15° steps; bricks turn in quarter turns. R turns once.',
  },
  {
    id: 'resize',
    glyph: '⤡',
    label: 'Resize',
    key: 'Q',
    help: 'Resize: select an asset, a trigger zone or one brick, then drag a square handle. Assets grow freely (the white corner grows them evenly); bricks snap to real LEGO sizes; the top handle makes a plate or a brick.',
  },
  {
    id: 'place',
    glyph: '▦',
    label: 'Place',
    key: 'B',
    help: 'Place: pick a brick or an asset in the dock below, then click the ground (or drag a card straight in). Press T to turn it a quarter turn before you put it down.',
  },
  {
    id: 'asset',
    glyph: '▦',
    label: 'Place',
    key: 'A',
    help: 'Place: pick a brick or an asset in the dock below, then click the ground (or drag a card straight in). Press T to turn it a quarter turn before you put it down.',
    hidden: true,
  },
  {
    id: 'paint',
    glyph: '◐',
    label: 'Color paint',
    key: 'C',
    help: 'Color paint: click an object to recolor it with the brush color (Alt: one brick).',
  },
  {
    id: 'erase',
    glyph: '⌫',
    label: 'Erase',
    key: 'X',
    help: 'Erase: click a brick to remove it (Shift: whole object). Supporting bricks are protected.',
  },
  {
    id: 'spawn',
    glyph: '⚑',
    label: 'Spawn point',
    key: 'P',
    help: 'Spawn point: click open ground to add one, facing the way the camera looks.',
  },
  {
    id: 'zone',
    glyph: '⬚',
    label: 'Trigger zone',
    key: 'Z',
    help: 'Trigger zone: drag on the ground to draw a zone; logic reacts when the hero walks in or out.',
  },
  {
    id: 'sound',
    glyph: '♫',
    label: 'Sound emitter',
    key: 'S',
    help: 'Sound emitter: click the ground to place a looping or repeating sound. Music and ambience zones: pick a zone’s Music in the Inspector.',
  },
  {
    id: 'ui',
    glyph: '▭',
    label: 'Sign',
    key: 'U',
    help: 'Sign: click the ground to put up a sign in the world; its text can show {variables} while playing. The HUD, title and splash screens are made in the Screens workspace.',
  },
];
