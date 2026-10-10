import { AiError, type AiProvider, type AiRunRequest, type AiRunResult } from '../../core/ai/provider';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
type Msg = { role: 'user' | 'assistant'; content: string | Block[] };
type Response = {
  content: Block[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'refusal' | string;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
};

const URL_ = 'https://api.anthropic.com/v1/messages';

/**
 * The user's own Anthropic API key, straight from the browser (P8.1). The key lives only in this
 * device's settings and is sent only to api.anthropic.com. Runs the tool loop itself: each round
 * may call tools; their results go back as tool_result blocks until the model answers or the round
 * budget runs out (the last round has tools switched off so it must answer).
 */
export function anthropicProvider(cfg: { key: () => string; model: () => string; fetch?: typeof fetch }): AiProvider {
  const doFetch = cfg.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    id: 'anthropic-api',
    label: 'Your Anthropic API key',
    available: async () => !!cfg.key(),
    async run(req: AiRunRequest): Promise<AiRunResult> {
      const key = cfg.key();
      if (!key) throw new AiError('no-key', 'Add your Anthropic API key in the AI builder settings.');
      const messages: Msg[] = req.turns.map((t) => ({ role: t.role, content: t.content }));
      const tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
      let text = '';
      let inT = 0;
      let outT = 0;
      let requests = 0;
      let truncated = false;
      let model: string | undefined;
      for (let round = 0; round < req.maxRounds; round++) {
        const last = round === req.maxRounds - 1;
        let res: globalThis.Response;
        try {
          res = await doFetch(URL_, {
            method: 'POST',
            signal: req.signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
              model: cfg.model(),
              max_tokens: req.maxTokens,
              system: req.instructions,
              messages,
              tools,
              ...(last ? { tool_choice: { type: 'none' } } : {}),
            }),
          });
        } catch (e) {
          if (req.signal.aborted) throw new AiError('cancelled', 'Stopped.');
          throw new AiError('network', `Could not reach the Anthropic API (${e instanceof Error ? e.message : e}).`);
        }
        requests++;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const msg = (() => {
            try {
              return (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
            } catch {
              return body;
            }
          })();
          if (res.status === 401 || res.status === 403) throw new AiError('no-key', `The API key was refused: ${msg}`);
          if (res.status === 429) throw new AiError('rate-limited', `Rate limited: ${msg}`);
          throw new AiError('network', `The API answered ${res.status}: ${msg}`);
        }
        const r = (await res.json()) as Response;
        model = r.model ?? model;
        inT += r.usage?.input_tokens ?? 0;
        outT += r.usage?.output_tokens ?? 0;
        const said = r.content
          .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('');
        if (said.trim()) {
          text = text ? `${text}\n\n${said}` : said;
          req.onText?.(text);
        }
        if (r.stop_reason === 'refusal') throw new AiError('refused', 'Claude declined this request.');
        if (r.stop_reason === 'max_tokens') truncated = true;
        const calls = r.content.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
        if (r.stop_reason !== 'tool_use' || !calls.length) break;
        messages.push({ role: 'assistant', content: r.content });
        const results: Block[] = [];
        for (const c of calls) {
          const tool = req.tools.find((t) => t.name === c.name);
          try {
            if (!tool) throw new Error(`Unknown tool ${c.name}.`);
            const out = await tool.execute(c.input ?? {}, { signal: req.signal });
            results.push({
              type: 'tool_result',
              tool_use_id: c.id,
              content: typeof out === 'string' ? out : JSON.stringify(out),
            });
          } catch (e) {
            results.push({
              type: 'tool_result',
              tool_use_id: c.id,
              content: e instanceof Error ? e.message : String(e),
              is_error: true,
            });
          }
        }
        messages.push({ role: 'user', content: results });
        if (req.signal.aborted) throw new AiError('cancelled', 'Stopped.');
      }
      return {
        text,
        usage: { inputTokens: inT, outputTokens: outT, requests },
        truncated,
        ...(model ? { model } : {}),
      };
    },
  };
}
