import { nodeDef } from '../../core/logic/catalog';
import { type GraphProblem, graphProblems } from '../../core/logic/graph';
import type { LogicGraph } from '../../core/schema';

/**
 * Flat instructions per event node (P4.2). Chains end with `end`, which returns to the instruction
 * after the last `gosub` (Sequence slots, For-each bodies) or finishes the run.
 */
export type Instr =
  | { op: 'call'; node: string }
  | { op: 'jumpIf'; node: string; else: number }
  | { op: 'jump'; to: number }
  | { op: 'gosub'; to: number; node: string }
  | { op: 'wait'; node: string }
  | { op: 'once'; node: string; skip: number }
  | { op: 'gate'; node: string; skip: number }
  | { op: 'gateSet'; node: string; open: boolean }
  | { op: 'iterInit'; node: string }
  | { op: 'iterNext'; node: string; done: number }
  | { op: 'end' };

export type Program = { graph: string; event: string; type: string; args: Record<string, unknown>; code: Instr[] };
export type Compiled = { programs: Program[]; problems: (GraphProblem & { graph: string })[] };

export function compile(g: LogicGraph): Compiled {
  const problems = graphProblems(g).map((p) => ({ ...p, graph: g.id }));
  if (problems.length) return { programs: [], problems };
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const next = (node: string, pin: string) => g.edges.find((e) => e[0] === node && e[1] === pin);
  const programs: Program[] = [];
  for (const ev of g.nodes) {
    if (nodeDef(ev.type)?.kind !== 'event') continue;
    const code: Instr[] = [];
    const labels = new Map<string, number>();
    const queued: string[] = [];
    const fixes: { at: Instr; field: 'else' | 'to' | 'skip' | 'done'; key: string | null }[] = [];
    /** address of the chain that starts at an output pin (null = nothing wired: an `end`) */
    const target = (node: string, pin: string): string | null => {
      const e = next(node, pin);
      if (!e) return null;
      const key = `${e[2]}:${e[3]}`;
      if (!labels.has(key) && !queued.includes(key)) queued.push(key);
      return key;
    };
    const ref = (at: Instr, field: 'else' | 'to' | 'skip' | 'done', key: string | null) =>
      fixes.push({ at, field, key });
    const emit = (start: string) => {
      let key: string | null = start;
      while (key) {
        if (labels.has(key)) {
          const j: Instr = { op: 'jump', to: -1 };
          ref(j, 'to', key);
          code.push(j);
          return;
        }
        labels.set(key, code.length);
        const [id, pin] = key.split(':') as [string, string];
        const n = byId.get(id)!;
        switch (n.type) {
          case 'flow.branch': {
            const i: Instr = { op: 'jumpIf', node: id, else: -1 };
            code.push(i);
            ref(i, 'else', target(id, 'false'));
            key = target(id, 'true');
            continue;
          }
          case 'flow.sequence': {
            for (const slot of ['a', 'b']) {
              const t = target(id, slot);
              if (!t) continue;
              const i: Instr = { op: 'gosub', to: -1, node: id };
              code.push(i);
              ref(i, 'to', t);
            }
            key = target(id, 'c');
            continue;
          }
          case 'flow.wait':
            code.push({ op: 'wait', node: id });
            key = target(id, 'then');
            continue;
          case 'flow.once': {
            const i: Instr = { op: 'once', node: id, skip: -1 };
            code.push(i);
            ref(i, 'skip', null);
            key = target(id, 'then');
            continue;
          }
          case 'flow.gate': {
            if (pin === 'open' || pin === 'close') {
              code.push({ op: 'gateSet', node: id, open: pin === 'open' });
              key = null;
              continue;
            }
            const i: Instr = { op: 'gate', node: id, skip: -1 };
            code.push(i);
            ref(i, 'skip', null);
            key = target(id, 'then');
            continue;
          }
          case 'flow.forEachInZone': {
            code.push({ op: 'iterInit', node: id });
            const loop = code.length;
            const nx: Instr = { op: 'iterNext', node: id, done: -1 };
            code.push(nx);
            const body = target(id, 'body');
            if (body) {
              const gs: Instr = { op: 'gosub', to: -1, node: id };
              code.push(gs);
              ref(gs, 'to', body);
            }
            code.push({ op: 'jump', to: loop });
            ref(nx, 'done', target(id, 'done'));
            key = null;
            continue;
          }
          default: {
            const def = nodeDef(n.type)!;
            if (def.kind === 'event') {
              key = target(id, 'then');
              continue;
            }
            code.push({ op: 'call', node: id });
            key = target(id, 'then');
          }
        }
      }
      code.push({ op: 'end' });
    };
    labels.set(`${ev.id}:start`, 0);
    const first = target(ev.id, 'then');
    if (first) emit(first);
    else code.push({ op: 'end' });
    while (queued.length) {
      const k = queued.shift()!;
      if (!labels.has(k)) emit(k);
    }
    // `null` targets (nothing wired) land on a shared end
    let endAt = -1;
    const end = () => {
      if (endAt < 0) {
        endAt = code.length;
        code.push({ op: 'end' });
      }
      return endAt;
    };
    for (const f of fixes) {
      const to = f.key ? labels.get(f.key)! : f.at.op === 'once' || f.at.op === 'gate' ? -2 : end();
      (f.at as Record<string, unknown>)[f.field] = to;
    }
    // once/gate "skip" = the end of the chain they guard
    for (const i of code) if ((i.op === 'once' || i.op === 'gate') && i.skip === -2) i.skip = end();
    programs.push({ graph: g.id, event: ev.id, type: ev.type, args: ev.args ?? {}, code });
  }
  return { programs, problems };
}
