import { describe, expect, it } from 'vitest';
import { parseCode } from '../../src/core/logic/code/parse';
import { printGraph } from '../../src/core/logic/code/print';
import { graphProblems } from '../../src/core/logic/graph';
import { graph } from './logic-helpers';

const ok = (code: string, prev?: Parameters<typeof parseCode>[1]) => {
  const r = parseCode(code, prev);
  if ('error' in r) throw new Error(`${r.error.message} at ${r.error.line}:${r.error.column}\n${code}`);
  return r;
};

const repair = graph(
  [
    ['event.onRebuildFinished'],
    ['var.add', { var: 'repaired', amount: 1 }],
    ['flow.branch'],
    ['compare.gte', { b: 3 }],
    ['var.get', { var: 'repaired' }],
    ['cinematic.play', { cinematic: 'cin_reward0001', once: true }],
  ],
  [
    [1, 'then', 2, 'in'],
    [2, 'then', 3, 'in'],
    [5, 'value', 4, 'a'],
    [4, 'out', 3, 'cond'],
    [3, 'true', 6, 'in'],
  ],
);

describe('logic code view (P4.4)', () => {
  it('prints the repair example as readable script', () => {
    expect(printGraph(repair).code).toBe(
      [
        'on("rebuildFinished", (e) => {',
        '  vars.repaired += 1;',
        '  if ((vars.repaired >= 3)) {',
        '    cinematic.play("cin_reward0001", true);',
        '  }',
        '});',
        '',
      ].join('\n'),
    );
  });

  it('parses back to the same graph, keeping node ids and positions', () => {
    const p = ok(printGraph(repair).code, repair);
    expect(printGraph(p).code).toBe(printGraph(repair).code);
    expect(p.nodes.map((n) => [n.id, n.type, n.pos])).toEqual(
      expect.arrayContaining(repair.nodes.map((n) => [n.id, n.type, n.pos])),
    );
    expect(graphProblems(p)).toEqual([]);
  });

  it('every construct round-trips: if/else, wait, once, gates, for-each, consts, notes, event settings', () => {
    const code = [
      '// note: Quest one',
      '// group: Village (480x260)',
      '',
      'on("enterZone", { zone: "zn_village001" }, async (e) => {',
      '  log(e.who);',
      '  await wait(2);',
      '  if (!(vars.met === true)) {',
      '    vars.met = true;',
      '    emit("greet");',
      '  } else {',
      '    world.give("coin", random(1, 3));',
      '  }',
      '  once(() => {',
      '    const n9 = world.spawn("ast_crate00001", "sp_square00001");',
      '    world.setState(n9, "open");',
      '  });',
      '  forEachInZone("zn_village001", (item) => {',
      '    world.setState(item, "off");',
      '  });',
      '  gate("door", false, () => {',
      '    world.teleport("sp_square00001");',
      '  });',
      '});',
      '',
      'on("custom", { event: "greet" }, (e) => {',
      '  gate.open("door");',
      '});',
      '',
    ].join('\n');
    const g1 = ok(code);
    expect(printGraph(g1).code).toBe(code);
    const g2 = ok(printGraph(g1).code, g1);
    expect(g2).toEqual(g1);
  });

  it('errors point to the line and column', () => {
    const r = parseCode('on("start", (e) => {\n  while (true) {}\n});\n');
    expect(r).toMatchObject({ error: { line: 2, column: 2 } });
    expect(parseCode('on("nope", (e) => {});')).toMatchObject({
      error: { message: 'There is no event “nope”.', line: 1 },
    });
    expect(parseCode('on("start", (e) => {\n  launchRocket();\n});')).toMatchObject({ error: { line: 2 } });
    expect(parseCode('on("start", (e) => { log(1) ')).toMatchObject({ error: { line: 1 } });
  });

  it('200 random valid graphs: print(parse(print(g))) equals print(g)', () => {
    let seed = 1234567;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
    const value = (depth: number, ev: string): string => {
      const r = rnd();
      if (depth > 2 || r < 0.35) return pick(['1', '2.5', '"hi"', 'true', 'false', '-3', '0']);
      if (r < 0.45 && ev === 'interact') return pick(['e.target', 'e.socket']);
      if (r < 0.55) return `vars.${pick(['score', 'flag', 'count'])}`;
      if (r < 0.65) return `!${value(depth + 1, ev)}`;
      if (r < 0.75) return `random(${value(depth + 1, ev)}, ${value(depth + 1, ev)})`;
      return `(${value(depth + 1, ev)} ${pick(['+', '-', '*', '>=', '<=', '===', '&&', '||'])} ${value(depth + 1, ev)})`;
    };
    const stmts = (depth: number, ind: string, ev: string, item: string | null): string[] => {
      const out: string[] = [];
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const r = rnd();
        const ends = i === n - 1;
        if (r < 0.15) out.push(`${ind}log(${item && rnd() < 0.5 ? item : value(0, ev)});`);
        else if (r < 0.25) out.push(`${ind}vars.${pick(['score', 'count'])} += ${value(0, ev)};`);
        else if (r < 0.35) out.push(`${ind}vars.flag = ${value(0, ev)};`);
        else if (r < 0.42) out.push(`${ind}emit(${pick(['"a"', '"b"'])});`);
        else if (r < 0.5) out.push(`${ind}world.give("gem", ${value(0, ev)});`);
        else if (r < 0.58) out.push(`${ind}await wait(${pick(['1', '0.5', 'vars.count'])});`);
        else if (ends && depth < 3 && r < 0.7) {
          out.push(`${ind}if (${value(0, ev)}) {`, ...stmts(depth + 1, `${ind}  `, ev, item));
          if (rnd() < 0.5) out.push(`${ind}} else {`, ...stmts(depth + 1, `${ind}  `, ev, item));
          out.push(`${ind}}`);
        } else if (ends && depth < 3 && r < 0.78)
          out.push(`${ind}once(async () => {`, ...stmts(depth + 1, `${ind}  `, ev, item), `${ind}});`);
        else if (ends && depth < 3 && r < 0.86)
          out.push(
            `${ind}gate("g", ${rnd() < 0.5}, async () => {`,
            ...stmts(depth + 1, `${ind}  `, ev, item),
            `${ind}});`,
          );
        else if (depth < 3 && r < 0.94 && !item)
          out.push(
            `${ind}forEachInZone("zn_area000001", async (item) => {`,
            ...stmts(depth + 1, `${ind}  `, ev, 'item'),
            `${ind}});`,
          );
        else if (ends && r < 0.97) out.push(`${ind}gate.${pick(['open', 'close'])}("g");`);
        else out.push(`${ind}world.setState(${item ?? '"ins_x"'}, "open");`);
      }
      return out;
    };
    for (let k = 0; k < 200; k++) {
      const events = 1 + Math.floor(rnd() * 3);
      const parts: string[] = [];
      for (let i = 0; i < events; i++) {
        const ev = pick(['start', 'interact', 'custom']);
        const head = ev === 'custom' ? `on("custom", { event: "a" }, ` : `on("${ev}", `;
        parts.push(`${head}async (e) => {`, ...stmts(0, '  ', ev, null), '});', '');
      }
      const src = parts.join('\n');
      const pr = parseCode(src);
      if ('error' in pr)
        throw new Error(
          `${pr.error.message} ${pr.error.line}:${pr.error.column}\n${src
            .split('\n')
            .map((l, i) => `${i + 1} ${l}`)
            .join('\n')}`,
        );
      const g = pr;
      const printed = printGraph(g).code;
      const again = printGraph(ok(printed, g)).code;
      expect(again, printed).toBe(printed);
    }
  });
});
