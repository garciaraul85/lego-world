import { z } from 'zod';

/**
 * P9a: health and damage. Anything can have health: an asset (a crate takes 2 hits, a stone wall only breaks to
 * explosions), a neighbour that “can be harmed”, the hero (its hearts). An attack has power and a damage type;
 * a target has armour (taken off every hit) and resistances (how much of each type gets through).
 */
export const DAMAGE_TYPES = [
  'slash',
  'blunt',
  'pierce',
  'fire',
  'explosive',
  'electric',
  'light',
  'ice',
  'stun',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/**
 * Step 11, 4a: what each type is in a game: slash (swords), blunt (hammers, fists), pierce (arrows), fire (torches,
 * fire arrows), explosive (bombs), electric, light (light arrows, a mirror's beam, the Lens), ice (ice arrows, frost),
 * stun (a boomerang, a flash: stops a foe for a moment and does no damage of its own).
 */
export const DAMAGE_INFO: Record<DamageType, { label: string; about: string }> = {
  slash: { label: 'Slash', about: 'swords, axes' },
  blunt: { label: 'Blunt', about: 'hammers, clubs, fists' },
  pierce: { label: 'Pierce', about: 'arrows, spears' },
  fire: { label: 'Fire', about: 'torches, fire arrows, flames' },
  explosive: { label: 'Explosive', about: 'bombs, blasts' },
  electric: { label: 'Electric', about: 'shocks, lightning' },
  light: { label: 'Light', about: 'light arrows, a mirror’s beam' },
  ice: { label: 'Ice', about: 'ice arrows, frost' },
  stun: { label: 'Stun', about: 'a boomerang, a flash: stops it for a moment, no damage' },
};

/** How much of a damage type gets through: 0 = immune, 1 = normal, 2 = weak to it. */
export const Resist = z.partialRecord(z.enum(DAMAGE_TYPES), z.number().min(0).max(4));

/** What happens when health reaches zero. */
export const AtZero = z.strictObject({
  /** break into loose bricks (the hero can rebuild them if the asset allows) */
  break: z.boolean(),
  /** an asset (by name) put where it was, or an inventory item given to the hero */
  drop: z.strictObject({ item: z.string().min(1).max(60), count: z.number().int().min(1).max(99) }).optional(),
  /** a custom event sent to logic (On custom event) */
  emit: z.string().min(1).max(60).optional(),
  /** step 11, 4a: more it may drop, each with its chance (a heart 50%, arrows 30%…) */
  loot: z
    .array(
      z.strictObject({
        item: z.string().min(1).max(60),
        count: z.number().int().min(1).max(99),
        chance: z.number().min(0.01).max(1),
      }),
    )
    .max(6)
    .optional(),
  /** P27 part 3d (characters): comes back after this many seconds, or when the player comes back to the map (0) */
  respawn: z.number().min(0).max(3600).optional(),
});

/** Health on an asset or a character. */
export const Health = z.strictObject({
  /** hit points: how much damage it takes before it reaches zero (a normal hit does 1) */
  hp: z.number().min(1).max(9999),
  /** taken off every hit (a hit weaker than the armour does nothing) */
  armor: z.number().min(0).max(999).optional(),
  resist: Resist.optional(),
  /** cannot be damaged at all (logic can switch this) */
  invulnerable: z.boolean().optional(),
  /**
   * step 11, 4a: how much gets through by where the hit comes from (characters): a shield or a hard shell in front
   * (front 0), a soft back (back 2), a tail at the sides, a head hit from above (a plunge)
   */
  sides: z.partialRecord(z.enum(['front', 'back', 'side', 'above']), z.number().min(0).max(4)).optional(),
  /** step 11, 4a: damage types that stun it for a moment (a boomerang, a flash; fire on an ice creature) */
  stunBy: z.array(z.enum(DAMAGE_TYPES)).max(9).optional(),
  /** seconds a stun lasts (default 2) */
  stunFor: z.number().min(0.2).max(10).optional(),
  atZero: AtZero,
});
export type Health = z.infer<typeof Health>;
export type AttackHit = { power: number; type: DamageType };

export type HitSide = 'front' | 'back' | 'side' | 'above';

/**
 * The damage one hit does to a target: power × resistance × side − armour, never below zero. A stun hit does no
 * damage of its own (unless the target is weak to stun).
 */
export function damageOf(
  hit: AttackHit,
  target: Pick<Health, 'armor' | 'resist' | 'invulnerable' | 'sides'>,
  side?: HitSide,
): number {
  if (target.invulnerable) return 0;
  const through = target.resist?.[hit.type] ?? (hit.type === 'stun' ? 0 : 1);
  const facing = side ? (target.sides?.[side] ?? 1) : 1;
  return Math.max(0, Math.round((hit.power * through * facing - (target.armor ?? 0)) * 100) / 100);
}

/** step 11, 4a: whether a hit stuns the target (a stun hit, unless it is immune; or a type it is stunned by) */
export const stunsIt = (hit: AttackHit, target: Pick<Health, 'resist' | 'stunBy'>) =>
  (hit.type === 'stun' && target.resist?.stun !== 0) || !!target.stunBy?.includes(hit.type);

/**
 * step 11, 4a: where a hit comes from, seen by the target: in front (within 50° of where it faces), behind (beyond
 * 130°), at its side, or from above (the attacker well over its top: a plunge)
 */
export function hitSide(
  target: { x: number; y: number; z: number; heading: number },
  from: { x: number; y: number; z: number },
  top: number,
): HitSide {
  if (from.y > target.y + top * 0.8) return 'above';
  const a = Math.atan2(from.x - target.x, from.z - target.z);
  const off = Math.abs(((a - target.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return off < (50 * Math.PI) / 180 ? 'front' : off > (130 * Math.PI) / 180 ? 'back' : 'side';
}

/**
 * What the hero's held item hits with (v68's melee items). Anything not listed hits like bare hands: power 1,
 * blunt. Guns, magic and powers stay in the v68 runtime.
 */
export const HELD_ATTACKS: Record<string, AttackHit> = {
  None: { power: 1, type: 'blunt' },
  Hammer: { power: 1, type: 'blunt' },
  Wrench: { power: 1, type: 'blunt' },
  Shovel: { power: 1, type: 'blunt' },
  Club: { power: 1.5, type: 'blunt' },
  Baton: { power: 1, type: 'blunt' },
  'Baseball bat': { power: 1.5, type: 'blunt' },
  Crowbar: { power: 1.5, type: 'blunt' },
  Mace: { power: 2, type: 'blunt' },
  'War hammer': { power: 2.5, type: 'blunt' },
  Sledgehammer: { power: 3, type: 'blunt' },
  Sword: { power: 2, type: 'slash' },
  'Battle axe': { power: 2.5, type: 'slash' },
  Torch: { power: 1, type: 'fire' },
};
export const heldAttack = (held: unknown): AttackHit => HELD_ATTACKS[String(held ?? 'None')] ?? HELD_ATTACKS.None!;

/** Presets for “Make breakable”: everyday things break to any hit; tough ones only to some. */
export const BREAKABLE_PRESETS: Record<string, { name: string; health: Health }> = {
  crate: { name: 'Takes 2 hits (a crate)', health: { hp: 2, atZero: { break: true } } },
  pot: { name: 'Breaks at the first hit (a pot)', health: { hp: 1, atZero: { break: true } } },
  sturdy: { name: 'Takes 5 hits (a door, a fence)', health: { hp: 5, atZero: { break: true } } },
  stone: {
    name: 'Only explosions break it (a stone wall)',
    health: {
      hp: 3,
      resist: { slash: 0, blunt: 0, pierce: 0, fire: 0, electric: 0, light: 0, ice: 0, explosive: 1 },
      atZero: { break: true },
    },
  },
};
