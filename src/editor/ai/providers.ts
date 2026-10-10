import { FakeProvider, type FakeRound } from '../../core/ai/fake';
import type { AiProvider } from '../../core/ai/provider';
import { anthropicProvider } from '../../platform/ai/anthropic-api';
import { artifactProvider } from '../../platform/ai/artifact-claude';
import type { AiSettings } from '../../platform/ai/settings';

/**
 * Picks who answers: Claude in the artifact viewer (no key; the viewer's own plan) or the user's own
 * Anthropic API key. "auto" prefers the artifact when it can run tools, then the key. Tests can set
 * `window.__aiFake` to a list of rounds to replay instead.
 */
export async function pickProvider(get: () => AiSettings): Promise<AiProvider | null> {
  const fake = (globalThis as { __aiFake?: FakeRound[] }).__aiFake;
  if (fake) return new FakeProvider(structuredClone(fake));
  const s = get();
  const art = artifactProvider({ tier: () => get().tier });
  const api = anthropicProvider({ key: () => get().apiKey, model: () => get().model || 'claude-sonnet-5-5' });
  if (s.provider === 'artifact') return (await art.available()) ? art : null;
  if (s.provider === 'anthropic-api') return api;
  if (await art.available()) return art;
  if (s.apiKey) return api;
  return null;
}

/** Whether the artifact's Claude can answer here (shown in settings). */
export const artifactAvailable = () => artifactProvider({ tier: () => 'default' }).available();
