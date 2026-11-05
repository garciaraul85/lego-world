/**
 * Milestone 3b (B3): the engine's own asset features as built-in behaviours (base classes). Each keeps its engine
 * code and its settings on the asset (so older projects already have them: an asset with a lock *is* a Lock); here
 * each is described as a behaviour: what it does, its settings as fields, its hooks (decisions a behaviour that
 * extends it can make itself: `class GemDoor extends Lock { canOpen(e) { … } }`) and the events it sends.
 */
import { DEFAULT_STATS } from '../character/sheet';
import type { Asset, BehaviourField, Character, FieldValue } from '../schema';

export type BuiltinHook = { method: string; event: string; returns: 'bool' | 'number'; doc: string };
export type Builtin<T = Asset> = {
  /** its class name (what `extends` names) */
  name: string;
  about: string;
  /** Milestone 3b (B4): what it goes on: an asset (and its copies), or a character */
  for?: 'asset' | 'character';
  /** B4: it is what the thing is (the Hero, a Neighbour): it cannot be added or taken off */
  fixed?: boolean;
  /** the asset has it (its setting is there) */
  on(a: T): boolean;
  /** what attaching it adds to an asset (its default settings) */
  add(a: T): Partial<T>;
  /** the asset without it */
  remove(a: T): T;
  /** its settings as fields: read from the asset, and written back */
  fields: (BehaviourField & {
    get(a: T): FieldValue;
    set(a: T, v: FieldValue): Partial<T>;
    /** a text field that is one of these (a list to pick from) */
    choices?: readonly string[];
  })[];
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
        label: 'Opens with',
        choices: ['small', 'boss', 'item'],
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

/** Milestone 3b (B3, part 2): a number field of a setting object on the asset */
type F = Builtin['fields'][number];
function num<K extends keyof Asset>(
  key: K,
  name: string,
  label: string,
  def: number,
  min: number,
  max: number,
  base: (a: Asset) => NonNullable<Asset[K]>,
  int = false,
): F {
  return {
    name,
    type: 'number',
    default: def,
    label,
    min,
    max,
    get: (a) => ((a[key] as Record<string, unknown> | undefined)?.[name] as number | undefined) ?? def,
    set: (a, v) => {
      let n = Math.max(min, Math.min(max, Number(v) || def));
      if (int) n = Math.round(n);
      return { [key]: { ...((a[key] ?? base(a)) as object), [name]: n } } as Partial<Asset>;
    },
  };
}
function flag<K extends keyof Asset>(
  key: K,
  name: string,
  label: string,
  def: boolean,
  base: (a: Asset) => NonNullable<Asset[K]>,
): F {
  return {
    name,
    type: 'bool',
    default: def,
    label,
    get: (a) => ((a[key] as Record<string, unknown> | undefined)?.[name] as boolean | undefined) ?? def,
    set: (a, v) => ({ [key]: { ...((a[key] ?? base(a)) as object), [name]: !!v } }) as Partial<Asset>,
  };
}
function pick<K extends keyof Asset>(
  key: K,
  name: string,
  label: string,
  choices: readonly string[],
  base: (a: Asset) => NonNullable<Asset[K]>,
): F {
  return {
    name,
    type: 'string',
    default: choices[0]!,
    label,
    choices,
    get: (a) => ((a[key] as Record<string, unknown> | undefined)?.[name] as string | undefined) ?? choices[0]!,
    set: (a, v) =>
      ({
        [key]: { ...((a[key] ?? base(a)) as object), [name]: choices.includes(String(v)) ? String(v) : choices[0] },
      }) as Partial<Asset>,
  };
}
const mid = (a: Asset, y: number): [number, number, number] => [a.footprint[0] / 2, y, a.footprint[1] / 2];
const twoStates = (a: Asset, first: string, second: string): Partial<Asset> =>
  a.states.length < 2 ? { states: [a.states[0] ?? first, second] } : {};

const flame = (a: Asset) => ({ at: mid(a, 2) });
const beam = (a: Asset) => ({ at: mid(a, 1) });
const moves = () => ({ by: [0, 4, 0] as [number, number, number] });
const wind = (a: Asset): NonNullable<Asset['wind']> => ({ at: [a.footprint[0] / 2, 0, a.footprint[1]] });
const light = (a: Asset): NonNullable<Asset['light']> => ({
  color: '#ffd28a',
  brightness: 1,
  range: 8,
  flicker: 0,
  shadow: false,
  at: mid(a, 2),
});

BUILTINS.push(
  {
    name: 'Burnable',
    about:
      'It catches fire (a lit stick, a fire arrow, a bomb, fire next to it), burns a while and is gone: vines, a barricade, a web.',
    on: (a) => !!a.burn,
    add: () => ({ burn: {} }),
    remove: (a) => without(a, 'burn'),
    fields: [
      num('burn', 'seconds', 'Burns for (seconds)', 2, 0.5, 30, () => ({})),
      flag('burn', 'spreads', 'Sets things touching it alight', true, () => ({})),
    ],
    hooks: [hk('canBurn', 'bool', 'Does it catch fire now? (why: how the fire came)')],
    events: ['event.onBurned'],
    editIn: 'Assets › Fire and light › Burns',
  },
  {
    name: 'Flame',
    about: 'A fire burns on it (a lit torch stand), always or in one of its states.',
    on: (a) => !!a.flame,
    add: (a) => ({ flame: flame(a) }),
    remove: (a) => without(a, 'flame'),
    fields: [num('flame', 'size', 'How big', 1, 0.2, 4, flame)],
    hooks: [],
    events: [],
    editIn: 'Assets › Fire and light › Flame',
  },
  {
    name: 'Beam',
    about:
      'It shines a beam of light straight ahead (a sun stone): mirrors turn it, light sensors see it, it can melt ice.',
    on: (a) => !!a.beam,
    add: (a) => ({ beam: beam(a) }),
    remove: (a) => without(a, 'beam'),
    fields: [num('beam', 'range', 'Reach (studs)', 32, 4, 96, beam)],
    hooks: [],
    events: [],
    editIn: 'Assets › Fire and light › Shines',
  },
  {
    name: 'Mirror',
    about: 'It turns a beam of light a quarter turn; the hero turns it round (two states, one leaning each way).',
    on: (a) => !!a.mirror,
    add: (a) => ({ mirror: {}, ...twoStates(a, 'left', 'right') }),
    remove: (a) => without(a, 'mirror'),
    fields: [flag('mirror', 'turns', 'The hero can turn it', true, () => ({}))],
    hooks: [hk('canTurn', 'bool', 'Can the hero turn it now?')],
    events: ['event.onSwitch'],
    editIn: 'Assets › Fire and light › Mirror',
  },
  {
    name: 'BombPlant',
    about: 'It grows a bomb the hero picks, lights and throws; it grows another as its setting says.',
    on: (a) => !!a.bombPlant,
    add: (a) => ({ bombPlant: {}, ...twoStates(a, 'grown', 'picked') }),
    remove: (a) => without(a, 'bombPlant'),
    fields: [pick('bombPlant', 'regrow', 'Grows another', ['missed', 'always', 'never'], () => ({}))],
    hooks: [hk('canPick', 'bool', 'Can the hero pick its bomb now?')],
    events: [],
    editIn: 'Assets › Fire and light › Grows another',
  },
  {
    name: 'Ice',
    about: 'Slippery to walk on; a push block of it slides on by itself; fire (or light) melts it.',
    on: (a) => !!a.ice,
    add: () => ({ ice: {} }),
    remove: (a) => without(a, 'ice'),
    fields: [
      flag('ice', 'floor', 'Slippery to walk on', true, () => ({})),
      flag('ice', 'slides', 'Slides on when pushed', false, () => ({})),
      pick('ice', 'melts', 'Melts with', ['fire', 'fire-or-light', 'never'], () => ({})),
      num('ice', 'seconds', 'Melts in (seconds)', 2, 0.5, 30, () => ({})),
    ],
    hooks: [hk('canMelt', 'bool', 'Does it start to melt now? (by: fire, light or thaw)')],
    events: [],
    editIn: 'Assets › Ice, moving and climbing › Ice',
  },
  {
    name: 'Platform',
    about: 'It moves back and forth (or up and down) and carries what stands on it.',
    on: (a) => !!a.moves,
    add: () => ({ moves: moves() }),
    remove: (a) => without(a, 'moves'),
    fields: [
      ...(['x', 'y', 'z'] as const).map(
        (k, i): F => ({
          name: `far${k.toUpperCase()}`,
          type: 'number',
          default: i === 1 ? 4 : 0,
          label: `Far end: ${k === 'y' ? 'up' : k} (studs)`,
          min: i === 1 ? -32 : -64,
          max: i === 1 ? 32 : 64,
          get: (a) => a.moves?.by[i] ?? (i === 1 ? 4 : 0),
          set: (a, v) => {
            const by = [...(a.moves?.by ?? moves().by)] as [number, number, number];
            by[i] = Math.max(i === 1 ? -32 : -64, Math.min(i === 1 ? 32 : 64, Number(v) || 0));
            return { moves: { ...(a.moves ?? moves()), by } };
          },
        }),
      ),
      num('moves', 'seconds', 'Seconds end to end', 3, 0.5, 60, moves),
      num('moves', 'pause', 'Waits at each end (seconds)', 1, 0, 30, moves),
      flag('moves', 'whenOn', 'Only while on (its second state)', false, moves),
    ],
    hooks: [],
    events: [],
    editIn: 'Assets › Ice, moving and climbing › Moves',
  },
  {
    name: 'Fan',
    about:
      'It blows wind straight ahead: the hero leans into it or is blown back; it turns windmills, carries the glider.',
    on: (a) => !!a.wind,
    add: (a) => ({ wind: wind(a) }),
    remove: (a) => without(a, 'wind'),
    fields: [
      num('wind', 'speed', 'Air speed (studs a second)', 16, 2, 60, wind),
      num('wind', 'reach', 'Reach (studs)', 16, 2, 64, wind),
      num('wind', 'width', 'Width at the fan', 3, 1, 16, wind),
      num('wind', 'height', 'Height at the fan', 3, 1, 16, wind),
    ],
    hooks: [],
    events: [],
    editIn: 'Assets › Wind and lifting › Blows',
  },
  {
    name: 'Liftable',
    about: 'The hero lifts it over the head, carries it, puts it down or throws it (a rock, a pot).',
    on: (a) => !!a.lift,
    add: () => ({ lift: {} }),
    remove: (a) => without(a, 'lift'),
    fields: [
      flag('lift', 'breaks', 'Breaks where it lands', false, () => ({})),
      num('lift', 'weight', 'Weight on a floor switch', 1, 1, 5, () => ({}), true),
    ],
    hooks: [hk('canLift', 'bool', 'Can the hero lift it now?')],
    events: [],
    editIn: 'Assets › Wind and lifting › Lift',
  },
  {
    name: 'PhysicsBody',
    about: 'A loose object: in Play it falls, tumbles, is pushed about by the hero and wind, and floats in water.',
    on: (a) => !!a.loose,
    add: () => ({ loose: true }),
    remove: (a) => without(a, 'loose'),
    fields: [],
    hooks: [],
    events: [],
    editIn: 'Scene › Inspector › Loose',
  },
  {
    name: 'HookTarget',
    about:
      'The hook line and the grapple rope catch on it (a target, a ring, a beam); wood, vines and ladders catch anyway.',
    on: (a) => !!a.hook,
    add: () => ({ hook: true }),
    remove: (a) => without(a, 'hook'),
    fields: [],
    hooks: [hk('canCatch', 'bool', 'Does the hook catch on it now?')],
    events: [],
    editIn: 'Assets › Wind and lifting › Hook target',
  },
  {
    name: 'Magnetic',
    about: 'It is metal: the magnet glove pulls a loose one, and it is heavy (it sinks in water).',
    on: (a) => !!a.metal,
    add: () => ({ metal: true }),
    remove: (a) => without(a, 'metal'),
    fields: [],
    hooks: [],
    events: [],
    editIn: 'Assets › Wind and lifting › Metal',
  },
);

// Milestone 3b (B3, part 2): the Light's settings as fields
BUILTINS.find((b) => b.name === 'Light')!.fields.push(
  num('light', 'brightness', 'Brightness', 1, 0, 4, light),
  num('light', 'range', 'Reach (studs)', 8, 2, 40, light),
  num('light', 'flicker', 'Flicker', 0, 0, 1, light),
);

export const builtinNamed = (name: string | undefined) => BUILTINS.find((b) => b.name === name) ?? null;

// ---------- Milestone 3b (B4): characters ----------

const stat = (name: keyof typeof DEFAULT_STATS & string, label: string, min: number, max: number, int = false) => ({
  name,
  type: 'number' as const,
  default: DEFAULT_STATS[name] as number,
  label,
  min,
  max,
  get: (c: Character) => (c.stats?.[name] as number | undefined) ?? (DEFAULT_STATS[name] as number),
  set: (c: Character, v: FieldValue): Partial<Character> => {
    let n = Math.max(min, Math.min(max, Number(v) || (DEFAULT_STATS[name] as number)));
    if (int) n = Math.round(n);
    return { stats: { ...DEFAULT_STATS, ...(c.stats ?? {}), [name]: n } };
  },
});
const harmOf = (c: Character): NonNullable<Character['harm']> =>
  c.harm ?? { canBeHarmed: true, health: { hp: 3, atZero: { break: false } } };

export const CHARACTER_BUILTINS: Builtin<Character>[] = [
  {
    name: 'Hero',
    for: 'character',
    fixed: true,
    about:
      'The character the player plays: it walks, runs and jumps with the sheet’s speed and jump, hits with its strength, takes hits after its defence, and gains experience.',
    on: (c) => c.role === 'hero',
    add: () => ({}),
    remove: (c) => c,
    fields: [
      stat('health', 'Hearts', 1, 99, true),
      stat('speed', 'Speed (1: normal)', 0.5, 2),
      stat('jump', 'Jump (1: normal)', 0.5, 2),
      stat('strength', 'Strength (1: normal)', 0.5, 3),
      stat('defence', 'Defence (8% less a point)', 0, 10, true),
      stat('stamina', 'Stamina', 10, 500, true),
    ],
    hooks: [
      hk('canJump', 'bool', 'Can the hero jump now? (onGround: standing on something)'),
      hk('moveSpeed', 'number', 'How fast the hero walks or runs now (1: normal; asked every step)'),
      hk('hitPower', 'number', 'How hard this swing hits (power, kind: light, heavy, charged, spin, bash)'),
      hk('takeDamage', 'number', 'How much a hit takes from the hero’s hearts (after defence)'),
      hk('gainXp', 'number', 'How much experience the hero gets (amount)'),
    ],
    events: ['event.onDamaged', 'event.onDefeated', 'event.onLevelUp'],
    editIn: 'Characters › Stats',
  },
  {
    name: 'Neighbour',
    for: 'character',
    fixed: true,
    about: 'A character who lives on the map: it walks about or stands where it was put, and the hero talks to it.',
    on: (c) => c.role === 'npc',
    add: () => ({}),
    remove: (c) => c,
    fields: [
      {
        name: 'stands',
        type: 'bool',
        default: false,
        label: 'Stands where it was put',
        get: (c) => c.behaviour?.routine === 'stand',
        set: (c, v) => ({ behaviour: { kind: c.behaviour?.kind ?? 'villager', routine: v ? 'stand' : 'wander' } }),
      },
    ],
    hooks: [hk('canTalk', 'bool', 'Will it talk to the hero now?')],
    events: ['event.onConversationEnd', 'event.onChoice'],
    editIn: 'Characters › Behaviour',
  },
  {
    name: 'Damageable',
    for: 'character',
    about: 'The hero can hit and hurt it; at 0 it is defeated (and drops its loot).',
    on: (c) => !!c.harm?.canBeHarmed,
    add: (c) => ({ harm: { ...harmOf(c), canBeHarmed: true } }),
    remove: (c) => {
      const { harm: _gone, ...rest } = c;
      return rest as Character;
    },
    fields: [
      {
        name: 'hp',
        type: 'number',
        default: 3,
        label: 'Health',
        min: 1,
        max: 999,
        get: (c) => c.harm?.health.hp ?? 3,
        set: (c, v) => {
          const h = harmOf(c);
          return { harm: { ...h, health: { ...h.health, hp: Math.max(1, Math.min(999, Number(v) || 1)) } } };
        },
      },
      {
        name: 'armor',
        type: 'number',
        default: 0,
        label: 'Armour (taken off every hit)',
        min: 0,
        max: 99,
        get: (c) => c.harm?.health.armor ?? 0,
        set: (c, v) => {
          const h = harmOf(c);
          return { harm: { ...h, health: { ...h.health, armor: Math.max(0, Math.min(99, Number(v) || 0)) } } };
        },
      },
    ],
    hooks: [hk('takeDamage', 'number', 'How much a hit takes (after armour, its sides and weaknesses).')],
    events: ['event.onDamaged', 'event.onDefeated'],
    editIn: 'Characters › Stats › Can be harmed',
  },
];

// Milestone 3b (B4, part 2): what the hero does in water and on walls, and a neighbour that follows
CHARACTER_BUILTINS.push(
  {
    name: 'Swimmer',
    for: 'character',
    fixed: true,
    about: 'The hero swims in deep water, dives with the Action button held, and holds its breath under water.',
    on: (c) => c.role === 'hero',
    add: () => ({}),
    remove: (c) => c,
    fields: [],
    hooks: [
      hk('canDive', 'bool', 'Can the hero dive now?'),
      hk('breath', 'number', 'Seconds of air under water (asked every step)'),
    ],
    events: [],
    editIn: 'Project › Swimming',
  },
  {
    name: 'Climber',
    for: 'character',
    fixed: true,
    about:
      'The hero climbs onto ledges, up ladders and vines, and (with Climbing: anything) up walls while stamina lasts.',
    on: (c) => c.role === 'hero',
    add: () => ({}),
    remove: (c) => c,
    fields: [],
    hooks: [hk('canClimbWall', 'bool', 'Can the hero take hold of this wall now?')],
    events: [],
    editIn: 'Project › Climbing',
  },
  {
    name: 'Follower',
    for: 'character',
    fixed: true,
    about:
      'A neighbour told to follow the hero (Follow the hero card) walks after it, runs to catch up and jumps to it when far behind.',
    on: (c) => c.role === 'npc',
    add: () => ({}),
    remove: (c) => c,
    fields: [],
    hooks: [hk('followGap', 'number', 'How close it keeps to the hero (studs; distance: how far it is now)')],
    events: [],
    editIn: 'Logic › Follow',
  },
);

export const characterBuiltinNamed = (name: string | undefined) =>
  CHARACTER_BUILTINS.find((b) => b.name === name) ?? null;
/** any built-in by its class name (an asset's or a character's) */
export const anyBuiltinNamed = (name: string | undefined): Builtin<Asset> | Builtin<Character> | null =>
  builtinNamed(name) ?? characterBuiltinNamed(name);

/** a built-in's hook by its event type */
export const hookOf = (event: string) => {
  for (const b of [...BUILTINS, ...CHARACTER_BUILTINS])
    for (const h of b.hooks) if (h.event === event) return { builtin: b, hook: h };
  return null;
};

/** a new behaviour that extends a built-in: each of its hooks answered with the engine's own answer, to change */
export function extendCode(b: Pick<Builtin<unknown>, 'name' | 'hooks'>, name: string): string {
  const cls = name.replace(/[^A-Za-z0-9]/g, '') || `My${b.name}`;
  const lines = [`class ${cls} extends ${b.name} {`, ...(b.hooks.length ? [''] : [])];
  b.hooks.forEach((h, i) => {
    if (i) lines.push('');
    lines.push(`  ${h.method}(e) {`, `    return super.${h.method}(e);`, '  }');
  });
  lines.push('}');
  return lines.join('\n');
}
