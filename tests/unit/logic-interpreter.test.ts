import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/core/logic/catalog';
import { edgeError, graphProblems } from '../../src/core/logic/graph';
import { LogicRuntime } from '../../src/engine/logic/interpreter';
import { graph, recorder } from './logic-helpers';

const vars = (defs: Record<string, number | boolean | string>) =>
  ({
    vars: Object.fromEntries(
      Object.entries(defs).map(([k, v]) => [
        k,
        {
          type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'bool' : 'string',
          default: v,
          scope: 'global',
        },
      ]),
    ),
  }) as never;

describe('logic catalog (P4.1)', () => {
  it('every node type has a title, doc text, a category and a code name; types are unique', () => {
    expect(new Set(CATALOG.map((d) => d.type)).size).toBe(CATALOG.length);
    for (const d of CATALOG) {
      expect(d.doc.length, d.type).toBeGreaterThan(10);
      expect(d.title && d.category && d.code.name, d.type).toBeTruthy();
      expect(d.type).toMatch(/^[a-z]+\.[A-Za-z]+$/);
      if (d.kind === 'pure') expect(d.eval, d.type).toBeTypeOf('function');
      if (d.kind === 'action') expect(d.exec, d.type).toBeTypeOf('function');
    }
    for (const t of [
      'event.onStart',
      'event.onEnterZone',
      'event.onRebuildFinished',
      'flow.branch',
      'flow.wait',
      'flow.once',
      'flow.forEachInZone',
      'flow.gate',
      'var.add',
      'math.random',
      'compare.gte',
      'world.travel',
      'audio.playSound',
      'screen.setText',
      'cinematic.play',
      'misc.emit',
    ])
      expect(CATALOG.map((d) => d.type)).toContain(t);
  });

  it('refuses wires between incompatible pins, with a sentence', () => {
    const g = graph([['event.onStart'], ['var.get', { var: 'x' }], ['flow.branch'], ['math.add']], []);
    expect(edgeError(g, ['n1', 'then', 'n3', 'in'])).toBeNull();
    expect(edgeError(g, ['n1', 'then', 'n3', 'cond'])).toMatch(/Flow wires/);
    expect(edgeError(g, ['n4', 'out', 'n3', 'cond'])).toMatch(/number can’t go into a bool/);
    expect(edgeError(g, ['n2', 'value', 'n3', 'cond'])).toBeNull(); // any fits
    expect(graphProblems(graph([['event.onEnterZone']], []))[0]!.message).toMatch(/choose zone/);
  });

  it('pure nodes compute; actions call the game', () => {
    const { ctx, log } = recorder();
    const rt = new LogicRuntime(
      [
        graph(
          [
            ['event.onStart'],
            ['math.add', { a: 2, b: 3 }],
            ['misc.log'],
            ['world.give', { item: 'gem', count: 2 }],
            ['math.random', { min: 1, max: 6 }],
            ['misc.log'],
          ],
          [
            [1, 'then', 3, 'in'],
            [2, 'out', 3, 'value'],
            [3, 'then', 4, 'in'],
            [4, 'then', 6, 'in'],
            [5, 'out', 6, 'value'],
          ],
        ),
      ],
      undefined,
      ctx,
    );
    rt.fire({ type: 'event.onStart' }, true);
    expect(log).toEqual(['log 5', 'give 2 gem', 'log 4']);
  });
});

describe('logic interpreter (P4.2)', () => {
  it('repair 3 buildings: counts rebuilds and plays the reward once', () => {
    const { ctx, log } = recorder();
    const g = graph(
      [
        ['event.onRebuildFinished'],
        ['var.add', { var: 'repaired' }],
        ['flow.branch'],
        ['compare.gte', { b: 3 }],
        ['var.get', { var: 'repaired' }],
        ['cinematic.play', { cinematic: 'cin_reward0001', once: true }],
        ['flow.once'],
      ],
      [
        [1, 'then', 2, 'in'],
        [2, 'then', 3, 'in'],
        [5, 'value', 4, 'a'],
        [4, 'out', 3, 'cond'],
        [3, 'true', 7, 'in'],
        [7, 'then', 6, 'in'],
      ],
    );
    const rt = new LogicRuntime([g], vars({ repaired: 0 }), ctx);
    for (let i = 0; i < 5; i++) rt.fire({ type: 'event.onRebuildFinished', payload: { target: `ins_${i}` } }, true);
    expect(rt.vars.get('repaired')).toBe(5);
    expect(log).toEqual(['cinematic cin_reward0001']);
  });

  it('wait suspends on game time; sequence, gate and for-each run in order', () => {
    const { ctx, log } = recorder();
    const g = graph(
      [
        ['event.onStart'],
        ['flow.sequence'],
        ['misc.log', { value: 'a' }],
        ['flow.wait', { seconds: 2 }],
        ['misc.log', { value: 'b' }],
        ['flow.forEachInZone', { zone: 'zn_test000001' }],
        ['misc.log'],
        ['misc.log', { value: 'done' }],
        ['flow.gate', { name: 'g', startOpen: false }],
        ['misc.log', { value: 'through gate' }],
      ],
      [
        [1, 'then', 2, 'in'],
        [2, 'a', 3, 'in'],
        [3, 'then', 4, 'in'],
        [4, 'then', 5, 'in'],
        [2, 'b', 6, 'in'],
        [6, 'body', 7, 'in'],
        [6, 'item', 7, 'value'],
        [6, 'done', 8, 'in'],
        [2, 'c', 9, 'in'],
        [9, 'then', 10, 'in'],
      ],
    );
    const rt = new LogicRuntime([g], undefined, ctx);
    rt.fire({ type: 'event.onStart' }, true);
    // the first slot waits; the sequence goes on only when it finishes
    expect(log).toEqual(['log a']);
    rt.step(1);
    expect(log).toEqual(['log a']);
    rt.step(2.01);
    expect(log).toEqual(['log a', 'log b', 'log hero', 'log ins_a', 'log ins_b', 'log done']);
    expect(rt.active).toBe(0);
  });

  it('once lets execution through one time; onVarChanged fires after the run; custom events chain', () => {
    const { ctx, log } = recorder();
    const g = graph(
      [
        ['event.onCustom', { event: 'ping' }],
        ['flow.once'],
        ['var.set', { var: 'flag', value: true }],
        ['event.onVarChanged', { var: 'flag' }],
        ['misc.log'],
        ['event.onStart'],
        ['misc.emit', { event: 'ping' }],
      ],
      [
        [1, 'then', 2, 'in'],
        [2, 'then', 3, 'in'],
        [4, 'then', 5, 'in'],
        [4, 'value', 5, 'value'],
        [6, 'then', 7, 'in'],
      ],
    );
    const rt = new LogicRuntime([g], vars({ flag: false }), ctx);
    rt.fire({ type: 'event.onStart' }, true);
    rt.fire({ type: 'event.onCustom', match: { event: 'ping' } }, true);
    expect(log).toEqual(['emit ping', 'log true']);
  });

  it('stops a run that loops forever and names the node', () => {
    const { ctx } = recorder();
    const g = graph(
      [['event.onStart'], ['var.add', { var: 'n' }], ['var.add', { var: 'n' }]],
      [
        [1, 'then', 2, 'in'],
        [2, 'then', 3, 'in'],
        [3, 'then', 2, 'in'],
      ],
    );
    const rt = new LogicRuntime([g], vars({ n: 0 }), ctx);
    rt.fire({ type: 'event.onStart' }, true);
    expect(rt.problems[0]?.message).toMatch(/1000 steps/);
    expect(rt.problems[0]?.node).toMatch(/^n[23]$/);
    expect(Number(rt.vars.get('n'))).toBeGreaterThan(400);
  });

  it('a graph with a type error does not run and reports the node', () => {
    const { ctx, log } = recorder();
    const g = graph(
      [['event.onStart'], ['misc.log'], ['math.add']],
      [
        [1, 'then', 2, 'in'],
        [3, 'out', 2, 'in'],
      ],
    );
    const rt = new LogicRuntime([g], undefined, ctx);
    rt.fire({ type: 'event.onStart' }, true);
    expect(log).toEqual([]);
    expect(rt.problems[0]).toMatchObject({ node: 'n2' });
  });

  it('breakpoints pause before the node, show its input values, and Continue goes on', () => {
    const { ctx, log } = recorder();
    const g = graph(
      [['event.onStart'], ['misc.log', { value: 'one' }], ['misc.log', { value: 'two' }]],
      [
        [1, 'then', 2, 'in'],
        [2, 'then', 3, 'in'],
      ],
    );
    const rt = new LogicRuntime([g], undefined, ctx);
    rt.breakpoints.add(`${g.id}:n3`);
    rt.fire({ type: 'event.onStart' }, true);
    expect(log).toEqual(['log one']);
    expect(rt.paused).toMatchObject({ node: 'n3', values: { value: 'two' } });
    rt.continue();
    expect(log).toEqual(['log one', 'log two']);
    expect(rt.paused).toBeNull();
  });
});
