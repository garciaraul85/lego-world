import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allCommands, generateGame } from '../../src/core/gamegen/generateGame';
import type { Theme } from '../../src/core/gamegen/recipes';
import { serializeFile } from '../../src/core/json/stable';
import { ProjectStore } from '../../src/core/project/store';
import { type LogicGraph, type MapDoc, paths, validateFile } from '../../src/core/schema';
import { validateWorld } from '../../src/core/world/validate';
import { PlaySession } from '../../src/engine/runtime/session';

const NOW = '2026-01-01T00:00:00.000Z';
/** GAMEGEN_SEEDS=100 runs the plan's full 100 seeds × 4 themes (about 3 minutes) */
const SEEDS = Number(process.env.GAMEGEN_SEEDS ?? 12);
const THEMES: Theme[] = ['town', 'volcano', 'forest', 'mixed'];

function replay(g: ReturnType<typeof generateGame>, oneStep = true) {
  const store = new ProjectStore(g.files);
  const bus = registerAll(new CommandBus(store));
  if (oneStep) {
    const r = bus.execute(allCommands(g), { source: 'generator', label: `Generate ${g.name}` });
    if (!r.ok) throw new Error(r.error);
  } else
    for (const s of g.stages) {
      const r = bus.execute(s.commands, { source: 'generator', label: s.title });
      if (!r.ok) throw new Error(`${s.title}: ${r.error}`);
    }
  return { store, bus };
}
const dump = (s: ProjectStore) =>
  [...s.keys()]
    .sort()
    .map((p) => p + serializeFile(p, s.get(p)))
    .join('\n');

describe('generateGame (P7.1)', () => {
  for (const theme of THEMES)
    it(`${SEEDS} seeds of “${theme}” all build valid, reachable games`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const g = generateGame(
          {
            theme,
            maps: 1 + (seed % 3),
            length: seed % 4 === 0 ? 'medium' : 'short',
            difficulty: ((seed % 3) + 1) as 1,
          },
          seed * 101,
          { now: NOW },
        );
        const { store } = replay(g);
        expect(
          validateWorld(store).filter((i) => i.level === 'warn'),
          `${theme} ${seed}`,
        ).toEqual([]);
        for (const p of store.keys()) expect(validateFile(p, store.get(p)), p).toEqual([]);
        expect(store.manifest.hero).toBeTruthy();
        expect(store.list('cinematics/')).toHaveLength(1);
        expect(store.list('logic/lg_').length).toBe(2);
      }
    }, 300_000);

  it('the same seed gives identical files; one step or stage by stage gives the same project', () => {
    const a = generateGame({ theme: 'town', maps: 2, length: 'short', difficulty: 2 }, 4242, { now: NOW });
    const b = generateGame({ theme: 'town', maps: 2, length: 'short', difficulty: 2 }, 4242, { now: NOW });
    expect(dump(replay(a).store)).toBe(dump(replay(b).store));
    expect(dump(replay(a, false).store)).toBe(dump(replay(a).store));
    expect(a.stages.map((s) => s.id)).toEqual([
      'name',
      'terrain',
      'maps',
      'gates',
      'hero',
      'props',
      'logic',
      'screens',
      'cinematic',
      'audio',
      'worldui',
      'check',
    ]);
    for (const s of a.stages) {
      expect(s.explain.length, s.id).toBeGreaterThan(20);
      expect(s.howTo.length, s.id).toBeGreaterThan(20);
    }
  });

  it('a generated collect game is playable: opening every chest plays the reward scene', () => {
    const g = generateGame({ theme: 'forest', maps: 1, length: 'short', difficulty: 1, quest: 'collect' }, 77, {
      now: NOW,
    });
    const { store } = replay(g);
    expect(g.quest.kind).toBe('collect');
    const graph = store.get<LogicGraph>(store.list('logic/lg_')[0]!)!;
    expect(graph.nodes.some((n) => n.type === 'cinematic.play')).toBe(true);
    const game = new PlaySession(store.snapshot());
    expect(game.screens.ids.length).toBe(1); // the HUD (Play in the editor skips the splash)
    game.runtime.stepOnce();
    const chests = game.world.instances.filter((i) => i.def.name === 'Treasure chest');
    expect(chests.length).toBe(3);
    // open each chest the way E does (the chest's own interaction list)
    for (const c of chests) {
      game.actions.run(c.def.interactions[0]!.do, game.clock, c.inst.id);
      for (let i = 0; i < 3; i++) game.runtime.stepOnce();
      expect(c.state).toBe('open');
    }
    expect(game.logic.vars.get('found')).toBe(3);
    expect(game.cine.active).toBe(true);
    expect(store.get<MapDoc>(paths.map(store.manifest.entry.map))!.music).toBeTruthy();
  });
});
