import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENTS } from '../../src/builtin/audio/pack';
import { AI_LIMITS, checkPlan, type Plan } from '../../src/core/ai/patch';
import { MapBricks } from '../../src/core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allCommands, generateGame } from '../../src/core/gamegen/generateGame';
import { packProject } from '../../src/core/project/archive';
import { ProjectStore } from '../../src/core/project/store';
import { DEFAULT_AI, recordSpend } from '../../src/platform/ai/settings';

const NOW = '2026-01-01T00:00:00.000Z';
function base() {
  const g = generateGame({ theme: 'town', maps: 1, length: 'short', difficulty: 1 }, 4242, { now: NOW });
  const store = new ProjectStore(g.files);
  const bus = registerAll(new CommandBus(store));
  bus.execute(allCommands(g), { source: 'generator' });
  return { store, bus, map: store.manifest.entry.map };
}
const one = (type: string, payload: unknown): Plan => ({
  summary: 't',
  steps: [{ title: 't', explain: 't', commands: [{ type, payload }] }],
});

describe('AI safety and limits (P8.4)', () => {
  it(`refuses patches over ${AI_LIMITS.maxCommands} commands`, () => {
    const { store, bus, map } = base();
    const cmds = Array.from({ length: AI_LIMITS.maxCommands + 1 }, (_, i) => ({
      type: 'map.rename',
      payload: { map, name: `N${i}` },
    }));
    const r = checkPlan(store, bus, { summary: 'many', steps: [{ title: 'x', explain: 'x', commands: cmds }] }, 'map');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]!.message).toMatch(/limit is 2000/);
  });

  it('refuses diffs over the size limit (5 MB by default)', () => {
    const { store, bus } = base();
    const plan = one('map.create', { name: 'Big', generate: { environments: ['city'], size: 32, seed: 7 } });
    expect(checkPlan(store, bus, plan, 'map').ok).toBe(true);
    const r = checkPlan(store, bus, plan, 'map', { ...AI_LIMITS, maxDiffBytes: 5_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]!.message).toMatch(/KB of files; the limit is 5 KB/);
    expect(AI_LIMITS.maxDiffBytes).toBe(5 * 1024 * 1024);
  });

  it('removing more than half of a map needs an explicit confirm; less is only a warning', () => {
    const { store, bus } = base();
    bus.execute({ type: 'map.create', payload: { id: 'map_flatflat01', name: 'Flat' } }, { source: 'user' });
    const plates = Array.from({ length: 10 }, (_, i) => ({
      type: 'plate2x2',
      x: i * 3,
      y: 0,
      z: 0,
      rot: 0,
      color: '#79b44c',
    }));
    expect(
      bus.execute({ type: 'bricks.place', payload: { map: 'map_flatflat01', bricks: plates } }, { source: 'user' }).ok,
    ).toBe(true);
    const ids = new MapBricks(store, 'map_flatflat01').all().map((b) => b.id);
    expect(ids).toHaveLength(10);
    const few = checkPlan(store, bus, one('bricks.remove', { map: 'map_flatflat01', ids: ids.slice(0, 2) }), 'map');
    expect(few.ok && few.patch.confirm).toBeNull();
    if (few.ok) expect(few.patch.warnings.join()).toMatch(/Removes 2 bricks/);
    const most = checkPlan(store, bus, one('bricks.remove', { map: 'map_flatflat01', ids: ids.slice(0, 6) }), 'map');
    expect(most.ok).toBe(true);
    if (most.ok) expect(most.patch.confirm).toMatch(/This removes 6 of 10 loose bricks \(60%\)/);
  });

  it('the AI cannot fetch or link files from the internet', () => {
    const { store, bus, map } = base();
    const r = checkPlan(
      store,
      bus,
      one('item.add', {
        map,
        item: {
          id: 'ins_urlsign001',
          kind: 'ui',
          widget: 'sign',
          pos: [0, 2, 0],
          text: 'https://example.com/x.png',
          maxDistance: 20,
        },
      }),
      'map',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]!.message).toMatch(/cannot fetch or link files from the internet/);
  });

  it('media may only come from the built-in pack or the project', () => {
    const { store, bus } = base();
    const [id, ev] = Object.entries(DEFAULT_EVENTS.events)[0]!;
    const ok = checkPlan(store, bus, one('audio.setEvent', { id, event: { ...ev, volume: -6 } }), 'audio');
    expect(ok.ok).toBe(true);
    const bad = checkPlan(
      store,
      bus,
      one('audio.setEvent', { id, event: { ...ev, clips: [`sha256:${'ab'.repeat(32)}`] } }),
      'audio',
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems[0]!.message).toMatch(/Unknown media/);
  });

  it('raw file writes are not available to the AI', () => {
    const { store, bus } = base();
    const r = checkPlan(store, bus, one('file.put', { path: 'logic/lg_hackhack01.json', data: {} }), 'game');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]!.message).toMatch(/not a command the AI builder can use/);
  });

  it('the API key lives in device settings, never in the project file', () => {
    const { store } = base();
    const zip = packProject(store, new Map());
    const text = new TextDecoder('latin1').decode(zip);
    expect(text).not.toMatch(/apiKey|sk-ant-/);
    const s = recordSpend({ ...DEFAULT_AI, apiKey: 'sk-ant-test' }, 1234, 2);
    expect(s.spent.tokens).toBe(1234);
    expect(s.spent.requests).toBe(2);
  });
});
