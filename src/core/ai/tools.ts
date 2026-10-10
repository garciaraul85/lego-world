import type { CommandBus } from '../commands/bus';
import type { ProjectStore } from '../project/store';
import { aiCommand, payloadJsonSchema, type Scope, typesFor } from './commands';
import { builtinFile, builtinPaths, projectSummary } from './context';
import { type CheckResult, checkPlan, type Plan, problemsText } from './patch';
import type { AiTool } from './provider';

/** Tool results stay under the artifact runtime's 32 KB cap. */
export const MAX_RESULT = 24_000;
const cap = (s: string, max = MAX_RESULT) => (s.length > max ? `${s.slice(0, max)}\n… (cut at ${max} characters)` : s);

export type ToolState = {
  /** proposals made this request (accepted or not) */
  proposals: number;
  lastProblems: string | null;
  result: Extract<CheckResult, { ok: true }> | null;
  question: { question: string; options: string[] } | null;
};

export const MAX_REPAIRS = 3;

/**
 * The AI builder's tools (P8.1), generated from the command catalog: read the project, look up a
 * command's payload schema, propose the plan (validated, expanded and dry-run here), or ask the user.
 * Input schemas stay small (≤ 4 KB each) so both providers accept them.
 */
export function makeTools(o: {
  store: ProjectStore;
  bus: CommandBus;
  scope: Scope;
  state: ToolState;
  onTool?(name: string, detail: string): void;
}): AiTool[] {
  const { store, bus, scope, state } = o;
  const note = (name: string, detail: string) => o.onTool?.(name, detail);
  const types = typesFor(scope);
  const read = (path: string): unknown => store.get(path) ?? builtinFile(path);
  return [
    {
      name: 'read_project_summary',
      description:
        'Returns a fresh summary of the project: maps, spawns, zones, placed assets, gates, assets, characters, logic as code, screens, scenes, audio and problems. Call it again after a plan is refused to see the current state.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => {
        note('read_project_summary', 'Reading the project');
        return cap(projectSummary(store, { budget: 5_500 }));
      },
    },
    {
      name: 'list_files',
      description:
        'Lists project file paths starting with a prefix (e.g. "maps/", "assets/", "screens/", "logic/"), plus read-only built-ins under "builtin/". Returns at most 300 paths.',
      inputSchema: { type: 'object', properties: { prefix: { type: 'string' } }, required: ['prefix'] },
      execute: (i) => {
        const prefix = String(i.prefix ?? '');
        note('list_files', prefix || 'all files');
        const all = [...store.keys(), ...builtinPaths()].filter(
          (p) => p.startsWith(prefix) && !p.startsWith('.editor/'),
        );
        return all.sort().slice(0, 300).join('\n') || '(no files)';
      },
    },
    {
      name: 'read_file',
      description:
        'Returns one file as JSON text (project files, or builtin/assets|characters|clips|screens/<id>.json and builtin/audio/events|music|mixer.json). Long files are cut; pass offset to continue.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, offset: { type: 'number' } },
        required: ['path'],
      },
      execute: (i) => {
        const path = String(i.path ?? '');
        note('read_file', path);
        const v = read(path);
        if (v === undefined) throw new Error(`No file at ${path}. Use list_files.`);
        const text = JSON.stringify(v);
        const off = Math.max(0, Number(i.offset ?? 0) | 0);
        const part = text.slice(off, off + MAX_RESULT);
        return off + MAX_RESULT < text.length
          ? `${part}\n… (more: offset ${off + MAX_RESULT} of ${text.length})`
          : part;
      },
    },
    {
      name: 'search',
      description:
        'Finds files whose JSON contains the text (case-insensitive), e.g. a name, an id, a variable. Returns up to 30 paths with a snippet.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: (i) => {
        const q = String(i.query ?? '').toLowerCase();
        note('search', q);
        if (!q) throw new Error('Give a query.');
        const hits: string[] = [];
        for (const p of [...store.keys(), ...builtinPaths()]) {
          if (p.includes('/chunks/') || p.startsWith('.editor/')) continue;
          const t = JSON.stringify(read(p));
          const at = t.toLowerCase().indexOf(q);
          if (at >= 0) hits.push(`${p}: …${t.slice(Math.max(0, at - 60), at + 80)}…`);
          if (hits.length >= 30) break;
        }
        return hits.join('\n') || 'No matches.';
      },
    },
    {
      name: 'describe_command',
      description:
        'Returns what a command does, the JSON Schema of its payload and an example. Call it before using a command whose payload you are unsure of.',
      inputSchema: { type: 'object', properties: { type: { type: 'string', enum: types } }, required: ['type'] },
      execute: (i) => {
        const t = String(i.type ?? '');
        note('describe_command', t);
        const c = aiCommand(t);
        if (!c || !types.includes(t)) throw new Error(`${t} is not available in this scope.`);
        return cap(
          JSON.stringify({
            type: t,
            doc: c.doc,
            workspace: c.workspace,
            payloadSchema: payloadJsonSchema(t),
            example: c.example,
          }),
        );
      },
    },
    {
      name: 'propose_plan',
      description:
        'Proposes the whole change as steps of commands. The editor validates and dry-runs it: on success it is shown to the user to review (nothing is applied yet); on failure you get the problems to fix. Call once with the complete plan.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'one line: what the patch does' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                explain: { type: 'string', description: 'what it does and how the user would do it in the editor' },
                commands: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { type: { type: 'string', enum: types }, payload: { type: 'object' } },
                    required: ['type', 'payload'],
                  },
                },
              },
              required: ['title', 'explain', 'commands'],
            },
          },
        },
        required: ['summary', 'steps'],
      },
      execute: (i) => {
        if (state.result) return 'A plan was already accepted for review. Reply with one short sentence for the user.';
        if (state.proposals > MAX_REPAIRS)
          throw new Error('Too many refused plans. Stop and tell the user what blocked you.');
        state.proposals++;
        note('propose_plan', `Checking the plan (attempt ${state.proposals})`);
        const r = checkPlan(store, bus, i as unknown as Plan, scope);
        if (!r.ok) {
          state.lastProblems = problemsText(r.problems);
          note('problems', state.lastProblems);
          throw new Error(
            `The plan was refused:\n${state.lastProblems}\nFix exactly these and call propose_plan again.`,
          );
        }
        state.result = r;
        state.lastProblems = null;
        return `Accepted for review: ${r.patch.steps.length} step(s), ${r.patch.commandCount} command(s), ${r.patch.diff.length} file(s) change.${r.patch.warnings.length ? ` Warnings: ${r.patch.warnings.join(' ')}` : ''} Now reply with one short sentence for the user.`;
      },
    },
    {
      name: 'ask_user',
      description:
        'Shows the user a question with 2-4 short options when the request is ambiguous. After calling it, stop and end your reply with the question; the answer arrives as the next message.',
      inputSchema: {
        type: 'object',
        properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } },
        required: ['question', 'options'],
      },
      execute: (i) => {
        const options = (Array.isArray(i.options) ? i.options : []).map(String).filter(Boolean).slice(0, 4);
        state.question = { question: String(i.question ?? ''), options };
        note('ask_user', state.question.question);
        return 'The question is shown to the user. Stop now; their answer comes as the next message.';
      },
    },
  ];
}
