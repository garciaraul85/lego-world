import type { GameOptions } from '../../core/gamegen/recipes';

/**
 * What the editor should do right after (re)opening a project: start Play (Generate & play),
 * replay a generated game stage by stage (Watch it being built) or run the tutorial on its
 * sandbox. Kept in localStorage because opening a project reloads the page.
 */
export type Intent =
  | { kind: 'play'; project: string }
  | { kind: 'build'; project: string; seed: number; options: GameOptions; step: number }
  | { kind: 'tutorial'; project: string; mode: 'show' | 'try' };

const KEY = 'brickworlds.intent';
const HUB = 'brickworlds.hub';

export function readIntent(project: string): Intent | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Intent | null;
    return v && v.project === project ? v : null;
  } catch {
    return null;
  }
}

export function writeIntent(v: Intent | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the intent only lasts this page */
  }
}

/** Start hub at startup: on by default for the first project, then as the user chose. */
export function hubAtStartup(): boolean {
  try {
    return localStorage.getItem(HUB) !== 'off';
  } catch {
    return true;
  }
}

export function setHubAtStartup(on: boolean) {
  try {
    localStorage.setItem(HUB, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
