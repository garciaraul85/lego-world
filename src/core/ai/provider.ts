/**
 * The AI provider seam (P8.1). A provider takes instructions, a short conversation and page tools, runs
 * as many model rounds as it is allowed (calling each tool's execute between rounds), and returns the
 * final text. Two providers implement it: the user's own Anthropic API key (src/platform/ai/anthropic-api)
 * and the artifact's built-in "ask Claude" (src/platform/ai/artifact-claude). The tool loop lives in the
 * provider because the artifact runtime runs it for us; the agent loop (agent-loop.ts) only supplies tools.
 */
export type JsonSchemaObject = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

export type AiTool = {
  /** 1-64 of A-Z a-z 0-9 _ - */
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  /** Runs in the editor. Return small plain data; throw to report a problem to the model. */
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown | Promise<unknown>;
};

export type AiTurn = { role: 'user' | 'assistant'; content: string };
export type AiUsage = { inputTokens: number; outputTokens: number; requests: number };

export type AiRunRequest = {
  /** standing instructions (a system prompt where the provider has one, else a leading user turn) */
  instructions: string;
  turns: AiTurn[];
  tools: AiTool[];
  /** model rounds the provider may take before it must answer */
  maxRounds: number;
  maxTokens: number;
  signal: AbortSignal;
  onText?(text: string): void;
};

export type AiRunResult = { text: string; usage: AiUsage | null; truncated: boolean; model?: string };

export interface AiProvider {
  id: 'anthropic-api' | 'artifact' | 'fake';
  label: string;
  available(): Promise<boolean>;
  run(req: AiRunRequest): Promise<AiRunResult>;
}

/** A provider failure the panel can explain. */
export class AiError extends Error {
  constructor(
    readonly code:
      | 'no-key'
      | 'not-granted'
      | 'rate-limited'
      | 'network'
      | 'refused'
      | 'cancelled'
      | 'bad-response'
      | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}
