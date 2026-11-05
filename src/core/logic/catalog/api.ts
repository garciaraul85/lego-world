import type { NodeDef, PinDef, PinType } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

/**
 * Milestone 3b (B2): the engine API for behaviours (and every logic file) — where things are and moving them,
 * physics, messages between behaviours, more maths, text, input and time. Each reads in Code as a call
 * (`entity.x("this")`, `math.min(a, b)`), in cards as one card.
 */

const WHO =
  'What it is about: “this” (the copy running the behaviour), “hero”, a placed copy’s name (“Gate switch”), an asset or character name (the one nearest the hero), or an id.';
const who = (name = 'target', label?: string, def = 'this'): PinDef => ({
  name,
  type: 'entity',
  default: def,
  pick: { kind: 'object' },
  help: WHO,
  ...(label ? { label } : {}),
});
const num = (name: string, def = 0, help?: string): PinDef => ({
  name,
  type: 'number',
  default: def,
  ...(help ? { help } : {}),
});
const n = Number;

/** a pure function card: name(a, b…) in code */
function fn(
  type: string,
  title: string,
  category: string,
  doc: string,
  inputs: PinDef[],
  out: PinType,
  code: string,
  ev: NodeDef['eval'],
): NodeDef {
  return {
    type,
    kind: 'pure',
    title,
    category,
    doc,
    inputs,
    outputs: [{ name: 'out', type: out }],
    code: { name: code, style: 'call' },
    eval: ev,
  };
}

/** a binary operator card (a op b in code) */
const op = (
  type: string,
  title: string,
  sym: string,
  doc: string,
  inT: PinType,
  outT: PinType,
  f: (a: unknown, b: unknown) => unknown,
  category: string,
): NodeDef => ({
  type,
  kind: 'pure',
  title,
  category,
  doc,
  inputs: [
    { name: 'a', type: inT, default: 0 },
    { name: 'b', type: inT, default: 0 },
  ],
  outputs: [{ name: 'out', type: outT }],
  code: { name: sym, style: 'expr' },
  eval: (_c, _a, i) => f(i.a, i.b),
});

export const API_MATH: NodeDef[] = [
  op(
    'math.div',
    'Divide',
    '/',
    'Divides a by b (0 when b is 0).',
    'number',
    'number',
    (a, b) => (n(b) ? n(a) / n(b) : 0),
    'Math',
  ),
  op(
    'math.mod',
    'Remainder',
    '%',
    'What is left over when a is divided by b (7 % 3 is 1).',
    'number',
    'number',
    (a, b) => (n(b) ? n(a) % n(b) : 0),
    'Math',
  ),
  op('compare.gt', 'More than', '>', 'True when a > b.', 'any', 'bool', (a, b) => n(a) > n(b), 'Compare'),
  op('compare.lt', 'Less than', '<', 'True when a < b.', 'any', 'bool', (a, b) => n(a) < n(b), 'Compare'),
  op(
    'compare.neq',
    'Not equal',
    '!==',
    'True when a and b are different.',
    'any',
    'bool',
    (a, b) => a !== b,
    'Compare',
  ),
  fn(
    'math.min',
    'Smaller',
    'Math',
    'The smaller of a and b.',
    [num('a'), num('b')],
    'number',
    'math.min',
    (_c, _a, i) => Math.min(n(i.a), n(i.b)),
  ),
  fn('math.max', 'Larger', 'Math', 'The larger of a and b.', [num('a'), num('b')], 'number', 'math.max', (_c, _a, i) =>
    Math.max(n(i.a), n(i.b)),
  ),
  fn(
    'math.abs',
    'Without sign',
    'Math',
    'The number without its minus sign (−3 → 3).',
    [num('a')],
    'number',
    'math.abs',
    (_c, _a, i) => Math.abs(n(i.a)),
  ),
  fn(
    'math.clamp',
    'Keep between',
    'Math',
    'The value, kept between low and high.',
    [num('value'), num('low', 0), num('high', 1)],
    'number',
    'math.clamp',
    (_c, _a, i) => Math.min(n(i.high), Math.max(n(i.low), n(i.value))),
  ),
  fn(
    'math.lerp',
    'Blend',
    'Math',
    'From a toward b by t (0 is a, 1 is b, 0.5 halfway).',
    [num('a'), num('b', 1), num('t', 0.5)],
    'number',
    'math.lerp',
    (_c, _a, i) => n(i.a) + (n(i.b) - n(i.a)) * n(i.t),
  ),
  fn(
    'math.sin',
    'Sine',
    'Math',
    'The sine of an angle in degrees: goes smoothly from −1 to 1 and back (for swinging, bobbing).',
    [num('degrees')],
    'number',
    'math.sin',
    (_c, _a, i) => Math.sin((n(i.degrees) * Math.PI) / 180),
  ),
  fn(
    'math.cos',
    'Cosine',
    'Math',
    'The cosine of an angle in degrees.',
    [num('degrees')],
    'number',
    'math.cos',
    (_c, _a, i) => Math.cos((n(i.degrees) * Math.PI) / 180),
  ),
  fn(
    'math.sqrt',
    'Square root',
    'Math',
    'The square root (of 0 or more).',
    [num('a')],
    'number',
    'math.sqrt',
    (_c, _a, i) => Math.sqrt(Math.max(0, n(i.a))),
  ),
  fn('math.round', 'Round', 'Math', 'The nearest whole number.', [num('a')], 'number', 'math.round', (_c, _a, i) =>
    Math.round(n(i.a)),
  ),
  fn(
    'math.floor',
    'Round down',
    'Math',
    'The whole number at or below it.',
    [num('a')],
    'number',
    'math.floor',
    (_c, _a, i) => Math.floor(n(i.a)),
  ),
  fn(
    'text.join',
    'Join text',
    'Text',
    'Puts two pieces of text (or numbers) together: “Gems: ” and 3 make “Gems: 3”.',
    [
      { name: 'a', type: 'any', default: '' },
      { name: 'b', type: 'any', default: '' },
    ],
    'string',
    'text.join',
    (_c, _a, i) => `${String(i.a ?? '')}${String(i.b ?? '')}`,
  ),
];

export const API_EVENTS: NodeDef[] = [
  {
    type: 'event.onMessage',
    kind: 'event',
    title: 'On message',
    category: 'Events',
    doc: 'Runs when a behaviour sends this object a message (Send message). Leave Name empty to hear every message. value is what was sent; from is who sent it.',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'value', type: 'any' }, { name: 'from', type: 'entity' }],
    args: [
      {
        name: 'name',
        kind: 'string',
        label: 'Name',
        optional: true,
        help: 'The message’s name (“open”, “alarm”): only messages with this name run it.',
      },
    ],
    code: { name: 'message', style: 'event' },
  },
];

const read = (
  type: string,
  title: string,
  doc: string,
  out: PinType,
  code: string,
  what: 'x' | 'y' | 'z' | 'heading' | 'state',
): NodeDef =>
  fn(
    type,
    title,
    'Things',
    doc,
    [who()],
    out,
    code,
    (c, _a, i) => c.entity?.(what, String(i.target ?? 'this')) ?? (out === 'string' ? '' : 0),
  );

export const API: NodeDef[] = [
  // where things are
  read('entity.x', 'X of', 'Where it is across (studs, east is +).', 'number', 'entity.x', 'x'),
  read('entity.y', 'Height of', 'How high it stands (studs).', 'number', 'entity.y', 'y'),
  read('entity.z', 'Z of', 'Where it is along (studs, south is +).', 'number', 'entity.z', 'z'),
  read(
    'entity.heading',
    'Facing of',
    'Which way it faces, in degrees (0 is +z, 90 is +x).',
    'number',
    'entity.heading',
    'heading',
  ),
  read('entity.state', 'State of', 'A placed asset’s state now (“open”, “on”…).', 'string', 'entity.state', 'state'),
  fn(
    'entity.distance',
    'Distance',
    'Things',
    'How far apart two things are, in studs along the ground.',
    [who('a', 'From'), who('b', 'To', 'hero')],
    'number',
    'entity.distance',
    (c, _a, i) => c.distance?.(String(i.a ?? 'this'), String(i.b ?? 'hero')) ?? 0,
  ),
  {
    type: 'entity.moveBy',
    kind: 'action',
    title: 'Move by',
    category: 'Things',
    doc: 'Moves something this many studs (a placed asset moves in whole studs, carrying whatever stands on it; a character or the hero moves smoothly). The way must be clear for an asset.',
    inputs: [EXEC_IN, who(), num('x', 1), num('y'), num('z')],
    outputs: [EXEC_OUT],
    code: { name: 'entity.moveBy', style: 'call' },
    exec: (c, _a, i) => c.moveThing?.('by', String(i.target ?? 'this'), n(i.x), n(i.y), n(i.z)),
  },
  {
    type: 'entity.moveTo',
    kind: 'action',
    title: 'Move to',
    category: 'Things',
    doc: 'Puts something at a place (x, y, z in studs). An asset goes to the nearest whole stud.',
    inputs: [EXEC_IN, who(), num('x'), num('y'), num('z')],
    outputs: [EXEC_OUT],
    code: { name: 'entity.moveTo', style: 'call' },
    exec: (c, _a, i) => c.moveThing?.('to', String(i.target ?? 'this'), n(i.x), n(i.y), n(i.z)),
  },
  {
    type: 'entity.face',
    kind: 'action',
    title: 'Face',
    category: 'Things',
    doc: 'Turns something to face a way, in degrees (0 is +z, 90 is +x). A placed asset turns in quarter turns.',
    inputs: [EXEC_IN, who(), num('degrees')],
    outputs: [EXEC_OUT],
    code: { name: 'entity.face', style: 'call' },
    exec: (c, _a, i) => c.face?.(String(i.target ?? 'this'), n(i.degrees)),
  },
  {
    type: 'entity.lookAt',
    kind: 'action',
    title: 'Turn toward',
    category: 'Things',
    doc: 'Turns something to face another thing (a character turns smoothly; an asset in quarter turns).',
    inputs: [EXEC_IN, who(), who('other', 'Toward', 'hero')],
    outputs: [EXEC_OUT],
    code: { name: 'entity.lookAt', style: 'call' },
    exec: (c, _a, i) => c.lookAt?.(String(i.target ?? 'this'), String(i.other ?? 'hero')),
  },
  // physics
  {
    type: 'physics.push',
    kind: 'action',
    title: 'Push',
    category: 'Physics',
    doc: 'Gives a loose object (Turn it into › Loose) or the hero a push: a change of speed in studs a second (x, y up, z). Heavier things are pushed the same way: it is a speed, not a force.',
    inputs: [EXEC_IN, who(), num('x'), num('y', 4), num('z')],
    outputs: [EXEC_OUT],
    code: { name: 'physics.push', style: 'call' },
    exec: (c, _a, i) => c.physics?.('push', String(i.target ?? 'this'), n(i.x), n(i.y), n(i.z)),
  },
  {
    type: 'physics.setVelocity',
    kind: 'action',
    title: 'Set speed',
    category: 'Physics',
    doc: 'Sets how fast a loose object moves now (studs a second: x, y up, z).',
    inputs: [EXEC_IN, who(), num('x'), num('y'), num('z')],
    outputs: [EXEC_OUT],
    code: { name: 'physics.setVelocity', style: 'call' },
    exec: (c, _a, i) => c.physics?.('velocity', String(i.target ?? 'this'), n(i.x), n(i.y), n(i.z)),
  },
  fn(
    'physics.raycast',
    'Look ahead',
    'Physics',
    'How far something solid is in front of it (studs), looking from a little above its feet the way it faces; −1 when nothing is within Reach.',
    [who('from', 'From'), num('reach', 10)],
    'number',
    'physics.raycast',
    (c, _a, i) => c.raycast?.(String(i.from ?? 'this'), n(i.reach)) ?? -1,
  ),
  // input and time
  fn(
    'input.held',
    'Button held',
    'Input',
    'True while the player holds a button: attack, action, jump, guard, roll, lockOn, item1, item2, item3, forward, back, left or right.',
    [{ name: 'button', type: 'string', default: 'action' }],
    'bool',
    'input.held',
    (c, _a, i) => c.held?.(String(i.button ?? 'action')) ?? false,
  ),
  fn(
    'time.now',
    'Game time',
    'Input',
    'Seconds since play started (game time: it stops while paused).',
    [],
    'number',
    'time.now',
    (c) => c.now?.() ?? 0,
  ),
  // messages
  {
    type: 'msg.send',
    kind: 'action',
    title: 'Send message',
    category: 'Things',
    doc: 'Sends a message to another object: its behaviours’ On message (with this name) run, with the value. Behaviours talk to each other this way (a switch tells a door to open).',
    inputs: [
      EXEC_IN,
      who('target', 'To', ''),
      { name: 'name', type: 'string', default: 'open' },
      { name: 'value', type: 'any', default: '' },
    ],
    outputs: [EXEC_OUT],
    code: { name: 'msg.send', style: 'call' },
    // the interpreter sends it (it knows who sends)
    exec: () => {},
  },
];
