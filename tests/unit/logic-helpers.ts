import type { ExecCtx } from '../../src/core/logic/catalog';
import type { LogicGraph } from '../../src/core/schema';

/** A tiny graph builder for tests: nodes in order get ids n1, n2... */
export function graph(
  nodes: [string, Record<string, unknown>?][],
  edges: [number, string, number, string][],
  id = 'lg_test000001',
): LogicGraph {
  return {
    id: id as LogicGraph['id'],
    name: 'Test',
    scope: 'global',
    nodes: nodes.map(([type, args], i) => ({ id: `n${i + 1}`, type, pos: [i * 200, 0], ...(args ? { args } : {}) })),
    edges: edges.map(([a, ap, b, bp]) => [`n${a}`, ap, `n${b}`, bp]),
  };
}

/** An ExecCtx that records what the graph did. */
export function recorder() {
  const log: string[] = [];
  const vars = new Map<string, unknown>();
  const ctx: ExecCtx & { log: (m: string) => void } = {
    getVar: (n) => vars.get(n),
    setVar: (n, v) => vars.set(n, v),
    log: (m) => log.push(`log ${m}`),
    emit: (e) => log.push(`emit ${e}`),
    random: () => 0.5,
    setState: (t, s) => log.push(`state ${t} ${s}`),
    teleport: (s) => log.push(`teleport ${s}`),
    travel: (m, s) => log.push(`travel ${m} ${s}`),
    give: (i, c) => log.push(`give ${c} ${i}`),
    spawn: (a, at) => {
      log.push(`spawn ${a} ${at}`);
      return 'ins_spawned001';
    },
    despawn: (t) => log.push(`despawn ${t}`),
    media: (k, id) => log.push(`${k} ${id}`),
    inZone: () => ['hero', 'ins_a', 'ins_b'],
  };
  return { ctx, log, vars };
}
