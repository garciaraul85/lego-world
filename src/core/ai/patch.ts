import { MapBricks } from '../bricks/map-bricks';
import { rewardScene } from '../cinematic/templates';
import type { CommandBus } from '../commands/bus';
import type { Command } from '../commands/types';
import { parseCode } from '../logic/code/parse';
import type { ProjectSnapshot, ProjectStore } from '../project/store';
import { type Gates, type LogicGraph, paths } from '../schema';
import { AI_HELPERS, aiCommand, type Scope } from './commands';
import { knownMedia } from './context';

/** P8.4 limits. */
export const AI_LIMITS = {
  maxCommands: 2_000,
  maxDiffBytes: 5 * 1024 * 1024,
  maxSteps: 12,
  /** removing more than this share of a map's loose bricks needs an explicit confirm */
  destructiveShare: 0.5,
} as const;

export type PlanCommand = { type: string; payload: unknown };
export type PlanStep = { title: string; explain: string; workspace?: string; commands: PlanCommand[] };
export type Plan = { summary: string; steps: PlanStep[] };

/** A step after helpers are expanded: only engine commands, ready for the bus. */
export type PatchStep = { title: string; explain: string; workspace: string; commands: Command[]; helperNote?: string };
export type FileDiff = {
  path: string;
  kind: 'added' | 'changed' | 'removed';
  before?: unknown;
  after?: unknown;
  bytes: number;
};
export type Patch = {
  summary: string;
  steps: PatchStep[];
  diff: FileDiff[];
  warnings: string[];
  /** set when the patch removes a lot: the user must confirm before accepting */
  confirm: string | null;
  commandCount: number;
};

export type PlanProblem = { step: number; command: number | null; path: string; message: string };
export type CheckResult = { ok: true; patch: Patch } | { ok: false; problems: PlanProblem[] };

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const URLISH = /^(https?:|data:|blob:|file:|ftp:)/i;

/** Every string in a payload (for the media and URL checks). */
function* strings(v: unknown, path: string[] = []): Generator<[string, string[]]> {
  if (typeof v === 'string') yield [v, path];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], [...path, String(i)]);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, [...path, k]);
}

const WORKSPACE_OF: Record<string, string> = {};
const workspaceOf = (type: string) => (WORKSPACE_OF[type] ??= aiCommand(type)?.workspace ?? 'Scene');

/** Expands one helper into engine commands (or returns an error message). */
function expandHelper(store: ProjectStore, c: PlanCommand, earlier: Set<string>): Command[] | string {
  const p = c.payload as Record<string, unknown>;
  if (c.type === 'logic.code') {
    const graphId = String(p.graph);
    const existing = store.get<LogicGraph>(paths.logic(graphId));
    const parsed = parseCode(String(p.code), existing);
    if ('error' in parsed) return `code line ${parsed.error.line}:${parsed.error.column}: ${parsed.error.message}`;
    const graph: LogicGraph = {
      id: graphId as LogicGraph['id'],
      name: String(p.name),
      scope: (p.scope as LogicGraph['scope']) ?? existing?.scope ?? 'global',
      nodes: parsed.nodes,
      edges: parsed.edges,
    };
    const create = !existing && !earlier.has(graphId);
    earlier.add(graphId);
    return [{ type: create ? 'logic.create' : 'logic.replace', payload: { graph }, label: `Logic: ${graph.name}` }];
  }
  if (c.type === 'cinematic.reward') {
    const scene = rewardScene({
      id: String(p.id),
      map: String(p.map),
      at: p.at as [number, number, number],
      giver: String(p.giver),
      ...(p.name ? { name: String(p.name) } : {}),
      ...(p.line ? { line: String(p.line) } : {}),
    });
    return [{ type: 'cinematic.put', payload: { cinematic: scene }, label: `Scene: ${scene.name}` }];
  }
  return `unknown helper ${c.type}`;
}

/**
 * Validates a proposed plan (scope, schemas, media, limits), expands helpers, dry-runs every command
 * as one transaction and returns the patch with its file diff — or the problems, each with the step,
 * command and payload path, so the model can repair the plan.
 */
export function checkPlan(
  store: ProjectStore,
  bus: CommandBus,
  plan: Plan,
  scope: Scope,
  limits: { maxCommands: number; maxDiffBytes: number; maxSteps: number; destructiveShare: number } = AI_LIMITS,
): CheckResult {
  const problems: PlanProblem[] = [];
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length)
    return {
      ok: false,
      problems: [{ step: -1, command: null, path: 'steps', message: 'A plan needs at least one step.' }],
    };
  if (plan.steps.length > limits.maxSteps)
    problems.push({ step: -1, command: null, path: 'steps', message: `Use at most ${limits.maxSteps} steps.` });
  const media = knownMedia(store);
  const earlierGraphs = new Set<string>();
  const steps: PatchStep[] = [];
  const flat: { step: number; command: number }[] = [];
  plan.steps.forEach((s, si) => {
    const out: Command[] = [];
    const notes: string[] = [];
    if (!s || typeof s.title !== 'string' || !Array.isArray(s.commands)) {
      problems.push({
        step: si,
        command: null,
        path: '',
        message: 'Each step needs a title, an explanation and commands.',
      });
      return;
    }
    s.commands.forEach((c, ci) => {
      const def = aiCommand(c?.type);
      if (!def) {
        problems.push({
          step: si,
          command: ci,
          path: 'type',
          message: `"${c?.type}" is not a command the AI builder can use. Call describe_command or pick from the list.`,
        });
        return;
      }
      if (!def.scopes.includes(scope)) {
        problems.push({
          step: si,
          command: ci,
          path: 'type',
          message: `${c.type} is outside the "${scope}" scope the user chose.`,
        });
        return;
      }
      const r = def.schema.safeParse(c.payload);
      if (!r.success) {
        for (const i of r.error.issues.slice(0, 4))
          problems.push({
            step: si,
            command: ci,
            path: ['payload', ...i.path.map(String)].join('.'),
            message: i.message,
          });
        return;
      }
      for (const [str, path] of strings(c.payload)) {
        if (URLISH.test(str))
          problems.push({
            step: si,
            command: ci,
            path: ['payload', ...path].join('.'),
            message: 'The AI builder cannot fetch or link files from the internet; use built-in or imported media.',
          });
        else if (/^sha256:[0-9a-f]{64}$/.test(str) && !media.has(str))
          problems.push({
            step: si,
            command: ci,
            path: ['payload', ...path].join('.'),
            message:
              'Unknown media: only the built-in sound pack and media already imported into the project can be used.',
          });
      }
      if (AI_HELPERS.some((h) => h.type === c.type)) {
        const e = expandHelper(store, { type: c.type, payload: r.data }, earlierGraphs);
        if (typeof e === 'string') problems.push({ step: si, command: ci, path: 'payload', message: e });
        else {
          for (const x of e) {
            out.push(x);
            flat.push({ step: si, command: ci });
          }
          notes.push(`${c.type} → ${e.map((x) => x.type).join(', ')}`);
        }
        return;
      }
      if (c.type === 'logic.create' || c.type === 'logic.replace')
        earlierGraphs.add((r.data as { graph: { id: string } }).graph.id);
      out.push({ type: c.type, payload: r.data });
      flat.push({ step: si, command: ci });
    });
    steps.push({
      title: String(s.title).slice(0, 120),
      explain: String(s.explain ?? '').slice(0, 800),
      workspace: s.workspace ?? workspaceOf(out[0]?.type ?? s.commands[0]?.type ?? ''),
      commands: out,
      ...(notes.length ? { helperNote: notes.join('; ') } : {}),
    });
  });
  if (problems.length) return { ok: false, problems };
  const all = steps.flatMap((s) => s.commands);
  if (all.length > limits.maxCommands)
    return {
      ok: false,
      problems: [
        {
          step: -1,
          command: null,
          path: '',
          message: `The patch has ${all.length} commands; the limit is ${limits.maxCommands}. Do less at once.`,
        },
      ],
    };
  if (!all.length)
    return { ok: false, problems: [{ step: -1, command: null, path: '', message: 'The plan has no commands.' }] };

  const dry = bus.dryRun(all);
  if (!dry.ok) {
    const at = flat[dry.failedAt ?? 0] ?? { step: 0, command: 0 };
    return {
      ok: false,
      problems: [{ step: at.step, command: at.command, path: '', message: `The engine refused it: ${dry.error}` }],
    };
  }
  const diff = diffSnapshots(store.snapshot(), dry.preview);
  const bytes = diff.reduce((n, d) => n + d.bytes, 0);
  if (bytes > limits.maxDiffBytes)
    return {
      ok: false,
      problems: [
        {
          step: -1,
          command: null,
          path: '',
          message: `The patch changes ${size(bytes)} of files; the limit is ${size(limits.maxDiffBytes)}. Do less at once.`,
        },
      ],
    };

  const warnings: string[] = [];
  let confirm: string | null = null;
  const gates = store.get<Gates>(paths.gates);
  for (const mapId of gates?.mapOrder ?? []) {
    const before = new MapBricks(store, mapId).all().length;
    if (!before) continue;
    const prefix = paths.chunkDir(mapId);
    let after = 0;
    for (const [p, v] of dry.preview) if (p.startsWith(prefix)) after += (v as { bricks: unknown[] }).bricks.length;
    const removed = before - after;
    if (removed > before * limits.destructiveShare)
      confirm = `This removes ${removed} of ${before} loose bricks (${Math.round((removed / before) * 100)}%) on map ${mapId}.`;
    else if (removed > 0) warnings.push(`Removes ${removed} bricks on ${mapId}.`);
  }
  const removedFiles = diff.filter((d) => d.kind === 'removed');
  if (removedFiles.length)
    warnings.push(
      `Deletes ${removedFiles.length} file(s): ${removedFiles
        .map((d) => d.path)
        .slice(0, 5)
        .join(', ')}`,
    );
  return {
    ok: true,
    patch: {
      summary: String(plan.summary ?? '').slice(0, 200) || steps[0]!.title,
      steps,
      diff,
      warnings,
      confirm,
      commandCount: all.length,
    },
  };
}

/** What changed between two snapshots (project.json's file table is bookkeeping and ignored). */
export function diffSnapshots(before: ProjectSnapshot, after: ProjectSnapshot): FileDiff[] {
  const out: FileDiff[] = [];
  const strip = (p: string, v: unknown) => {
    if (p !== paths.project || !v || typeof v !== 'object') return v;
    const { files: _f, modified: _m, ...rest } = v as Record<string, unknown>;
    return rest;
  };
  const size = (v: unknown) => (v === undefined ? 0 : JSON.stringify(v).length);
  for (const [p, a] of after) {
    const b = before.get(p);
    if (b === undefined) out.push({ path: p, kind: 'added', after: a, bytes: size(a) });
    else if (b !== a && JSON.stringify(strip(p, b)) !== JSON.stringify(strip(p, a)))
      out.push({ path: p, kind: 'changed', before: b, after: a, bytes: size(a) + size(b) });
  }
  for (const [p, b] of before) if (!after.has(p)) out.push({ path: p, kind: 'removed', before: b, bytes: size(b) });
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

/** Problems as the text the model reads back. */
export function problemsText(ps: PlanProblem[]): string {
  return ps
    .map(
      (p) =>
        `- ${p.step >= 0 ? `step ${p.step + 1}` : 'plan'}${p.command !== null ? ` command ${p.command + 1}` : ''}${p.path ? ` (${p.path})` : ''}: ${p.message}`,
    )
    .join('\n');
}

/**
 * Applies the chosen steps of a patch as ONE undo step labelled "AI: <summary>" (P8.3). Steps are
 * re-checked together first, so a subset that no longer fits (a later step needing an earlier one)
 * is refused with the engine's reason instead of half-applying.
 */
export function applyPatch(bus: CommandBus, patch: Patch, steps: readonly number[] = patch.steps.map((_, i) => i)) {
  const cmds = steps.flatMap((i) => patch.steps[i]?.commands ?? []);
  if (!cmds.length) return { ok: false as const, error: 'Pick at least one step.' };
  const r = bus.execute(cmds, { source: 'ai', label: `AI: ${patch.summary}` });
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? 'The engine refused the patch.' };
}
