import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { ENEMY_PRESETS } from '../../src/core/combat/enemy';
import { CommandBus, registerAll } from '../../src/core/commands';
import { addWire, removeWire, scriptOf, wiresOf, wireText } from '../../src/core/logic/wiring';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, type Character, type Instances, type LogicGraph, paths } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';

/** P9c: scripts on objects, wiring (switch → gate), names on placed copies, and enemies that fight back. */
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
const floor: Asset = {
  ...crate,
  id: 'ast_yardfloor0' as Asset['id'],
  name: 'Yard floor',
  health: undefined,
  smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  palette: { types: ['plate8x8'], colors: ['#5a8f3c'] },
  footprint: [32, 32],
  bricks: [0, 1, 2, 3].flatMap((i) =>
    [0, 1, 2, 3].map((j) => [0, i * 8, 0, j * 8, 0, 0, 0] as Asset['bricks'][number]),
  ),
};

function yard() {
  const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  const run = (cmds: unknown) => {
    const r = bus.execute(cmds as Parameters<typeof bus.execute>[0], { source: 'user' });
    expect(r.ok, r.error).toBe(true);
  };
  run([
    { type: 'asset.create', payload: { asset: floor } },
    { type: 'asset.place', payload: { map, asset: floor.id, pos: [-4, 0, -8] } },
    { type: 'asset.create', payload: { asset: crate } },
    { type: 'asset.create', payload: { asset: chest } },
    { type: 'asset.place', payload: { map, asset: crate.id, pos: [6, 1, 3] } },
    { type: 'asset.place', payload: { map, asset: chest.id, pos: [12, 1, 3] } },
    { type: 'asset.place', payload: { map, asset: chest.id, pos: [18, 1, 3] } },
  ]);
  const items = () => (s.get<Instances>(paths.instances(map))?.items ?? []).filter((i) => i.kind === 'asset');
  const [, box, chestA, chestB] = items();
  return { s, bus, map, run, items, box: box!.id, chestA: chestA!.id, chestB: chestB!.id };
}

describe('names on placed copies', () => {
  it('a copy can be named; names are unique on a map and “this” or “hero” are refused', () => {
    const y = yard();
    y.run({ type: 'instance.rename', payload: { map: y.map, instance: y.chestA, name: 'Gate' } });
    expect(y.items().find((i) => i.id === y.chestA)?.name).toBe('Gate');
    const dup = y.bus.execute(
      { type: 'instance.rename', payload: { map: y.map, instance: y.chestB, name: 'gate' } },
      { source: 'user' },
    );
    expect(dup.ok).toBe(false);
    expect(
      y.bus.execute(
        { type: 'instance.rename', payload: { map: y.map, instance: y.chestB, name: 'this' } },
        { source: 'user' },
      ).ok,
    ).toBe(false);
    // in play, logic finds that exact copy by its name (not the nearest chest)
    const p = new PlaySession(y.s.snapshot());
    expect(p.resolveEntity('Gate')?.inst.id).toBe(y.chestA);
  });
});

describe('wiring', () => {
  it('a wire is two cards in the object’s own script; it lists, reads in words, and comes out again', () => {
    const y = yard();
    let g = addWire(null, { id: y.box, name: 'Lever', newId: () => 'lg_aaaaaaaaaa' }, 'smashed', {
      kind: 'state',
      target: 'Gate',
      state: 'open',
    });
    expect(g.owner).toBe(y.box);
    g = addWire(g, { id: y.box, name: 'Lever', newId: () => 'x' }, 'hit', { kind: 'emit', event: 'alarm' });
    const ws = wiresOf(g);
    expect(ws.map(wireText)).toEqual(['When is smashed → Gate: open', 'When is hit → send “alarm”']);
    expect(scriptOf([g], y.box)).toBe(g);
    const less = removeWire(g, ws[0]!);
    expect(wiresOf(less).length).toBe(1);
    expect(less.nodes.length).toBe(2);
  });

  it('in play: hitting the wired crate opens the named chest — and not when another crate is hit', () => {
    const y = yard();
    y.run({ type: 'instance.rename', payload: { map: y.map, instance: y.chestA, name: 'Gate' } });
    const g = addWire(null, { id: y.box, name: 'Lever', newId: () => 'lg_wirewire01' }, 'hit', {
      kind: 'state',
      target: 'Gate',
      state: 'open',
    });
    y.run({ type: 'logic.create', payload: { graph: g } });
    const p = new PlaySession(y.s.snapshot());
    const box = p.world.instances.find((i) => i.inst.id === y.box)!;
    const gate = () => p.world.instances.find((i) => i.inst.id === y.chestA)!.state;
    expect(gate()).toBe('closed');
    p.hitInstance(box, { power: 1, type: 'blunt' });
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    expect(gate()).toBe('open');
  });

  it('a script on one object hears only its own events, and “this” is that object', () => {
    const y = yard();
    const g: LogicGraph = {
      id: 'lg_thisthis01' as LogicGraph['id'],
      name: 'Chest B script',
      scope: 'global',
      owner: y.chestB as LogicGraph['owner'],
      nodes: [
        { id: 'n1', type: 'event.onInteract', pos: [0, 0] },
        { id: 'n2', type: 'world.despawn', pos: [200, 0], args: { target: 'this' } },
      ],
      edges: [['n1', 'then', 'n2', 'in']],
    };
    y.run({ type: 'logic.create', payload: { graph: g } });
    const p = new PlaySession(y.s.snapshot());
    // an interaction with chest A: the script on chest B does not run
    p.logic.fire(
      { type: 'event.onInteract', match: { asset: chest.id }, payload: { target: y.chestA }, self: y.chestA },
      true,
    );
    expect(p.world.instances.some((i) => i.inst.id === y.chestB)).toBe(true);
    // with chest B: “this” is chest B, which is removed
    p.logic.fire(
      { type: 'event.onInteract', match: { asset: chest.id }, payload: { target: y.chestB }, self: y.chestB },
      true,
    );
    p.runtime.stepOnce();
    expect(p.world.instances.some((i) => i.inst.id === y.chestB)).toBe(false);
    expect(p.world.instances.some((i) => i.inst.id === y.chestA)).toBe(true);
  });
});

describe('enemies', () => {
  function arena(guard = false) {
    const y = yard();
    const preset = ENEMY_PRESETS.grunt!;
    const chr: Character = {
      id: 'chr_gruntaaaaa' as Character['id'],
      name: 'Grunt',
      role: 'npc',
      profile: { name: 'Grunt' },
      harm: { canBeHarmed: true, health: preset.health },
      enemy: { ...preset.enemy, windup: 0.4, cooldown: 1 },
    };
    const hero: Character = {
      id: 'chr_heroaaaaaa' as Character['id'],
      name: 'Rowan',
      role: 'hero',
      profile: { name: 'Rowan', held: 'Sword' },
      ...(guard ? { gear: { offHand: 'Shield' as const } } : {}),
    };
    y.run([
      { type: 'character.create', payload: { character: hero } },
      { type: 'project.update', payload: { hero: hero.id } },
    ]);
    const inst = y.s.get<Instances>(paths.instances(y.map))!;
    y.s.put(paths.character(chr.id), chr);
    y.s.put(paths.instances(y.map), {
      ...inst,
      npcsSaved: true,
      items: [
        ...inst.items,
        {
          id: 'ins_gruntaaaaa',
          kind: 'npc',
          character: chr.id,
          legacyId: 11,
          biome: 'prairie',
          role: 'guard',
          state: { x: 2, y: 0.4, z: 12, heading: Math.PI },
        },
      ],
    } as Instances);
    const p = new PlaySession(y.s.snapshot());
    p.placeAt([2, 0.4, 4], 0);
    p.camYaw = Math.PI;
    return p;
  }
  const step = (p: PlaySession, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
  };

  it('an enemy that sees the hero walks over, warns, and hits (a heart gone)', () => {
    const p = arena();
    const g = p.world.npcs.find((n) => n.id === 11)!;
    const d0 = Math.hypot(g.state.x - p.heroState.x, g.state.z - p.heroState.z);
    step(p, 2);
    const d1 = Math.hypot(g.state.x - p.heroState.x, g.state.z - p.heroState.z);
    expect(d1).toBeLessThan(d0 - 2);
    let warned = false;
    for (let t = 0; t < 6 && Number(p.logic.vars.get('hp')) === 3; t += 1 / 60) {
      p.runtime.stepOnce();
      warned ||= p.enemies.windingUp(g);
    }
    expect(warned).toBe(true);
    expect(Number(p.logic.vars.get('hp'))).toBeLessThan(3);
  });

  it('a raised shield blocks the swing from the front', () => {
    const p = arena(true);
    p.input.keys.add('q');
    step(p, 6);
    expect(Number(p.logic.vars.get('hp'))).toBe(3);
    expect(p.message === 'Blocked' || p.message === 'Parry!' || p.combat.stamina < 100).toBe(true);
  });
});
