import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { nameBook, withIds, withNames } from '../../src/core/logic/code/names';
import { parseCode } from '../../src/core/logic/code/parse';
import { printGraph } from '../../src/core/logic/code/print';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { MapDoc } from '../../src/core/schema';
import { paths } from '../../src/core/schema';
import { complete } from '../../src/editor/workspaces/logic/complete';
import { argChoices } from '../../src/editor/workspaces/logic/model';
import { graph } from './logic-helpers';

/** P9b.1: code names zones, spawn points, sounds… as the editor does; the graph keeps ids; completion offers names. */
function project() {
  const store = new ProjectStore(newProjectFiles({ name: 'Names', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const r = bus.execute(
    {
      type: 'map.addZone',
      payload: { map, zone: { id: 'zn_pond000001', min: [0, 0, 0], max: [4, 4, 4], tags: ['Pond'], onEnter: [] } },
    },
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  return { store, map };
}

describe('names in code', () => {
  it('prints names for ids and reads names back to the same ids', () => {
    const { store, map } = project();
    const spawn = store.get<MapDoc>(paths.map(map))!.spawns[0]!;
    const book = nameBook(store);
    const g = graph(
      [
        ['event.onEnterZone', { zone: 'zn_pond000001' }],
        ['world.teleport', { spawn: spawn.id }],
      ],
      [[1, 'then', 2, 'in']],
    );
    const code = printGraph(withNames(g, book)).code;
    expect(code).toContain('zone: "Pond"');
    expect(code).toContain(`"${spawn.name}"`);
    expect(code).not.toContain('zn_pond000001');
    const back = parseCode(code, withNames(g, book));
    if ('error' in back) throw new Error(back.error.message);
    const ids = withIds(back, book);
    expect(ids.nodes.find((n) => n.type === 'event.onEnterZone')?.args?.zone).toBe('zn_pond000001');
    expect(ids.nodes.find((n) => n.type === 'world.teleport')?.args?.spawn).toBe(spawn.id);
    // an id typed by hand still works
    expect(book.idOf('zone', 'zn_pond000001')).toBe('zn_pond000001');
  });

  it('completion: inside quotes it lists the game’s zones, sounds (with a preview) and variables', () => {
    const { store } = project();
    const z = 'on("enterZone", { zone: "';
    const zones = complete(store, z, z.length);
    expect(zones?.options.map((o) => o.label)).toContain('Pond');
    const s = 'on("start", (e) => {\n  audio.playSound("';
    const sounds = complete(store, s, s.length);
    expect(sounds?.options.length).toBeGreaterThan(0);
    expect(sounds?.options[0]?.preview?.kind).toBe('sound');
    const ev = 'on("';
    expect(complete(store, ev, ev.length)?.options.map((o) => o.label)).toContain('enterZone');
    const word = 'aud';
    expect(complete(store, word, word.length)?.options.map((o) => o.label)).toContain('audio.playSound');
  });

  it('every node setting that names something is a list in the inspector', () => {
    const { store } = project();
    const ed = { store } as Parameters<typeof argChoices>[0];
    for (const kind of ['zone', 'spawn', 'map', 'sound', 'music', 'screen'] as const)
      expect(argChoices(ed, kind)?.length, kind).toBeGreaterThan(0);
    expect(argChoices(ed, 'zone')?.[0]?.label).toMatch(/^Pond · /);
  });
});
