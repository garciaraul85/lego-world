import { CATALOG, nodeDef } from '../../../core/logic/catalog';
import type { ArgKind, NodeDef } from '../../../core/logic/catalog/types';
import { NAME_KINDS, type NameKind, namedThings } from '../../../core/logic/code/names';
import { eventName } from '../../../core/logic/code/print';
import type { ProjectStore } from '../../../core/project/store';
import { paths, type Variables } from '../../../core/schema';
import { eventNames } from '../../events';

/**
 * P9b.1: what the code editor offers as you type — the game's own names inside quotes (zones, sounds, spawn
 * points, assets, screens, scenes, variables, custom events), and the language's actions and events. Pure: the
 * code editor (CodeMirror) only draws the list.
 */
export type Suggestion = {
  /** what is inserted */
  label: string;
  /** shown greyed beside it */
  detail?: string;
  /** shown in the side panel */
  info?: string;
  type: 'name' | 'event' | 'function' | 'variable' | 'keyword';
  /** a ▶ in the side panel plays it */
  preview?: { kind: 'sound' | 'music'; id: string };
};
export type Completion = { from: number; options: Suggestion[] };

const CALLS = new Map(
  CATALOG.filter((d) => d.kind === 'action' && d.code.style === 'call').map((d) => [d.code.name, d] as const),
);
const STMTS: { label: string; info: string }[] = [
  { label: 'on', info: 'on("event", { settings }, (e) => { … }) — runs the block when the event happens.' },
  { label: 'if', info: 'if (condition) { … } else { … }' },
  { label: 'once', info: 'once(() => { … }) — the block runs only the first time.' },
  {
    label: 'gate',
    info: 'gate("name", startOpen, () => { … }) — runs only while the gate is open; gate.open/close("name").',
  },
  { label: 'forEachInZone', info: 'forEachInZone("Zone", (item) => { … }) — for everything inside a zone.' },
  { label: 'wait', info: 'await wait(seconds) — waits, then goes on (the block becomes async).' },
  { label: 'vars', info: 'vars.name — a variable every file shares (Variables panel).' },
];

/** the kind of name a setting or value takes: from the catalog's arg kinds and pin picks */
function kindAt(def: NodeDef, index: number): ArgKind | 'object' | null {
  const args = def.args ?? [];
  if (index < args.length) return args[index]!.kind;
  const ins = def.inputs.filter((p) => p.type !== 'exec');
  const pin = ins[index - args.length];
  if (!pin) return null;
  if (pin.pick?.kind === 'object') return 'object';
  if (pin.pick?.kind === 'asset') return 'asset';
  if (pin.pick?.kind === 'event') return 'event';
  return null;
}

/** how many arguments come before the cursor in an argument list (commas outside quotes and brackets) */
function argIndex(text: string): number {
  let depth = 0;
  let quote = '';
  let n = 0;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) n++;
  }
  return n;
}

export function namesOf(store: ProjectStore, kind: ArgKind | 'object'): Suggestion[] {
  if (kind === 'var') {
    const vars = store.get<Variables>(paths.variables)?.vars ?? {};
    return Object.entries(vars).map(([name, v]) => ({
      label: name,
      detail: v.type,
      info: `Variable shared by every file: starts at ${JSON.stringify(v.default)}.`,
      type: 'variable',
    }));
  }
  if (kind === 'event')
    return eventNames(store).map((e) => ({
      label: e,
      detail: 'custom event',
      info: 'A custom event: emit() sends it, on("custom", { event }) hears it — in any file.',
      type: 'event',
    }));
  if (kind === 'object') {
    const seen = new Set<string>(['hero']);
    const out: Suggestion[] = [{ label: 'hero', detail: 'the player', type: 'name', info: 'The hero.' }];
    const things = namedThings(store).asset;
    for (const p of store.list('maps/')) {
      if (!p.endsWith('/instances.json')) continue;
      const items = store.get<{ items: { kind: string; asset?: string }[] }>(p)?.items ?? [];
      for (const i of items) {
        const a = i.kind === 'asset' && things.find((t) => t.id === i.asset);
        if (a && !seen.has(a.name)) {
          seen.add(a.name);
          out.push({ label: a.name, detail: 'placed object', info: `The nearest placed ${a.name}.`, type: 'name' });
        }
      }
    }
    return out;
  }
  if (!(NAME_KINDS as readonly string[]).includes(kind)) return [];
  return namedThings(store)[kind as NameKind].map((t) => ({
    label: t.name,
    detail: t.kind,
    info: t.note,
    type: 'name',
    ...(t.kind === 'sound' || t.kind === 'music' ? { preview: { kind: t.kind, id: t.id } } : {}),
  }));
}

/**
 * What to offer at `pos` in `doc`: inside quotes, the names the argument takes; after `vars.`, the variables;
 * at the start of a word, the actions (audio.playSound, world.teleport…) and statements. null: nothing.
 */
export function complete(store: ProjectStore, doc: string, pos: number, explicit = false): Completion | null {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const before = doc.slice(lineStart, pos);
  // inside a string: which setting or argument is it?
  const str = /(["'])([^"']*)$/.exec(before);
  if (str && (before.slice(0, str.index).split(str[1]!).length - 1) % 2 === 0) {
    const from = pos - str[2]!.length;
    const head = before.slice(0, str.index);
    // on("…  → events
    if (/\bon\(\s*$/.test(head))
      return {
        from,
        options: CATALOG.filter((d) => d.kind === 'event').map((d) => ({
          label: eventName(d.type),
          detail: d.title,
          info: d.doc,
          type: 'event',
        })),
      };
    // { zone: "…  (an event's settings)
    const key = /(\w+)\s*:\s*$/.exec(head);
    if (key) {
      const ev = /\bon\(\s*["'](\w+)["']/.exec(head);
      const def = ev ? nodeDef(`event.on${ev[1]!.charAt(0).toUpperCase()}${ev[1]!.slice(1)}`) : null;
      const kind = def?.args?.find((a) => a.name === key[1])?.kind ?? (key[1] as ArgKind);
      const options = namesOf(store, kind);
      return options.length ? { from, options } : null;
    }
    // name("…", "…  (an action's arguments)
    const call = /([\w.]+)\(([^()]*)$/.exec(head);
    if (call) {
      const def = CALLS.get(call[1]!) ?? (call[1] === 'forEachInZone' ? nodeDef('flow.forEachInZone') : undefined);
      const kind = def ? kindAt(def, argIndex(call[2]!)) : call[1] === 'emit' ? 'event' : null;
      const options = kind ? namesOf(store, kind) : [];
      return options.length ? { from, options } : null;
    }
    return null;
  }
  // vars.…
  const v = /\bvars\.(\w*)$/.exec(before);
  if (v) return { from: pos - v[1]!.length, options: namesOf(store, 'var') };
  // a word: actions and statements
  const w = /([A-Za-z_][\w.]*)$/.exec(before);
  if (!w && !explicit) return null;
  const word = w?.[1] ?? '';
  if (!explicit && word.length < 2) return null;
  return {
    from: pos - word.length,
    options: [
      ...[...CALLS.values()].map((d) => ({
        label: d.code.name,
        detail: d.title,
        info: `${d.doc}${argsHint(d)}`,
        type: 'function' as const,
      })),
      ...STMTS.map((s) => ({ label: s.label, info: s.info, type: 'keyword' as const })),
    ],
  };
}

function argsHint(d: NodeDef): string {
  const names = [
    ...(d.args ?? []).map((a) => a.label),
    ...d.inputs.filter((p) => p.type !== 'exec').map((p) => p.label ?? p.name),
  ];
  return names.length ? `\n${d.code.name}(${names.join(', ')})` : '';
}
