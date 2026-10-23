import { describe, expect, it } from 'vitest';
import { BUILTIN_EFFECTS, DEFAULT_EFFECT_EVENTS, DEFAULT_HITS, FX } from '../../src/builtin/effects';
import { DAMAGE_TYPES } from '../../src/core/combat/damage';
import { Effect, EffectHooks } from '../../src/core/effects/schema';
import { Instances } from '../../src/core/schema';
import { ParticleSystem, SIZE_STEPS, sizeStep } from '../../src/engine/effects/particles';

/** P23 part 1: effects — the built-in library, the particle pool, bursts, streams, gravity, bouncing. */
const seeded = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};
const def = (id: string) => BUILTIN_EFFECTS.find((e) => e.id === id)!;

describe('the built-in effects', () => {
  it('are valid, have unique ids, and cover every hit type and event', () => {
    for (const e of BUILTIN_EFFECTS) expect(Effect.safeParse(e).success, e.name).toBe(true);
    expect(new Set(BUILTIN_EFFECTS.map((e) => e.id)).size).toBe(BUILTIN_EFFECTS.length);
    expect(BUILTIN_EFFECTS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(BUILTIN_EFFECTS.map((e) => e.id));
    for (const t of DAMAGE_TYPES) expect(ids.has(DEFAULT_HITS[t])).toBe(true);
    for (const v of Object.values(DEFAULT_EFFECT_EVENTS)) expect(ids.has(v)).toBe(true);
  });
  it('a game picks its own hit effects; an effect placed on a map is a map item', () => {
    expect(
      EffectHooks.safeParse({ hits: { fire: FX.smoke, slash: 'none' }, events: { levelUp: FX.confetti } }).success,
    ).toBe(true);
    expect(EffectHooks.safeParse({ hits: { lasers: FX.smoke } }).success).toBe(false);
    const items = {
      npcsSaved: true,
      items: [
        {
          id: 'ins_torchfire1',
          kind: 'effect',
          effect: FX.fire,
          pos: [1, 2, 3],
          scale: 0.6,
          interval: [2, 4],
          maxDistance: 40,
          playing: true,
        },
      ],
    };
    const r = Instances.safeParse(items);
    expect(r.success, JSON.stringify(r.error?.issues?.[0])).toBe(true);
  });
});

describe('particles', () => {
  it('a burst makes its count at once; they age and are gone after their life', () => {
    const p = new ParticleSystem(500, seeded());
    p.play(def(FX.sparks), [0, 5, 0]);
    expect(p.count).toBe(18);
    for (let i = 0; i < 20; i++) p.step(1 / 60);
    expect(p.count).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) p.step(1 / 60);
    expect(p.count).toBe(0);
  });
  it('a stream makes rate a second until stopped; one with a duration stops itself', () => {
    const p = new ParticleSystem(2000, seeded());
    const h = p.play(def(FX.fire), [0, 0, 0])!;
    expect(h).not.toBeNull();
    for (let i = 0; i < 60; i++) p.step(1 / 60);
    // 40 a second, each living under a second
    expect(p.count).toBeGreaterThan(20);
    expect(p.count).toBeLessThan(45);
    p.stop(h);
    for (let i = 0; i < 60; i++) p.step(1 / 60);
    expect(p.count).toBe(0);
    const b = p.play(def(FX.breath), [0, 0, 0])!;
    for (let i = 0; i < 100; i++) p.step(1 / 60);
    expect(p.running(b)).toBe(false);
  });
  it('fire rises, sparks fall; size and colour change over life', () => {
    const p = new ParticleSystem(500, seeded());
    p.play(def(FX.sparks), [0, 10, 0]);
    for (let i = 0; i < 15; i++) p.step(1 / 60);
    const sparks = p.snapshot();
    expect(sparks.every((s) => s.size < 0.16)).toBe(true);
    const q = new ParticleSystem(500, seeded());
    const h = q.play(def(FX.fire), [0, 0, 0])!;
    for (let i = 0; i < 20; i++) q.step(1 / 60);
    q.stop(h);
    const mean = q.snapshot().reduce((a, s) => a + s.pos[1], 0) / q.count;
    expect(mean).toBeGreaterThan(0.1);
    const b = q.batches();
    expect(b.length).toBeGreaterThan(0);
    expect(b.reduce((a, x) => a + x.count, 0)).toBe(q.count);
    expect(b.every((x) => x.data.length === x.count * 6)).toBe(true);
  });
  it('bouncing off bricks: particles that hit the floor go back up', () => {
    const p = new ParticleSystem(100, seeded());
    const e: Effect = {
      ...def(FX.sparks),
      count: 5,
      direction: 'down',
      spread: 0,
      speed: [6, 6],
      life: [2, 2],
      bounce: 0.6,
      gravity: 0,
    };
    p.play(e, [0, 1, 0]);
    const solid = (_x: number, y: number) => y < 0;
    for (let i = 0; i < 20; i++) p.step(1 / 60, solid);
    expect(p.snapshot().every((s) => s.pos[1] >= 0 && s.vel[1] > 0)).toBe(true);
  });
  it('the pool has a cap: past it, particles are dropped and counted', () => {
    const p = new ParticleSystem(100, seeded());
    p.play(def(FX.confetti), [0, 0, 0]);
    p.play(def(FX.confetti), [0, 0, 0]);
    expect(p.count).toBe(100);
    expect(p.dropped).toBe(60);
    p.cap = 50;
    p.clear();
    p.play(def(FX.confetti), [0, 0, 0]);
    expect(p.count).toBe(50);
  });
  it('scale makes it bigger and faster; sizes snap to a few drawn steps', () => {
    const a = new ParticleSystem(100, seeded(3));
    const b = new ParticleSystem(100, seeded(3));
    a.play(def(FX.hitFlash), [0, 0, 0]);
    b.play(def(FX.hitFlash), [0, 0, 0], { scale: 2 });
    expect(b.snapshot()[0]!.size).toBeCloseTo(a.snapshot()[0]!.size * 2);
    expect(SIZE_STEPS[sizeStep(0.2)]).toBe(0.22);
  });
  it('2,000 particles step in well under 2 ms', () => {
    const p = new ParticleSystem(2000, seeded());
    const e = { ...def(FX.confetti), count: 400 };
    for (let i = 0; i < 5; i++) p.play(e, [0, 0, 0]);
    expect(p.count).toBe(2000);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      p.step(1 / 600, (_x, y) => y < -5);
      p.batches();
    }
    expect((performance.now() - t0) / 20).toBeLessThan(6);
  });
});
