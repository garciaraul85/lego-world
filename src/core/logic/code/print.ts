import type { LogicGraph } from '../../schema';
import { nodeDef } from '../catalog';
import type { LogicNode } from '../graph';

/**
 * Graph -> script (P4.4). The script is a view: a strict subset of JavaScript that parse() turns back
 * into the same graph. Every node printed gets a structural signature so parse() can keep node ids
 * and positions of unchanged nodes.
 */
export type Printed = {
  code: string;
  /** node id -> structural signature */
  sig: Map<string, string>;
  /** node id -> 1-based line where it is printed (first occurrence) */
  line: Map<string, number>;
  /** nodes that are not printed (not reachable from an event) */
  unprinted: string[];
};

export class PrintError extends Error {
  constructor(
    readonly node: string,
    message: string,
  ) {
    super(message);
  }
}

export const BINARY: Record<string, string> = {
  'math.add': '+',
  'math.sub': '-',
  'math.mul': '*',
  'compare.gte': '>=',
  'compare.lte': '<=',
  'compare.eq': '===',
  'compare.and': '&&',
  'compare.or': '||',
};

/** event.onRebuildFinished -> "rebuildFinished" */
export const eventName = (type: string) => type.charAt(8).toLowerCase() + type.slice(9);
export const eventType = (name: string) => `event.on${name.charAt(0).toUpperCase()}${name.slice(1)}`;

const lit = (v: unknown) => (v === undefined ? 'null' : JSON.stringify(v));
const ident = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s);

/** an arrow block that waits must be async to be valid JavaScript */
function asyncIf<T extends { text: string }>(head: T, body: T[]): T {
  if (body.some((l) => l.text.includes('await wait(')))
    head.text = head.text.replace(/\((\w*)\) => \{$/, 'async ($1) => {');
  return head;
}

export function printGraph(g: Pick<LogicGraph, 'nodes' | 'edges'>): Printed {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  type Line = { text: string; nodes: string[] };
  const out: Line[] = [];
  const sig = new Map<string, string>();
  const line = new Map<string, number>();
  /** nodes printed inside the statement being built */
  let current: string[] = [];
  const mark = (n: LogicNode, s: string) => {
    if (!sig.has(n.id)) sig.set(n.id, s);
    current.push(n.id);
  };
  const L = (text: string): Line => {
    const l = { text, nodes: current };
    current = [];
    return l;
  };
  const edgeTo = (node: string, pin: string) => g.edges.find((e) => e[2] === node && e[3] === pin);
  const edgeFrom = (node: string, pin: string) => g.edges.find((e) => e[0] === node && e[1] === pin);
  const order = (a: LogicNode, b: LogicNode) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.id.localeCompare(b.id);

  // notes first, as comments
  const notes = g.nodes.filter((n) => n.type.startsWith('note.')).sort(order);
  notes.forEach((n, i) => {
    mark(n, `note:${i}`);
    const a = n.args ?? {};
    if (n.type === 'note.group')
      out.push(
        L(`// group: ${String(a.title ?? 'Group').replace(/\n/g, ' ')} (${Number(a.w ?? 480)}x${Number(a.h ?? 260)})`),
      );
    else out.push(L(`// note: ${String(a.text ?? '').replace(/\n/g, ' ')}`));
  });
  if (notes.length) out.push(L(''));

  const events = g.nodes.filter((n) => nodeDef(n.type)?.kind === 'event').sort(order);
  events.forEach((ev, ei) => {
    const def = nodeDef(ev.type)!;
    const base = `${ei}:${eventName(ev.type)}`;
    mark(ev, base);
    const body: Line[] = [];
    let async = false;
    /** pure value of an output pin, as an expression */
    const expr = (node: string, pin: string, path: string, depth: number, scope: Scope): string => {
      if (depth > 40) throw new PrintError(node, 'These values feed into each other in a circle.');
      const n = byId.get(node)!;
      const d = nodeDef(n.type)!;
      if (d.kind === 'event') return `e.${pin}`;
      if (n.type === 'flow.forEachInZone') return scope.items.get(node) ?? 'item';
      if (d.kind !== 'pure') {
        if (!scope.consts.has(node)) throw new PrintError(node, 'A value is used before the action that makes it.');
        return node;
      }
      mark(n, path);
      if (n.type === 'var.get') return `vars.${String(n.args?.var)}`;
      const arg = (p: string) => input(n, p, `${path}/${p}`, depth + 1, scope);
      if (BINARY[n.type]) return `(${arg('a')} ${BINARY[n.type]} ${arg('b')})`;
      if (n.type === 'compare.not') return `!${arg('a')}`;
      if (n.type === 'math.random') return `random(${arg('min')}, ${arg('max')})`;
      throw new PrintError(node, `${d.title} can’t be printed as code.`);
    };
    const input = (n: LogicNode, pin: string, path: string, depth: number, scope: Scope): string => {
      const e = edgeTo(n.id, pin);
      if (e) return expr(e[0], e[1], path, depth, scope);
      const d = nodeDef(n.type)!;
      return lit(n.args?.[pin] ?? d.inputs.find((p) => p.name === pin)?.default);
    };
    type Scope = { items: Map<string, string>; consts: Set<string>; path: Set<string> };
    /** statements of the chain entering (node, pin) */
    /** keys a straight run passes through (branches that join again count as straight) */
    const linear = (start: [string, string] | null): string[] => {
      const keys: string[] = [];
      let at = start;
      for (let guard = 0; at && guard < 500; guard++) {
        const k = `${at[0]}:${at[1]}`;
        if (keys.includes(k)) break;
        keys.push(k);
        const n = byId.get(at[0])!;
        const nx = (out: string): [string, string] | null => {
          const e = edgeFrom(n.id, out);
          return e ? [e[2], e[3]] : null;
        };
        if (n.type === 'flow.branch') at = joinOf(n.id);
        else if (n.type === 'flow.sequence') at = nx('c');
        else if (n.type === 'flow.forEachInZone') at = nx('done');
        else if (n.type === 'flow.once' || n.type === 'flow.gate') at = null;
        else at = nx('then');
      }
      return keys;
    };
    /** where the two sides of a branch flow together again (the statement after the if) */
    const joinOf = (branch: string): [string, string] | null => {
      const t = edgeFrom(branch, 'true');
      const f = edgeFrom(branch, 'false');
      if (!t || !f) return null;
      const tp = linear([t[2], t[3]]);
      const fp = linear([f[2], f[3]]);
      const j = tp.find((k) => fp.includes(k));
      if (!j) return null;
      const [a, b] = j.split(':') as [string, string];
      return [a, b];
    };
    const chain = (
      start: [string, string] | null,
      path: string,
      ind: string,
      scope: Scope,
      lines: Line[],
      stopAt: [string, string] | null = null,
    ) => {
      let at = start;
      let k = 0;
      while (at) {
        if (stopAt && at[0] === stopAt[0] && at[1] === stopAt[1]) return;
        const [id, pin] = at;
        if (scope.path.has(id))
          throw new PrintError(id, 'This graph has a loop wired by hand; edit it in the graph view.');
        const n = byId.get(id)!;
        const d = nodeDef(n.type)!;
        const p = `${path}/${k++}`;
        const here = { ...scope, path: new Set([...scope.path, id]) };
        const a = n.args ?? {};
        const next = (out: string) => {
          const e = edgeFrom(id, out);
          return e ? ([e[2], e[3]] as [string, string]) : null;
        };
        mark(n, p);
        switch (n.type) {
          case 'flow.branch': {
            const join = joinOf(id);
            lines.push(L(`${ind}if (${input(n, 'cond', `${p}/cond`, 0, here)}) {`));
            chain(next('true'), `${p}/t`, `${ind}  `, here, lines, join);
            const f: Line[] = [];
            chain(next('false'), `${p}/f`, `${ind}  `, here, f, join);
            if (f.length) lines.push(L(`${ind}} else {`), ...f);
            lines.push(L(`${ind}}`));
            at = join;
            scope = here;
            continue;
          }
          case 'flow.sequence': {
            chain(next('a'), `${p}/a`, ind, here, lines);
            chain(next('b'), `${p}/b`, ind, here, lines);
            at = next('c');
            scope = here;
            continue;
          }
          case 'flow.wait':
            async = true;
            lines.push(L(`${ind}await wait(${input(n, 'seconds', `${p}/seconds`, 0, here)});`));
            at = next('then');
            scope = here;
            continue;
          case 'flow.once': {
            const head = L(`${ind}once(() => {`);
            const inner: Line[] = [];
            chain(next('then'), `${p}/o`, `${ind}  `, here, inner);
            lines.push(asyncIf(head, inner), ...inner, L(`${ind}});`));
            at = null;
            continue;
          }
          case 'flow.gate': {
            if (pin === 'open' || pin === 'close') {
              lines.push(L(`${ind}gate.${pin}(${lit(a.name ?? 'gate')});`));
              at = null;
              continue;
            }
            const head = L(`${ind}gate(${lit(a.name ?? 'gate')}, ${lit(a.startOpen ?? true)}, () => {`);
            const inner: Line[] = [];
            chain(next('then'), `${p}/g`, `${ind}  `, here, inner);
            lines.push(asyncIf(head, inner), ...inner, L(`${ind}});`));
            at = null;
            continue;
          }
          case 'flow.forEachInZone': {
            const name = scope.items.size ? `item${scope.items.size + 1}` : 'item';
            const inner = { ...here, items: new Map([...here.items, [id, name]]) };
            const head = L(`${ind}forEachInZone(${lit(a.zone)}, (${name}) => {`);
            const body2: Line[] = [];
            chain(next('body'), `${p}/b`, `${ind}  `, inner, body2);
            lines.push(asyncIf(head, body2), ...body2, L(`${ind}});`));
            at = next('done');
            scope = here;
            continue;
          }
          case 'var.set':
            lines.push(L(`${ind}vars.${String(a.var)} = ${input(n, 'value', `${p}/value`, 0, here)};`));
            break;
          case 'var.add':
            lines.push(L(`${ind}vars.${String(a.var)} += ${input(n, 'amount', `${p}/amount`, 0, here)};`));
            break;
          default: {
            const parts = [
              ...(d.args ?? []).map((x) => lit(a[x.name])),
              ...d.inputs.filter((x) => x.type !== 'exec').map((x) => input(n, x.name, `${p}/${x.name}`, 0, here)),
            ];
            while (parts.length && parts.at(-1) === 'null' && (d.args?.length ?? 0) >= parts.length) parts.pop();
            const call = `${d.code.name}(${parts.join(', ')})`;
            const used = d.outputs.some(
              (o) => o.type !== 'exec' && g.edges.some((e) => e[0] === id && e[1] === o.name),
            );
            if (used && ident(id)) {
              lines.push(L(`${ind}const ${id} = ${call};`));
              here.consts.add(id);
            } else lines.push(L(`${ind}${call};`));
          }
        }
        scope = here;
        at = next('then');
      }
    };
    chain(
      (() => {
        const e = edgeFrom(ev.id, 'then');
        return e ? ([e[2], e[3]] as [string, string]) : null;
      })(),
      base,
      '  ',
      { items: new Map(), consts: new Set(), path: new Set() },
      body,
    );
    const args = (def.args ?? []).filter((x) => ev.args?.[x.name] !== undefined && ev.args?.[x.name] !== '');
    const argObj = args.length ? `{ ${args.map((x) => `${x.name}: ${lit(ev.args![x.name])}`).join(', ')} }, ` : '';
    current = [ev.id];
    out.push(L(`on(${lit(eventName(ev.type))}, ${argObj}${async ? 'async ' : ''}(e) => {`));
    out.push(...body, L('});'), L(''));
  });
  while (out.at(-1)?.text === '') out.pop();
  out.forEach((l, i) => {
    for (const id of l.nodes) if (!line.has(id)) line.set(id, i + 1);
  });
  const unprinted = g.nodes.filter((n) => !sig.has(n.id)).map((n) => n.id);
  return { code: `${out.map((l) => l.text).join('\n')}\n`, sig, line, unprinted };
}
