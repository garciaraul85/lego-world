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
  /** step 11, 4a: how far its body reaches out sideways (a big spider strikes from further away) */
  radiusOf(n: Npc): number;
  /** step 11, 4a: the hero is making noise (running, fighting): heard within an enemy's hearing */
  heroLoud(): boolean;
};

type Brain = { phase: 'idle' | 'chase' | 'windup' | 'back'; t: number; cooldown: number };

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
        if (!this.notices(n, e, d, face)) continue;
        b.phase = 'chase';
        // a pack hunter calls the others near it
        if (e.wits === 'pack') this.callPack(npcs, n);
      }
      // a turret stays where it is: it turns to watch and strikes what comes into reach
      const turret = e.style === 'turret' || e.style === 'ambusher';
      const reach = e.reach + Math.max(0, this.host.radiusOf(n) - 0.6);
      if (b.phase === 'back') {
        // a smart fighter steps back after its swing, out of reach for a moment
        b.t -= dt;
        const k = 0.35 * e.speed;
        if (!turret && d > 0.01)
          n.controller.step({ x: -(dx / d) * k, z: (dz / d) * k, run: false, jump: false, vertical: 0 }, dt, 0);
        s.heading = face;
        if (b.t <= 0) b.phase = 'chase';
        continue;
      }
      if (b.phase === 'windup') {
        b.t -= dt;
        s.heading = s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 4);
        n.controller.step(still, dt, 0);
        if (b.t > 0) continue;
        // the swing lands if the hero is still in reach and in front
        if (d <= reach + 0.6 && Math.abs(angleDiff(face, s.heading)) < 1.2) this.host.hitHero(n, e.power, e.type);
        b.phase = e.wits === 'smart' ? 'back' : 'chase';
        b.t = 0.7;
        b.cooldown = e.cooldown;
        continue;
      }
      // chasing: walk to the hero, then wind up a swing
      if (d <= reach || turret) {
        n.controller.step(still, dt, 0);
        // a turret turns slowly; anything else faces the hero at once
        s.heading = turret ? s.heading + angleDiff(face, s.heading) * Math.min(1, dt * 1.5) : face;
        if (d > reach) continue;
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

  /**
   * step 11, 4a: it sees the hero (within sight and its cone of view, which is all round unless set) or hears it
   * (running or fighting within its hearing)
   */
  private notices(n: Npc, e: Enemy, d: number, face: number): boolean {
    if (e.hearing && d <= e.hearing && this.host.heroLoud()) return true;
    if (d > e.sight) return false;
    const cone = e.cone ?? 360;
    return cone >= 360 || Math.abs(angleDiff(face, n.state.heading)) <= ((cone / 2) * Math.PI) / 180;
  }

  /** step 11, 4a: the enemies within 12 studs of a pack hunter that saw the hero join the fight */
  private callPack(npcs: readonly Npc[], caller: Npc) {
    for (const o of npcs) {
      if (o === caller || !this.host.enemyOf(o)) continue;
      if (Math.hypot(o.state.x - caller.state.x, o.state.z - caller.state.z) > 12) continue;
      const b = this.brains.get(o.id) ?? { phase: 'idle' as const, t: 0, cooldown: 0 };
      if (b.phase === 'idle') b.phase = 'chase';
      this.brains.set(o.id, b);
    }
  }
}
