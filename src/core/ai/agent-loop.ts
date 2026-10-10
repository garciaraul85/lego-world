import type { CommandBus } from '../commands/bus';
import type { ProjectStore } from '../project/store';
import type { Scope } from './commands';
import { projectSummary } from './context';
import type { Patch } from './patch';
import { instructions, repairTurn } from './prompts';
import type { AiProvider, AiTurn, AiUsage } from './provider';
import { MAX_REPAIRS, makeTools, type ToolState } from './tools';

export const MAX_ROUNDS = 8;

export type AgentEvent =
  | { kind: 'tool'; name: string; detail: string }
  | { kind: 'text'; text: string }
  | { kind: 'problems'; text: string };

export type AgentOutcome = { text: string; usage: AiUsage; turns: AiTurn[] } & (
  | { kind: 'patch'; patch: Patch }
  | { kind: 'question'; question: string; options: string[] }
  | { kind: 'answer' }
  | { kind: 'failed'; problems: string }
);

const add = (a: AiUsage, b: AiUsage | null): AiUsage =>
  b
    ? {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        requests: a.requests + b.requests,
      }
    : a;

/**
 * Request → plan → propose_plan → dry run → problems back to the model → repaired plan (P8.2).
 * The provider runs the model rounds (up to MAX_ROUNDS) and calls our tools; propose_plan validates,
 * expands and dry-runs every proposal, so a patch that comes out of here is known to apply cleanly.
 * Nothing touches the project: the review UI applies the patch only when the user accepts.
 */
export async function runAgent(o: {
  provider: AiProvider;
  store: ProjectStore;
  bus: CommandBus;
  request: string;
  scope: Scope;
  /** earlier turns of this conversation (the provider keeps nothing) */
  history?: AiTurn[];
  currentMap?: string;
  signal: AbortSignal;
  onEvent?(e: AgentEvent): void;
}): Promise<AgentOutcome> {
  const state: ToolState = { proposals: 0, lastProblems: null, result: null, question: null };
  const tools = makeTools({
    store: o.store,
    bus: o.bus,
    scope: o.scope,
    state,
    onTool: (name, detail) =>
      o.onEvent?.(name === 'problems' ? { kind: 'problems', text: detail } : { kind: 'tool', name, detail }),
  });
  const system = instructions({
    scope: o.scope,
    summary: projectSummary(o.store, o.currentMap ? { currentMap: o.currentMap } : {}),
  });
  const turns: AiTurn[] = [...(o.history ?? []), { role: 'user', content: o.request }];
  let usage: AiUsage = { inputTokens: 0, outputTokens: 0, requests: 0 };
  let text = '';
  // one run normally does it all; a second run nudges a model that stopped after a refused plan
  for (let run = 0; run < 2; run++) {
    const r = await o.provider.run({
      instructions: system,
      turns,
      tools,
      maxRounds: MAX_ROUNDS,
      maxTokens: 8_000,
      signal: o.signal,
      onText: (t) => o.onEvent?.({ kind: 'text', text: t }),
    });
    usage = add(usage, r.usage);
    text = r.text.trim();
    turns.push({ role: 'assistant', content: text || '(no reply)' });
    if (state.result || state.question) break;
    if (!state.lastProblems || state.proposals > MAX_REPAIRS) break;
    turns.push({ role: 'user', content: repairTurn(state.lastProblems) });
  }
  const done = { text, usage, turns };
  if (state.result) return { ...done, kind: 'patch', patch: state.result.patch };
  if (state.question) return { ...done, kind: 'question', ...state.question };
  if (state.lastProblems) return { ...done, kind: 'failed', problems: state.lastProblems };
  return { ...done, kind: 'answer' };
}
