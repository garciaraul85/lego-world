import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { boot } = require('../../harness/legacy-boot.cjs') as {
  boot: (o?: { html?: string; saved?: string | null }) => LegacyApp;
};

export type LegacyApp = {
  tools: Map<string, { execute: (input?: unknown) => unknown }>;
  elements: Record<string, { value: string; textContent: string }>;
  stored: Map<string, string>;
  read: () => unknown;
  fire: (id: string, event?: string, value?: unknown) => void;
};

/** Boots LEGO World v68 (dist/index.html) in a VM. */
export const bootLegacy = (saved?: string): LegacyApp => boot({ saved: saved ?? null });

/** Loads a save through v68's own Load dialog; throws with v68's message if it is rejected. */
export function loadSave(app: LegacyApp, save: unknown): void {
  app.fire('bb-open');
  app.elements['#bb-data']!.value = typeof save === 'string' ? save : JSON.stringify(save);
  app.fire('bb-load-code');
  const msg = app.elements['#bb-dialog-message']!.textContent;
  if (msg) throw new Error(`v68 rejected the save: ${msg}`);
}

/** What v68 would write for this save: load it, then read it back (plain JSON). */
export function canonical(save: unknown): Record<string, unknown> {
  const app = bootLegacy();
  loadSave(app, save);
  return JSON.parse(JSON.stringify(app.read()));
}
