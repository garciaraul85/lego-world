import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { CommandBus, registerAll } from '../../src/core/commands';
import { parseBehaviour, printBehaviour } from '../../src/core/logic/code/behaviour';
import { parseCode } from '../../src/core/logic/code/parse';
import { printGraph } from '../../src/core/logic/code/print';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, type LogicGraph, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B2): the engine API — things, physics, messages, maths, text, input and time. */
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

describe('the code reads the new cards', () => {
  it('function cards and operators print and parse both ways', () => {
    const code = [
      'on("start", (e) => {',
      '  vars.a = math.min((entity.x("this") / 2), math.max(3, (7 % 4)));',
      '  if ((entity.distance("this", "hero") < 5)) {',
      '    say(text.join("Near: ", math.round(time.now())), 2);',
      '  }',
      '  if ((input.held("action") !== false)) {',
      '    entity.moveBy("this", 1, 0, 0);',
      '  }',
      '});',
    ].join('\n');
    const r = parseCode(code);
    expect('error' in r ? r.error : null).toBeNull();
    if ('error' in r) return;
    const types = r.nodes.map((n) => n.type);
    for (const t of [
      'math.min',
      'math.max',
      'math.div',
      'math.mod',
      'entity.x',
      'entity.distance',
      'compare.lt',
      'text.join',
      'math.round',
      'time.now',
      'input.held',
      'compare.neq',
      'entity.moveBy',
    ])
      expect(types).toContain(t);
    expect(printGraph(r).code.trim()).toBe(code);
  });
});

describe('the engine API in Play', () => {
  function world(...graphs: LogicGraph[]) {
    const s = new ProjectStore(newProjectFiles({ name: 'API', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const lamp = BUILTIN_ASSETS.find((a) => a.name === 'Lamp post')!;
    const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
    const ok = bus.execute(
      [
        { type: 'asset.create', payload: { asset: lamp } },
        { type: 'asset.create', payload: { asset: crate } },
        { type: 'asset.place', payload: { map, asset: lamp.id, pos: [10, 0, 10] } },
        { type: 'asset.place', payload: { map, asset: crate.id, pos: [-10, 0, 10] } },
        ...graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
      ],
      { source: 'user' },
    );
    expect(ok.ok, ok.error).toBe(true);
    const items = s.get<Instances>(paths.instances(map))!.items;
    const lampId = items.find((i) => i.kind === 'asset' && i.asset === lamp.id)!.id;
    const crateId = items.find((i) => i.kind === 'asset' && i.asset === crate.id)!.id;
    return { s, bus, map, lamp, crate, lampId, crateId };
  }
  const attach = (w: ReturnType<typeof world>, asset: string, g: LogicGraph, fields?: Record<string, number>) => {
    const r = w.bus.execute(
      [
        {
          type: 'script.attach',
          payload: { target: { kind: 'asset', id: asset }, use: g.id, ...(fields ? { fields } : {}) },
        },
      ],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
  };

  it('a sentry lamp: on when the hero comes near, off when it goes; it tells the crate, which slides', () => {
    const sentry = behaviour(
      'lg_sentryaaaa',
      [
        'class Sentry extends Behaviour {',
        '  range = field.number(5, { label: "Sees within" });',
        '  update(e) {',
        '    if ((entity.distance("this", "hero") < this.range)) {',
        '      world.setState("this", "on");',
        '    } else {',
        '      world.setState("this", "off");',
        '    }',
        '  }',
        '  interact(e) {',
        '    msg.send("Wooden crate", "slide", 2);',
        '  }',
        '}',
      ].join('\n'),
    );
    const slider = behaviour(
      'lg_slideraaaa',
      [
        'class Slider extends Behaviour {',
        '  slid = 0;',
        '  message(e = { name: "slide" }) {',
        '    entity.moveBy("this", e.value, 0, 0);',
        '    this.slid += e.value;',
        '  }',
        '}',
      ].join('\n'),
    );
    const w = world(sentry, slider);
    attach(w, w.lamp.id, sentry);
    attach(w, w.crate.id, slider);
    const p = new PlaySession(w.s.snapshot(), { audio: new RecordingAudio() });
    const lamp = () => p.world.instances.find((i) => i.inst.id === w.lampId)!;
    const crate = () => p.world.instances.find((i) => i.inst.id === w.crateId)!;
    // far away: off
    p.placeAt([0, 0.4, -6], 0);
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    expect(p.heroState.z).toBeLessThan(0);
    expect(lamp().state).toBe('off');
    // near: on
    const c = p.instanceCenter(lamp())!;
    p.placeAt([c[0] - 2.5, 0.4, c[2]], 0);
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    expect(lamp().state).toBe('on');
    // used: the crate slides 2 studs east
    const x0 = crate().inst.pos[0];
    p.logic.fire({ type: 'event.onInteract', self: w.lampId, payload: {} }, true);
    p.runtime.stepOnce();
    expect(crate().inst.pos[0]).toBe(x0 + 2);
    expect(p.logic.selfOf(slider.id, w.crateId).slid).toBe(2);
  });

  it('reads where things are, turns them, and looks ahead', () => {
    const probe = behaviour(
      'lg_probeaaaaa',
      [
        'class Probe extends Behaviour {',
        '  x = 0;',
        '  far = 0;',
        '  start(e) {',
        '    this.x = entity.x("this");',
        '    entity.face("this", 90);',
        '    this.far = physics.raycast("hero", 30);',
        '  }',
        '}',
      ].join('\n'),
    );
    const w = world(probe);
    attach(w, w.crate.id, probe);
    const p = new PlaySession(w.s.snapshot(), { audio: new RecordingAudio() });
    p.runtime.stepOnce();
    const crate = p.world.instances.find((i) => i.inst.id === w.crateId)!;
    const vals = p.logic.selfOf(probe.id, w.crateId);
    expect(p.logic.problems).toEqual([]);
    expect(Number(vals.x)).toBeCloseTo(p.instanceCenter(crate)![0], 5);
    expect(crate.inst.rot).toBe(1);
    expect(typeof vals.far).toBe('number');
    // printed back the same
    expect(printBehaviour(probe).code).toContain('this.far = physics.raycast("hero", 30);');
  });
});
