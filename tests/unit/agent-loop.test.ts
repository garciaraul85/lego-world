import { describe, expect, it } from 'vitest';
import { runAgent } from '../../src/core/ai/agent-loop';
import { FakeProvider } from '../../src/core/ai/fake';
import { applyPatch } from '../../src/core/ai/patch';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allCommands, generateGame } from '../../src/core/gamegen/generateGame';
import { serializeFile } from '../../src/core/json/stable';
import { ProjectStore } from '../../src/core/project/store';
import { type LogicGraph, paths, validateFile } from '../../src/core/schema';
import { SCRIPTS } from '../fixtures/ai/scripts';

const NOW = '2026-01-01T00:00:00.000Z';
function base() {
  const g = generateGame({ theme: 'town', maps: 1, length: 'short', difficulty: 1 }, 4242, { now: NOW });
  const store = new ProjectStore(g.files);
  const bus = registerAll(new CommandBus(store));
  const r = bus.execute(allCommands(g), { source: 'generator' });
  if (!r.ok) throw new Error(r.error);
  bus.clearHistory();
  return { store, bus };
}
const dump = (s: ProjectStore) =>
  [...s.keys()]
    .filter((p) => p !== paths.project)
    .sort()
    .map((p) => p + serializeFile(p, s.get(p)))
    .join('\n');

describe('plan → patch loop with recorded transcripts (P8.2)', () => {
  for (const [name, make] of Object.entries(SCRIPTS))
    it(name, async () => {
      const { store, bus } = base();
      const script = make(store);
      const provider = new FakeProvider(script.rounds);
      const before = dump(store);
      const out = await runAgent({
        provider,
        store,
        bus,
        request: script.prompt,
        scope: script.scope,
        signal: new AbortController().signal,
      });
      expect(out.kind, JSON.stringify(provider.log, null, 1).slice(0, 2000)).toBe(script.expect);
      // planning never touches the project
      expect(dump(store)).toBe(before);
      expect(bus.history()).toHaveLength(0);
      if (out.kind !== 'patch') return;
      const p = out.patch;
      expect(p.steps.length).toBeGreaterThan(0);
      for (const s of p.steps) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.workspace).toBeTruthy();
        for (const c of s.commands) expect(bus.types()).toContain(c.type); // helpers are expanded away
      }
      expect(p.diff.length).toBeGreaterThan(0);
      // Accept = one undo step labelled "AI: …"; every file it writes is valid
      expect(applyPatch(bus, p).ok).toBe(true);
      expect(bus.history().map((h) => h.label)).toEqual([`AI: ${p.summary}`]);
      expect(bus.history()[0]!.source).toBe('ai');
      for (const d of p.diff)
        if (d.kind !== 'removed') expect(validateFile(d.path, store.get(d.path)), d.path).toEqual([]);
      // Undo restores byte-identical files
      bus.undo();
      expect(dump(store)).toBe(before);
    });

  it('a refused plan gets the problem back with step, command and path, and the repair passes', async () => {
    const { store, bus } = base();
    const script = SCRIPTS['chest gives coins (with one repair)']!(store);
    const provider = new FakeProvider(script.rounds);
    await runAgent({
      provider,
      store,
      bus,
      request: script.prompt,
      scope: script.scope,
      signal: new AbortController().signal,
    });
    const proposals = provider.log.filter((l) => l.name === 'propose_plan');
    expect(proposals.map((p) => p.ok)).toEqual([false, true]);
    expect(proposals[0]!.result).toMatch(/step 2 command 1 .*code line \d+/);
  });

  it('the logic helper writes a graph the Code view shows the same way', async () => {
    const { store, bus } = base();
    const script = SCRIPTS['chest gives coins (with one repair)']!(store);
    const out = await runAgent({
      provider: new FakeProvider(script.rounds),
      store,
      bus,
      request: script.prompt,
      scope: script.scope,
      signal: new AbortController().signal,
    });
    if (out.kind !== 'patch') throw new Error(out.kind);
    applyPatch(bus, out.patch);
    const g = store.get<LogicGraph>(paths.logic('lg_chestcoins'))!;
    expect(g.nodes.map((n) => n.type)).toEqual(
      expect.arrayContaining(['event.onInteract', 'var.add', 'audio.playSound']),
    );
  });

  it('accepting only some steps is checked again and refused when a step needs a skipped one', async () => {
    const { store, bus } = base();
    const script = SCRIPTS['second map with a gate']!(store);
    const out = await runAgent({
      provider: new FakeProvider(script.rounds),
      store,
      bus,
      request: script.prompt,
      scope: script.scope,
      signal: new AbortController().signal,
    });
    if (out.kind !== 'patch') throw new Error(out.kind);
    const partial = applyPatch(bus, out.patch, [2]);
    expect(partial.ok).toBe(false);
    expect(bus.history()).toHaveLength(0);
    expect(applyPatch(bus, out.patch, [0]).ok).toBe(true);
  });

  it('a model that gives up after a refusal is nudged once, then the failure is reported', async () => {
    const { store, bus } = base();
    const bad = {
      summary: 'x',
      steps: [
        {
          title: 'x',
          explain: 'x',
          commands: [{ type: 'map.rename', payload: { map: 'map_zzzzzzzzzz', name: 'Nope' } }],
        },
      ],
    };
    const provider = new FakeProvider([
      { tools: [{ name: 'propose_plan', input: bad }] },
      { text: 'Sorry.' },
      { text: 'Still no.' },
    ]);
    const out = await runAgent({
      provider,
      store,
      bus,
      request: 'rename',
      scope: 'map',
      signal: new AbortController().signal,
    });
    expect(out.kind).toBe('failed');
    expect(provider.runs).toHaveLength(2);
    expect(provider.runs[1]!.turns.at(-1)!.content).toMatch(/refused by the editor/);
  });
});
