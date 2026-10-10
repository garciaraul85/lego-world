import { describe, expect, it } from 'vitest';
import { AI_COMMANDS, AI_HELPERS, payloadJsonSchema, SCOPES, typesFor } from '../../src/core/ai/commands';
import { approxTokens, builtinFile, builtinPaths, projectSummary, SUMMARY_TOKENS } from '../../src/core/ai/context';
import { instructions } from '../../src/core/ai/prompts';
import { makeTools, type ToolState } from '../../src/core/ai/tools';
import { CommandBus, registerAll } from '../../src/core/commands';
import { parseCode } from '../../src/core/logic/code/parse';
import { ProjectStore } from '../../src/core/project/store';
import { bigGame } from '../fixtures/ai/games';

const fresh = (): ToolState => ({ proposals: 0, lastProblems: null, result: null, question: null });

describe('AI commands come from the engine (P8.1)', () => {
  const bus = registerAll(new CommandBus(new ProjectStore(new Map())));
  it('every AI command is a registered engine command; files and media are never exposed', () => {
    const engine = new Set(bus.types());
    for (const c of AI_COMMANDS) expect(engine, c.type).toContain(c.type);
    const types = AI_COMMANDS.map((c) => c.type);
    expect(types.filter((t) => t.startsWith('file.') || t.startsWith('media.'))).toEqual([]);
    expect(new Set(types).size).toBe(types.length);
    for (const h of AI_HELPERS) expect(engine.has(h.type)).toBe(false);
  });

  it('every payload has a JSON Schema and concrete examples validate', () => {
    for (const c of [...AI_COMMANDS, ...AI_HELPERS]) {
      const js = payloadJsonSchema(c.type);
      expect(js, c.type).toBeTruthy();
      expect(JSON.stringify(js).length).toBeGreaterThan(10);
      const ex = JSON.stringify(c.example);
      if (!ex.includes('$read')) expect(c.schema.safeParse(c.example).success, `${c.type} example`).toBe(true);
    }
  });

  it('the logic.code example is valid script', () => {
    const ex = AI_HELPERS.find((h) => h.type === 'logic.code')!.example as { code: string };
    expect('error' in parseCode(ex.code)).toBe(false);
  });

  it('tool definitions fit the API tool format and the artifact runtime (≤ 4 KB schemas)', () => {
    const { store, bus: b } = bigGame();
    for (const s of SCOPES) {
      const tools = makeTools({ store, bus: b, scope: s.id, state: fresh() });
      for (const t of tools) {
        expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
        expect(t.inputSchema.type).toBe('object');
        expect(t.description.length).toBeLessThan(1024);
        expect(JSON.stringify(t.inputSchema).length, `${s.id} ${t.name}`).toBeLessThanOrEqual(4096);
      }
      expect(typesFor(s.id).length).toBeGreaterThan(2);
    }
  });

  it('scopes narrow the commands', () => {
    expect(typesFor('logic')).toContain('logic.code');
    expect(typesFor('logic')).not.toContain('bricks.place');
    expect(typesFor('audio')).toContain('audio.setEvent');
    expect(typesFor('game').length).toBe(AI_COMMANDS.length + AI_HELPERS.length);
  });
});

describe('AI context (P8.1)', () => {
  it('the summary of a 4-map game stays under 20k tokens and names what the AI needs', () => {
    const { g, store } = bigGame();
    const s = projectSummary(store);
    expect(approxTokens(s)).toBeLessThanOrEqual(SUMMARY_TOKENS);
    expect(s).toContain(g.name);
    for (const id of store.list('maps/').filter((p) => p.endsWith('/map.json'))) expect(s).toContain(id.split('/')[1]!);
    expect(s).toMatch(/on\("/); // logic shown as code
    const all = instructions({ scope: 'game', summary: s });
    expect(new TextEncoder().encode(all).length).toBeLessThan(256 * 1024); // artifact prompt cap
  });

  it('a tight budget cuts the summary, not the request', () => {
    const { store } = bigGame();
    expect(approxTokens(projectSummary(store, { budget: 1500 }))).toBeLessThanOrEqual(1500);
  });

  it('built-ins can be read like files and tool results stay under 32 KB', async () => {
    expect(builtinPaths().length).toBeGreaterThan(20);
    for (const p of builtinPaths()) expect(builtinFile(p), p).toBeTruthy();
    const { store, bus } = bigGame();
    const tools = makeTools({ store, bus, scope: 'game', state: fresh() });
    const run = (n: string, i: Record<string, unknown>) =>
      tools.find((t) => t.name === n)!.execute(i, { signal: new AbortController().signal }) as string;
    for (const p of [...store.keys()].slice(0, 40))
      expect(run('read_file', { path: p }).length).toBeLessThan(32 * 1024);
    expect(run('describe_command', { type: 'cinematic.put' }).length).toBeLessThan(32 * 1024);
    expect(run('list_files', { prefix: 'builtin/screens/' })).toContain('scr_');
    expect(run('search', { query: 'chest' })).toContain('chest');
  });
});
