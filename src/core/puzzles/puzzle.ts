import { z } from 'zod';
import { DAMAGE_TYPES, type DamageType } from '../combat/damage';

/**
 * Step 12a: the puzzle parts an asset can have, Zelda style.
 *
 * - push: a block the hero grabs (hold Action) and shoves one step along the floor, square to the grid; with
 *   pull on, the hero can also step back to drag it. It stops at walls, other blocks and
 *   edges, and it can hold a floor switch down.
 * - switch: something with an off and an on state (its first two states). Stepped on (the hero, or a block on it),
 *   hit (a sword, an arrow, a boomerang, a bomb: the hit kinds it answers to), or pressed (Action). It stays on,
 *   is on only while held down, or goes back off after some seconds (timed, ticking).
 * - lock: a door that opens (to its second state) with a key: a small key (used up), the boss key (kept), or any
 *   item by name.
 * - pickup: touched, it is gone and the hero has the item: a small key, the boss key, the dungeon map, the compass,
 *   a heart, or any item by name.
 *
 * The small key, boss key, dungeon map and compass belong to the map where they were found (a dungeon is a map):
 * keys from one dungeon do not open another's doors.
 */
export const SWITCH_BY = ['step', 'hit', 'press', 'light'] as const;
export type SwitchBy = (typeof SWITCH_BY)[number];
export const SWITCH_STAYS = ['on', 'held', 'timed', 'toggle'] as const;
export type SwitchStays = (typeof SWITCH_STAYS)[number];

export const PushDef = z.strictObject({
  /** the hero can also grab it and pull it back (hold Action, step back) */
  pull: z.boolean().optional(),
  /** studs it moves each shove (default: its own size along the way it goes) */
  step: z.number().int().min(1).max(8).optional(),
});
export type PushDef = z.infer<typeof PushDef>;

export const SwitchDef = z.strictObject({
  by: z.enum(SWITCH_BY),
  /** on: stays on · held: on only while something stands on it (step) · timed: back off after `seconds` ·
   *  toggle: each use flips it */
  stays: z.enum(SWITCH_STAYS),
  seconds: z.number().min(1).max(120).optional(),
  /** hit: the kinds of hit it answers to (none listed: any hit) */
  hitBy: z.array(z.enum(DAMAGE_TYPES)).max(9).optional(),
  /** step: what can hold it down (default both) */
  heavy: z.enum(['any', 'hero', 'block']).optional(),
  /** step: how much weight must be on it (the hero or a neighbour 1, a crate 1–3 by size, a push block 3); default 1 */
  weight: z.number().int().min(1).max(10).optional(),
});
export type SwitchDef = z.infer<typeof SwitchDef>;

/**
 * Step 12b: fire and light.
 *
 * - burn: it catches fire from a fire hit (a torch swung, a flame), a bomb's blast or a burning thing touching it,
 *   burns for some seconds and is gone (vines, a wooden barricade, a web).
 * - beam: it shines a beam of light straight ahead (its front, the way it is turned) from a point on it, in one of
 *   its states or always. The beam stops at the first solid thing; a mirror turns it; a light sensor switch it
 *   reaches turns on.
 * - mirror: it turns a beam a quarter turn. Its first state leans one way (/), its second the other (\); Action at
 *   its interact socket turns it, and a turned copy (T) leans the other way.
 */
export const BurnDef = z.strictObject({
  /** seconds it burns before it is gone (2 at first) */
  seconds: z.number().min(0.5).max(30).optional(),
  /** it sets burnable things touching it alight (on at first) */
  spreads: z.boolean().optional(),
});
export type BurnDef = z.infer<typeof BurnDef>;

export const BeamDef = z.strictObject({
  /** where the beam starts on it (x, z studs, y up, as a socket's place) */
  at: z.tuple([z.number(), z.number(), z.number()]),
  /** the state it shines in (none: always) */
  when: z.string().max(40).optional(),
  /** how far it reaches, studs (32 at first) */
  range: z.number().min(4).max(96).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type BeamDef = z.infer<typeof BeamDef>;

/** step 12b: a plant that grows a bomb (Action picks it, lit); once it has gone off another grows (or not) */
export const BOMB_REGROW = ['always', 'missed', 'never'] as const;
export const BombPlantDef = z.strictObject({
  /** grows another: always, only when the last one broke nothing (a miss: missed, at first), or never */
  regrow: z.enum(BOMB_REGROW).optional(),
});
export type BombPlantDef = z.infer<typeof BombPlantDef>;

/** step 12b: a fire effect on the asset (a lit torch stand's flame), in one of its states or always */
export const FlameDef = z.strictObject({
  /** where it burns on it (x, z studs, y up, as a socket's place) */
  at: z.tuple([z.number(), z.number(), z.number()]),
  /** the state it burns in (none: always) */
  when: z.string().max(40).optional(),
  /** how big (1: as the effect is made) */
  size: z.number().min(0.2).max(4).optional(),
  /** the effect (none: Fire) */
  effect: z.string().max(40).optional(),
});
export type FlameDef = z.infer<typeof FlameDef>;

/**
 * step 12c: ice. A floor of it is slippery (the hero speeds up and slows down slowly, and slides on); a block of it,
 * pushed, slides on by itself until something stops it; and it melts with fire (and a beam of light, if set).
 */
export const ICE_MELTS = ['fire', 'fire-or-light', 'never'] as const;
export const IceDef = z.strictObject({
  /** walking on it slides (on at first) */
  floor: z.boolean().optional(),
  /** a push block of it slides on by itself, until something stops it */
  slides: z.boolean().optional(),
  /** what melts it: fire (at first), fire or a beam of light, or nothing */
  melts: z.enum(ICE_MELTS).optional(),
  /** seconds it takes to melt (2 at first) */
  seconds: z.number().min(0.5).max(30).optional(),
});
export type IceDef = z.infer<typeof IceDef>;

/**
 * step 12c: a moving platform. It travels from where it is placed to `by` studs away and back (or round and back
 * to the start, with stops), carrying what stands on it; with `whenOn` it only runs in its second state (a switch,
 * logic's Set state, or Light all the torches can turn it on).
 */
export const MoveDef = z.strictObject({
  /** the far end, from where it is placed (studs: x, up, z) */
  by: z.tuple([z.number().min(-64).max(64), z.number().min(-32).max(32), z.number().min(-64).max(64)]),
  /** seconds from one end to the other (3 at first) */
  seconds: z.number().min(0.5).max(60).optional(),
  /** seconds it waits at each end (1 at first) */
  pause: z.number().min(0).max(30).optional(),
  /** only while it is in its second state (on) */
  whenOn: z.boolean().optional(),
});
export type MoveDef = z.infer<typeof MoveDef>;

export const MirrorDef = z.strictObject({
  /** Action at it turns it (on at first) */
  turns: z.boolean().optional(),
});
export type MirrorDef = z.infer<typeof MirrorDef>;

export const KEY_KINDS = ['small', 'boss', 'item'] as const;
export const LockDef = z.strictObject({
  key: z.enum(KEY_KINDS),
  /** key: item — the item (by name) that opens it, used up unless keep is on */
  item: z.string().min(1).max(60).optional(),
  keep: z.boolean().optional(),
});
export type LockDef = z.infer<typeof LockDef>;

export const PickupDef = z.strictObject({
  item: z.string().min(1).max(60),
  count: z.number().int().min(1).max(99).optional(),
});
export type PickupDef = z.infer<typeof PickupDef>;

/** the items that belong to the map (the dungeon) where they are found */
export const DUNGEON_ITEMS = ['Small key', 'Boss key', 'Dungeon map', 'Compass'] as const;
export type DungeonItem = (typeof DUNGEON_ITEMS)[number];
export function dungeonItem(name: string): DungeonItem | null {
  const t = name.trim().toLowerCase();
  if (/^small keys?$/.test(t)) return 'Small key';
  if (/^boss keys?$|^big keys?$/.test(t)) return 'Boss key';
  if (/^dungeon maps?$/.test(t)) return 'Dungeon map'; // a plain “map” is an ordinary item
  if (/^compass$/.test(t)) return 'Compass';
  return null;
}

/** the item a lock wants, by name */
export function lockItem(l: LockDef): string {
  return l.key === 'small' ? 'Small key' : l.key === 'boss' ? 'Boss key' : (l.item ?? 'Key');
}
/** a lock's key is used up (a small key, an item unless kept); the boss key is kept */
export const lockUses = (l: LockDef) => l.key === 'small' || (l.key === 'item' && !l.keep);

/** a switch answers this hit */
export function switchHitBy(s: SwitchDef, type: DamageType): boolean {
  return s.by === 'hit' && (!s.hitBy?.length || s.hitBy.includes(type));
}

/** the words for a switch, for the editor and Help */
export function describeSwitch(s: SwitchDef): string {
  const how = s.by === 'step' ? 'stepped on' : s.by === 'hit' ? 'hit' : s.by === 'light' ? 'lit by a beam' : 'pressed';
  const stays =
    s.stays === 'on'
      ? 'stays on'
      : s.stays === 'held'
        ? 'on while held down'
        : s.stays === 'timed'
          ? `back off after ${s.seconds ?? 10} s`
          : 'flips each time';
  const w = s.by === 'step' && (s.weight ?? 1) > 1 ? `, needs weight ${s.weight}` : '';
  return `${how}, ${stays}${w}`;
}

/** the problems with an asset's puzzle parts, as sentences (empty: fine) */
export function puzzleProblems(a: {
  name: string;
  states: string[];
  push?: PushDef | undefined;
  switch?: SwitchDef | undefined;
  lock?: LockDef | undefined;
  pickup?: PickupDef | undefined;
  loose?: boolean | undefined;
  mirror?: MirrorDef | undefined;
  beam?: BeamDef | undefined;
  flame?: FlameDef | undefined;
  bombPlant?: BombPlantDef | undefined;
  ice?: IceDef | undefined;
  moves?: MoveDef | undefined;
}): string[] {
  const out: string[] = [];
  if (a.switch && a.states.length < 2)
    out.push(`${a.name} is a switch but has one state: it needs an off and an on state (its first two).`);
  if (a.lock && a.states.length < 2)
    out.push(`${a.name} has a lock but one state: it needs a locked and an open state (its first two).`);
  if (a.switch?.stays === 'held' && a.switch.by !== 'step' && a.switch.by !== 'light')
    out.push(`${a.name}: only a floor switch (held down) or a light sensor (while lit) can be held.`);
  if (a.mirror && a.states.length < 2)
    out.push(`${a.name} is a mirror but has one state: it needs two, one leaning each way.`);
  if (a.bombPlant && a.states.length < 2)
    out.push(`${a.name} grows bombs but has one state: it needs two (grown, then picked).`);
  if (a.flame?.when && !a.states.includes(a.flame.when))
    out.push(`${a.name}: its flame burns in “${a.flame.when}”, which is not one of its states.`);
  if (a.beam?.when && !a.states.includes(a.beam.when))
    out.push(`${a.name}: its beam shines in “${a.beam.when}”, which is not one of its states.`);
  if (a.lock?.key === 'item' && !a.lock.item) out.push(`${a.name}: choose the item that opens the lock.`);
  if (a.ice?.slides && !a.push) out.push(`${a.name}: ice that slides when pushed must be a push block too.`);
  if (a.moves?.whenOn && a.states.length < 2)
    out.push(`${a.name} moves only when on but has one state: it needs two (off, then on).`);
  if (a.moves && (a.push || a.loose)) out.push(`${a.name}: a moving platform is not a push block or loose too.`);
  if (a.moves && a.moves.by.every((v) => v === 0)) out.push(`${a.name}: a moving platform needs somewhere to go.`);
  if (a.push && a.loose) out.push(`${a.name}: a push block slides square to the floor, so it is not loose too.`);
  return out;
}
