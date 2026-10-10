import type { AiProvider, AiRunRequest, AiRunResult } from './provider';

/**
 * A provider that replays a recorded script (P8.2 tests and the e2e). Each entry is one model round:
 * tool calls (run through the real tools, results recorded) and/or text.
 */
export type FakeRound = { tools?: { name: string; input: Record<string, unknown> }[]; text?: string };

export class FakeProvider implements AiProvider {
  readonly id = 'fake' as const;
  readonly label = 'Recorded responses';
  /** what each tool returned (or the error it threw), for assertions */
  readonly log: { name: string; ok: boolean; result: string }[] = [];
  /** the instructions and turns each run received */
  readonly runs: AiRunRequest[] = [];
  private next = 0;

  constructor(private readonly rounds: FakeRound[]) {}

  async available() {
    return true;
  }

  async run(req: AiRunRequest): Promise<AiRunResult> {
    this.runs.push(req);
    let text = '';
    let used = 0;
    while (this.next < this.rounds.length && used < req.maxRounds) {
      if (req.signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      const round = this.rounds[this.next++]!;
      used++;
      for (const call of round.tools ?? []) {
        const tool = req.tools.find((t) => t.name === call.name);
        if (!tool) {
          this.log.push({ name: call.name, ok: false, result: 'unknown tool' });
          continue;
        }
        try {
          const r = await tool.execute(call.input, { signal: req.signal });
          this.log.push({ name: call.name, ok: true, result: typeof r === 'string' ? r : JSON.stringify(r) });
        } catch (e) {
          this.log.push({ name: call.name, ok: false, result: e instanceof Error ? e.message : String(e) });
        }
      }
      if (round.text) {
        text = text ? `${text}\n\n${round.text}` : round.text;
        req.onText?.(text);
        // a round with text and no tools ends the run, as a real model's final answer does
        if (!round.tools?.length) break;
      }
    }
    return {
      text: text || '…',
      usage: { inputTokens: 1000 * used, outputTokens: 200 * used, requests: used },
      truncated: false,
    };
  }
}
