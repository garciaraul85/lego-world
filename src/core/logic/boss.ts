/**
 * Milestone 3b (14a-2): a boss is made in Logic. A behaviour extending a boss template (PhasedBoss, WeakPointBoss,
 * PuzzleBoss, or BossBrain itself) makes the character it is attached to a boss: its phases are written in the class
 * (`phases = [{ from: 100, fights: "melee" }, { from: 50, fights: "shooter", speed: 1.3 }]`) and when it can be
 * hurt is the template it extends.
 */
import { type BossVulnerable, type Enemy, planOfPhases } from '../combat/enemy';
import type { Character, LogicGraph, ScriptAttachment } from '../schema';
import { lineageOf } from './builtins';

/** the enemy a character is when nothing sets it: a plain melee fighter */
export const PLAIN_ENEMY: Enemy = {
  power: 1,
  type: 'blunt',
  reach: 1.9,
  sight: 10,
  speed: 1.4,
  cooldown: 1.8,
  windup: 0.6,
};

/** when a boss whose class extends this can be hurt; not a boss class: null */
export function bossHowOf(ext: string | undefined): BossVulnerable | null {
  if (!ext) return null;
  const line = lineageOf(ext).map((b) => b.name);
  if (!line.includes('BossBrain')) return null;
  return line.includes('PuzzleBoss') ? 'stunned' : line.includes('WeakPointBoss') ? 'afterAttack' : 'always';
}

/** the boss behaviour attached (on the character, or on this placed copy), or null */
export function bossBehaviourOf(
  scripts: readonly ScriptAttachment[],
  graphOf: (id: string) => LogicGraph | undefined,
): LogicGraph | null {
  const off = new Set(scripts.filter((s) => s.off).map((s) => s.use));
  for (const s of scripts) {
    if (s.off || off.has(s.use)) continue;
    const g = graphOf(s.use);
    if (g?.behaviour && bossHowOf(g.behaviour.extends)) return g;
  }
  return null;
}

/**
 * the enemy a character fights as: its own, made a boss by a boss behaviour attached to it (its phases from the
 * class, when it can be hurt from the template); `copy`: the placed copy's own scripts (they come first)
 */
export function enemyOfCharacter(
  chr: Pick<Character, 'enemy' | 'scripts'> | null | undefined,
  graphOf: (id: string) => LogicGraph | undefined,
  copy: readonly ScriptAttachment[] = [],
): Enemy | null {
  if (!chr) return null;
  const g = bossBehaviourOf([...copy, ...(chr.scripts ?? [])], graphOf);
  if (!g) return chr.enemy ?? null;
  const how = bossHowOf(g.behaviour!.extends)!;
  const base = chr.enemy ?? PLAIN_ENEMY;
  // the first phase fights as the class says, else as the character's own kind (a boss of its own kind: melee)
  const own = base.style && base.style !== 'boss' ? base.style : undefined;
  const plan = planOfPhases(g.behaviour!.phases ?? [], how);
  if (!plan.first && own) plan.first = own;
  return { ...base, style: 'boss', boss: plan };
}
