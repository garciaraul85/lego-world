import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { puzzleProblems } from '../../src/core/puzzles/puzzle';
import { paths, validateFile } from '../../src/core/schema';
import { GRAVITY } from '../../src/engine/physics/physics';
import { PlaySession } from '../../src/engine/runtime/session';
import { ARROW_DRAG, aimDir, flightPath, pitchToHit } from '../../src/engine/runtime/shots';

/** Step 13a: the bow (plain, fire and ice arrows), the slingshot, stun nuts and the boomerang. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

type Thing = [string, [number, number, number], string, number?];
function game(
  things: Thing[],
  opts: { water?: { pos: [number, number, number]; size: [number, number, number] } } = {},
) {
  const store = new ProjectStore(newProjectFiles({ name: 'Shots', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const run = (c: unknown) => {
    const r = bus.execute(c as Parameters<typeof bus.execute>[0], { source: 'user' });
    expect(r.ok, r.error).toBe(true);
  };
  for (const [name, pos, id, rot] of things) {
    const def = piece(name);
    if (!store.has(paths.asset(def.id))) run({ type: 'asset.create', payload: { asset: def } });
    run({ type: 'asset.place', payload: { map, asset: def.id, pos, rot: rot ?? 0, id } });
  }
  const tuft = piece('Grass tuft');
  run({ type: 'asset.create', payload: { asset: tuft } });
  run({ type: 'asset.place', payload: { map, asset: tuft.id, pos: [-4, 0, -4], rot: 0, id: 'ins_corner0001' } });
  run({ type: 'asset.place', payload: { map, asset: tuft.id, pos: [60, 0, 60], rot: 0, id: 'ins_corner0002' } });
  const p = new PlaySession(store.snapshot());
  (p.world.npcs as unknown[]).splice(0);
  (p.world.controller as unknown as { setActors(a: unknown[]): void }).setActors([]);
  if (opts.water)
    (p.world as unknown as { water: unknown[] }).water = [
      ...p.world.water,
      {
        id: 'ins_water00001',
        kind: 'water',
        pos: opts.water.pos,
        size: opts.water.size,
        body: 'lake',
        current: [0, 0],
      },
    ];
  const get = (id: string) => p.world.instances.find((i) => i.inst.id === id);
  const host = (p as unknown as { buttonHost(): { attack(down: boolean): void } }).buttonHost();
  const give = (i: string, n: number) => (p as unknown as { give(i: string, n: number): void }).give(i, n);
  const use = (i: string) => (p as unknown as { useTool(i: string): boolean }).useTool(i);
  return { store, p, get, host, give, use };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};

describe('shooting parts', () => {
  it('are valid and say nothing is wrong', () => {
    for (const n of [
      'Bow',
      'Quiver',
      'Fire arrows',
      'Ice arrows',
      'Slingshot',
      'Seed bag',
      'Stun nuts',
      'Boomerang',
      'Whirl boomerang',
      'Eye target',
      'Archery target',
      'Ice floe',
    ]) {
      const a = piece(n);
      expect(a, n).toBeTruthy();
      expect(validateFile(paths.asset(a.id), a), n).toEqual([]);
      expect(puzzleProblems(a), n).toEqual([]);
    }
  });

  it('an arrow flies as the physics does: gravity, and drag that slows it; the aim finds the arc that hits', () => {
    // with no drag a shot falls ½gt²
    const flat = flightPath([0, 10, 0], [20, 0, 0], 0, 1);
    expect(flat.at(-1)![1]).toBeCloseTo(10 - 0.5 * GRAVITY, 0);
    // drag takes speed: it goes less far than without
    const dragged = flightPath([0, 10, 0], [20, 0, 0], ARROW_DRAG * 10, 1);
    expect(dragged.at(-1)![0]).toBeLessThan(flat.at(-1)![0]);
    // the aim's angle brings it to the target
    const from = [0, 2, 0];
    const to = [30, 4, 0];
    const p = pitchToHit(from, to, 40, ARROW_DRAG);
    const path = flightPath(
      from,
      aimDir(Math.PI / 2, p).map((c) => c * 40),
      ARROW_DRAG,
      3,
    );
    const near = path.reduce((a, b) => (Math.abs(b[0] - 30) < Math.abs(a[0] - 30) ? b : a));
    expect(Math.abs(near[1] - 4)).toBeLessThan(0.3);
    // further away it must aim higher
    expect(pitchToHit(from, [45, 4, 0], 40, ARROW_DRAG)).toBeGreaterThan(p);
  });
});

describe('the bow', () => {
  it('taken, it comes with arrows; its button takes it out in the left hand; drawn and let go it shoots one', () => {
    const { p, host, give, use } = game([]);
    give('Bow', 1);
    expect(p.itemViews().find((i) => i.name === 'Arrows')?.count).toBe(10);
    use('Bow');
    expect(p.shots.out).toBe('bow');
    expect(p.hero.heldLook).toBe('Bow');
    p.placeAt([10, 0, 10], 0);
    steps(p, 0.1);
    host.attack(true);
    steps(p, 0.8);
    expect(p.shots.aiming).toBe(true);
    expect((p.hero as Record<string, unknown>).heldDraw).toBe(5);
    host.attack(false);
    expect(p.shots.flying.length).toBe(1);
    expect(p.itemViews().find((i) => i.name === 'Arrows')?.count).toBe(9);
    // it flies forward (the way the hero faces, +z), fast, and falls
    const a = p.shots.flying[0]!;
    steps(p, 0.3);
    expect(a.ball.z).toBeGreaterThan(20);
    expect(a.ball.vy).toBeLessThan(0);
  });

  it('an arrow in the eye of an eye target turns it on, and sticks in it; the aim help finds the eye', () => {
    const { p, get, host, give, use } = game([['Eye target', [9, 0, 34], 'ins_eye0000001']]);
    give('Bow', 1);
    use('Bow');
    p.placeAt([10.5, 0, 10], 0);
    steps(p, 0.1);
    host.attack(true);
    steps(p, 0.8);
    expect(p.shots.aimAt).not.toBeNull();
    host.attack(false);
    steps(p, 1.2);
    expect(get('ins_eye0000001')!.state).toBe('struck');
    expect(p.shots.stuck.length).toBe(1);
    expect(p.events.some((e) => /stuck in Eye target/.test(e.msg))).toBe(true);
  });

  it('a plain arrow shot through a torch’s flame catches fire and lights another torch stand', () => {
    // shot from far off at the unlit one, the arrow's arc rises through the lit one's flame just before it
    const { p, get, host, give, use } = game([
      ['Burning torch', [10, 0, 26], 'ins_burning001'],
      ['Torch stand', [10, 0, 30], 'ins_torch00001'],
    ]);
    give('Bow', 1);
    use('Bow');
    p.placeAt([10.5, 0, 0.5], 0);
    steps(p, 0.3);
    host.attack(true);
    steps(p, 0.8);
    host.attack(false);
    steps(p, 1.2);
    expect(p.events.some((e) => /arrow caught fire/.test(e.msg))).toBe(true);
    expect(get('ins_torch00001')!.state).toBe('lit');
  });

  it('an ice arrow into water freezes a floe of ice to stand on; it melts after a while', () => {
    const { p, host, give, use } = game([], { water: { pos: [4, 0, 20], size: [16, 2.4, 16] } });
    give('Bow', 1);
    give('Ice arrows', 5);
    use('Ice arrows');
    expect(p.shots.arrow).toBe('ice');
    p.placeAt([10.5, 0, 16], 0);
    steps(p, 0.1);
    // aim a little down at the water just ahead (the back key tilts the aim down)
    host.attack(true);
    p.shots.steer(0, -1, 0.17);
    steps(p, 0.8);
    expect(p.shots.landing?.[1]).toBeCloseTo(2.4, 1);
    host.attack(false);
    steps(p, 1.2);
    expect(p.shots.floes.length).toBe(1);
    const floe = p.world.instances.find((i) => i.def.name === 'Ice floe');
    expect(floe).toBeTruthy();
    expect(p.itemViews().find((i) => i.name === 'Ice arrows')?.count).toBe(4);
    steps(p, 27);
    expect(p.world.instances.find((i) => i.def.name === 'Ice floe')).toBeUndefined();
  });

  it('fire arrows need the bow', () => {
    const { p, give, use } = game([]);
    give('Fire arrows', 5);
    use('Fire arrows');
    expect(p.shots.out).toBeNull();
  });
});

describe('the boomerang, seeds and nuts', () => {
  it('the boomerang flies out to a crystal switch, turns it, and comes back to the hand', () => {
    const { p, get, give, use } = game([['Crystal switch', [10, 0, 20], 'ins_crystal001']]);
    give('Boomerang', 1);
    p.placeAt([11, 0, 10], 0);
    steps(p, 0.1);
    use('Boomerang');
    expect(p.shots.boomer).not.toBeNull();
    steps(p, 3);
    expect(get('ins_crystal001')!.state).toBe('on');
    expect(p.shots.boomer).toBeNull();
    expect(p.events.some((e) => /boomerang caught/i.test(e.msg))).toBe(true);
  });

  it('the boomerang brings back a key it touches', () => {
    const { p, get, give, use } = game([['Small key', [10, 0, 18], 'ins_key0000001']]);
    give('Boomerang', 1);
    p.placeAt([11, 0, 10], 0);
    steps(p, 0.1);
    use('Boomerang');
    steps(p, 3);
    expect(get('ins_key0000001')).toBeUndefined();
    expect(p.events.some((e) => /caught with Small key/.test(e.msg))).toBe(true);
  });

  it('the whirl boomerang spins a far pinwheel', () => {
    const { p, give, use } = game([['Pinwheel', [10, 0, 22], 'ins_pinwheel01']]);
    give('Whirl boomerang', 1);
    p.placeAt([11.5, 0, 10], 0);
    steps(p, 0.1);
    use('Whirl boomerang');
    steps(p, 1.2);
    expect(p.events.some((e) => /Pinwheel is now turning/.test(e.msg))).toBe(true);
    expect(p.wind.spins.get('ins_pinwheel01')!.omega).toBeGreaterThan(1);
    // the wind gone with it, the sails run down
    steps(p, 3);
    expect(p.wind.spins.get('ins_pinwheel01')!.omega).toBeLessThan(2);
  });

  it('a slingshot seed hits an archery target', () => {
    const { p, get, host, give, use } = game([['Archery target', [9, 0, 26], 'ins_target0001']]);
    give('Slingshot', 1);
    expect(p.itemViews().find((i) => i.name === 'Seeds')?.count).toBe(20);
    use('Slingshot');
    p.placeAt([10.5, 0, 10], 0);
    steps(p, 0.1);
    host.attack(true);
    steps(p, 0.5);
    host.attack(false);
    steps(p, 1.2);
    expect(get('ins_target0001')!.state).toBe('hit');
  });
});

describe('arrows are physics', () => {
  it('a crosswind (a gale fan blowing across the way) carries an arrow off its line', () => {
    const shoot = (fan: boolean) => {
      const { p, host, give, use } = game(fan ? [['Gale fan', [2, 0, 20], 'ins_galefan001', 3]] : []);
      give('Bow', 1);
      use('Bow');
      p.placeAt([14.5, 0, 8], 0);
      steps(p, 0.2);
      host.attack(true);
      steps(p, 0.4);
      host.attack(false);
      const a = p.shots.flying[0]!;
      let x = a.ball.x;
      for (let i = 0; i < 60 && p.shots.flying.includes(a) && a.ball.z < 34; i++) {
        steps(p, 1 / 60);
        x = a.ball.x;
      }
      return x;
    };
    const still = shoot(false);
    const windy = shoot(true);
    // blown the way the wind blows (+x); a fast arrow crosses a few studs of wind in a tenth of a second, so not far
    expect(windy - still).toBeGreaterThan(0.05);
  });

  it('an arrow striking a wall at a slant glances off; square on it sticks', () => {
    const { p, host, give, use } = game([['Dungeon wall', [6, 0, 30], 'ins_wall000001']]);
    give('Bow', 1);
    use('Bow');
    p.placeAt([9.5, 0, 12], 0);
    steps(p, 0.2);
    host.attack(true);
    steps(p, 0.8);
    host.attack(false);
    steps(p, 1);
    expect(p.shots.stuck.length).toBe(1);
    // nearly along the wall's face: it glances
    p.placeAt([0.5, 0, 26.8], Math.atan2(1, 0.3));
    steps(p, 0.2);
    host.attack(true);
    p.shots.aimAt = null;
    steps(p, 0.8);
    host.attack(false);
    steps(p, 1.2);
    expect(p.events.some((e) => /glanced off/.test(e.msg))).toBe(true);
  });

  it('a stun nut thrown bursts in a flash where it lands', () => {
    const { p, give, use } = game([]);
    give('Stun nut', 3);
    p.placeAt([10, 0, 10], 0);
    steps(p, 0.1);
    use('Stun nut');
    expect(p.shots.flying[0]?.kind).toBe('nut');
    steps(p, 2);
    expect(p.events.some((e) => /stun nut flashed/.test(e.msg))).toBe(true);
    expect(p.itemViews().find((i) => i.name === 'Stun nut')?.count).toBe(2);
  });

  it('the boomerang turns back at a wall before its mark', () => {
    const { p, give, use } = game([['Dungeon wall', [8, 0, 18], 'ins_wall000001']]);
    give('Boomerang', 1);
    p.placeAt([11, 0, 10], 0);
    steps(p, 0.1);
    use('Boomerang');
    steps(p, 3);
    expect(p.events.some((e) => /bounced off/.test(e.msg))).toBe(true);
    expect(p.shots.boomer).toBeNull();
  });
});
