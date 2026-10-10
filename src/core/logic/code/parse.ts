import { type Node as AcornNode, parse as acornParse } from 'acorn';
import type { LogicGraph } from '../../schema';
import { CATALOG, nodeDef } from '../catalog';
import type { Edge, LogicNode } from '../graph';
import { BINARY, eventType, printGraph } from './print';

export type ParseError = { message: string; line: number; column: number };
export type Parsed = { nodes: LogicNode[]; edges: Edge[] } | { error: ParseError };

// biome-ignore lint/suspicious/noExplicitAny: acorn's ESTree nodes are walked structurally
type N = any;

class CodeError extends Error {
  constructor(
    message: string,
    readonly at: N,
  ) {
    super(message);
  }
}

const CALLS = new Map(
  CATALOG.filter((d) => d.kind === 'action' && d.code.style === 'call').map((d) => [d.code.name, d]),
);
const OPS = new Map(Object.entries(BINARY).map(([t, op]) => [op, t]));

/**
 * Script -> graph (P4.4). Accepts only the dialect print() writes: top-level `on(event, [args], (e) => {…})`
 * calls; inside, catalog calls, `vars.x = / += / -=`, `if/else`, `await wait(s)`, `once`, `gate`,
 * `forEachInZone`, and `const nX = <action call>`. Anything else is an error with its line and column.
 * Nodes that print the same way as in `prev` keep their ids and positions.
 */
export function parseCode(code: string, prev?: Pick<LogicGraph, 'nodes' | 'edges'>): Parsed {
  let ast: N;
  const comments: { text: string; line: number }[] = [];
  try {
    ast = acornParse(code, {
      ecmaVersion: 2022,
      sourceType: 'script',
      locations: true,
      allowAwaitOutsideFunction: true,
      onComment: (block, text, _s, _e, loc) => {
        if (!block) comments.push({ text: text.trim(), line: loc?.line ?? 0 });
      },
    }) as N;
  } catch (e) {
    const err = e as { message: string; loc?: { line: number; column: number } };
    return {
      error: {
        message: err.message.replace(/ \(\d+:\d+\)$/, ''),
        line: err.loc?.line ?? 1,
        column: err.loc?.column ?? 0,
      },
    };
  }
  const nodes: (LogicNode & { sig: string })[] = [];
  const edges: Edge[] = [];
  let serial = 0;
  const add = (type: string, sig: string, args?: Record<string, unknown>, id?: string) => {
    const n = {
      id: id ?? `t${++serial}`,
      type,
      pos: [0, 0] as [number, number],
      sig,
      ...(args && Object.keys(args).length ? { args } : {}),
    };
    nodes.push(n);
    return n;
  };
  try {
    // notes
    let ni = 0;
    for (const c of comments) {
      const g = /^group:\s*(.*?)\s*\((\d+)x(\d+)\)$/.exec(c.text);
      if (g) add('note.group', `note:${ni++}`, { title: g[1], w: Number(g[2]), h: Number(g[3]) });
      else if (c.text.startsWith('note:')) add('note.comment', `note:${ni++}`, { text: c.text.slice(5).trim() });
    }
    ast.body.forEach((st: N, ei: number) => {
      const call = st.type === 'ExpressionStatement' ? st.expression : null;
      if (!call || call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== 'on')
        throw new CodeError('Only on("event", (e) => { … }) blocks can be at the top level.', st);
      const [nameArg, ...rest] = call.arguments;
      if (nameArg?.type !== 'Literal' || typeof nameArg.value !== 'string')
        throw new CodeError('on() needs an event name in quotes.', call);
      const type = eventType(nameArg.value);
      const def = nodeDef(type);
      if (!def || def.kind !== 'event') throw new CodeError(`There is no event “${nameArg.value}”.`, nameArg);
      const fn = rest.at(-1);
      if (!fn || fn.type !== 'ArrowFunctionExpression' || fn.body.type !== 'BlockStatement')
        throw new CodeError('on() ends with a function: (e) => { … }', call);
      const args = rest.length === 2 ? literalObject(rest[0]) : {};
      for (const k of Object.keys(args))
        if (!def.args?.some((a) => a.name === k))
          throw new CodeError(`“${nameArg.value}” has no setting “${k}”.`, rest[0]);
      const base = `${ei}:${nameArg.value}`;
      const ev = add(type, base, args);
      const scope: Scope = { items: new Map(), consts: new Map(), ev };
      block(fn.body.body, [[ev.id, 'then']], base, scope);
    });
  } catch (e) {
    if (e instanceof CodeError)
      return { error: { message: e.message, line: e.at?.loc?.start.line ?? 1, column: e.at?.loc?.start.column ?? 0 } };
    throw e;
  }

  type Scope = { items: Map<string, string>; consts: Map<string, string>; ev: LogicNode };
  type Ends = [string, string][];
  /** wires exec from `from` into each statement in turn; returns the open exec outputs at the end */
  function block(stmts: N[], from: Ends, path: string, scope: Scope): Ends {
    let at = from;
    for (let k = 0; k < stmts.length; k++) {
      const st = stmts[k];
      if (!at.length) throw new CodeError('Nothing runs after gate.open() or gate.close().', st);
      if (k < stmts.length - 1 && blockCall(st)) {
        // once(…)/gate(…) followed by more lines: a Sequence runs the block, then the rest
        const seq = add('flow.sequence', `${path}/${k}`);
        wire(at, seq);
        statement(st, [[seq.id, 'a']], `${seq.sig}/a/0`, scope);
        return block(stmts.slice(k + 1), [[seq.id, 'b']], `${seq.sig}/b`, scope);
      }
      at = statement(st, at, `${path}/${k}`, scope);
    }
    return at;
  }
  function blockCall(st: N): boolean {
    const x = st.type === 'ExpressionStatement' ? st.expression : null;
    return x?.type === 'CallExpression' && x.callee.type === 'Identifier' && ['once', 'gate'].includes(x.callee.name);
  }
  function wire(from: Ends, to: LogicNode, pin = 'in') {
    for (const f of from) edges.push([f[0], f[1], to.id, pin]);
  }

  function statement(st: N, from: Ends, p: string, scope: Scope): Ends {
    if (st.type === 'IfStatement') {
      const n = add('flow.branch', p);
      wire(from, n);
      value(st.test, n, 'cond', `${p}/cond`, scope);
      const body = (s: N) => (s.type === 'BlockStatement' ? s.body : [s]);
      const t = block(body(st.consequent), [[n.id, 'true']], `${p}/t`, scope);
      const f: Ends = st.alternate ? block(body(st.alternate), [[n.id, 'false']], `${p}/f`, scope) : [[n.id, 'false']];
      return [...t, ...f];
    }
    if (st.type === 'VariableDeclaration') {
      const d = st.declarations[0];
      if (
        st.kind !== 'const' ||
        st.declarations.length !== 1 ||
        d.id.type !== 'Identifier' ||
        d.init?.type !== 'CallExpression'
      )
        throw new CodeError('Only const name = action(…) is allowed here.', st);
      const n = actionCall(d.init, from, p, scope, d.id.name);
      scope.consts.set(d.id.name, n.id);
      return [[n.id, 'then']];
    }
    if (st.type !== 'ExpressionStatement')
      throw new CodeError(`${st.type.replace(/Statement$/, '')} is not part of the logic language.`, st);
    const x = st.expression;
    if (x.type === 'AwaitExpression') {
      const c = x.argument;
      if (
        c.type !== 'CallExpression' ||
        c.callee.type !== 'Identifier' ||
        c.callee.name !== 'wait' ||
        c.arguments.length !== 1
      )
        throw new CodeError('Only await wait(seconds) is allowed.', x);
      const n = add('flow.wait', p);
      wire(from, n);
      value(c.arguments[0], n, 'seconds', `${p}/seconds`, scope);
      return [[n.id, 'then']];
    }
    if (x.type === 'AssignmentExpression') {
      if (x.left.type !== 'MemberExpression' || x.left.object.name !== 'vars' || x.left.computed)
        throw new CodeError('Only game variables can be set: vars.name = …', x);
      const name = x.left.property.name;
      if (x.operator === '=') {
        const n = add('var.set', p, { var: name });
        wire(from, n);
        value(x.right, n, 'value', `${p}/value`, scope);
        return [[n.id, 'then']];
      }
      if (x.operator === '+=' || x.operator === '-=') {
        const n = add('var.add', p, { var: name });
        wire(from, n);
        if (x.operator === '-=') {
          const v = literal(x.right);
          if (typeof v !== 'number') throw new CodeError('-= takes a number; use += with a value instead.', x.right);
          n.args = { ...n.args, amount: -v };
        } else value(x.right, n, 'amount', `${p}/amount`, scope);
        return [[n.id, 'then']];
      }
      throw new CodeError(`${x.operator} is not supported; use =, += or -=.`, x);
    }
    if (x.type !== 'CallExpression')
      throw new CodeError('Each line must be an action, an if, or a variable change.', x);
    const callee = calleeName(x.callee);
    const fnArg = (i: number) => {
      const f = x.arguments[i];
      if (f?.type !== 'ArrowFunctionExpression' || f.body.type !== 'BlockStatement')
        throw new CodeError(`${callee}() needs a function: () => { … }`, x);
      return f;
    };
    if (callee === 'once') {
      const n = add('flow.once', p);
      wire(from, n);
      block(fnArg(0).body.body, [[n.id, 'then']], `${p}/o`, scope);
      return [];
    }
    if (callee === 'gate') {
      const n = add('flow.gate', p, { name: literal(x.arguments[0]), startOpen: literal(x.arguments[1]) });
      wire(from, n);
      block(fnArg(2).body.body, [[n.id, 'then']], `${p}/g`, scope);
      return [];
    }
    if (callee === 'gate.open' || callee === 'gate.close') {
      const n = add('flow.gate', p, { name: literal(x.arguments[0]) });
      wire(from, n, callee.slice(5));
      return [];
    }
    if (callee === 'forEachInZone') {
      const n = add('flow.forEachInZone', p, { zone: literal(x.arguments[0]) });
      wire(from, n);
      const f = fnArg(1);
      const name = f.params[0]?.name ?? 'item';
      block(f.body.body, [[n.id, 'body']], `${p}/b`, { ...scope, items: new Map([...scope.items, [name, n.id]]) });
      return [[n.id, 'done']];
    }
    const n = actionCall(x, from, p, scope);
    return [[n.id, 'then']];
  }

  function actionCall(x: N, from: Ends, p: string, scope: Scope, constName?: string): LogicNode {
    const callee = calleeName(x.callee);
    const def = CALLS.get(callee);
    if (!def) throw new CodeError(`There is no action “${callee}”.`, x.callee);
    const argDefs = def.args ?? [];
    const ins = def.inputs.filter((i) => i.type !== 'exec');
    if (x.arguments.length > argDefs.length + ins.length)
      throw new CodeError(`${callee}() takes at most ${argDefs.length + ins.length} values.`, x);
    const args: Record<string, unknown> = {};
    argDefs.forEach((a, i) => {
      if (i >= x.arguments.length) return;
      const v = literal(x.arguments[i]);
      if (v !== null) args[a.name] = v;
    });
    const n = add(def.type, p, args);
    if (constName) (n as { constName?: string }).constName = constName;
    wire(from, n);
    ins.forEach((pin, i) => {
      const a = x.arguments[argDefs.length + i];
      if (a) value(a, n, pin.name, `${p}/${pin.name}`, scope);
    });
    return n;
  }

  /** an expression into an input pin: a literal goes into the node's args, anything else is a wire */
  function value(x: N, into: LogicNode, pin: string, p: string, scope: Scope) {
    const lit = tryLiteral(x);
    if (lit.ok) {
      into.args = { ...(into.args ?? {}), [pin]: lit.value };
      return;
    }
    const [src, out] = source(x, p, scope);
    edges.push([src, out, into.id, pin]);
  }

  function source(x: N, p: string, scope: Scope): [string, string] {
    if (x.type === 'MemberExpression' && !x.computed && x.object.type === 'Identifier') {
      if (x.object.name === 'e') {
        if (!nodeDef(scope.ev.type)!.outputs.some((o) => o.name === x.property.name))
          throw new CodeError(`This event has no value e.${x.property.name}.`, x);
        return [scope.ev.id, x.property.name];
      }
      if (x.object.name === 'vars') return [add('var.get', p, { var: x.property.name }).id, 'value'];
    }
    if (x.type === 'Identifier') {
      if (scope.items.has(x.name)) return [scope.items.get(x.name)!, 'item'];
      if (scope.consts.has(x.name)) {
        const id = scope.consts.get(x.name)!;
        const n = nodes.find((m) => m.id === id)!;
        const out = nodeDef(n.type)!.outputs.find((o) => o.type !== 'exec');
        if (!out) throw new CodeError(`${x.name} has no value.`, x);
        return [id, out.name];
      }
      throw new CodeError(`Unknown name “${x.name}”.`, x);
    }
    if ((x.type === 'BinaryExpression' || x.type === 'LogicalExpression') && OPS.has(x.operator)) {
      const n = add(OPS.get(x.operator)!, p);
      value(x.left, n, 'a', `${p}/a`, scope);
      value(x.right, n, 'b', `${p}/b`, scope);
      return [n.id, 'out'];
    }
    if (x.type === 'UnaryExpression' && x.operator === '!') {
      const n = add('compare.not', p);
      value(x.argument, n, 'a', `${p}/a`, scope);
      return [n.id, 'out'];
    }
    if (x.type === 'CallExpression' && calleeName(x.callee) === 'random' && x.arguments.length === 2) {
      const n = add('math.random', p);
      value(x.arguments[0], n, 'min', `${p}/min`, scope);
      value(x.arguments[1], n, 'max', `${p}/max`, scope);
      return [n.id, 'out'];
    }
    throw new CodeError('This value is not part of the logic language.', x);
  }

  // ---------- ids and positions ----------
  const old = prev ? printGraph(prev) : null;
  const bySig = new Map<string, LogicNode>();
  if (old && prev) for (const [id, s] of old.sig) bySig.set(s, prev.nodes.find((n) => n.id === id)!);
  const used = new Set<string>();
  const rename = new Map<string, string>();
  // keep ids and positions of nodes that print the same way as before
  for (const n of nodes) {
    const o = bySig.get(n.sig);
    if (o && o.type === n.type && !used.has(o.id)) {
      rename.set(n.id, o.id);
      used.add(o.id);
      n.pos = [...o.pos];
    }
  }
  // const names written as nN keep that id when it is free
  for (const n of nodes as (LogicNode & { constName?: string })[])
    if (!rename.has(n.id) && n.constName && /^n\d+$/.test(n.constName) && !used.has(n.constName)) {
      rename.set(n.id, n.constName);
      used.add(n.constName);
    }
  let next =
    Math.max(
      0,
      ...[...used].map((id) => Number(id.slice(1))),
      ...(prev?.nodes ?? []).map((n) => Number(n.id.slice(1))),
    ) + 1;
  for (const n of nodes) if (!rename.has(n.id)) rename.set(n.id, `n${next++}`);
  const placed = new Set(nodes.filter((n) => bySig.get(n.sig)?.type === n.type).map((n) => n.id));
  layout(nodes, edges, placed);
  return {
    nodes: nodes.map(({ sig: _s, ...n }) => {
      const { constName: _c, ...rest } = n as LogicNode & { constName?: string };
      return { ...rest, id: rename.get(n.id)! };
    }),
    edges: edges.map(([a, ap, b, bp]) => [rename.get(a)!, ap, rename.get(b)!, bp]),
  };
}

/** New nodes go right of the node that flows into them (data nodes to the left of their consumer). */
function layout(nodes: (LogicNode & { sig: string })[], edges: Edge[], placed: Set<string>) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let evY = Math.max(-260, ...nodes.filter((n) => placed.has(n.id)).map((n) => n.pos[1])) + 260;
  for (const n of nodes) {
    if (placed.has(n.id)) continue;
    const def = nodeDef(n.type);
    if (def?.kind === 'event' || def?.kind === 'note') {
      n.pos = [0, evY];
      evY += 260;
      placed.add(n.id);
      continue;
    }
    const execIn = edges.find(
      (e) => e[2] === n.id && nodeDef(byId.get(e[0])!.type)?.outputs.find((o) => o.name === e[1])?.type === 'exec',
    );
    const dataOut = edges.find((e) => e[0] === n.id);
    if (execIn && placed.has(execIn[0])) {
      const p = byId.get(execIn[0])!.pos;
      const siblings = edges.filter((e) => e[0] === execIn[0]).findIndex((e) => e[2] === n.id);
      n.pos = [p[0] + 240, p[1] + Math.max(0, siblings) * 130];
    } else if (dataOut && placed.has(dataOut[2])) {
      const p = byId.get(dataOut[2])!.pos;
      const k = edges.filter((e) => e[2] === dataOut[2] && e[0] !== n.id && placed.has(e[0])).length;
      n.pos = [p[0] - 200, p[1] + 90 + k * 80];
    } else n.pos = [0, evY];
    placed.add(n.id);
  }
}

function calleeName(c: N): string {
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier')
    return `${c.object.name}.${c.property.name}`;
  throw new CodeError('Calls must name an action, like world.give(…).', c);
}

function tryLiteral(x: N): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: literal(x) };
  } catch {
    return { ok: false };
  }
}

function literal(x: N): unknown {
  if (!x) return null;
  if (x.type === 'Literal' && !x.regex) return x.value;
  if (
    x.type === 'UnaryExpression' &&
    x.operator === '-' &&
    x.argument.type === 'Literal' &&
    typeof x.argument.value === 'number'
  )
    return -x.argument.value;
  if (x.type === 'ArrayExpression') return x.elements.map(literal);
  if (x.type === 'ObjectExpression') return literalObject(x);
  throw new CodeError('Expected a plain value here (a number, text in quotes, true or false).', x);
}

function literalObject(x: N): Record<string, unknown> {
  if (x.type !== 'ObjectExpression') throw new CodeError('Expected { name: value } settings.', x);
  const out: Record<string, unknown> = {};
  for (const p of x.properties) {
    if (p.type !== 'Property' || p.computed) throw new CodeError('Settings are written name: value.', p);
    out[p.key.type === 'Identifier' ? p.key.name : String(p.key.value)] = literal(p.value);
  }
  return out;
}

export type { AcornNode };
