import { z } from 'zod';
import type { EnemyStyle } from './enemy';
import { HURT_REACTIONS, type HurtHow } from './hurt';

/**
 * Milestone 3b (B5b, part 2): an enemy's abilities as parts, each behind an interface — how it senses (Senses),
 * how it gets about (Mover) and how it attacks (Attack). Every brain template comes with its parts; a part can be
 * swapped for another of its kind (Ears instead of Eyes, a Flyer instead of a Walker, a Spit instead of a Swing)
 * without touching the brain, and each part is a built-in a behaviour can extend.
 */
export const SENSES = ['eyes', 'ears', 'allSeeing'] as const;
export const MOVERS = ['walker', 'flyer', 'static', 'hider', 'thread'] as const;
export const ATTACKS = ['swing', 'bite', 'pounce', 'spit', 'shot', 'beam', 'breath', 'swoop', 'drop'] as const;
export type SenseKind = (typeof SENSES)[number];
export type MoverKind = (typeof MOVERS)[number];
export type AttackKind = (typeof ATTACKS)[number];

/** what a part is called (its built-in's class name) */
export const PART_CLASS: Record<SenseKind | MoverKind | AttackKind, string> = {
  eyes: 'Eyes',
  ears: 'Ears',
  allSeeing: 'AllSeeing',
  walker: 'Walker',
  flyer: 'Wings',
  static: 'Static',
  hider: 'Hider',
  thread: 'Thread',
  swing: 'Swing',
  bite: 'Bite',
  pounce: 'Pounce',
  spit: 'Spit',
  shot: 'Shot',
  beam: 'Ray',
  breath: 'Breath',
  swoop: 'Swoop',
  drop: 'Drop',
};

/** an enemy's own choices (anything left out is its template's) */
export const EnemyParts = z.strictObject({
  senses: z.enum(SENSES).optional(),
  mover: z.enum(MOVERS).optional(),
  attack: z.enum(ATTACKS).optional(),
  /** its attack's power, times the enemy's power */
  attackPower: z.number().min(0).max(5).optional(),
  /** the reaction its attack makes (flinch, stagger, knockdown…); left out: by the attack and its damage type */
  hurt: z.enum(HURT_REACTIONS).optional(),
});
export type EnemyParts = z.infer<typeof EnemyParts>;

export type Parts = { senses: SenseKind; mover: MoverKind; attack: AttackKind; attackPower: number; hurt?: HurtHow };

/** the parts each template comes with */
export function templateParts(style: EnemyStyle | undefined, fire = false): Omit<Parts, 'attackPower'> {
  switch (style ?? 'melee') {
    case 'knight':
      return { senses: 'eyes', mover: 'walker', attack: 'swing' };
    case 'turret':
      return { senses: 'eyes', mover: 'static', attack: 'beam' };
    case 'shooter':
      return { senses: 'eyes', mover: 'walker', attack: 'shot' };
    case 'popup':
      return { senses: 'eyes', mover: 'hider', attack: 'spit' };
    case 'flyer':
    case 'swarm':
      return { senses: 'eyes', mover: 'flyer', attack: 'swoop' };
    case 'ambusher':
      return { senses: 'eyes', mover: 'thread', attack: 'drop' };
    case 'ghost':
      return { senses: 'eyes', mover: 'walker', attack: 'swing' };
    case 'pack':
      return { senses: 'eyes', mover: 'walker', attack: 'pounce' };
    default:
      return fire
        ? { senses: 'eyes', mover: 'walker', attack: 'breath' }
        : { senses: 'eyes', mover: 'walker', attack: 'swing' };
  }
}

/**
 * Which parts a template can swap in. Senses always swap. A walking brain can walk, fly or stand still; a pop-up
 * keeps its hiding and a spider its thread, and a turret stays put. A brain that strikes up close (a swing, a bite,
 * a pounce) can strike another way or spit or shoot from where it stands; a shooter or a pop-up can spit or shoot.
 */
export function swappable(
  style: EnemyStyle | undefined,
  fire = false,
): {
  senses: readonly SenseKind[];
  mover: readonly MoverKind[];
  attack: readonly AttackKind[];
} {
  const t = templateParts(style, fire);
  // (a flyer's brain flies itself: only a walking brain's mover swaps)
  const walks = t.mover === 'walker';
  const close = ['swing', 'bite', 'pounce'].includes(t.attack);
  return {
    senses: SENSES,
    mover: walks && !fire ? ['walker', 'flyer', 'static'] : [t.mover],
    attack: close
      ? ['swing', 'bite', 'pounce', 'spit', 'shot']
      : t.attack === 'spit' || t.attack === 'shot'
        ? ['spit', 'shot']
        : [t.attack],
  };
}

/** an enemy's parts now: its template's, with its own swaps (a swap its template can't take is left out) */
export function partsOf(e: { style?: EnemyStyle; type?: string; parts?: EnemyParts } | null | undefined): Parts {
  const fire = e?.type === 'fire' && (e?.style ?? 'melee') === 'melee';
  const t = templateParts(e?.style, fire);
  const ok = swappable(e?.style, fire);
  const p = e?.parts ?? {};
  return {
    senses: p.senses && ok.senses.includes(p.senses) ? p.senses : t.senses,
    mover: p.mover && ok.mover.includes(p.mover) ? p.mover : t.mover,
    attack: p.attack && ok.attack.includes(p.attack) ? p.attack : t.attack,
    attackPower: p.attackPower ?? 1,
    ...(p.hurt ? { hurt: p.hurt } : {}),
  };
}

export const isRanged = (a: AttackKind) => a === 'spit' || a === 'shot';
