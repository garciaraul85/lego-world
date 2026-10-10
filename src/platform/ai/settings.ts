/**
 * AI builder settings, kept on this device only (localStorage), never in the project: the API key
 * cannot end up in a .bwproj, an export, a log or the undo history (P8.1/P8.4).
 */
export type AiProviderChoice = 'auto' | 'artifact' | 'anthropic-api';
export type AiSettings = {
  provider: AiProviderChoice;
  apiKey: string;
  model: string;
  /** artifact provider: quick | default | complex */
  tier: 'quick' | 'default' | 'complex';
  /** daily soft cap in tokens (0 = none): past it the panel asks before sending */
  dailyCap: number;
  spent: { day: string; tokens: number; requests: number };
};

const KEY = 'brickworlds.ai';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const today = () => new Date().toISOString().slice(0, 10);

export const DEFAULT_AI: AiSettings = {
  provider: 'auto',
  apiKey: '',
  model: DEFAULT_MODEL,
  tier: 'default',
  dailyCap: 400_000,
  spent: { day: today(), tokens: 0, requests: 0 },
};

export function loadAi(): AiSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AiSettings> | null;
    const s = { ...DEFAULT_AI, ...(v ?? {}) };
    if (s.spent.day !== today()) s.spent = { day: today(), tokens: 0, requests: 0 };
    return s;
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function saveAi(s: AiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings last for this page only */
  }
}

/** Adds a request's usage to today's spend and returns the new settings. */
export function recordSpend(s: AiSettings, tokens: number, requests: number): AiSettings {
  const spent = s.spent.day === today() ? s.spent : { day: today(), tokens: 0, requests: 0 };
  const next = { ...s, spent: { day: spent.day, tokens: spent.tokens + tokens, requests: spent.requests + requests } };
  saveAi(next);
  return next;
}

/** Masks a key for display: sk-ant-…a1b2 */
export const maskKey = (k: string) => (k ? `${k.slice(0, 7)}…${k.slice(-4)}` : '');
