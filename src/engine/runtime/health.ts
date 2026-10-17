import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { type AttackHit, DAMAGE_TYPES, type DamageType, damageOf, type Health } from '../../core/combat/damage';
import { type Asset, type Character, type Instances, paths } from '../../core/schema';
import type { Npc } from '../legacy/runtime-modules';

/**
 * P9a: health in Play — for this play only (Stop forgets it, as it forgets smashed bricks). Keys: `hero`,
 * `i:<instance id>` for placed objects, `n:<neighbour id>` for neighbours.
 */
export type HealthHost = {
  /** the project's files (to find a neighbour's character) */
  get(path: string): unknown;
  keys(): Iterable<string>;
};

export type Wound = { key: string; hp: number; max: number; def: Health };

/** What an asset's health is in play: its own, or (smashable, none given) one hit breaks it, as before P9a. */
export function assetHealth(def: Asset): Health | null {
  if (def.health) return def.health;
  return def.smash.enabled ? { hp: 1, atZero: { break: true } } : null;
}

/** A neighbour's character, by its legacy id (instances of kind npc on the map). */
export function npcCharacter(host: HealthHost, mapId: string, npc: Npc): Character | null {
  const inst = host.get(paths.instances(mapId)) as Instances | undefined;
  const item = inst?.items.find((i) => i.kind === 'npc' && i.legacyId === npc.id) as { character: string } | undefined;
  const id = item?.character;
  if (!id) return null;
  return (
    (host.get(paths.character(id)) as Character | undefined) ?? BUILTIN_CHARACTERS.find((c) => c.id === id) ?? null
  );
}

export class HealthBook {
  private book = new Map<string, Wound>();
  readonly invulnerable = new Set<string>();

  /** the current health of a target (made on first touch, full) */
  of(key: string, def: Health): Wound {
    let w = this.book.get(key);
    if (!w) {
      w = { key, hp: def.hp, max: def.hp, def };
      this.book.set(key, w);
      if (def.invulnerable) this.invulnerable.add(key);
    }
    return w;
  }

  peek(key: string): Wound | undefined {
    return this.book.get(key);
  }

  /** applies one hit; returns the damage done (0: armour, resistance or invulnerable stopped it) */
  hit(key: string, def: Health, attack: AttackHit): { dealt: number; wound: Wound } {
    const wound = this.of(key, def);
    if (wound.hp <= 0) return { dealt: 0, wound };
    const dealt = damageOf(attack, { ...def, invulnerable: this.invulnerable.has(key) });
    wound.hp = Math.max(0, Math.round((wound.hp - dealt) * 100) / 100);
    return { dealt, wound };
  }

  heal(key: string, def: Health, amount: number): Wound {
    const wound = this.of(key, def);
    wound.hp = Math.min(wound.max, wound.hp + Math.max(0, amount));
    return wound;
  }

  forget(key: string) {
    this.book.delete(key);
  }
}

export const asDamageType = (t: string): DamageType =>
  (DAMAGE_TYPES as readonly string[]).includes(t) ? (t as DamageType) : 'blunt';

/** “only explosive hurts it” — the types that get through a target's resistances, in words */
export function hurtBy(def: Health): string {
  const through = DAMAGE_TYPES.filter((t) => (def.resist?.[t] ?? 1) > 0);
  return through.length === DAMAGE_TYPES.length ? 'any hit' : through.length ? through.join(' or ') : 'nothing';
}
