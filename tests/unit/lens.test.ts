import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { HOVER_TIME, HoverBoots } from '../../src/engine/runtime/boots';
import { inRanges, LENS_DRAIN, Lens, lensRanges } from '../../src/engine/runtime/lens';
import { MAGIC_DEFAULTS, MAGIC_JAR, MagicMeter } from '../../src/engine/runtime/magic';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 13c: the hover boots, the Lens of Truth, hidden and fake things, and the magic meter. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

function vars() {
  const m = new Map<string, unknown>();
  return { m, get: (k: string) => m.get(k), has: (k: string) => m.has(k), set: (k: string, v: unknown) => m.set(k, v) };
}

type Thing = [string, [number, number, number], string];
function game(things: Thing[], settings?: Record<string, unknown>) {
  const store = new ProjectStore(newProjectFiles({ name: 'Lens', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const run = (c: unknown) => {
    const r = bus.execute(c as Parameters<typeof bus.execute>[0], { source: 'user' });
    expect(r.ok, r.error).toBe(true);
  };
  if (settings) run({ type: 'project.update', payload: settings });
  for (const [name, pos, id] of things) {
    const def = piece(name);
    if (!store.has(paths.asset(def.id))) run({ type: 'asset.create', payload: { asset: def } });
    run({ type: 'asset.place', payload: { map, asset: def.id, pos, rot: 0, id } });
  }
  const p = new PlaySession(store.snapshot());
  (p.world.npcs as unknown[]).splice(0);
  const give = (i: string, n: number) => (p as unknown as { give(i: string, n: number): void }).give(i, n);
  const use = (i: string) => (p as unknown as { useTool(i: string): boolean }).useTool(i);
  const steps = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
  };
  return { p, give, use, steps };
}

describe('boots and Lens parts', () => {
  it('are valid and say nothing is wrong', () => {
    for (const n of [
      'Hover boots',
      'Lens of Truth',
      'Magic jar',
      'Big magic jar',
      'Pit gap',
      'Invisible bridge',
      'Fake wall',
      'Fake floor',
      'Stone alcove',
      'Hidden chest',
    ]) {
      const a = piece(n);
      expect(a, n).toBeTruthy();
      expect(validateFile(paths.asset(a.id), a), n).toEqual([]);
      expect(puzzleProblems(a), n).toEqual([]);
    }
    expect(piece('Invisible bridge').hidden).toBe(true);
    expect(piece('Hidden chest').hidden).toBe(true);
    expect(piece('Fake wall').fake).toBe(true);
    expect(piece('Fake floor').fake).toBe(true);
  });
});

describe('the magic meter', () => {
  it('comes full with a grant, takes whole units on a drain, and a jar fills it back', () => {
    const v = vars();
    const m = new MagicMeter(
      () => v,
      v.set,
      () => MAGIC_DEFAULTS,
    );
    expect(m.has).toBe(false);
    m.grant();
    expect([m.has, m.now, m.max]).toEqual([true, 48, 48]);
    // 4 a second for 2.67 seconds: 10 whole units
    for (let i = 0; i < 160; i++) m.drain(4, 1 / 60);
    expect(m.now).toBe(38);
    expect(m.spend(40)).toBe(false);
    expect(m.now).toBe(38);
    m.fill(MAGIC_JAR);
    expect(m.now).toBe(48);
  });

  it('runs dry and says so; off, everything is free and no meter shows', () => {
    const v = vars();
    const m = new MagicMeter(
      () => v,
      v.set,
      () => ({ can: true, max: 8 }),
    );
    m.grant();
    let ok = true;
    for (let i = 0; i < 200 && ok; i++) ok = m.drain(4, 1 / 60);
    expect(ok).toBe(false);
    expect(m.now).toBe(0);
    const w = vars();
    const off = new MagicMeter(
      () => w,
      w.set,
      () => ({ can: false, max: 48 }),
    );
    off.grant();
    expect(off.has).toBe(false);
    expect(off.drain(100, 1)).toBe(true);
  });
});

describe('the Lens of Truth', () => {
  it('fades the view in, drains magic while up, and goes down when the meter runs dry', () => {
    const v = vars();
    const m = new MagicMeter(
      () => v,
      v.set,
      () => ({ can: true, max: 8 }),
    );
    m.grant();
    const said: string[] = [];
    const l = new Lens({
      drain: (r, dt) => m.drain(r, dt),
      has: () => m.now > 0,
      say: (t) => said.push(t),
      log: () => {},
      sound: () => {},
    });
    expect(l.toggle()).toBe(true);
    l.step(0.1);
    expect(l.amount).toBeCloseTo(0.4);
    for (let i = 0; i < 30; i++) l.step(1 / 60);
    expect(l.amount).toBe(1);
    // fake things go see-through, hidden ones show
    expect(l.fakeAlpha).toBeLessThan(0.3);
    expect(l.hiddenAlpha).toBeGreaterThan(0.7);
    // 8 magic at 4 a second: about 2 seconds
    let t = 0;
    while (l.on && t < 5) {
      l.step(1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(8 / LENS_DRAIN - 0.8);
    expect(t).toBeLessThan(8 / LENS_DRAIN + 0.1);
    expect(said.some((x) => /out of magic/i.test(x))).toBe(true);
    // with nothing left it will not go up
    expect(l.toggle()).toBe(false);
  });

  it('knows which bricks are hidden and which are fake', () => {
    const r = lensRanges([
      { def: { hidden: true, bricks: [[0, 0, 0, 0, 0, 0, 0]] as never }, inst: { idBase: 10, id: 'a' } },
      {
        def: {
          fake: true,
          bricks: [
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
          ] as never,
        },
        inst: { idBase: 20, id: 'b' },
      },
    ]);
    expect(inRanges(10, r.hidden)).toBe(true);
    expect(inRanges(11, r.hidden)).toBe(false);
    expect(inRanges(21, r.fake)).toBe(true);
  });
});

describe('the hover boots', () => {
  it('hold the hero level for HOVER_TIME after walking off an edge, once until it lands', () => {
    const b = new HoverBoots({ log: () => {}, sound: () => {} });
    b.worn = true;
    b.step({ y: 3.6, vy: 0, grounded: true }, 1 / 60, true);
    const s = { y: 3.4, vy: -0.4, grounded: false };
    let t = 0;
    let held = 0;
    while (t < 3) {
      const y = b.step(s, 1 / 60, true);
      if (y !== null) held += 1 / 60;
      t += 1 / 60;
    }
    expect(held).toBeGreaterThan(HOVER_TIME - 0.05);
    expect(held).toBeLessThan(HOVER_TIME + 0.05);
    // still in the air: no second float
    expect(b.step(s, 1 / 60, true)).toBeNull();
    // landed, then off an edge again: it floats again
    b.step({ y: 0, vy: 0, grounded: true }, 1 / 60, true);
    b.step({ y: 2, vy: 0, grounded: true }, 1 / 60, true);
    expect(b.step({ y: 2, vy: -0.1, grounded: false }, 1 / 60, true)).toBe(2);
    // the pose paddles: the legs go opposite ways and swap
    const p1 = b.pose()!;
    for (let i = 0; i < 9; i++) b.step({ y: 2, vy: 0, grounded: false }, 1 / 60, true);
    const p2 = b.pose()!;
    const ll = (p: typeof p1) => (p.ll as number[])[0]!;
    const rl = (p: typeof p1) => (p.rl as number[])[0]!;
    expect(Math.sign(ll(p2) - ll(p1))).toBe(-Math.sign(rl(p2) - rl(p1)));
  });

  it('never float a jump (not on the way up, nor at its top), nor when put on in the air', () => {
    const b = new HoverBoots({ log: () => {}, sound: () => {} });
    b.worn = true;
    b.step({ y: 0, vy: 0, grounded: true }, 1 / 60, true);
    expect(b.step({ y: 0.2, vy: 9, grounded: false }, 1 / 60, true)).toBeNull();
    for (let vy = 8; vy > -6; vy -= 0.4) expect(b.step({ y: 2, vy, grounded: false }, 1 / 60, true)).toBeNull();
    expect(b.hover).toBeNull();
    // landed, then the boots are put on mid-fall: no float either
    const c = new HoverBoots({ log: () => {}, sound: () => {} });
    c.step({ y: 3, vy: 0, grounded: true }, 1 / 60, true);
    c.step({ y: 2.9, vy: -0.5, grounded: false }, 1 / 60, true);
    c.worn = true;
    expect(c.step({ y: 2.8, vy: -1, grounded: false }, 1 / 60, true)).toBeNull();
  });
});

describe('in play', () => {
  it('the hover boots float the hero off a Pit gap ledge and across', () => {
    const { p, give, use, steps } = game([['Pit gap', [0, 0, -20], 'ins_pitgap0001']]);
    give('Hover boots', 1);
    use('Hover boots');
    expect(p.boots.worn).toBe(true);
    expect(p.hero.shoes).toBe('Armored boots');
    p.placeAt([3, 3.6, -18], Math.PI / 2);
    p.camYaw = Math.PI / 2 + Math.PI;
    steps(0.3);
    p.input.keys.add('forward');
    let floated = false;
    for (let t = 0; t < 5 && p.heroState.x < 16; t += 1 / 60) {
      p.runtime.stepOnce();
      if (p.boots.hover) floated = true;
    }
    p.input.keys.delete('forward');
    expect(floated).toBe(true);
    expect(p.heroState.x).toBeGreaterThan(14);
    expect(p.heroState.y).toBeGreaterThan(3);
    // on the ground they are ordinary shoes: let go and the hero stops (no sliding)
    steps(0.5);
    const x = p.heroState.x;
    steps(0.5);
    expect(Math.abs(p.heroState.x - x)).toBeLessThan(0.2);
  });

  it('on the ground the boots walk and run as shoes do; a jump in them does not float', () => {
    // the same run without them, to compare
    const plain = game([]);
    plain.p.placeAt([0, 0.4, 0], Math.PI / 2);
    plain.p.camYaw = Math.PI / 2 + Math.PI;
    plain.steps(0.3);
    plain.p.input.keys.add('forward');
    plain.p.input.keys.add('shift');
    const px0 = plain.p.heroState.x;
    plain.steps(1);
    const without = plain.p.heroState.x - px0;
    const { p, give, use, steps } = game([]);
    give('Hover boots', 1);
    use('Hover boots');
    p.placeAt([0, 0.4, 0], Math.PI / 2);
    p.camYaw = Math.PI / 2 + Math.PI;
    steps(0.3);
    // as fast as without them, straight away (no slow ice start), and running is running
    p.input.keys.add('forward');
    p.input.keys.add('shift');
    const x0 = p.heroState.x;
    steps(1);
    p.input.keys.delete('shift');
    p.input.keys.delete('forward');
    expect(p.heroState.x - x0).toBeGreaterThan(without * 0.95);
    expect(without).toBeGreaterThan(1);
    expect(p.iceVel).toBeNull();
    // a jump: up and down again, never held in the air
    p.input.jump = true;
    let floated = false;
    for (let t = 0; t < 2; t += 1 / 60) {
      p.runtime.stepOnce();
      if (p.boots.hover) floated = true;
    }
    expect(floated).toBe(false);
    expect(p.heroState.grounded).toBe(true);
  });

  it('without the boots, the hero walks off the same ledge and falls', () => {
    const { p, steps } = game([['Pit gap', [0, 0, -20], 'ins_pitgap0001']]);
    p.placeAt([3, 3.6, -18], Math.PI / 2);
    p.camYaw = Math.PI / 2 + Math.PI;
    steps(0.3);
    p.input.keys.add('forward');
    for (let t = 0; t < 3 && p.heroState.y > 1; t += 1 / 60) p.runtime.stepOnce();
    p.input.keys.delete('forward');
    expect(p.heroState.y).toBeLessThan(1);
    expect(p.heroState.x).toBeLessThan(14);
  });

  it('a fake wall is walked through; an invisible bridge holds the hero up', () => {
    const { p, steps } = game([
      ['Fake wall', [0, 0, -10], 'ins_fakewal001'],
      ['Pit gap', [20, 0, -20], 'ins_pitgap0001'],
      ['Invisible bridge', [28, 0, -20], 'ins_bridge0001'],
    ]);
    expect(p.world.fakePieces.size).toBeGreaterThan(0);
    // walk -z through the wall (it stands at z = -10)
    p.placeAt([3, 0, -7], Math.PI);
    p.camYaw = 0;
    steps(0.2);
    p.input.keys.add('forward');
    steps(1.6);
    p.input.keys.delete('forward');
    expect(p.heroState.z).toBeLessThan(-11);
    // across the gap on the invisible bridge, without the boots
    p.placeAt([25, 3.6, -18], Math.PI / 2);
    p.camYaw = Math.PI / 2 + Math.PI;
    steps(0.2);
    p.input.keys.add('forward');
    steps(1.6);
    p.input.keys.delete('forward');
    expect(p.heroState.y).toBeGreaterThan(3);
    expect(p.events.some((e) => e.msg.includes('Standing on the Invisible bridge'))).toBe(true);
  });

  it('the Lens comes with a full meter, drains it while up, and a magic jar puts some back', () => {
    const { p, give, use, steps } = game([]);
    give('Lens of Truth', 1);
    expect(p.logic.vars.get('hasMagic')).toBe(true);
    expect(p.logic.vars.get('magic')).toBe(48);
    use('Lens of Truth');
    expect(p.lens.on).toBe(true);
    expect(p.hero.heldLook).toBe('Lens of Truth');
    steps(3);
    expect(p.logic.vars.get('magic')).toBe(36);
    use('Lens of Truth');
    expect(p.lens.on).toBe(false);
    expect(p.hero.heldLook).toBeUndefined();
    give('Magic jar', 1);
    expect(p.logic.vars.get('magic')).toBe(48);
  });

  it('a new tool always gets an item button: with them all full, the one touched longest ago', () => {
    const { p, give, steps } = game([]);
    const n = p.buttons.c.items;
    const tools = ['Hook line', 'Grapple rope', 'Magnet glove', 'Boomerang'].slice(0, n);
    for (const t of tools) give(t, 1);
    expect(p.buttons.slots.slice(0, n)).toEqual(tools);
    // the first one is used: the next new tool goes over the second (put on longest ago, never used)
    steps(0.5);
    p.useItem(tools[0]!, 1);
    give('Lens of Truth', 1);
    expect(p.buttons.slots.slice(0, n)).toContain('Lens of Truth');
    expect(p.buttons.slots.slice(0, n)).toContain(tools[0]);
    if (n > 1) expect(p.buttons.slots[1]).toBe('Lens of Truth');
    // and the one after that does not take the Lens's button
    give('Hover boots', 1);
    expect(p.buttons.slots.slice(0, n)).toContain(n > 2 ? 'Lens of Truth' : 'Hover boots');
  });

  it('walking with the Lens up, the legs step (a walk under the lens pose, not a pose over nothing)', () => {
    const { p, give, use, steps } = game([]);
    give('Lens of Truth', 1);
    use('Lens of Truth');
    p.placeAt([0, 0.4, 0], Math.PI / 2);
    p.camYaw = Math.PI / 2 + Math.PI;
    steps(0.3);
    p.input.keys.add('forward');
    steps(0.4);
    const legs: number[] = [];
    for (let i = 0; i < 12; i++) {
      steps(0.07);
      const b = p.baseParams();
      expect(b, 'a walk under the lens').not.toBeNull();
      legs.push((b!.ll as number[])[0]!);
    }
    p.input.keys.delete('forward');
    expect(p.heroStates.state).toBe('walk');
    // the legs swing both ways through the step, and the arm keeps the lens up
    expect(Math.max(...legs) - Math.min(...legs)).toBeGreaterThan(0.5);
    expect(p.poseOver()!.ra).toEqual([-0.6, -0.3, -0.3]);
  });

  it('with magic off, the Lens needs none and no meter comes', () => {
    const { p, give, use, steps } = game([], { magic: { can: false, max: 48 } });
    give('Lens of Truth', 1);
    expect(p.logic.vars.get('hasMagic')).toBeFalsy();
    use('Lens of Truth');
    steps(20);
    expect(p.lens.on).toBe(true);
  });
});
