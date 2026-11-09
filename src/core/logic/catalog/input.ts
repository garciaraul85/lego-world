import { BUTTONS } from '../../controls/controls';
import { HUD_STYLES } from '../../controls/hud-styles';
import { hook } from './hooks';
import type { NodeDef, PinDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Milestone 3b (B7b): the player's buttons and the HUD in logic. PlayerInput (a behaviour extending it) decides
 * what the Action button says and which buttons work; GameHud which widgets show and what they say. Any script
 * hears presses, asks whether a button is held, turns the controls off for a moment, rumbles the gamepad and
 * changes the HUD style while playing.
 */
const str = (v: unknown) => (typeof v === 'string' ? v : String(v ?? ''));
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const BUTTON: PinDef = {
  name: 'button',
  type: 'string',
  default: 'action',
  help: `The button: ${BUTTONS.join(', ')}.`,
};

export const INPUT_HOOKS: NodeDef[] = [
  hook(
    'ActionLabel',
    'What does Action say? (PlayerInput)',
    'Asked each moment about what the Action button would do (kind: talk, lift, use, read, grab, climb, dive, swimUp, rebuild, jump, custom; label: what it says). Return other words for the HUD and touch button (“Peek”, “Chat”); base is its own label.',
    [
      { name: 'kind', type: 'string' },
      { name: 'label', type: 'string' },
    ],
    'string',
  ),
  hook(
    'CanPress',
    'Does this button work? (PlayerInput)',
    'Asked as a button is pressed. Return false and nothing happens (no item buttons underwater, no attacking in a village, no menu in a cutscene).',
    [{ name: 'button', type: 'string' }],
    'bool',
  ),
  hook(
    'ShowWidget',
    'Does this widget show? (GameHud)',
    'Asked about each HUD widget a few times a second (widget: its id, such as hearts, minimap, buttons, quest; screen: the HUD’s name). Return false to hide it.',
    [
      { name: 'widget', type: 'string' },
      { name: 'screen', type: 'string' },
    ],
    'bool',
  ),
  hook(
    'WidgetText',
    'What does this widget say? (GameHud)',
    'Asked about each text widget of the HUD a few times a second (widget: its id; text: what it would say). Return other words.',
    [
      { name: 'widget', type: 'string' },
      { name: 'text', type: 'string' },
    ],
    'string',
  ),
];

const BUTTON_ARG = [
  {
    name: 'button',
    kind: 'string' as const,
    label: 'Button',
    optional: true,
    help: `Only for this button (${BUTTONS.join(', ')}). Empty: any.`,
  },
];

export const INPUT_EVENTS: NodeDef[] = [
  {
    type: 'event.onButtonDown',
    kind: 'event',
    title: 'On button down',
    category: 'Events',
    doc: 'Runs as the player presses a button (keys, gamepad or touch, whichever is bound to it): button is its name (action, attack, item1…), face what it wears in the HUD style (A, B, ◀…).',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'button', type: 'string' }, { name: 'face', type: 'string' }],
    args: BUTTON_ARG,
    code: { name: 'buttonDown', style: 'event' },
  },
  {
    type: 'event.onButtonUp',
    kind: 'event',
    title: 'On button up',
    category: 'Events',
    doc: 'Runs as the player lets go of a button: held is how many seconds it was down (a charged attack, a long press).',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'button', type: 'string' }, { name: 'held', type: 'number' }],
    args: BUTTON_ARG,
    code: { name: 'buttonUp', style: 'event' },
  },
  {
    type: 'event.onHudStyle',
    kind: 'event',
    title: 'On HUD style',
    category: 'Events',
    doc: 'Runs when the HUD style changes while playing (hud.setStyle): style is the new one.',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'style', type: 'string' }],
    code: { name: 'hudStyle', style: 'event' },
  },
];

export const INPUT: NodeDef[] = [
  {
    type: 'input.isHeld',
    kind: 'pure',
    title: 'Button is held',
    category: 'Input',
    doc: 'True while the player holds this button down.',
    inputs: [BUTTON],
    outputs: [{ name: 'out', type: 'bool' }],
    code: { name: 'input.isHeld', style: 'call' },
    eval: (c, _a, i) => (c.inputRead?.('held', str(i.button)) ?? 0) > 0,
  },
  {
    type: 'input.heldFor',
    kind: 'pure',
    title: 'Button held for',
    category: 'Input',
    doc: 'How many seconds the player has held this button down (0 when it is up).',
    inputs: [BUTTON],
    outputs: [{ name: 'out', type: 'number' }],
    code: { name: 'input.heldFor', style: 'call' },
    eval: (c, _a, i) => c.inputRead?.('heldFor', str(i.button)) ?? 0,
  },
  {
    type: 'input.enable',
    kind: 'action',
    title: 'Controls on or off',
    category: 'Input',
    doc: 'Turns the player’s buttons off (a cutscene of your own, a fall, a stun) or back on. Moving stops too while they are off.',
    inputs: [EXEC_IN, { name: 'on', type: 'bool', default: false, help: 'On: the buttons work. Off: they do not.' }],
    outputs: [EXEC_OUT],
    code: { name: 'input.enable', style: 'call' },
    exec: (c, _a, i) => c.inputOp?.(i.on === true ? 'on' : 'off'),
  },
  {
    type: 'input.rumble',
    kind: 'action',
    title: 'Rumble',
    category: 'Input',
    doc: 'Shakes the player’s gamepad (where it can): a hit, a chest’s lid, a boss stomping.',
    inputs: [
      EXEC_IN,
      { name: 'strength', type: 'number', default: 0.6, help: 'How hard, 0 to 1.' },
      { name: 'seconds', type: 'number', default: 0.3, help: 'How long.' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'input.rumble', style: 'call' },
    exec: (c, _a, i) =>
      c.inputOp?.(
        'rumble',
        Math.max(0, Math.min(1, num(i.strength, 0.6))),
        Math.max(0, Math.min(5, num(i.seconds, 0.3))),
      ),
  },
  {
    type: 'hud.setStyle',
    kind: 'action',
    title: 'Set HUD style',
    category: 'Input',
    doc: `Changes how the HUD’s buttons look while playing: ${HUD_STYLES.join(', ')}, the name of a style of the game’s own (Project › Controls › HUD style), or default (the game’s). The buttons themselves stay as Project › Controls has them.`,
    inputs: [
      EXEC_IN,
      {
        name: 'style',
        type: 'string',
        default: 'openair',
        help: `${HUD_STYLES.join(', ')}, a style of your own by name, or default.`,
      },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'hud.setStyle', style: 'call' },
    exec: (c, _a, i) => c.inputOp?.('style', 0, 0, str(i.style)),
  },
  {
    type: 'hud.style',
    kind: 'pure',
    title: 'HUD style',
    category: 'Input',
    doc: `The HUD style now: ${HUD_STYLES.join(', ')}, or the id of a style of the game’s own (openair when the game has not picked).`,
    inputs: [],
    outputs: [{ name: 'out', type: 'string' }],
    code: { name: 'hud.style', style: 'call' },
    eval: (c) => c.hudRead?.() ?? '',
  },
];
