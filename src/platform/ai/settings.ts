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
  /** P33: how the key is kept (locked with a passphrase, this session only, or plain) */
  keyMode: KeyMode;
  /** P33: the key encrypted with the passphrase (keyMode locked) */
  locked?: LockedKey;
  /** P33: a cap per game (tokens a day, 0 = none) and what each game spent today */
  gameCap: number;
  spentByGame: Record<string, { day: string; tokens: number }>;
};

import { type KeyMode, type LockedKey, sessionKey, setSessionKey } from './keys';

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
  keyMode: 'session',
  gameCap: 0,
  spentByGame: {},
};

export function loadAi(): AiSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AiSettings> | null;
    // a key saved before P33 stays plain (and still works) until it is locked or forgotten
    const s = { ...DEFAULT_AI, ...(v ?? {}), keyMode: v?.keyMode ?? (v?.apiKey ? 'plain' : 'session') } as AiSettings;
    if (s.spent.day !== today()) s.spent = { day: today(), tokens: 0, requests: 0 };
    // a session key, or a locked key once unlocked, lives in memory only
    if (s.keyMode !== 'plain') s.apiKey = sessionKey();
    return s;
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function saveAi(s: AiSettings): void {
  // P33: only a plain key is written to storage; session and locked keys stay in memory
  if (s.keyMode !== 'plain') setSessionKey(s.apiKey);
  const stored = s.keyMode === 'plain' ? s : { ...s, apiKey: '' };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* storage blocked: settings last for this page only */
  }
}

/** Adds a request's usage to today's spend and returns the new settings. */
export function recordSpend(s: AiSettings, tokens: number, requests: number, game?: string): AiSettings {
  const spent = s.spent.day === today() ? s.spent : { day: today(), tokens: 0, requests: 0 };
  const spentByGame = { ...s.spentByGame };
  if (game) {
    const g = spentByGame[game]?.day === today() ? spentByGame[game]! : { day: today(), tokens: 0 };
    spentByGame[game] = { day: g.day, tokens: g.tokens + tokens };
  }
  const next = {
    ...s,
    spent: { day: spent.day, tokens: spent.tokens + tokens, requests: spent.requests + requests },
    spentByGame,
  };
  saveAi(next);
  return next;
}

/** P33: what this game spent today, in tokens */
export const gameSpent = (s: AiSettings, game: string) =>
  s.spentByGame[game]?.day === today() ? s.spentByGame[game]!.tokens : 0;

/** Masks a key for display: sk-ant-…a1b2 */
export const maskKey = (k: string) => (k ? `${k.slice(0, 7)}…${k.slice(-4)}` : '');
