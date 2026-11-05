/**
 * Milestone 3b (B3): the engine's own asset features as built-in behaviours (base classes). Each keeps its engine
 * code and its settings on the asset (so older projects already have them: an asset with a lock *is* a Lock); here
 * each is described as a behaviour: what it does, its settings as fields, its hooks (decisions a behaviour that
 * extends it can make itself: `class GemDoor extends Lock { canOpen(e) { … } }`) and the events it sends.
 */
import type { Asset, BehaviourField, FieldValue } from '../schema';

export type BuiltinHook = { method: string; event: string; returns: 'bool' | 'number'; doc: string };
export type Builtin = {
  /** its class name (what `extends` names) */
  name: string;
  about: string;
  /** the asset has it (its setting is there) */
  on(a: Asset): boolean;
  /** what attaching it adds to an asset (its default settings) */
  add(a: Asset): Partial<Asset>;
  /** the asset without it */
  remove(a: Asset): Asset;
  /** its settings as fields: read from the asset, and written back */
  fields: (BehaviourField & { get(a: Asset): FieldValue; set(a: Asset, v: FieldValue): Partial<Asset> })[];
  hooks: BuiltinHook[];
  /** logic events it sends (what a behaviour on it can listen to) */
  events: string[];
  /** where its settings are edited besides here */
  editIn: string;
};

const without = (a: Asset, key: keyof Asset): Asset => {
  const { [key]: _gone, ...rest } = a;
  return rest as Asset;
};
const hk = (method: string, returns: BuiltinHook['returns'], doc: string): BuiltinHook => ({
  method,
  event: `event.on${method.charAt(0).toUpperCase()}${method.slice(1)}`,
  returns,
  doc,
});

export const BUILTINS: Builtin[] = [
  {
    name: 'Interactable',
    about:
      'The hero uses it with the Action button at one of its sockets: its interactions run (a door opens, a chest gives its item).',
    on: (a) => a.interactions.length > 0,
    add: () => ({}),
    remove: (a) => ({ ...a, interactions: [] }),
    fields: [],
    hooks: [hk('canUse', 'bool', 'Can the hero use it now? false: nothing happens.')],
    events: ['event.onInteract'],
    editIn: 'Assets › Interactions',
  },
  {
    name: 'Health',
    about: 'It can be hit and hurt; at 0 it breaks (or is defeated), drops its loot, and may come back.',
    on: (a) => !!a.health,
    add: () => ({ health: { hp: 3, atZero: { break: true } } }),
    remove: (a) => without(a, 'health'),
    fields: [
      {
        name: 'hp',
        type: 'number',
        default: 3,
        label: 'Health',
        min: 1,
        max: 999,
        get: (a) => a.health?.hp ?? 3,
        set: (a, v) => ({ health: { ...(a.health ?? { atZero: { break: true } }), hp: Math.max(1, Number(v) || 1) } }),
      },
    ],
    hooks: [hk('takeDamage', 'number', 'How much a hit takes (after armour and weaknesses).')],
    events: ['event.onDamaged', 'event.onDefeated'],
    editIn: 'Assets › Health',
  },
  {
    name: 'Lock',
    about: 'Locked until the hero opens it with a key: a small key of this dungeon, the boss key, or an item.',
    on: (a) => !!a.lock,
    add: (a) => ({
      lock: { key: 'small' },
      ...(a.states.length < 2 ? { states: [a.states[0] ?? 'closed', 'open'] } : {}),
    }),
    remove: (a) => without(a, 'lock'),
    fields: [
      {
        name: 'key',
        type: 'string',
        default: 'small',
        label: 'Opens with (small, boss, item)',
        get: (a) => a.lock?.key ?? 'small',
        set: (a, v) => ({
          lock: { ...(a.lock ?? {}), key: (['small', 'boss', 'item'].includes(String(v)) ? v : 'small') as 'small' },
        }),
      },
      {
        name: 'item',
        type: 'item',
        default: '',
        label: 'The item (key: item)',
        get: (a) => a.lock?.item ?? '',
        set: (a, v) => ({ lock: { ...(a.lock ?? { key: 'item' }), ...(v ? { item: String(v) } : {}) } }),
      },
    ],
    hooks: [hk('canOpen', 'bool', 'Does it open now? (the key is used up only if the hero has one)')],
    events: ['event.onUnlocked'],
    editIn: 'Assets › Puzzle › Lock',
  },
  {
    name: 'Switch',
    about:
      'A switch: stepped on (a floor switch, by weight), hit (a crystal), pressed (a lever) or lit (a light sensor). It stays on, is held, runs on a timer or toggles.',
    on: (a) => !!a.switch,
    add: (a) => ({
      switch: { by: 'step', stays: 'held' },
      ...(a.states.length < 2 ? { states: [a.states[0] ?? 'off', 'on'] } : {}),
    }),
    remove: (a) => without(a, 'switch'),
    fields: [
      {
        name: 'weight',
        type: 'number',
        default: 1,
        label: 'Weight needed (floor switch)',
        min: 1,
        max: 10,
        get: (a) => a.switch?.weight ?? 1,
        set: (a, v) => ({
          switch: {
            ...(a.switch ?? { by: 'step', stays: 'held' }),
            weight: Math.max(1, Math.min(10, Math.round(Number(v) || 1))),
          },
        }),
      },
    ],
    hooks: [hk('isPressed', 'bool', 'Is a floor switch down? (weight on it, and who)')],
    events: ['event.onSwitch'],
    editIn: 'Assets › Puzzle › Switch',
  },
  {
    name: 'Pushable',
    about:
      'A block the hero grabs (Action held) and pushes or pulls square along the floor, a stud or its size at a time.',
    on: (a) => !!a.push,
    add: () => ({ push: {} }),
    remove: (a) => without(a, 'push'),
    fields: [
      {
        name: 'pull',
        type: 'bool',
        default: false,
        label: 'Can be pulled too',
        get: (a) => !!a.push?.pull,
        set: (a, v) => ({ push: { ...(a.push ?? {}), pull: !!v } }),
      },
    ],
    hooks: [hk('canPush', 'bool', 'Can it move this way now? (dx, dz, pulled)')],
    events: ['event.onPushed'],
    editIn: 'Assets › Puzzle › Push',
  },
  {
    name: 'Pickup',
    about: 'Touched, it is gone and the hero has its item (a key, a heart, rupees, the dungeon map…).',
    on: (a) => !!a.pickup,
    add: () => ({ pickup: { item: 'rupee', count: 1 } }),
    remove: (a) => without(a, 'pickup'),
    fields: [
      {
        name: 'item',
        type: 'item',
        default: 'rupee',
        label: 'Gives',
        get: (a) => a.pickup?.item ?? 'rupee',
        set: (a, v) => ({ pickup: { ...(a.pickup ?? { count: 1 }), item: String(v || 'rupee') } }),
      },
      {
        name: 'count',
        type: 'number',
        default: 1,
        label: 'How many',
        min: 1,
        max: 99,
        get: (a) => a.pickup?.count ?? 1,
        set: (a, v) => ({
          pickup: { ...(a.pickup ?? { item: 'rupee' }), count: Math.max(1, Math.round(Number(v) || 1)) },
        }),
      },
    ],
    hooks: [hk('canPickUp', 'bool', 'Can the hero take it now?')],
    events: ['event.onPickedUp'],
    editIn: 'Assets › Puzzle › Pickup',
  },
  {
    name: 'Climbable',
    about: 'Vines or a ladder: walk into it to take hold and climb.',
    on: (a) => !!a.climbable,
    add: () => ({ climbable: true }),
    remove: (a) => without(a, 'climbable'),
    fields: [],
    hooks: [hk('canClimb', 'bool', 'Can the hero take hold now?')],
    events: [],
    editIn: 'Assets › Fire and light › Climbable',
  },
  {
    name: 'Checkpoint',
    about: 'Touched, it is where the hero comes back after a fall or defeat.',
    on: (a) => !!a.checkpoint,
    add: () => ({ checkpoint: true }),
    remove: (a) => without(a, 'checkpoint'),
    fields: [],
    hooks: [],
    events: [],
    editIn: 'Assets › Checkpoint',
  },
  {
    name: 'Hidden',
    about: 'Unseen until the hero looks through the Lens of Truth; still solid.',
    on: (a) => !!a.hidden,
    add: () => ({ hidden: true }),
    remove: (a) => without(a, 'hidden'),
    fields: [],
    hooks: [],
    events: [],
    editIn: 'Assets › Wind and lifting › Hidden',
  },
  {
    name: 'Fake',
    about: 'Looks solid but is not: the hero walks or falls through it (see-through through the Lens).',
    on: (a) => !!a.fake,
    add: () => ({ fake: true }),
    remove: (a) => without(a, 'fake'),
    fields: [],
    hooks: [],
    events: [],
    editIn: 'Assets › Wind and lifting › Fake',
  },
  {
    name: 'Light',
    about: 'It shines a light (a lamp, a torch): colour, how far, only at night.',
    on: (a) => !!a.light,
    add: (a) => ({
      light: {
        color: '#ffd28a',
        brightness: 1,
        range: 8,
        flicker: 0,
        shadow: false,
        at: [a.footprint[0] / 2, 2, a.footprint[1] / 2],
      },
    }),
    remove: (a) => without(a, 'light'),
    fields: [],
    hooks: [],
    events: [],
    editIn: 'Assets › Light',
  },
];

export const builtinNamed = (name: string | undefined) => BUILTINS.find((b) => b.name === name) ?? null;
/** a built-in's hook by its event type */
export const hookOf = (event: string) => {
  for (const b of BUILTINS) for (const h of b.hooks) if (h.event === event) return { builtin: b, hook: h };
  return null;
};

/** a new behaviour that extends a built-in: each of its hooks answered with the engine's own answer, to change */
export function extendCode(b: Builtin, name: string): string {
  const cls = name.replace(/[^A-Za-z0-9]/g, '') || `My${b.name}`;
  const lines = [`class ${cls} extends ${b.name} {`, ...(b.hooks.length ? [''] : [])];
  for (const h of b.hooks) {
    lines.push(`  ${h.method}(e) {`, `    return super.${h.method}(e);`, '  }');
  }
  lines.push('}');
  return lines.join('\n');
}
