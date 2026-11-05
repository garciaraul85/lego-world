import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { BUILTINS, extendCode } from '../../src/core/logic/builtins';
import { parseBehaviour, printBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, type Instances, type LogicGraph, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B3): the engine's asset features as built-in behaviours, extended by behaviours of the game's own. */
function behaviour(id: string, code: string): LogicGraph {
  const r = parseBehaviour(code);
  if ('error' in r) throw new Error(`line ${r.error.line}: ${r.error.message}`);
  return {
    id: id as LogicGraph['id'],
    name: id,
    scope: 'global',
    behaviour: r.behaviour,
    nodes: r.nodes,
    edges: r.edges,
  };
}

describe('built-in behaviours', () => {
  it('every built-in names its hooks as events, and its Extend code parses', () => {
    for (const b of BUILTINS) {
      const code = extendCode(b, `My${b.name}`);
      const r = parseBehaviour(code);
      expect('error' in r ? `${b.name}: ${r.error.message}` : null).toBeNull();
      if ('error' in r) continue;
      expect(r.behaviour.extends).toBe(b.name);
      for (const h of b.hooks)
        expect(
          r.nodes.some((n) => n.type === h.event),
          `${b.name}.${h.method}`,
        ).toBe(true);
      // it prints back as written (super.method(e) is the engine's answer)
      const g = { name: `My${b.name}`, behaviour: r.behaviour, nodes: r.nodes, edges: r.edges };
      expect(printBehaviour(g).code.trim()).toBe(code);
    }
  });

  it('an asset with a setting already is that built-in (older projects need no change)', () => {
    const lock = BUILTINS.find((b) => b.name === 'Lock')!;
    const door = BUILTIN_ASSETS.find((a) => a.name === 'Door')!;
    expect(lock.on(door)).toBe(false);
    const locked = { ...door, ...lock.add(door) } as Asset;
    expect(lock.on(locked)).toBe(true);
    expect(lock.fields.find((f) => f.name === 'key')!.get(locked)).toBe('small');
    expect(lock.on(lock.remove(locked))).toBe(false);
  });
});

describe('extending built-ins in Play', () => {
  const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
  function world(asset: Asset, ...graphs: LogicGraph[]) {
    const s = new ProjectStore(newProjectFiles({ name: 'Built-ins', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const ok = bus.execute(
      [
        { type: 'asset.create', payload: { asset } },
        { type: 'asset.place', payload: { map, asset: asset.id, pos: [4, 0, 6] } },
        ...graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
        ...graphs.map((g) => ({
          type: 'script.attach',
          payload: { target: { kind: 'asset', id: asset.id }, use: g.id },
        })),
      ],
      { source: 'user' },
    );
    expect(ok.ok, ok.error).toBe(true);
    const id = s
      .get<Instances>(paths.instances(map))!
      .items.find((i) => i.kind === 'asset' && i.asset === asset.id)!.id;
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    p.runtime.stepOnce();
    const o = () => p.world.instances.find((i) => i.inst.id === id)!;
    return { s, p, o, id };
  }

  it('a door that needs three gems: Lock.canOpen answered by the game', () => {
    const gemDoor = behaviour(
      'lg_gemdooraaa',
      [
        'class GemDoor extends Lock {',
        '  needs = field.number(3, { label: "Gems needed" });',
        '  canOpen(e) {',
        '    return (e.have >= this.needs);',
        '  }',
        '}',
      ].join('\n'),
    );
    const box: Asset = {
      ...crate,
      id: 'ast_gemdoorbox' as Asset['id'],
      name: 'Gem box',
      states: ['closed', 'open'],
      initialState: 'closed',
      lock: { key: 'item', item: 'Gem', keep: true },
    };
    const { p, o } = world(box, gemDoor);
    p.inventory.set('gem', 1);
    p.inventory.set('Gem', 1);
    p.puzzles.press(o());
    expect(o().state).toBe('closed');
    p.inventory.set('gem', 3);
    p.inventory.set('Gem', 3);
    p.puzzles.press(o());
    expect(o().state).toBe('open');
  });

  it('attaching one that extends a built-in makes the asset that built-in', () => {
    const oneWay = behaviour(
      'lg_onewayaaaa',
      ['class OneWay extends Pushable {', '  canPush(e) {', '    return (e.dz > 0);', '  }', '}'].join('\n'),
    );
    const box: Asset = { ...crate, id: 'ast_onewayboxa' as Asset['id'], name: 'One-way block' };
    expect(box.push).toBeUndefined();
    const { s, p, o } = world(box, oneWay);
    expect(s.get<Asset>(paths.asset(box.id))!.push).toEqual({});
    // north (−z) refused, south (+z) allowed
    expect(p.puzzles.tryMove(o(), 0, -1, false)).toBe(false);
    expect(p.events.some((e) => e.msg.includes("won't move that way"))).toBe(true);
    expect(p.puzzles.tryMove(o(), 0, 1, false)).toBe(true);
  });

  it('a tough crate takes half of every hit (Health.takeDamage)', () => {
    const tough = behaviour(
      'lg_toughaaaaa',
      ['class Tough extends Health {', '  takeDamage(e) {', '    return (super.takeDamage(e) / 2);', '  }', '}'].join(
        '\n',
      ),
    );
    const box: Asset = {
      ...crate,
      id: 'ast_toughboxaa' as Asset['id'],
      name: 'Tough crate',
      health: { hp: 4, atZero: { break: true } },
    };
    const { p, o, id } = world(box, tough);
    p.hitInstance(o(), { power: 2, type: 'blunt' });
    expect(p.health.peek(`i:${id}`)?.hp).toBe(3);
  });

  it('a block that sticks after two pushes (own variables in a hook, log, return false)', () => {
    const stubborn = behaviour(
      'lg_stubbornaa',
      [
        'class Stubborn extends Pushable {',
        '  pushes = field.number(2, { label: "Pushes before it sticks", min: 1, max: 20 });',
        '  moved = 0;',
        '',
        '  canPush(e) {',
        '    if ((this.moved >= this.pushes)) {',
        '      log("The block is stuck fast");',
        '      return false;',
        '    }',
        '    this.moved += 1;',
        '    return super.canPush(e);',
        '  }',
        '}',
      ].join('\n'),
    );
    const box: Asset = { ...crate, id: 'ast_stubbornbx' as Asset['id'], name: 'Stubborn block' };
    const { p, o } = world(box, stubborn);
    // each push slides the block a moment; the next waits for it
    const push = () => {
      const ok = p.puzzles.tryMove(o(), 1, 0, false);
      for (let i = 0; i < 120; i++) p.runtime.stepOnce();
      return ok;
    };
    expect(push()).toBe(true);
    expect(push()).toBe(true);
    expect(push()).toBe(false);
    expect(p.events.some((e) => e.msg.includes('stuck fast'))).toBe(true);
  });
});
