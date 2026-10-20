import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import { CATALOG, type ExecCtx } from '../../src/core/logic/catalog';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { MemorySaveStore } from '../../src/core/save/save';
import { findSecrets, scanFiles } from '../../src/core/security/secrets';
import { PlaySession } from '../../src/engine/runtime/session';
import { lockKey, setSessionKey, unlockKey } from '../../src/platform/ai/keys';
import { DEFAULT_AI, loadAi, saveAi } from '../../src/platform/ai/settings';

/** P33: keys stay out of games, the editor's key is locked, game scripts are sandboxed, the page is locked down. */
const KEY = `sk-ant-api03-${'A1b2C3d4'.repeat(6)}`;

const fakeStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

describe('the AI key at rest', () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = store;
    setSessionKey('');
  });

  it('this session only: the key is never written to storage', () => {
    saveAi({ ...DEFAULT_AI, keyMode: 'session', apiKey: KEY });
    expect([...store.data.values()].join('')).not.toContain('sk-ant');
    expect(loadAi().apiKey).toBe(KEY);
    // a new page (memory gone): no key
    setSessionKey('');
    expect(loadAi().apiKey).toBe('');
  });

  it('locked: only the encrypted key is stored; the right passphrase unlocks it, a wrong one does not', async () => {
    const locked = await lockKey(KEY, 'correct horse battery', 1000);
    saveAi({ ...DEFAULT_AI, keyMode: 'locked', apiKey: KEY, locked });
    const stored = [...store.data.values()].join('');
    expect(stored).not.toContain('sk-ant');
    expect(findSecrets(stored)).toEqual([]);
    setSessionKey('');
    const s = loadAi();
    expect(s.apiKey).toBe('');
    expect(await unlockKey(s.locked!, 'wrong passphrase')).toBe(null);
    expect(await unlockKey(s.locked!, 'correct horse battery')).toBe(KEY);
    await expect(lockKey(KEY, 'short')).rejects.toThrow(/8 characters/);
  });

  it('a key saved before (plain) keeps working until it is locked', () => {
    store.setItem('brickworlds.ai', JSON.stringify({ ...DEFAULT_AI, apiKey: KEY, keyMode: undefined }));
    const s = loadAi();
    expect(s.keyMode).toBe('plain');
    expect(s.apiKey).toBe(KEY);
  });
});

describe('secret scan', () => {
  it('finds key-shaped strings and masks them', () => {
    const hits = findSecrets(`sign text ${KEY} and AKIAABCDEFGHIJKLMNOP`, 'screens/x.json');
    expect(hits.map((h) => h.name)).toEqual(['Anthropic API key', 'AWS access key']);
    expect(hits[0]!.sample).toBe('sk-ant…');
    expect(JSON.stringify(hits)).not.toContain(KEY.slice(10));
  });

  it('no key-shaped string in a game, its saves or its player record — even with a key in the editor', () => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();
    saveAi({ ...DEFAULT_AI, keyMode: 'plain', apiKey: KEY });
    const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const y = trainingYard();
    expect(bus.execute(y.commands, { source: 'user' }).ok).toBe(true);
    const files = [...s.keys()].map((k) => [k, s.get(k)] as [string, unknown]);
    expect(scanFiles(files)).toEqual([]);
    const saves = new MemorySaveStore();
    const p = new PlaySession(s.snapshot(), { mapId: y.map, saves });
    p.saveGame(1);
    p.progress.setSetting('music', 40);
    expect(findSecrets(JSON.stringify(saves.read(s.manifest.id, 1)))).toEqual([]);
    expect(findSecrets(JSON.stringify(saves.readPlayer(s.manifest.id)))).toEqual([]);
    expect(findSecrets(JSON.stringify(p.events))).toEqual([]);
    expect(findSecrets(JSON.stringify(bus.history()))).toEqual([]);
  });
});

describe('game scripts are sandboxed', () => {
  it('a logic card can only reach the game through its context: no storage, no network, no page', () => {
    const allowed = new Set<string>();
    const ctx = new Proxy({} as ExecCtx, {
      get(_t, k) {
        allowed.add(String(k));
        return () => 0;
      },
    });
    const g = globalThis as Record<string, unknown>;
    const saved = { fetch: g.fetch, localStorage: g.localStorage, XMLHttpRequest: g.XMLHttpRequest };
    const trap = (name: string) => () => {
      throw new Error(`a logic card used ${name}`);
    };
    g.fetch = trap('fetch');
    g.XMLHttpRequest = trap('XMLHttpRequest');
    g.localStorage = new Proxy({}, { get: trap('localStorage') });
    try {
      for (const d of CATALOG) {
        const args = Object.fromEntries((d.args ?? []).map((a) => [a.name, 'x']));
        d.exec?.(ctx, args, { value: 1, a: 1, b: 2, text: '<b>x</b>', target: 'hero' });
        d.eval?.(ctx, args, { value: 1, a: 1, b: 2, text: '<b>x</b>', target: 'hero' });
      }
    } finally {
      Object.assign(g, saved);
    }
    // everything the cards touched is part of the game's own interface
    const ctxKeys = [
      'getVar',
      'setVar',
      'log',
      'emit',
      'random',
      'setState',
      'teleport',
      'travel',
      'give',
      'spawn',
      'spawnNear',
      'despawn',
      'media',
      'inZone',
      'damage',
      'heal',
      'setInvulnerable',
      'saving',
      'progress',
      'talk',
      'sheet',
      'effect',
      'screen',
    ];
    for (const k of allowed) expect(ctxKeys, k).toContain(k);
  });

  it('game data is never run as code: no eval of project content anywhere in the engine', () => {
    for (const f of [
      'src/engine/logic/interpreter.ts',
      'src/engine/logic/compile.ts',
      'src/engine/runtime/session.ts',
      'src/engine/runtime/actions.ts',
      'src/engine/ui/widgets/index.tsx',
      'src/engine/ui/WorldUI.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/new Function|\beval\(|dangerouslySetInnerHTML/);
    }
  });
});

describe('the page is locked down', () => {
  it('the editor page has a content security policy: network only to itself and the AI host', () => {
    const src = readFileSync('scripts/inline-html.mjs', 'utf8');
    const block = src.slice(src.indexOf('export const EDITOR_CSP'), src.indexOf("].join('; ')"));
    const EDITOR_CSP = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join('; ');
    // the page template uses it
    expect(src).toContain('http-equiv="Content-Security-Policy" content="${EDITOR_CSP}"');
    const connect = EDITOR_CSP.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect.split(' ').slice(1).sort()).toEqual(
      ["'self'", 'blob:', 'data:', 'https://api.anthropic.com'].sort(),
    );
    expect(EDITOR_CSP).toContain("object-src 'none'");
    expect(EDITOR_CSP).toContain("form-action 'none'");
  });
});
