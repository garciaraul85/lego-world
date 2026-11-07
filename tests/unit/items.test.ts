import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allHooksOf, itemClassOf, itemsOfBehaviour, lineageOf } from '../../src/core/logic/builtins';
import { parseBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Character, type Instances, type LogicGraph, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B6): items and projectiles as classes — Item, Projectile and the built-in items, on the hero. */
function behaviour(name: string, code: string): LogicGraph {
  const r = parseBehaviour(code);
  if ('error' in r) throw new Error(`line ${r.error.line}: ${r.error.message}`);
  const id = `lg_${name.replace(/\W/g, '').toLowerCase().padEnd(10, 'x').slice(0, 10)}`;
  return { id: id as LogicGraph['id'], name, scope: 'global', behaviour: r.behaviour, nodes: r.nodes, edges: r.edges };
}
// biome-ignore lint/suspicious/noExplicitAny: test helper
// biome-ignore lint/suspicious/noExplicitAny: what a pickup does
const give = (p: PlaySession, item: string, n: number) => (p as any).give(item, n);
const run = (bus: CommandBus, c: any) => bus.execute(c, { source: 'user' });
const hero: Character = {
  id: 'chr_heroaaaaaa' as Character['id'],
  name: 'Rowan',
  role: 'hero',
  profile: { name: 'Rowan' },
};

/** a game whose hero carries these item behaviours; a Howler 6 studs ahead */
function game(...graphs: LogicGraph[]) {
  const s = new ProjectStore(newProjectFiles({ name: 'Items', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const r = run(bus, [
    { type: 'character.create', payload: { character: hero } },
    { type: 'project.update', payload: { hero: hero.id } },
    ...graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
    ...graphs.map((g) => ({
      type: 'script.attach',
      payload: { target: { kind: 'character', id: hero.id }, use: g.id },
    })),
  ]);
  expect(r.ok, r.error).toBe(true);
  const howler = STARTER_CHARACTERS.find((c) => c.slug === 'howler')!;
  s.put(paths.character(howler.id), { ...howler.character, id: howler.id });
  const map = s.manifest.entry.map;
  const inst = s.get<Instances>(paths.instances(map))!;
  s.put(paths.instances(map), {
    ...inst,
    npcsSaved: true,
    items: [
      ...inst.items.filter((i) => i.kind !== 'npc'),
      {
        id: 'ins_howleraaaa',
        kind: 'npc',
        character: howler.id,
        legacyId: 21,
        biome: 'prairie',
        role: 'guard',
        state: { x: 0, y: 0.4, z: 6, heading: Math.PI },
      },
    ],
  } as Instances);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  p.placeAt([0, 0.4, 0], 0);
  p.runtime.stepOnce();
  const said = (t: string) => p.events.some((e) => e.msg.includes(t));
  const step = (sec: number) => {
    for (let t = 0; t < sec; t += 1 / 60) p.runtime.stepOnce();
  };
  return { s, bus, p, said, step, howlerId: howler.id };
}

describe('item classes', () => {
  it('Bow extends Projectile extends Item; each built-in item has its class', () => {
    expect(lineageOf('Bow').map((b) => b.name)).toEqual(['Bow', 'Projectile', 'Item']);
    expect(allHooksOf('Boomerang').map((h) => h.method)).toEqual(
      expect.arrayContaining(['canUseItem', 'useItem', 'magicCost', 'shotSpeed', 'shotPower', 'hits']),
    );
    expect(itemClassOf('Fire arrows')?.name).toBe('Bow');
    expect(itemClassOf('lens of truth')?.name).toBe('LensOfTruth');
    expect(itemClassOf('Whistle')).toBeNull();
    // what a behaviour is about: a built-in item's, or (on Item or Projectile itself) the item of its own name
    expect(itemsOfBehaviour('Bow', 'Frost bow')).toEqual(['Bow', 'Fire arrows', 'Ice arrows']);
    expect(itemsOfBehaviour('Item', 'Whistle')).toEqual(['Whistle']);
    expect(itemsOfBehaviour('Projectile', 'Pebble')).toEqual(['Pebble']);
    expect(itemsOfBehaviour('Hero', 'Rowan')).toBeNull();
  });

  it('an item class goes on the hero only', () => {
    const { bus } = game();
    const g = behaviour('Quick boomerang', 'class QuickBoomerang extends Boomerang {\n}\n');
    run(bus, { type: 'logic.create', payload: { graph: g } });
    const npc = { ...hero, id: 'chr_villager01', name: 'Mira', role: 'npc' } as Character;
    run(bus, { type: 'character.create', payload: { character: npc } });
    const r = run(bus, { type: 'script.attach', payload: { target: { kind: 'character', id: npc.id }, use: g.id } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Quick boomerang is an item \(it extends Boomerang\): put it on the hero/);
  });
});

describe('an item of your own', () => {
  const whistle = behaviour(
    'Whistle',
    'class Whistle extends Item {\n  useItem(e) {\n    log("Tweet!");\n  }\n\n  magicCost(e) {\n    return 4;\n  }\n}\n',
  );

  it('given to the hero, it goes in an item button; used, it runs and takes its magic', () => {
    const { p, said } = game(whistle);
    give(p, 'Whistle', 1);
    expect(p.buttons.slots).toContain('Whistle');
    p.useItem('Whistle', p.buttons.slots.indexOf('Whistle') + 1);
    expect(said('Tweet!')).toBe(true);
    expect(p.magic.has).toBe(true);
    expect(p.magic.now).toBe(p.magic.max - 4);
  });

  it('without enough magic it is not used (On magic empty)', () => {
    const { p, said } = game(whistle);
    give(p, 'Whistle', 1);
    p.magic.grant();
    p.logic.setVar('magic', 2);
    p.useItem('Whistle', 1);
    expect(said('Tweet!')).toBe(false);
    expect(p.magic.now).toBe(2);
  });
});

describe('changing a built-in item', () => {
  it('canUseItem false: the bow stays put away', () => {
    const g = behaviour('No bow', 'class NoBow extends Bow {\n  canUseItem(e) {\n    return false;\n  }\n}\n');
    const { p } = game(g);
    give(p, 'Bow', 1);
    p.useItem('Bow', 1);
    expect(p.shots.out).toBeFalsy();
  });

  it('useItem false keeps the engine’s own use: the boots stay off; asked only about its own item', () => {
    const g = behaviour(
      'Heavy boots',
      'class HeavyBoots extends HoverBoots {\n  useItem(e) {\n    log("Too heavy");\n    return false;\n  }\n}\n',
    );
    const { p, said } = game(g);
    give(p, 'Hover boots', 1);
    give(p, 'Boomerang', 1);
    p.useItem('Hover boots', 1);
    expect(said('Too heavy')).toBe(true);
    expect(p.boots.worn).toBe(false);
    // the boomerang is not the boots: its own use runs
    p.useItem('Boomerang', 2);
    expect(p.shots.boomer).toBeTruthy();
  });

  it('shotSpeed: a quicker boomerang and a faster arrow', () => {
    const g = behaviour(
      'Quick boomerang',
      'class QuickBoomerang extends Boomerang {\n  shotSpeed(e) {\n    return e.base * 1.5;\n  }\n}\n',
    );
    const b = behaviour(
      'Strong bow',
      'class StrongBow extends Bow {\n  shotSpeed(e) {\n    return e.base * 2;\n  }\n}\n',
    );
    const { p } = game(g, b);
    give(p, 'Boomerang', 1);
    p.useItem('Boomerang', 1);
    expect(p.shots.boomer!.sp).toBeCloseTo(30);
    const s = p.shots.launch('arrow', 'plain', [0, 0, 1], 10);
    expect(Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz)).toBeCloseTo(20);
    // a seed is the Slingshot's: not changed
    const seed = p.shots.launch('seed', 'plain', [0, 0, 1], 10);
    expect(Math.hypot(seed.ball.vx, seed.ball.vy, seed.ball.vz)).toBeCloseTo(10);
  });

  it('hits false: an arrow does no harm; shotPower: a seed hits harder', () => {
    const soft = behaviour(
      'Soft arrows',
      'class SoftArrows extends Bow {\n  hits(e) {\n    log(text.join("Boop ", e.target));\n    return false;\n  }\n}\n',
    );
    const hard = behaviour(
      'Hard seeds',
      'class HardSeeds extends Slingshot {\n  shotPower(e) {\n    return 3;\n  }\n}\n',
    );
    const { p, said } = game(soft, hard);
    const foe = p.world.npcs.find((n) => n.id === 21)!;
    const npc = {
      id: foe.id,
      x: foe.state.x,
      y: foe.state.y,
      z: foe.state.z,
      bottom: 0,
      top: 4,
      radius: 0.6,
      name: 'Howler',
    };
    const hp = () => p.health.peek('n:21')?.hp;
    const before = hp();
    // biome-ignore lint/suspicious/noExplicitAny: the shot strikes the foe (as it does when it reaches it)
    const shots = p.shots as any;
    shots.hitFoe(p.shots.launch('arrow', 'plain', [0, 0, 1], 20), npc, 20);
    expect(said('Boop Howler')).toBe(true);
    expect(hp()).toBe(before);
    shots.hitFoe(p.shots.launch('seed', 'plain', [0, 0, 1], 10), npc, 10);
    // (a seed's own 0.5; this one 3: the Howler's front halves it)
    expect(p.health.peek('n:21')!.hp).toBeLessThanOrEqual(p.health.peek('n:21')!.max - 1.5);
  });

  it('LensOfTruth.magicCost: a lens that takes no magic', () => {
    const g = behaviour('Free lens', 'class FreeLens extends LensOfTruth {\n  magicCost(e) {\n    return 0;\n  }\n}\n');
    const { p, step } = game(g);
    give(p, 'Lens of Truth', 1);
    const full = p.magic.now;
    p.useItem('Lens of Truth', 1);
    expect(p.lens.on).toBe(true);
    step(3);
    expect(p.magic.now).toBe(full);
    expect(p.lens.on).toBe(true);
  });
});
