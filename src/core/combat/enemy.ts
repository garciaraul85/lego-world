import { z } from 'zod';
import { DAMAGE_TYPES, type Health } from './damage';
import { EnemyParts } from './parts';

/** step 11, 4a: the kinds of fighter (the built-in brains of step 14 are one each) */
export const ENEMY_STYLES = [
  'melee',
  'knight',
  'turret',
  'shooter',
  'popup',
  'flyer',
  'swarm',
  'ambusher',
  'ghost',
  'pack',
  'boss',
] as const;
export type EnemyStyle = (typeof ENEMY_STYLES)[number];
export const STYLE_INFO: Record<EnemyStyle, { label: string; about: string; now: string }> = {
  melee: {
    label: 'Melee',
    about: 'walks over and swings',
    now: 'walks over and swings; a fire one charges from afar and breathes fire close up',
  },
  knight: {
    label: 'Knight',
    about: 'blocks from the front, side-steps and counters',
    now: 'circles at the edge of its reach, shield toward you; a swing at its front is answered with a counter',
  },
  turret: {
    label: 'Turret',
    about: 'stays put, turns to watch, fires when it sees you',
    now: 'stays put and sweeps its gaze; seeing you, it charges and fires a beam (walls and a shield stop it)',
  },
  shooter: {
    label: 'Shooter',
    about: 'keeps its distance and fires',
    now: 'keeps its distance and shoots (a rock, or a fireball)',
  },
  popup: {
    label: 'Pop-up',
    about: 'hides, pops up to fire, hides again',
    now: 'hides underground (or under water), comes up to spit, ducks; can only be hit while up',
  },
  flyer: { label: 'Flyer', about: 'flies and swoops', now: 'flies, circles over you and swoops down to bite' },
  swarm: { label: 'Swarm', about: 'many weak ones, erratic', now: 'flies erratically, circles over you and swoops' },
  ambusher: {
    label: 'Ambusher',
    about: 'waits hidden and drops on you',
    now: 'hangs high on a thread, drops on you as you pass under, climbs back up',
  },
  ghost: {
    label: 'Ghost',
    about: 'fades in and out, can only be hit when seen',
    now: 'fades out, drifts behind you, fades in to strike; the Lens of Truth shows it',
  },
  pack: {
    label: 'Pack hunter',
    about: 'circles you and calls the others',
    now: 'howls for the others; the pack circles you and strikes one at a time',
  },
  boss: {
    label: 'Boss',
    about: 'phases and weak moments',
    now: 'fights as its first phase’s kind; lower on health it changes (a new kind, new parts, faster, harder); it may only be hurt at weak moments',
  },
};

/**
 * P9c: a neighbour that fights the hero. When the hero comes within `sight` it walks over; within `reach` it
 * raises its arm for `windup` seconds (the tell: guard, dodge or parry now), then hits for `power` of `type`,
 * and waits `cooldown` before the next swing. A stunned enemy (shield bash, knock-back, parry) stops for a moment.
 */
export const Enemy = z.strictObject({
  power: z.number().min(0).max(20),
  type: z.enum(DAMAGE_TYPES),
  /** studs */
  reach: z.number().min(1).max(6),
  /** studs: how far away it notices the hero */
  sight: z.number().min(2).max(30),
  /** walking speed, 1 = a neighbour's normal walk */
  speed: z.number().min(0.2).max(3),
  /** seconds between swings */
  cooldown: z.number().min(0.3).max(10),
  /** seconds the swing is telegraphed before it lands */
  windup: z.number().min(0.1).max(2),
  /** step 11, 4a: how wide it sees, in degrees (360: all round; 120: only in front, so it can be sneaked past) */
  cone: z.number().min(30).max(360).optional(),
  /** step 11, 4a: studs: it hears the hero running or fighting this close, even out of sight */
  hearing: z.number().min(0).max(30).optional(),
  /**
   * step 11, 4a: how it decides — simple (the same pattern every time), smart (backs off after a swing, waits for an
   * opening), pack (calls the others near it when it sees the hero)
   */
  wits: z.enum(['simple', 'smart', 'pack']).optional(),
  /** step 11, 4a: the kind of fighter it is: today a melee fighter or a turret; its full brain comes in step 14 */
  style: z.enum(ENEMY_STYLES).optional(),
  /** Milestone 3b (B5b): its abilities swapped from its template's (Senses, Mover, Attack) */
  parts: EnemyParts.optional(),
  /** Milestone 3b (B5c): a boss's phases and weak moments (style: boss) */
  boss: z.lazy(() => BossPlan).optional(),
});
export type Enemy = z.infer<typeof Enemy>;

// ---------- Milestone 3b (B5c): bosses ----------

/** the kinds a boss's phase can fight as (any but boss) */
export const PHASE_STYLES = ENEMY_STYLES.filter((s) => s !== 'boss') as Exclude<EnemyStyle, 'boss'>[];
/**
 * when a boss can be hurt: always; only just after it attacks (its opening: the weak point shows); only while
 * stunned (by its stunBy, a parry or a bounced shot: a puzzle to work out)
 */
export const BOSS_VULNERABLE = ['always', 'afterAttack', 'stunned'] as const;
export type BossVulnerable = (typeof BOSS_VULNERABLE)[number];
/** seconds after its attack that an afterAttack boss stays open */
export const BOSS_OPENING = 1.6;
/** a boss phase: from `at` (its health, 0…1, at or below) it fights as `style`, with `parts`, faster and harder */
export const BossPhase = z.strictObject({
  at: z.number().min(0.01).max(0.99),
  style: z.enum(PHASE_STYLES as [string, ...string[]]).optional(),
  parts: EnemyParts.optional(),
  /** times its speed */
  speedK: z.number().min(0.2).max(4).optional(),
  /** times its power */
  powerK: z.number().min(0).max(5).optional(),
  /** what it is called in this phase (shown and logged) */
  name: z.string().max(40).optional(),
});
export type BossPhase = z.infer<typeof BossPhase>;
export const BossPlan = z.strictObject({
  /** the kind it fights as in its first phase (default melee) */
  first: z.enum(PHASE_STYLES as [string, ...string[]]).optional(),
  /** its parts in its first phase (default: its own) */
  firstParts: EnemyParts.optional(),
  /** times its own speed and power in its first phase */
  firstSpeedK: z.number().min(0.2).max(4).optional(),
  firstPowerK: z.number().min(0).max(5).optional(),
  /** the phases after the first, each from a lower health */
  phases: z.array(BossPhase).max(4),
  vulnerable: z.enum(BOSS_VULNERABLE).optional(),
});
export type BossPlan = z.infer<typeof BossPlan>;

/** its phase at this health (0…1): 1 is the first; each phase whose `at` the health is at or below adds one */
export function bossPhaseAt(plan: BossPlan | undefined, fraction: number): number {
  if (!plan) return 1;
  const ats = plan.phases.map((p) => p.at).sort((a, b) => b - a);
  return 1 + ats.filter((a) => fraction <= a + 1e-9).length;
}
/** the phases in order (highest health first) */
export const bossPhases = (plan: BossPlan | undefined) => [...(plan?.phases ?? [])].sort((a, b) => b.at - a.at);
/**
 * the enemy a boss fights as in phase `n` (1: its first): its style becomes the phase's kind and each later phase
 * builds on the ones before (its parts, speed and power); not a boss: as it is
 */
export function bossEnemy(e: Enemy, n: number): Enemy {
  if (e.style !== 'boss') return e;
  const plan = e.boss;
  // its kind and parts carry on from the phase before unless a phase sets them; its speed and power are times its
  // own (a phase that leaves them out keeps the one before)
  let speedK = plan?.firstSpeedK ?? 1;
  let powerK = plan?.firstPowerK ?? 1;
  let out: Enemy = {
    ...e,
    style: (plan?.first as EnemyStyle | undefined) ?? 'melee',
    ...(plan?.firstParts ? { parts: plan.firstParts } : {}),
  };
  for (const p of bossPhases(plan).slice(0, Math.max(0, n - 1))) {
    speedK = p.speedK ?? speedK;
    powerK = p.powerK ?? powerK;
    out = {
      ...out,
      style: (p.style as EnemyStyle | undefined) ?? out.style,
      parts: p.parts ? { ...(out.parts ?? {}), ...p.parts } : p.style ? undefined : out.parts,
    };
  }
  return { ...out, speed: Math.min(3, e.speed * speedK), power: Math.min(20, e.power * powerK) };
}

export const ENEMY_PRESETS: Record<string, { name: string; enemy: Enemy; health: Health }> = {
  grunt: {
    name: 'Grunt — 3 hits, slow swings',
    enemy: { power: 1, type: 'blunt', reach: 1.9, sight: 10, speed: 1.4, cooldown: 1.8, windup: 0.6 },
    health: { hp: 3, atZero: { break: false } },
  },
  brute: {
    name: 'Brute — tough and armoured, hits hard',
    enemy: { power: 2, type: 'blunt', reach: 2.2, sight: 9, speed: 1, cooldown: 2.4, windup: 0.9 },
    health: { hp: 8, armor: 1, atZero: { break: false } },
  },
  swift: {
    name: 'Swift — fragile, fast and quick to strike',
    enemy: { power: 1, type: 'slash', reach: 1.7, sight: 13, speed: 2.1, cooldown: 1.1, windup: 0.35 },
    health: { hp: 2, atZero: { break: false } },
  },
};

/**
 * Milestone 3b (14a-2): a boss's phase as its class writes it (Logic):
 *   phases = [{ from: 100, fights: "melee", attack: "bite" }, { from: 66, fights: "ambusher" }, …];
 * from: the health (%) it starts at (100: its first phase); fights: its kind of fighter (as before: the one before);
 * senses, mover, attack, hurt: its parts; power, speed: times its own; name: what the phase is called.
 */
export const PhaseDef = z.strictObject({
  from: z.number().int().min(1).max(100),
  fights: z.enum(PHASE_STYLES as [string, ...string[]]).optional(),
  senses: EnemyParts.shape.senses,
  mover: EnemyParts.shape.mover,
  attack: EnemyParts.shape.attack,
  hurt: EnemyParts.shape.hurt,
  power: z.number().min(0).max(5).optional(),
  speed: z.number().min(0.2).max(4).optional(),
  name: z.string().max(40).optional(),
});
export type PhaseDef = z.infer<typeof PhaseDef>;
export const PHASE_KEYS = Object.keys(PhaseDef.shape) as (keyof PhaseDef)[];

/** its parts as a phase writes them (none: undefined) */
function phaseParts(p: PhaseDef): EnemyParts | undefined {
  const parts: EnemyParts = {};
  if (p.senses) parts.senses = p.senses;
  if (p.mover) parts.mover = p.mover;
  if (p.attack) parts.attack = p.attack;
  if (p.hurt) parts.hurt = p.hurt;
  return Object.keys(parts).length ? parts : undefined;
}

/** a class's phases as the plan the engine runs; how: when it can be hurt (by the template it extends) */
export function planOfPhases(defs: readonly PhaseDef[], how: BossVulnerable): BossPlan {
  const sorted = [...defs].sort((a, b) => b.from - a.from);
  const first = sorted.find((p) => p.from >= 100);
  const plan: BossPlan = { phases: [] };
  if (first?.fights) plan.first = first.fights;
  const fp = first && phaseParts(first);
  if (fp) plan.firstParts = fp;
  if (first?.speed !== undefined) plan.firstSpeedK = first.speed;
  if (first?.power !== undefined) plan.firstPowerK = first.power;
  for (const p of sorted.filter((x) => x.from < 100)) {
    const parts = phaseParts(p);
    plan.phases.push({
      at: Math.max(0.01, Math.min(0.99, p.from / 100)),
      ...(p.fights ? { style: p.fights } : {}),
      ...(parts ? { parts } : {}),
      ...(p.speed !== undefined ? { speedK: p.speed } : {}),
      ...(p.power !== undefined ? { powerK: p.power } : {}),
      ...(p.name ? { name: p.name } : {}),
    });
  }
  if (how !== 'always') plan.vulnerable = how;
  return plan;
}
