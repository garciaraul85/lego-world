import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';
import { legacySyncCommands } from '../../src/core/sync/legacy-sync';
import { bootLegacy, loadSave } from './helpers/legacy-app';

describe('legacySyncCommands', () => {
  const app = bootLegacy();
  loadSave(app, readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'));
  const text = () => JSON.stringify(app.read());
  const store = new ProjectStore(migrate(text(), { now: '2026-10-09T00:00:00.000Z' }).files);
  const bus = registerAll(new CommandBus(store));

  it('is empty when nothing changed', () => {
    expect(legacySyncCommands(store, text())).toEqual([]);
  });

  it('a brick added in v68 rewrites only the chunk file it lands in', () => {
    const save = app.read() as { pieces: { kind: string; x: number; y: number; z: number }[] };
    // v68 only accepts connected bricks: try stacking a 1x1 plate on top of the highest pieces.
    const tops = [...save.pieces].sort((a, b) => b.y - a.y).slice(0, 40);
    const placed = tops.some((p) => {
      try {
        app.tools.get('place_bricks')!.execute({
          pieces: [
            {
              rows: 1,
              cols: 1,
              kind: 'plate',
              color: 0,
              turn: 0,
              x: p.x,
              y: p.y + (p.kind === 'brick' ? 3 : 1),
              z: p.z,
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    });
    expect(placed).toBe(true);
    const cmds = legacySyncCommands(store, text());
    expect(cmds.length).toBeGreaterThan(0);
    for (const c of cmds) expect((c.payload as { path: string }).path).toMatch(/\/chunks\//);
    expect(bus.execute(cmds, { source: 'legacy' }).ok).toBe(true);
    expect(legacySyncCommands(store, text())).toEqual([]);
  });

  it('switching the active map in v68 updates project.json entry', () => {
    const maps = (app.read() as { maps: { activeId: number; maps: { id: number }[] } }).maps;
    const other = maps.maps.find((m) => m.id !== maps.activeId)!;
    app.tools.get('manage_lego_maps')!.execute({ action: 'switch', mapId: other.id });
    const cmds = legacySyncCommands(store, text());
    expect(cmds.some((c) => (c.payload as { path: string }).path === 'project.json')).toBe(true);
    expect(bus.execute(cmds, { source: 'legacy' }).ok).toBe(true);
    expect(store.manifest.entry.map).toBe(`map_${other.id.toString(36).padStart(10, '0')}`);
  });
});

describe('legacySyncCommands on an editor-made project', async () => {
  const { newProjectFiles } = await import('../../src/core/project/new-project');
  const { toLegacy } = await import('../../src/core/bridge/legacy-bridge');
  it('keeps the project’s own map, spawn and entry ids when v68 regenerates the world', () => {
    const store = new ProjectStore(
      newProjectFiles({ name: 'Ed', generate: { environments: ['forest'], size: 16, seed: 3 } }),
    );
    const bus = registerAll(new CommandBus(store));
    const mapId = store.manifest.entry.map;
    const spawnId = store.manifest.entry.spawn;
    const app = bootLegacy();
    loadSave(app, toLegacy(store));
    app.tools
      .get('generate_lego_world')!
      .execute({ biomes: ['desert'], time: 'night', rain: false, snow: false, snowing: false, size: 16, seed: 9 });
    const cmds = legacySyncCommands(store, JSON.stringify(app.read()));
    expect(bus.execute(cmds, { source: 'legacy' }).ok).toBe(true);
    expect(store.manifest.entry.map).toBe(mapId);
    expect(store.list('maps/').every((p) => p.startsWith(`maps/${mapId}/`))).toBe(true);
    expect(store.get<{ sky: { time: string }; spawns: { id: string }[] }>(`maps/${mapId}/map.json`)).toMatchObject({
      sky: { time: 'night' },
      spawns: [{ id: spawnId }],
    });
  });
});
