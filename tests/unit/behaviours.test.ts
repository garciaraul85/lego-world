import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { attachmentsOf, startValues } from '../../src/core/logic/behaviours';
import { parseBehaviour, printBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, type Instances, LogicGraph, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B1): behaviours — logic files with fields, attached to things, one instance per copy. */
const COUNTER: LogicGraph = {
  id: 'lg_counteraaa' as LogicGraph['id'],
  name: 'Counter',
  scope: 'global',
  behaviour: {
    fields: [{ name: 'step', type: 'number', default: 1, label: 'Counts by', min: 1, max: 10 }],
    vars: { count: 0, ticks: 0 },
  },
  nodes: [
    { id: 'n1', type: 'event.onInteract', pos: [0, 0] },
    { id: 'n2', type: 'self.add', pos: [300, 0], args: { name: 'count' } },
    { id: 'n3', type: 'self.get', pos: [150, 120], args: { name: 'step' } },
    { id: 'n4', type: 'event.onUpdate', pos: [0, 300] },
    { id: 'n5', type: 'self.add', pos: [300, 300], args: { name: 'ticks', amount: 1 } },
  ],
  edges: [
    ['n1', 'then', 'n2', 'in'],
    ['n3', 'value', 'n2', 'amount'],
    ['n4', 'then', 'n5', 'in'],
  ],
};

describe('behaviour files', () => {
  it('a behaviour is a logic file with fields and its own variables', () => {
    expect(LogicGraph.safeParse(COUNTER).success).toBe(true);
    const twice = { ...COUNTER, behaviour: { fields: [...COUNTER.behaviour!.fields, COUNTER.behaviour!.fields[0]!] } };
    expect(LogicGraph.safeParse(twice).success).toBe(false);
  });

  it('prints as a class and parses back to the same cards, fields and variables', () => {
    const code = printBehaviour(COUNTER).code;
    expect(code).toContain('class Counter extends Behaviour {');
    expect(code).toContain('step = field.number(1, { label: "Counts by", min: 1, max: 10 });');
    expect(code).toContain('count = 0;');
    expect(code).toContain('interact(e) {');
    expect(code).toContain('this.count += this.step;');
    expect(code).toContain('update(e) {');
    const back = parseBehaviour(code, COUNTER);
    expect('error' in back ? back.error : null).toBeNull();
    if ('error' in back) return;
    expect(back.behaviour).toEqual(COUNTER.behaviour);
    expect(back.nodes.map((n) => n.type).sort()).toEqual(COUNTER.nodes.map((n) => n.type).sort());
    expect(back.edges.length).toBe(COUNTER.edges.length);
  });

  it('code typed by hand: a new field, a filter on the event, an error on its line', () => {
    const code = [
      'class Door extends Behaviour {',
      '  key = field.item("Small key", { label: "Opens with" });',
      '  opened = false;',
      '',
      '  interact(e = { asset: "Wooden door" }) {',
      '    this.opened = true;',
      '  }',
      '}',
    ].join('\n');
    const r = parseBehaviour(code);
    expect('error' in r ? r.error : null).toBeNull();
    if ('error' in r) return;
    expect(r.behaviour.fields[0]).toMatchObject({ name: 'key', type: 'item', default: 'Small key', label: 'Opens with' });
    expect(r.behaviour.vars).toEqual({ opened: false });
    expect(r.nodes.find((n) => n.type === 'event.onInteract')?.args).toEqual({ asset: 'Wooden door' });
    const bad = parseBehaviour(code.replace('this.opened = true;', 'this.opened = whatever;'));
    expect('error' in bad && bad.error.line).toBe(6);
  });

  it('a copy runs its asset’s behaviours with its own values, and can switch one off', () => {
    const base = [{ use: COUNTER.id, fields: { step: 2 } }];
    expect(attachmentsOf(base, undefined)).toEqual([{ use: COUNTER.id, fields: { step: 2 } }]);
    expect(attachmentsOf(base, [{ use: COUNTER.id, fields: { step: 5 } }])).toEqual([
      { use: COUNTER.id, fields: { step: 5 } },
    ]);
    expect(attachmentsOf(base, [{ use: COUNTER.id, off: true }])).toEqual([]);
    expect(startValues(COUNTER, { step: 5 })).toEqual({ step: 5, count: 0, ticks: 0 });
  });
});

describe('behaviours in Play', () => {
  const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
  function world() {
    const s = new ProjectStore(newProjectFiles({ name: 'Scripts', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const box: Asset = { ...crate, id: 'ast_boxaaaaaaa' as Asset['id'], name: 'Counting box' };
    const ok = bus.execute(
      [
        { type: 'asset.create', payload: { asset: box } },
        { type: 'asset.place', payload: { map, asset: box.id, pos: [4, 0, 4] } },
        { type: 'asset.place', payload: { map, asset: box.id, pos: [-6, 0, 4] } },
        { type: 'logic.create', payload: { graph: COUNTER } },
        {
          type: 'script.attach',
          payload: { target: { kind: 'asset', id: box.id }, use: COUNTER.id, fields: { step: 2 } },
        },
      ],
      { source: 'user' },
    );
    expect(ok.ok, ok.error).toBe(true);
    const [a, b] = s.get<Instances>(paths.instances(map))!.items.filter((i) => i.kind === 'asset' && i.asset === box.id);
    // the second copy counts by 5
    const set = bus.execute(
      [
        {
          type: 'script.setField',
          payload: { target: { kind: 'instance', map, id: b!.id }, use: COUNTER.id, name: 'step', value: 5 },
        },
      ],
      { source: 'user' },
    );
    expect(set.ok, set.error).toBe(true);
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    return { p, a: a!.id, b: b!.id, bus, s, map };
  }

  it('each copy is its own instance: its fields, its variables, its events', () => {
    const { p, a, b } = world();
    expect(p.logic.attachedTo(COUNTER.id).sort()).toEqual([a, b].sort());
    p.logic.fire({ type: 'event.onInteract', self: a, payload: {} }, true);
    p.logic.fire({ type: 'event.onInteract', self: a, payload: {} }, true);
    p.logic.fire({ type: 'event.onInteract', self: b, payload: {} }, true);
    expect(p.logic.selfOf(COUNTER.id, a)).toMatchObject({ step: 2, count: 4 });
    expect(p.logic.selfOf(COUNTER.id, b)).toMatchObject({ step: 5, count: 5 });
  });

  it('On update runs every step for every copy', () => {
    const { p, a, b } = world();
    for (let i = 0; i < 30; i++) p.runtime.stepOnce();
    expect(Number(p.logic.selfOf(COUNTER.id, a).ticks)).toBeGreaterThanOrEqual(29);
    expect(p.logic.selfOf(COUNTER.id, b).ticks).toBe(p.logic.selfOf(COUNTER.id, a).ticks);
  });

  it('a copy that is removed stops; switched off on one copy, it runs only on the other', () => {
    const { bus, s, map, b, a } = world();
    const r = bus.execute(
      [{ type: 'script.detach', payload: { target: { kind: 'instance', map, id: b }, use: COUNTER.id, off: true } }],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    expect(p.logic.attachedTo(COUNTER.id)).toEqual([a]);
  });
});

describe('a behaviour written as code, on two lamp posts', () => {
  const BLINKER = [
    'class Blinker extends Behaviour {',
    '  seconds = field.number(1, { label: "Blinks every (seconds)", min: 0.1, max: 10 });',
    '  timer = 0;',
    '  lit = true;',
    '',
    '  update(e) {',
    '    this.timer += e.dt;',
    '    if ((this.timer >= this.seconds)) {',
    '      this.timer = 0;',
    '      if (this.lit) {',
    '        world.setState("this", "off");',
    '        this.lit = false;',
    '      } else {',
    '        world.setState("this", "on");',
    '        this.lit = true;',
    '      }',
    '    }',
    '  }',
    '}',
  ].join('\n');

  it('each lamp blinks at its own pace', () => {
    const parsed = parseBehaviour(BLINKER);
    expect('error' in parsed ? parsed.error : null).toBeNull();
    if ('error' in parsed) return;
    const g: LogicGraph = {
      id: 'lg_blinkeraaa' as LogicGraph['id'],
      name: 'Blinker',
      scope: 'global',
      behaviour: parsed.behaviour,
      nodes: parsed.nodes,
      edges: parsed.edges,
    };
    expect(LogicGraph.safeParse(g).success).toBe(true);
    // it prints back the same way
    expect(printBehaviour(g).code.trim()).toBe(BLINKER.trim());
    const s = new ProjectStore(newProjectFiles({ name: 'Lamps', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const lamp = BUILTIN_ASSETS.find((a) => a.name === 'Lamp post')!;
    const ok = bus.execute(
      [
        { type: 'asset.create', payload: { asset: lamp } },
        { type: 'asset.place', payload: { map, asset: lamp.id, pos: [4, 0, 4] } },
        { type: 'asset.place', payload: { map, asset: lamp.id, pos: [-6, 0, 4] } },
        { type: 'logic.create', payload: { graph: g } },
        { type: 'script.attach', payload: { target: { kind: 'asset', id: lamp.id }, use: g.id } },
      ],
      { source: 'user' },
    );
    expect(ok.ok, ok.error).toBe(true);
    expect(s.get<Asset>(paths.asset(lamp.id))?.scripts).toEqual([{ use: g.id }]);
    const [, fast] = s.get<Instances>(paths.instances(map))!.items.filter((i) => i.kind === 'asset' && i.asset === lamp.id);
    bus.execute(
      [
        {
          type: 'script.setField',
          payload: { target: { kind: 'instance', map, id: fast!.id }, use: g.id, name: 'seconds', value: 0.25 },
        },
      ],
      { source: 'user' },
    );
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    const lamps = p.world.instances.filter((i) => i.def.id === lamp.id);
    const slow = lamps.find((i) => i.inst.id !== fast!.id)!;
    const quick = lamps.find((i) => i.inst.id === fast!.id)!;
    const flips = { slow: 0, quick: 0 };
    let last = { slow: slow.state, quick: quick.state };
    for (let i = 0; i < 120; i++) {
      p.runtime.stepOnce();
      const now = { slow: p.world.instances.find((x) => x.inst.id === slow.inst.id)!.state, quick: p.world.instances.find((x) => x.inst.id === quick.inst.id)!.state };
      if (now.slow !== last.slow) flips.slow++;
      if (now.quick !== last.quick) flips.quick++;
      last = now;
    }
    // two seconds: the slow lamp flips twice, the quick one about eight times
    expect(flips.slow).toBe(2);
    expect(flips.quick).toBeGreaterThanOrEqual(7);
  });
});
