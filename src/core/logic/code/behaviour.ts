/**
 * Milestone 3b (B1): a behaviour's code view is a class (Unity's MonoBehaviour, a Godot script):
 *
 *   class Collector extends Behaviour {
 *     needs = field.number(3, { label: "Gems needed", min: 1 });
 *     tries = 0;
 *     interact(e) {
 *       this.tries += 1;
 *       …
 *     }
 *   }
 *
 * Fields are `name = field.type(default, { label, help, min, max })`, own variables are `name = value`, and each
 * method is one event (its filter, when it has one, is the default of `e`: `interact(e = { asset: "Chest" })`).
 * The methods print and parse with the same dialect as logic files (print.ts, parse.ts); a method becomes one
 * `on("event", …)` block, keeping its lines, so errors point at the right line.
 */
import { parse as acornParse } from 'acorn';
import { type BehaviourDef, type BehaviourField, FieldType, type LogicGraph } from '../../schema';
import { DEFAULT_OF } from '../behaviours';
import { type Parsed, parseCode } from './parse';
import { type Printed, printGraph } from './print';

// biome-ignore lint/suspicious/noExplicitAny: acorn's ESTree nodes are walked structurally
type N = any;

const lit = (v: unknown) => JSON.stringify(v);

/** the class name a behaviour prints with (its name, in CamelCase) */
export function className(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const s = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return /^[A-Za-z_]/.test(s) ? s : `Behaviour${s}`;
}

function fieldLine(f: BehaviourField): string {
  const opts: string[] = [`label: ${lit(f.label)}`];
  if (f.help) opts.push(`help: ${lit(f.help)}`);
  if (f.min !== undefined) opts.push(`min: ${f.min}`);
  if (f.max !== undefined) opts.push(`max: ${f.max}`);
  return `  ${f.name} = field.${f.type}(${lit(f.default)}, { ${opts.join(', ')} });`;
}

/** graph -> class source; line numbers of nodes are those of the class */
export function printBehaviour(g: Pick<LogicGraph, 'name' | 'nodes' | 'edges' | 'behaviour'>): Printed {
  const b = g.behaviour ?? { fields: [] };
  const head: string[] = [`class ${className(g.name)} extends ${b.extends ?? 'Behaviour'} {`];
  for (const f of b.fields) head.push(fieldLine(f));
  for (const [k, v] of Object.entries(b.vars ?? {})) head.push(`  ${k} = ${lit(v)};`);
  const body = printGraph(g);
  const out: string[] = [...head];
  if (body.code.trim()) out.push('');
  for (const l of body.code.trim() ? body.code.replace(/\n$/, '').split('\n') : []) {
    const m = /^on\("(\w+)", (?:(\{.*\}), )?(async )?\(e\) => \{$/.exec(l);
    if (m) out.push(`  ${m[3] ?? ''}${m[1]}(e${m[2] ? ` = ${m[2]}` : ''}) {`);
    else if (l === '});') out.push('  }');
    else out.push(l ? `  ${l}` : '');
  }
  out.push('}');
  const shift = head.length + (body.code.trim() ? 1 : 0);
  const line = new Map([...body.line].map(([k, v]) => [k, v + shift]));
  return { ...body, code: `${out.join('\n')}\n`, line };
}

export type ParsedBehaviour =
  | { nodes: LogicGraph['nodes']; edges: LogicGraph['edges']; behaviour: BehaviourDef }
  | Extract<Parsed, { error: unknown }>;

/** class source -> graph parts and the behaviour's fields and own variables */
export function parseBehaviour(
  code: string,
  prev?: Pick<LogicGraph, 'nodes' | 'edges' | 'behaviour'>,
): ParsedBehaviour {
  let ast: N;
  try {
    ast = acornParse(code, { ecmaVersion: 2022, sourceType: 'script', locations: true });
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
  const fail = (message: string, at: N) => ({
    error: { message, line: at?.loc?.start.line ?? 1, column: at?.loc?.start.column ?? 0 },
  });
  const classes = ast.body.filter((s: N) => s.type === 'ClassDeclaration');
  if (classes.length !== 1 || ast.body.length !== 1)
    return fail('A behaviour is one class: class Name extends Behaviour { … }', ast.body[1] ?? ast.body[0] ?? ast);
  const cls = classes[0];
  const fields: BehaviourField[] = [];
  const vars: Record<string, number | boolean | string> = {};
  const lines = code.split('\n');
  // the methods' text as on("…") blocks, each kept on its own lines (so errors keep their line numbers)
  const on: string[] = lines.map((l) => (/^\s*\/\/ (note|group):/.test(l) ? l.trim() : ''));
  for (const m of cls.body.body) {
    const name = m.key?.name;
    if (m.computed || !name) return fail('Fields and methods need plain names.', m);
    if (m.type === 'PropertyDefinition') {
      const v = m.value;
      if (
        v?.type === 'CallExpression' &&
        v.callee.type === 'MemberExpression' &&
        v.callee.object.name === 'field' &&
        !v.callee.computed
      ) {
        const type = FieldType.safeParse(v.callee.property.name);
        if (!type.success)
          return fail(`There is no field type “${v.callee.property.name}”. Use ${FieldType.options.join(', ')}.`, v);
        const def = literalOf(v.arguments[0]);
        const opts = v.arguments[1] ? objectOf(v.arguments[1]) : {};
        if (opts === null) return fail('The settings of a field are { label: "…", min: 0, max: 10 }.', v.arguments[1]);
        const f: BehaviourField = {
          name,
          type: type.data,
          default: (def ?? DEFAULT_OF[type.data]) as BehaviourField['default'],
          label: String(opts.label ?? name),
          ...(opts.help !== undefined ? { help: String(opts.help) } : {}),
          ...(typeof opts.min === 'number' ? { min: opts.min } : {}),
          ...(typeof opts.max === 'number' ? { max: opts.max } : {}),
        };
        fields.push(f);
        continue;
      }
      const val = literalOf(v);
      if (val === undefined || val === null || typeof val === 'object')
        return fail(`${name} needs a starting value: a number, true or false, or text in quotes.`, m);
      vars[name] = val as number | boolean | string;
      continue;
    }
    if (m.type !== 'MethodDefinition' || m.kind !== 'method' || m.static)
      return fail('Only fields and event methods (start, update, interact…) go in a behaviour.', m);
    const fn = m.value;
    const p0 = fn.params[0];
    if (fn.params.length > 1 || (p0 && p0.type !== 'Identifier' && p0.type !== 'AssignmentPattern'))
      return fail('An event method takes one value: (e), or (e = { … }) with its settings.', m);
    if (p0?.type === 'Identifier' && p0.name !== 'e') return fail('Name the event value e: start(e) { … }', p0);
    if (p0?.type === 'AssignmentPattern' && p0.left.name !== 'e')
      return fail('Name the event value e: interact(e = { … }) { … }', p0);
    const args =
      p0?.type === 'AssignmentPattern' ? `${code.slice(p0.right.start, p0.right.end).replace(/\n\s*/g, ' ')}, ` : '';
    const start = m.loc.start.line - 1;
    const open = fn.body.loc.start.line - 1;
    const close = fn.body.loc.end.line - 1;
    // the header (all its lines) becomes one line; the body keeps its lines; the closing brace ends the block
    for (let i = start; i <= close; i++) on[i] = '';
    // super.<this method>(e) is the engine's own answer: e.base on the card (Milestone 3b, B3)
    const bodyLines = code
      .slice(fn.body.start + 1, fn.body.end - 1)
      .replace(new RegExp(`\\bsuper\\.${name}\\(\\s*e\\s*\\)`, 'g'), 'e.base')
      .split('\n');
    const headText = `on(${lit(name)}, ${args}${fn.async ? 'async ' : ''}(e) => {`;
    if (bodyLines.length === 1) on[open] = `${headText}${bodyLines[0]}});`;
    else {
      on[open] = `${headText}${bodyLines[0]}`;
      for (let k = 1; k < bodyLines.length - 1; k++) on[open + k] = bodyLines[k]!;
      on[close] = `${bodyLines.at(-1)}});`;
    }
  }
  const names = new Set(fields.map((f) => f.name));
  for (const k of Object.keys(vars)) if (names.has(k)) return fail(`${k} is both a field and a variable.`, cls);
  const r = parseCode(on.join('\n'), prev);
  if ('error' in r) return r;
  const behaviour: BehaviourDef = {
    ...(prev?.behaviour ?? {}),
    fields,
    ...(Object.keys(vars).length ? { vars } : {}),
    ...(cls.superClass?.name && cls.superClass.name !== 'Behaviour' ? { extends: cls.superClass.name } : {}),
  };
  if (!Object.keys(vars).length) delete behaviour.vars;
  if (!cls.superClass || cls.superClass.name === 'Behaviour') delete behaviour.extends;
  return { ...r, behaviour };
}

function literalOf(x: N): unknown {
  if (!x) return undefined;
  if (x.type === 'Literal') return x.value;
  if (x.type === 'UnaryExpression' && x.operator === '-' && x.argument.type === 'Literal')
    return -Number(x.argument.value);
  return undefined;
}

function objectOf(x: N): Record<string, unknown> | null {
  if (x?.type !== 'ObjectExpression') return null;
  const out: Record<string, unknown> = {};
  for (const p of x.properties) {
    if (p.type !== 'Property' || p.computed) return null;
    const k = p.key.type === 'Identifier' ? p.key.name : p.key.value;
    const v = literalOf(p.value);
    if (v === undefined) return null;
    out[k] = v;
  }
  return out;
}
