import { z } from 'zod';
import { DAMAGE_TYPES, type DamageType } from '../combat/damage';

/**
 * Step 12a: the puzzle parts an asset can have, Zelda style.
 *
 * - push: a block the hero shoves (walk into it for a moment) one step along the floor, square to the grid; with
 *   pull on, the hero can also grab it (hold Action) and step back to drag it. It stops at walls, other blocks and
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
export const SWITCH_BY = ['step', 'hit', 'press'] as const;
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
});
export type SwitchDef = z.infer<typeof SwitchDef>;

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
  const how = s.by === 'step' ? 'stepped on' : s.by === 'hit' ? 'hit' : 'pressed';
  const stays =
    s.stays === 'on'
      ? 'stays on'
      : s.stays === 'held'
        ? 'on while held down'
        : s.stays === 'timed'
          ? `back off after ${s.seconds ?? 10} s`
          : 'flips each time';
  return `${how}, ${stays}`;
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
}): string[] {
  const out: string[] = [];
  if (a.switch && a.states.length < 2)
    out.push(`${a.name} is a switch but has one state: it needs an off and an on state (its first two).`);
  if (a.lock && a.states.length < 2)
    out.push(`${a.name} has a lock but one state: it needs a locked and an open state (its first two).`);
  if (a.switch?.stays === 'held' && a.switch.by !== 'step')
    out.push(`${a.name}: only a floor switch can be held down.`);
  if (a.lock?.key === 'item' && !a.lock.item) out.push(`${a.name}: choose the item that opens the lock.`);
  if (a.push && a.loose) out.push(`${a.name}: a push block slides square to the floor, so it is not loose too.`);
  return out;
}
