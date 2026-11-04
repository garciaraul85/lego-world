import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { GRAVITY } from '../../src/engine/physics/physics';
import { aimAt, segHitsCylinder } from '../../src/engine/runtime/foe-shots';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 14a: the built-in brains of the starter enemies, played. */
type Foe = [slug: string, x: number, z: number, heading?: number];
function play(foes: Foe[], opts: { water?: { pos: [number, number, number]; size: [number, number, number] } } = {}) {
  const s = new ProjectStore(newProjectFiles({ name: 'Brains', random: () => 0.3, noNeighbours: true }));
  registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  const inst = s.get<Instances>(paths.instances(map))!;
  s.put(paths.instances(map), {
    ...inst,
    npcsSaved: true,
    items: [
      ...inst.items.filter((i) => i.kind !== 'npc'),
      ...foes.map(([slug, x, z, heading], i) => ({
        id: `ins_foe${String(i).padStart(7, 'a')}`,
        kind: 'npc' as const,
        character: STARTER_CHARACTERS.find((c) => c.slug === slug)!.id,
        legacyId: 20 + i,
        biome: 'prairie',
        role: 'guard',
        state: { x, y: 0.4, z, heading: heading ?? 0 },
      })),
    ],
  } as Instances);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  if (opts.water)
    (p.world as unknown as { water: unknown[] }).water = [
      {
        id: 'ins_water00001',
        kind: 'water',
        pos: opts.water.pos,
        size: opts.water.size,
        body: 'lake',
        current: [0, 0],
      },
    ];
  const foe = (i = 0) => p.world.npcs.find((n) => n.id === 20 + i)!;
  const steps = (sec: number, each?: () => void) => {
    for (let t = 0; t < sec; t += 1 / 60) {
      p.runtime.stepOnce();
      each?.();
    }
  };
  const hp = () => Number(p.logic.vars.get('hp'));
  const brain = (i = 0) => (p.enemies as unknown as { brains: Map<number, { phase: string }> }).brains.get(20 + i);
  return { p, foe, steps, hp, brain };
}

describe('aiming and hitting', () => {
  it('the low arc lands on the target', () => {
    const v = aimAt([0, 2, 0], [8, 1.6, 0], 13);
    // fly it by hand (no drag): it comes down within a stud of the target
    let x = 0;
    let y = 2;
    let vy = v[1];
    while (x < 8) {
      x += v[0] / 600;
      vy -= GRAVITY / 600;
      y += vy / 600;
    }
    expect(Math.abs(y - 1.6)).toBeLessThan(0.6);
    expect(segHitsCylinder([0, 1, -1], [0, 1, 1], { x: 0, z: 0, r: 0.5, y0: 0, y1: 2 })).not.toBeNull();
    expect(segHitsCylinder([3, 1, -1], [3, 1, 1], { x: 0, z: 0, r: 0.5, y0: 0, y1: 2 })).toBeNull();
  });
});

describe('Pebblespout (pop-up)', () => {
  it('waits underground, comes up and spits a rock at the hero, and can only be hit while up', () => {
    const { p, foe, steps, brain } = play([['pebblespout', 0, 0, 0]]);
    p.placeAt([0, 0.4, 7], Math.PI);
    steps(0.1);
    expect(p.enemies.hittable(foe())).toBe(false);
    let shot = false;
    let up = false;
    steps(4, () => {
      if (p.foeShots.flying.length) shot = true;
      if (p.enemies.hittable(foe())) up = true;
    });
    expect(up).toBe(true);
    expect(shot).toBe(true);
    // close by, it stays down
    p.placeAt([0, 0.4, 2], Math.PI);
    steps(3);
    expect(brain()!.phase).toBe('hidden');
    expect(p.enemies.hittable(foe())).toBe(false);
  });

  it('a rock bounced off the shield goes back and fells it', () => {
    const { p, foe, steps } = play([['pebblespout', 0, 0, 0]]);
    p.hero = { ...p.hero, offHand: 'Shield' } as typeof p.hero;
    p.placeAt([0, 0.4, 7], Math.PI);
    steps(0.1);
    // the guard held toward it all along
    let bounced = false;
    p.input.keys.add('q');
    steps(6, () => {
      p.heroState.heading = Math.PI;
      p.combat.stamina = 100;
      if (p.foeShots.flying.some((s) => s.back)) bounced = true;
    });
    expect(bounced).toBe(true);
    expect(p.events.some((e) => /rock went back|bounced the rock/.test(e.msg))).toBe(true);
    // a bounced rock hits twice as hard as it came: one is enough (it is gone from the map)
    expect(foe()).toBeUndefined();
    expect(p.events.some((e) => e.msg.includes('Pebblespout defeated'))).toBe(true);
  });
});

describe('Finspitter in water', () => {
  it('surfaces out of the water to spit fire, and sinks back under', () => {
    const { p, foe, steps } = play([['finspitter', 0, 0, 0]], { water: { pos: [-4, 0, -4], size: [8, 3, 8] } });
    p.placeAt([0, 0.4, 9], Math.PI);
    steps(0.1);
    expect(p.enemies.look(foe())!.sink).toBe(1);
    const kinds = new Set<string>();
    steps(4, () => {
      for (const s of p.foeShots.flying) kinds.add(s.kind);
    });
    expect(kinds.has('fireball')).toBe(true);
  });
});

describe('Watcher Eye (turret)', () => {
  it('charges and fires its beam at a hero in sight; a shield held to it blocks the beam', () => {
    const { p, steps, hp } = play([['watcher-eye', 0, 0, 0]]);
    p.placeAt([0, 0.4, 7], Math.PI);
    const before = hp();
    let beam = false;
    steps(3, () => {
      if (p.enemies.effects().some((l) => l.beam && l.beam.power >= 1)) beam = true;
    });
    expect(beam).toBe(true);
    expect(hp()).toBeLessThan(before);
    // guarded
    const g = play([['watcher-eye', 0, 0, 0]]);
    g.p.hero = { ...g.p.hero, offHand: 'Shield' } as typeof g.p.hero;
    g.p.placeAt([0, 0.4, 7], Math.PI);
    const b2 = g.hp();
    g.p.input.keys.add('q');
    g.steps(3, () => {
      g.p.combat.stamina = 100;
      g.p.heroState.heading = Math.PI;
    });
    expect(g.hp()).toBe(b2);
    expect(g.p.events.some((e) => e.msg.includes('shield blocked the beam'))).toBe(true);
  });
});

describe('Cinderjaw (fire melee)', () => {
  it('breathes fire on a hero close in front: hurt and set alight', () => {
    const { p, foe, steps, hp, brain } = play([['cinderjaw', 0, 0, 0]]);
    // 3 studs in front of its mouth (it is a big lizard: its mouth is well in front of its middle)
    const front = p.mouthOf(foe()).front + 3;
    p.placeAt([0, 0.4, front], Math.PI);
    const before = hp();
    let breath = false;
    const log: unknown[] = [];
    steps(4, () => {
      p.placeAt([foe().state.x, 0.4, foe().state.z + front], Math.PI);
      const l = p.enemies.effects().find((x) => x.breath);
      if (l) {
        breath = true;
        log.push([
          l.breath!.from.map((v) => +v.toFixed(1)),
          l.breath!.reach.toFixed(1),
          +foe().state.heading.toFixed(2),
          +p.heroState.z.toFixed(1),
          (brain() as any).landed,
        ]);
      }
    });
    expect(breath).toBe(true);
    expect(hp()).toBeLessThan(before);
    expect(p.events.some((e) => e.msg.includes('set the hero alight'))).toBe(true);
  });
});

describe('Flitterwing (flyer)', () => {
  it('flies off the ground, swoops down on the hero; the ice bat freezes it a moment', () => {
    const { p, foe, steps } = play([['flitterwing-ice', 0, 0, 0]]);
    p.placeAt([0, 0.4, 5], Math.PI);
    let high = 0;
    let froze = false;
    steps(8, () => {
      high = Math.max(high, foe().state.y);
      if (p.combat.stagger > 0.5) froze = true;
    });
    expect(high).toBeGreaterThan(2);
    expect(froze).toBe(true);
    expect(p.events.some((e) => e.msg.includes('froze the hero'))).toBe(true);
  });
});

describe('Threadback (ambusher)', () => {
  it('hangs high on its thread, drops on a hero passing under, then climbs back up', () => {
    const { p, foe, steps, brain } = play([['threadback', 0, 0, 0]]);
    p.placeAt([10, 0.4, 10], 0);
    steps(0.5);
    expect(foe().state.y).toBeGreaterThan(4);
    p.placeAt([0.5, 0.4, 1], Math.PI);
    let low = 99;
    steps(1, () => {
      low = Math.min(low, foe().state.y);
    });
    expect(low).toBeLessThan(1.5);
    // the hero walks off; it climbs back up its thread
    p.placeAt([10, 0.4, 10], 0);
    steps(5);
    expect(brain()!.phase).toBe('hang');
    expect(foe().state.y).toBeGreaterThan(4);
  });
});

describe('Lanternwisp (ghost)', () => {
  it('fades out (it cannot be hit or locked on to), but the Lens of Truth shows it', () => {
    const { p, foe, steps } = play([['lanternwisp', 0, 0, 0]]);
    p.placeAt([0, 0.4, 6], Math.PI);
    let faded = false;
    steps(6, () => {
      if (p.enemies.look(foe())!.fade < 0.2) faded = true;
      if (faded) return;
    });
    expect(faded).toBe(true);
    // wait until it is faded again, and look through the Lens
    for (let i = 0; i < 600 && p.enemies.look(foe())!.fade > 0.2; i++) p.runtime.stepOnce();
    expect(p.enemies.hittable(foe())).toBe(false);
    expect(p.canHarm(foe())).toBe(false);
    p.lens.on = true;
    expect(p.enemies.hittable(foe())).toBe(true);
  });
});

describe('Howler (pack)', () => {
  it('howls, the pack circles, and only one strikes at a time', () => {
    const { p, foe, steps, brain } = play([
      ['howler', 0, 0, 0],
      ['howler', 3, 0, 0],
      ['howler', -3, 0, 0],
    ]);
    p.placeAt([0, 0.4, 8], Math.PI);
    let most = 0;
    steps(6, () => {
      const winding = [0, 1, 2].filter((i) => brain(i)?.phase === 'windup').length;
      most = Math.max(most, winding);
    });
    expect(p.events.some((e) => e.msg.includes('howls'))).toBe(true);
    expect(most).toBe(1);
    // the ones waiting hold a ring round the hero, not all on top of it
    const ds = [0, 1, 2].map((i) => Math.hypot(foe(i).state.x - p.heroState.x, foe(i).state.z - p.heroState.z));
    expect(ds.filter((d) => d > 3).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Rattlebones (knight)', () => {
  it('a swing at its front is answered with a counter', () => {
    const { p, foe, steps, brain } = play([['rattlebones', 0, 0, 0]]);
    p.placeAt([0, 0.4, 2.6], Math.PI);
    steps(0.5);
    let countered = false;
    steps(3, () => {
      // the hero keeps facing it, swinging
      const f = foe();
      p.heroState.heading = Math.atan2(f.state.x - p.heroState.x, f.state.z - p.heroState.z);
      (p.heroState as unknown as { attack: number }).attack = 0.3;
      if (brain()?.phase === 'counter') countered = true;
    });
    expect(countered).toBe(true);
    expect(p.events.some((e) => e.msg.includes('blocks and counters'))).toBe(true);
  });
});
