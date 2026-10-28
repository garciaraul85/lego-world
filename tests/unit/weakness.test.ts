import { describe, expect, it } from 'vitest';
import { damageOf, hitSide, stunsIt } from '../../src/core/combat/damage';
import { Enemy } from '../../src/core/combat/enemy';
import { Enemies, type EnemyHost } from '../../src/engine/runtime/enemies';

/** step 11, 4a: weaknesses (by damage type and by side), stuns, senses and wits */
describe('weaknesses', () => {
  const knight = { sides: { front: 0, back: 2 } } as const;
  it('a hit from the front is blocked, from behind it does double', () => {
    expect(damageOf({ power: 2, type: 'slash' }, knight, 'front')).toBe(0);
    expect(damageOf({ power: 2, type: 'slash' }, knight, 'back')).toBe(4);
    expect(damageOf({ power: 2, type: 'slash' }, knight, 'side')).toBe(2);
  });
  it('which side a hit comes from, seen by the target', () => {
    const t = { x: 0, y: 0, z: 0, heading: 0 };
    expect(hitSide(t, { x: 0, y: 0, z: 3 }, 4)).toBe('front');
    expect(hitSide(t, { x: 0, y: 0, z: -3 }, 4)).toBe('back');
    expect(hitSide(t, { x: 3, y: 0, z: 0 }, 4)).toBe('side');
    expect(hitSide(t, { x: 0, y: 5, z: 0.5 }, 4)).toBe('above');
  });
  it('a stun hit does no damage but stuns; a turret immune to stun is not stunned', () => {
    expect(damageOf({ power: 1, type: 'stun' }, {})).toBe(0);
    expect(stunsIt({ power: 1, type: 'stun' }, {})).toBe(true);
    expect(stunsIt({ power: 1, type: 'stun' }, { resist: { stun: 0 } })).toBe(false);
    expect(stunsIt({ power: 1, type: 'fire' }, { stunBy: ['fire'] })).toBe(true);
    // a creature weak to light takes double
    expect(damageOf({ power: 1, type: 'light' }, { resist: { light: 2 } })).toBe(2);
  });
});

function world(foes: { id: number; x: number; z: number; heading: number; e: Partial<Enemy> }[], hero = { x: 0, z: 0 }) {
  const base: Enemy = { power: 1, type: 'blunt', reach: 1.5, sight: 8, speed: 1, cooldown: 1, windup: 0.4 };
  const npcs = foes.map((f) => {
    const n = {
      id: f.id,
      profile: {},
      state: { x: f.x, y: 0, z: f.z, heading: f.heading },
      controller: {
        step(m: { x: number; z: number }, dt: number) {
          n.state.x += m.x * dt * 4;
          n.state.z -= m.z * dt * 4;
        },
      },
    };
    return n;
  });
  const loud = { v: false };
  const host: EnemyHost = {
    heroState: { x: hero.x, y: 0, z: hero.z, heading: 0 } as never,
    clock: 0,
    calm: () => false,
    enemyOf: (n) => ({ ...base, ...foes.find((f) => f.id === n.id)!.e }),
    isStunned: () => false,
    hitHero: () => {},
    radiusOf: () => 0.6,
    heroLoud: () => loud.v,
  };
  return { npcs: npcs as never[], ai: new Enemies(host), loud };
}

describe('senses and wits', () => {
  it('a narrow cone does not see the hero behind it; hearing does when the hero runs', () => {
    // facing away (+z) from the hero at z = -4
    const w = world([{ id: 1, x: 0, z: 0, heading: 0, e: { cone: 120, hearing: 6 } }], { x: 0, z: -4 });
    w.ai.step(w.npcs, 0.1);
    expect(w.ai.engaged(w.npcs[0]!)).toBe(false);
    w.loud.v = true;
    w.ai.step(w.npcs, 0.1);
    expect(w.ai.engaged(w.npcs[0]!)).toBe(true);
  });
  it('a pack hunter calls the others near it', () => {
    const w = world(
      [
        { id: 1, x: 0, z: 5, heading: Math.PI, e: { wits: 'pack' } },
        // a second one, facing away with a narrow cone: it would not see the hero itself
        { id: 2, x: 4, z: 9, heading: 0, e: { cone: 60 } },
      ],
      { x: 0, z: 0 },
    );
    w.ai.step(w.npcs, 0.1);
    expect(w.ai.engaged(w.npcs[0]!)).toBe(true);
    expect(w.ai.engaged(w.npcs[1]!)).toBe(true);
  });
  it('a turret stays where it is', () => {
    const w = world([{ id: 1, x: 0, z: 6, heading: Math.PI, e: { style: 'turret' } }], { x: 0, z: 0 });
    for (let i = 0; i < 30; i++) w.ai.step(w.npcs, 0.1);
    const s = (w.npcs[0] as unknown as { state: { x: number; z: number } }).state;
    expect(s.z).toBe(6);
    expect(s.x).toBe(0);
  });
});
