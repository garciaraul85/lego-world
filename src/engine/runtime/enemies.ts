import type { DamageType } from '../../core/combat/damage';
import type { Enemy } from '../../core/combat/enemy';
import type { HeroState, Npc } from '../legacy/runtime-modules';

/**
 * P9c: neighbours that fight the hero (a character with `enemy`). Out of sight they wander like any neighbour;
 * in sight they walk over, telegraph a swing (arm up, a red “!” over the head) and hit through the hero's guard
 * rules (block, parry, dodge). Everything here is for this play only.
 */
export type EnemyHost = {
  readonly heroState: HeroState;
  readonly clock: number;
  /** the hero cannot be fought now (game over, a cinematic, talking…) */
  calm(): boolean;
  enemyOf(n: Npc): Enemy | null;
  isStunned(n: Npc): boolean;
  /** the swing lands: hurts the hero (through guard, parry, dodge) */
  hitHero(n: Npc, power: number, type: DamageType): void;
};

type Brain = { phase: 'idle' | 'chase' | 'windup'; t: number; cooldown: number };

const still = { x: 0, z: 0, run: false, jump: false, vertical: 0 };
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Enemies {
  private brains = new Map<number, Brain>();

  constructor(private readonly host: EnemyHost) {}

  /** true while this neighbour is fighting (it is moved here, not by the wandering of v68 neighbours) */
  engaged(n: Npc): boolean {
    const b = this.brains.get(n.id);
    return !!b && b.phase !== 'idle';
  }

  /** the swing is coming: the tell to guard or dodge */
  windingUp(n: Npc): boolean {
    return this.brains.get(n.id)?.phase === 'windup';
  }

  step(npcs: readonly Npc[], dt: number) {
    const h = this.host.heroState;
    const calm = this.host.calm();
    for (const n of npcs) {
      const e = this.host.enemyOf(n);
      if (!e) continue;
      let b = this.brains.get(n.id);
      if (!b) {
        b = { phase: 'idle', t: 0, cooldown: 0 };
        this.brains.set(n.id, b);
      }
      b.cooldown = Math.max(0, b.cooldown - dt);
      const s = n.state;
      // the swing animation runs down (v68 only does this for the hero)
      const st = s as unknown as { attack?: number };
      if (st.attack) st.attack = Math.max(0, st.attack - dt);
      const dx = h.x - s.x;
      const dz = h.z - s.z;
      const d = Math.hypot(dx, dz);
      const face = Math.atan2(dx, dz);
      if (calm || d > e.sight * 1.3 || Math.abs(h.y - s.y) > 6) {
        b.phase = 'idle';
        continue;
      }
      if (this.host.isStunned(n)) {
        b.phase = 'chase';
        b.t = 0;
        n.controller.step(still, dt, 0);
        continue;
      }
      if (b.phase === 'idle') {
        if (d > e.sight) continue;
        b.phase = 'chase';
      }
      if (b.phase === 'windup') {
        b.t -= dt;
        s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 4);
        n.controller.step(still, dt, 0);
        if (b.t > 0) continue;
        // the swing lands if the hero is still in reach and in front
        if (d <= e.reach + 0.6 && Math.abs(angleDiff(face, s.heading)) < 1.2) this.host.hitHero(n, e.power, e.type);
        b.phase = 'chase';
        b.cooldown = e.cooldown;
        continue;
      }
      // chasing: walk to the hero, then wind up a swing
      if (d <= e.reach) {
        n.controller.step(still, dt, 0);
        s.heading = face;
        if (b.cooldown <= 0) {
          b.phase = 'windup';
          b.t = e.windup;
          const dur = e.windup + 0.3;
          Object.assign(s, { attack: dur, attackDuration: dur, attackWeapon: String(n.profile.held ?? 'None') });
        }
        continue;
      }
      const k = 0.42 * e.speed;
      n.controller.step({ x: (dx / d) * k, z: -(dz / d) * k, run: false, jump: false, vertical: 0 }, dt, 0);
      s.heading = face;
    }
  }
}
