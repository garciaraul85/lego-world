/**
 * P22 conditions on conversations, lines and choices, in words a maker can type:
 *
 *   gems >= 50
 *   quest.sword is done            (a variable equals a word)
 *   talks > 0 and not has key      (talks: times the hero has talked to this speaker)
 *   likes >= 20 or time is night   (likes: −100…100; time: day or night)
 *   chance 25%                     (true one time in four)
 *   door.state is open             (an object's state, by its name on the map)
 *
 * Words: `and`, `or`, `not`, brackets. Comparisons: is, is not, =, ==, !=, <, <=, >, >=. The left side is a
 * value the game knows; the right side is a number, a word, true/false or "quoted text". Unknown values
 * are empty (0 in a number comparison), so a typo makes a condition false, never an error in Play;
 * checkCondition reports it in the editor.
 */
export type CondHost = {
  /** a variable, or a built-in (talks, likes, time, <object>.state) */
  value(name: string): unknown;
  /** how many of an item the hero carries */
  count(item: string): number;
  /** 0 ≤ r < 1 */
  random(): number;
};

type Tok = { t: 'word' | 'num' | 'str' | 'op' | '(' | ')' | '%'; v: string; at: number };

const OPS = ['>=', '<=', '!=', '==', '=', '<', '>'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '%') {
      out.push({ t: c, v: c, at: i++ });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      out.push({ t: 'op', v: op === '=' ? '==' : op, at: i });
      i += op.length;
      continue;
    }
    if (c === '"' || c === '“') {
      const close = c === '"' ? '"' : '”';
      const j = src.indexOf(close, i + 1);
      if (j < 0) throw new CondError('A quote is not closed.', i);
      out.push({ t: 'str', v: src.slice(i + 1, j), at: i });
      i = j + 1;
      continue;
    }
    const m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (m && (c !== '-' || /\d/.test(src[i + 1] ?? ''))) {
      out.push({ t: 'num', v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const w = /^[\p{L}_][\p{L}\p{N}_.-]*/u.exec(src.slice(i));
    if (!w) throw new CondError(`I don't understand “${c}”.`, i);
    out.push({ t: 'word', v: w[0], at: i });
    i += w[0].length;
  }
  return out;
}

export class CondError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

export type CondNode =
  | { k: 'and' | 'or'; a: CondNode; b: CondNode }
  | { k: 'not'; a: CondNode }
  | { k: 'cmp'; left: string; op: string; right: string | number | boolean }
  | { k: 'truthy'; name: string }
  | { k: 'has'; item: string; n: number }
  | { k: 'chance'; p: number };

const KEYWORDS = new Set(['and', 'or', 'not', 'is', 'has', 'chance']);

export function parseCondition(src: string): CondNode | null {
  const toks = lex(src);
  if (!toks.length) return null;
  let i = 0;
  const peek = () => toks[i];
  const word = (v: string) => peek()?.t === 'word' && peek()!.v.toLowerCase() === v;
  const fail = (msg: string): never => {
    throw new CondError(msg, peek()?.at ?? src.length);
  };
  const or = (): CondNode => {
    let a = and();
    while (word('or')) {
      i++;
      a = { k: 'or', a, b: and() };
    }
    return a;
  };
  const and = (): CondNode => {
    let a = unary();
    while (word('and')) {
      i++;
      a = { k: 'and', a, b: unary() };
    }
    return a;
  };
  const value = (): string | number | boolean => {
    const t = peek();
    if (!t) return fail('Something is missing after the comparison.');
    i++;
    if (t.t === 'num') return Number(t.v);
    if (t.t === 'str') return t.v;
    if (t.t === 'word') {
      const low = t.v.toLowerCase();
      if (low === 'true' || low === 'yes') return true;
      if (low === 'false' || low === 'no') return false;
      return t.v;
    }
    return fail(`Expected a value, found “${t.v}”.`);
  };
  const unary = (): CondNode => {
    if (word('not')) {
      i++;
      return { k: 'not', a: unary() };
    }
    if (peek()?.t === '(') {
      i++;
      const e = or();
      if (peek()?.t !== ')') fail('A bracket is not closed.');
      i++;
      return e;
    }
    if (word('has')) {
      i++;
      let n = 1;
      if (peek()?.t === 'num') n = Number(toks[i++]!.v);
      const t = peek();
      if (t?.t !== 'word' && t?.t !== 'str') return fail('“has” needs an item name, like: has key');
      i++;
      return { k: 'has', item: t.v, n };
    }
    if (word('chance')) {
      i++;
      const t = peek();
      if (t?.t !== 'num') return fail('“chance” needs a number, like: chance 25%');
      i++;
      if (peek()?.t === '%') i++;
      return { k: 'chance', p: Math.max(0, Math.min(100, Number(t.v))) / 100 };
    }
    const t = peek();
    if (t?.t !== 'word' || KEYWORDS.has(t.v.toLowerCase()))
      return fail(t ? `Expected a name, found “${t.v}”.` : 'The condition ends too soon.');
    i++;
    const left = t.v;
    if (word('is')) {
      i++;
      let op = '==';
      if (word('not')) {
        i++;
        op = '!=';
      }
      return { k: 'cmp', left, op, right: value() };
    }
    if (peek()?.t === 'op') {
      const op = toks[i++]!.v;
      return { k: 'cmp', left, op, right: value() };
    }
    return { k: 'truthy', name: left };
  };
  const e = or();
  if (i < toks.length) fail(`I don't understand “${toks[i]!.v}” here.`);
  return e;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const truthy = (v: unknown) => !(v === undefined || v === null || v === false || v === 0 || v === '' || v === 'false');

export function evalNode(n: CondNode, h: CondHost): boolean {
  switch (n.k) {
    case 'and':
      return evalNode(n.a, h) && evalNode(n.b, h);
    case 'or':
      return evalNode(n.a, h) || evalNode(n.b, h);
    case 'not':
      return !evalNode(n.a, h);
    case 'truthy':
      return truthy(h.value(n.name));
    case 'has':
      return h.count(n.item) >= n.n;
    case 'chance':
      return h.random() < n.p;
    case 'cmp': {
      const l = h.value(n.left);
      const r = n.right;
      if (n.op === '==' || n.op === '!=') {
        const eq =
          typeof r === 'number'
            ? num(l) === r
            : typeof r === 'boolean'
              ? truthy(l) === r
              : String(l ?? '').toLowerCase() === r.toLowerCase();
        return n.op === '==' ? eq : !eq;
      }
      const a = num(l);
      const b = num(r);
      return n.op === '<' ? a < b : n.op === '<=' ? a <= b : n.op === '>' ? a > b : a >= b;
    }
  }
}

const cache = new Map<string, CondNode | null | CondError>();
/** Is a condition true now? Empty: yes. A condition with a mistake: no (the editor shows the mistake). */
export function evalCondition(src: string | undefined, h: CondHost): boolean {
  if (!src?.trim()) return true;
  let n = cache.get(src);
  if (n === undefined) {
    try {
      n = parseCondition(src);
    } catch (e) {
      n = e instanceof CondError ? e : new CondError(String(e), 0);
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, n);
  }
  if (n instanceof CondError) return false;
  return n ? evalNode(n, h) : true;
}

/** The mistake in a condition, for the editor (null: it reads fine). */
export function checkCondition(src: string | undefined): string | null {
  if (!src?.trim()) return null;
  try {
    parseCondition(src);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The names a condition reads (variables and built-ins), for “where used” and the preview's variable list. */
export function conditionNames(src: string | undefined): string[] {
  if (!src?.trim()) return [];
  try {
    const out = new Set<string>();
    const walk = (n: CondNode | null) => {
      if (!n) return;
      if (n.k === 'and' || n.k === 'or') {
        walk(n.a);
        walk(n.b);
      } else if (n.k === 'not') walk(n.a);
      else if (n.k === 'cmp') out.add(n.left);
      else if (n.k === 'truthy') out.add(n.name);
      else if (n.k === 'has') out.add(`has ${n.item}`);
    };
    walk(parseCondition(src));
    return [...out];
  } catch {
    return [];
  }
}
