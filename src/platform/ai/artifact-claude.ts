import { AiError, type AiProvider, type AiRunRequest, type AiRunResult } from '../../core/ai/provider';

/** The parts of the artifact runtime's `sample` capability we use (contract 0.2.x). */
type SampleTool = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute(input: Record<string, unknown>, ctx: { signal: AbortSignal }): unknown;
};
type Sample = ((
  input: string | { role: 'user' | 'assistant'; content: string }[],
  options?: {
    onText?(u: { text: string; delta: string }): void;
    signal?: AbortSignal;
    tools?: SampleTool[];
    modelTier?: 'quick' | 'default' | 'complex';
    images?: Blob[];
    cache?: boolean;
  },
) => Promise<{ text: string; truncated: boolean; modelTierApplied: string }>) & {
  limits(): Promise<{ maxPromptBytes: number; tools?: { maxCount: number }; images?: { maxCount: number } }>;
};
type ClaudeUse = { use(name: 'sample'): Promise<Sample | null> };

let samplePromise: Promise<Sample | null> | null = null;
export function sampleApi(): Promise<Sample | null> {
  const c = (globalThis as unknown as { claude?: ClaudeUse }).claude;
  if (!c?.use) return Promise.resolve(null);
  samplePromise ??= c.use('sample').catch(() => null);
  return samplePromise;
}

/** P22 part 4: whether the artifact's Claude can look at pictures here (the page declares images) */
export async function artifactImages(): Promise<boolean> {
  const s = await sampleApi();
  const l = s ? await s.limits().catch(() => null) : null;
  return !!l?.images;
}

const CODES: Record<string, AiError['code']> = {
  cancelled: 'cancelled',
  not_granted: 'not-granted',
  sampling_disabled: 'not-granted',
  not_declared: 'unavailable',
  capability_disabled: 'unavailable',
  capability_removed: 'unavailable',
  tools_unavailable: 'unavailable',
  rate_limited: 'rate-limited',
  images_unavailable: 'unavailable',
  image_rejected: 'bad-response',
  refused: 'refused',
};

/**
 * Claude through the artifact viewer (P8.1): when the editor runs as a published artifact, the viewer's
 * own Claude plan answers — no key needed. The platform runs the tool rounds and calls our tools'
 * execute functions in the page. There is no system prompt, so the instructions go in a leading user turn.
 */
export function artifactProvider(cfg: { tier: () => 'quick' | 'default' | 'complex' }): AiProvider {
  return {
    id: 'artifact',
    label: 'Claude (this artifact)',
    async available() {
      const s = await sampleApi();
      if (!s) return false;
      const l = await s.limits().catch(() => null);
      return !!l?.tools;
    },
    async run(req: AiRunRequest): Promise<AiRunResult> {
      const sample = await sampleApi();
      if (!sample) throw new AiError('unavailable', 'Claude is not available in this view.');
      try {
        const r = await sample([{ role: 'user', content: req.instructions }, ...req.turns], {
          signal: req.signal,
          modelTier: cfg.tier(),
          tools: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            execute: t.execute,
          })),
          onText: ({ text }) => req.onText?.(text),
          ...(req.images?.length ? { images: req.images.map((i) => i.blob) } : {}),
        });
        return { text: r.text, usage: null, truncated: r.truncated };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        throw new AiError(CODES[err.code ?? ''] ?? 'network', err.message ?? 'Claude could not answer.');
      }
    },
  };
}
