import type { Action } from '../schema/action';
import { checkCondition } from './condition';
import { type ChoiceOption, type Conversation, MOODS, type Mood, type Section, type Step } from './schema';

/**
 * P22 script view: a conversation as plain text for writers, kept in step with the list and the graph.
 *
 *   == start
 *   [if quest.sword is done] Smith (happy): Back again, hero?
 *   Smith: A fine sword, only 50 gems.
 *   * Buy it [if gems >= 50] -> buy
 *   * Not now -> end
 *
 *   == buy
 *   > add gems -50
 *   > give sword
 *   > like +10
 *   Smith: Use it well!
 *
 * `== name` starts a section. `Who (mood): text` is a line (`Narrator:` or no name: the narrator). `*` lines
 * are the options of one choice (`[grey]`: shown greyed out when its condition fails). `>` lines are
 * actions. `-> name` jumps (`-> end` ends). `[if …]` in front makes any step conditional.
 */
export type ScriptNames = {
  /** a speaker's display name from its id (character ids → names) */
  nameOf(who: string): string;
  /** a typed name → what is stored (a character's id when one has that name) */
  whoOf(name: string): string;
};
export const PLAIN_NAMES: ScriptNames = { nameOf: (w) => w, whoOf: (n) => n };

const ifPart = (c?: string) => (c?.trim() ? `[if ${c.trim()}] ` : '');

function actionText(a: Action): string {
  switch (a.do) {
    case 'setVar':
      return `set ${a.var} = ${typeof a.value === 'string' && /\s/.test(a.value) ? JSON.stringify(a.value) : String(a.value)}`;
    case 'addVar':
      return `add ${a.var} ${a.value >= 0 ? '+' : ''}${a.value}`;
    case 'give':
      return `give ${a.item}${a.count && a.count !== 1 ? ` ${a.count}` : ''}`;
    case 'cinematic':
      return `cinematic ${a.cinematic}`;
    case 'achieve':
      return `achieve ${a.id}`;
    case 'message':
      return `message ${a.text}`;
    case 'emit':
      return `emit ${a.event}`;
    case 'sound':
      return `sound ${a.event}`;
    case 'checkpoint':
      return 'checkpoint';
    case 'save':
      return a.slot ? `save ${a.slot}` : 'save';
    default:
      return `json ${JSON.stringify(a)}`;
  }
}

export function printScript(c: Conversation, names: ScriptNames = PLAIN_NAMES): string {
  const out: string[] = [];
  c.sections.forEach((s, i) => {
    if (i) out.push('');
    out.push(`== ${s.label}`);
    for (const st of s.steps) out.push(...stepLines(st, names));
  });
  return `${out.join('\n')}\n`;
}

function stepLines(st: Step, names: ScriptNames): string[] {
  switch (st.k) {
    case 'line': {
      const who = st.who ? names.nameOf(st.who) : 'Narrator';
      return [`${ifPart(st.if)}${who}${st.mood && st.mood !== 'neutral' ? ` (${st.mood})` : ''}: ${st.text}`];
    }
    case 'choice': {
      const head = st.if?.trim() ? [`[if ${st.if.trim()}] choice:`] : [];
      return [
        ...head,
        ...st.options.map(
          (o) =>
            `* ${o.text}${o.if?.trim() ? ` [if ${o.if.trim()}]` : ''}${o.failed === 'grey' ? ' [grey]' : ''}${o.to ? ` -> ${o.to}` : ''}`,
        ),
      ];
    }
    case 'do':
      return st.actions.map((a) => `${ifPart(st.if)}> ${actionText(a)}`);
    case 'like':
      return [`${ifPart(st.if)}> like ${st.by >= 0 ? '+' : ''}${st.by}`];
    case 'goto':
      return [`${ifPart(st.if)}-> ${st.to}`];
  }
}

export type ScriptError = { line: number; message: string };

function parseAction(src: string): Action | string {
  const [verb = '', ...rest] = src.trim().split(/\s+/);
  const arg = rest.join(' ');
  const lit = (v: string): unknown => {
    const t = v.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
    if (t.startsWith('"')) {
      try {
        return JSON.parse(t);
      } catch {
        return t.slice(1, -1);
      }
    }
    return t;
  };
  switch (verb.toLowerCase()) {
    case 'set': {
      const m = /^([a-zA-Z_][\w.]*)\s*=\s*(.+)$/.exec(arg);
      return m ? { do: 'setVar', var: m[1]!, value: lit(m[2]!) } : 'Write: > set name = value';
    }
    case 'add': {
      const m = /^([a-zA-Z_][\w.]*)\s+([+-]?\d+(\.\d+)?)$/.exec(arg);
      return m ? { do: 'addVar', var: m[1]!, value: Number(m[2]) } : 'Write: > add name 5 (or -5)';
    }
    case 'give': {
      const m = /^(.+?)(?:\s+(\d+))?$/.exec(arg);
      if (!m || !arg) return 'Write: > give item (or > give item 3)';
      return m[2] ? { do: 'give', item: m[1]!, count: Number(m[2]) } : { do: 'give', item: m[1]! };
    }
    case 'cinematic':
      return /^cin_[0-9a-z]{10}$/.test(arg)
        ? { do: 'cinematic', cinematic: arg }
        : 'Write: > cinematic cin_… (a cinematic id)';
    case 'achieve':
      return arg ? { do: 'achieve', id: arg } : 'Write: > achieve achievement-id';
    case 'message':
      return arg ? { do: 'message', text: arg.slice(0, 200) } : 'Write: > message the text';
    case 'emit':
      return arg ? { do: 'emit', event: arg } : 'Write: > emit event-name';
    case 'sound':
      return /^snd_[0-9a-z]{10}$/.test(arg) ? { do: 'sound', event: arg } : 'Write: > sound snd_… (a sound id)';
    case 'checkpoint':
      return { do: 'checkpoint' };
    case 'save':
      return arg ? { do: 'save', slot: Number(arg) } : { do: 'save' };
    case 'json':
      try {
        return JSON.parse(arg) as Action;
      } catch {
        return 'That action is not valid JSON.';
      }
    default:
      return `Unknown action “${verb}”. Use set, add, give, like, cinematic, achieve, message, emit, sound, checkpoint or save.`;
  }
}

const IF_RE = /^\[if\s+([^\]]*)\]\s*/i;

/** Text → conversation. Lines with mistakes are reported (and skipped); the rest still reads. */
export function parseScript(
  text: string,
  base: Pick<Conversation, 'id' | 'name' | 'style'>,
  names: ScriptNames = PLAIN_NAMES,
): { conversation: Conversation; errors: ScriptError[] } {
  const errors: ScriptError[] = [];
  const sections: Section[] = [];
  let cur: Section | null = null;
  let choice: Extract<Step, { k: 'choice' }> | null = null;
  let pendingChoiceIf: string | undefined;
  const lines = text.split(/\r?\n/);
  const section = () => {
    if (!cur) {
      cur = { label: 'start', steps: [] };
      sections.push(cur);
    }
    return cur;
  };
  lines.forEach((raw, i) => {
    const n = i + 1;
    let line = raw.trim();
    if (!line || line.startsWith('//')) {
      if (!line) choice = null;
      return;
    }
    const sec = /^==\s*(.*)$/.exec(line);
    if (sec) {
      choice = null;
      const label = sec[1]!.trim().toLowerCase();
      if (!/^[a-z][a-z0-9_-]{0,39}$/.test(label)) {
        errors.push({ line: n, message: 'A section name is lower case letters, digits, - or _ (like: buy-sword).' });
        return;
      }
      if (sections.some((s) => s.label === label)) {
        errors.push({ line: n, message: `There are two sections called “${label}”.` });
        return;
      }
      cur = { label, steps: [] };
      sections.push(cur);
      return;
    }
    // an option of a choice
    if (line.startsWith('*')) {
      let body = line.slice(1).trim();
      const opt: ChoiceOption = { text: '' };
      const to = /\s*->\s*([a-z][a-z0-9_-]{0,39}|end)\s*$/i.exec(body);
      if (to) {
        opt.to = to[1]!.toLowerCase();
        body = body.slice(0, to.index);
      }
      if (/\s*\[grey\]\s*$/i.test(body)) {
        opt.failed = 'grey';
        body = body.replace(/\s*\[grey\]\s*$/i, '');
      }
      const cond = /\s*\[if\s+([^\]]*)\]\s*$/i.exec(body);
      if (cond) {
        opt.if = cond[1]!.trim();
        body = body.slice(0, cond.index);
        const bad = checkCondition(opt.if);
        if (bad) errors.push({ line: n, message: `Condition: ${bad}` });
      }
      opt.text = body.trim().slice(0, 120);
      if (!opt.text) {
        errors.push({ line: n, message: 'An option needs some text.' });
        return;
      }
      if (!choice || choice.options.length >= 6) {
        choice = { k: 'choice', options: [] };
        if (pendingChoiceIf) choice.if = pendingChoiceIf;
        pendingChoiceIf = undefined;
        section().steps.push(choice);
      }
      choice.options.push(opt);
      return;
    }
    choice = null;
    let cond: string | undefined;
    const m = IF_RE.exec(line);
    if (m) {
      cond = m[1]!.trim();
      line = line.slice(m[0].length);
      const bad = checkCondition(cond);
      if (bad) errors.push({ line: n, message: `Condition: ${bad}` });
    }
    const withIf = <T extends Step>(s: T): T => (cond ? { ...s, if: cond } : s);
    if (/^choice:?$/i.test(line)) {
      pendingChoiceIf = cond;
      return;
    }
    if (line.startsWith('->')) {
      const to = line.slice(2).trim().toLowerCase();
      if (!/^([a-z][a-z0-9_-]{0,39}|end)$/.test(to)) {
        errors.push({ line: n, message: 'Write: -> section-name (or -> end)' });
        return;
      }
      section().steps.push(withIf({ k: 'goto', to }));
      return;
    }
    if (line.startsWith('>')) {
      const body = line.slice(1).trim();
      const like = /^like\s+([+-]?\d+)$/i.exec(body);
      if (like) {
        section().steps.push(withIf({ k: 'like', by: Math.max(-100, Math.min(100, Number(like[1]))) }));
        return;
      }
      const a = parseAction(body);
      if (typeof a === 'string') {
        errors.push({ line: n, message: a });
        return;
      }
      const steps = section().steps;
      const last = steps[steps.length - 1];
      // actions in a row (with the same condition) are one step
      if (last?.k === 'do' && (last.if ?? '') === (cond ?? '') && last.actions.length < 8) last.actions.push(a);
      else steps.push(withIf({ k: 'do', actions: [a] }));
      return;
    }
    // a line: “Who (mood): text”, or narration
    const say = /^([^:]{1,60}?)(?:\s*\(([a-z]+)\))?\s*:\s+(.*)$/i.exec(line);
    let who = '';
    let mood: Mood | undefined;
    let textPart = line;
    if (say) {
      const name = say[1]!.trim();
      who = name.toLowerCase() === 'narrator' ? '' : names.whoOf(name);
      const md = say[2]?.toLowerCase();
      if (md) {
        if ((MOODS as readonly string[]).includes(md)) mood = md as Mood;
        else errors.push({ line: n, message: `“${md}” is not a mood. Use ${MOODS.join(', ')}.` });
      }
      textPart = say[3]!;
    }
    const t = textPart.trim().slice(0, 400);
    if (!t) {
      errors.push({ line: n, message: 'A line needs some text.' });
      return;
    }
    section().steps.push(withIf({ k: 'line', who, text: t, ...(mood && mood !== 'neutral' ? { mood } : {}) }));
  });
  if (!sections.length) sections.push({ label: 'start', steps: [] });
  return {
    conversation: { id: base.id, name: base.name, ...(base.style ? { style: base.style } : {}), sections },
    errors,
  };
}
