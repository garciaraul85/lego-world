import type { ProjectSnapshot, ProjectStore } from '../project/store';

export interface Command<P = unknown> {
  /** 'bricks.place' | 'map.setEnvironment' | ... (registered in commands/registry.ts) */
  type: string;
  payload: P;
  /** shown in Edit › Undo and in AI review, e.g. 'Place 2×4 brick' */
  label?: string;
}

export interface CommandHandler<P> {
  /** Plain-sentence error, or null when the command can run. Must not write. */
  validate(store: ProjectStore, p: P): string | null;
  /** Mutates only through store.put/remove. Throwing rolls the whole transaction back. */
  apply(store: ProjectStore, p: P): void;
  /** Default label when the command has none. */
  label?(p: P): string;
}

export type Source = 'user' | 'ai' | 'tutorial' | 'agent' | 'generator' | 'migration' | 'legacy';

export interface ExecuteResult {
  ok: boolean;
  error?: string;
  /** index of the command that failed, when ok is false */
  failedAt?: number;
  touched: string[];
}

export interface HistoryEntry {
  label: string;
  source: Source;
  at: number;
  touched: string[];
}

export type DryRunResult = ExecuteResult & { preview: ProjectSnapshot };
