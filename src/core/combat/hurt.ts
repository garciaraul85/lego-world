import type { DamageType } from './damage';

/**
 * Milestone 3b (B5b): how a body reacts to a hit — the hero, a neighbour or an enemy — chosen by the attack and its
 * damage type: a light hit flinches, a hard one staggers back, a charge, a drop or a blast knocks it down, fire sets
 * it hopping and patting out the flames, ice freezes it stiff, a beam or lightning jolts it, a stun leaves it dizzy.
 */
export const HURT_REACTIONS = ['flinch', 'stagger', 'knockdown', 'burn', 'freeze', 'shock', 'stun'] as const;
export type HurtHow = (typeof HURT_REACTIONS)[number];

/** seconds each reaction plays */
export const HURT_TIME: Record<HurtHow, number> = {
  flinch: 0.45,
  stagger: 0.75,
  knockdown: 1.5,
  burn: 1.3,
  freeze: 1.2,
  shock: 0.8,
  stun: 1.4,
};

/** what each reaction looks like (Help, the attack parts' fields) */
export const HURT_LABEL: Record<HurtHow, string> = {
  flinch: 'Flinch (rocks back)',
  stagger: 'Stagger (steps back, arms out)',
  knockdown: 'Knocked down (falls, gets up)',
  burn: 'Burn (hops, pats out the flames)',
  freeze: 'Freeze (stiff, shivering)',
  shock: 'Shock (jolted, arms flung out)',
  stun: 'Stun (dizzy, swaying)',
};

/** attacks that knock a body down, and ones that stagger it */
const KNOCKS = new Set(['charge', 'drop', 'ram', 'blast', 'stomp', 'slam']);
const STAGGERS = new Set(['heavy', 'charged', 'spin', 'pounce', 'swoop', 'bash']);

export type HurtBy = {
  type: DamageType;
  /** how hard (hearts for the hero, damage for others) */
  power: number;
  /** the attack it was (swing, bite, pounce, spit, shot, beam, breath, charge, swoop, drop; the hero's light,
   * heavy, charged, spin, bash; blast) */
  attack?: string;
  /** how far it was knocked back (studs) */
  knock?: number;
  /** what the attack does after (a breath of fire burns, an ice wing freezes) */
  then?: 'burn' | 'freeze';
};

/** the reaction a hit makes */
export function hurtReaction(h: HurtBy): HurtHow {
  if (h.then === 'burn' || h.type === 'fire') return 'burn';
  if (h.then === 'freeze' || h.type === 'ice') return 'freeze';
  if (h.type === 'electric' || h.type === 'light' || h.attack === 'beam') return 'shock';
  if (h.type === 'stun' || h.attack === 'bash') return 'stun';
  if (h.type === 'explosive' || (h.attack && KNOCKS.has(h.attack)) || (h.knock ?? 0) >= 4 || h.power >= 4)
    return 'knockdown';
  if ((h.attack && STAGGERS.has(h.attack)) || h.power >= 2 || (h.knock ?? 0) >= 2.5) return 'stagger';
  return 'flinch';
}
