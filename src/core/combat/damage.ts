import { z } from 'zod';

/**
 * P9a: health and damage. Anything can have health: an asset (a crate takes 2 hits, a stone wall only breaks to
 * explosions), a neighbour that “can be harmed”, the hero (its hearts). An attack has power and a damage type;
 * a target has armour (taken off every hit) and resistances (how much of each type gets through).
 */
export const DAMAGE_TYPES = ['slash', 'blunt', 'pierce', 'fire', 'explosive', 'electric'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

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
  atZero: AtZero,
});
export type Health = z.infer<typeof Health>;
export type AttackHit = { power: number; type: DamageType };

/** The damage one hit does to a target: power × resistance − armour, never below zero. */
export function damageOf(hit: AttackHit, target: Pick<Health, 'armor' | 'resist' | 'invulnerable'>): number {
  if (target.invulnerable) return 0;
  const through = target.resist?.[hit.type] ?? 1;
  return Math.max(0, Math.round((hit.power * through - (target.armor ?? 0)) * 100) / 100);
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
      resist: { slash: 0, blunt: 0, pierce: 0, fire: 0, electric: 0, explosive: 1 },
      atZero: { break: true },
    },
  },
};
