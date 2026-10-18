import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { checkPlayable } from '../../src/core/checks/playable';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { ProgressDoc } from '../../src/core/save/progress';
import { type Instances, type MapDoc, paths } from '../../src/core/schema';

/** P28: “Can this game be finished?” — the Training yard passes; planted problems are each found. */
function yardGame() {
  const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const y = trainingYard();
  const r = bus.execute(
    [...y.commands, { type: 'project.update', payload: { entryMap: y.map, entrySpawn: y.spawn } }] as never,
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  return { s, bus, map: y.map };
}
const run = (g: ReturnType<typeof yardGame>, cmds: unknown) => {
  const r = g.bus.execute(cmds as never, { source: 'user' });
  expect(r.ok, r.error).toBe(true);
};

describe('playability checks', () => {
  it('the Training yard can be finished: no warnings', () => {
    const g = yardGame();
    const issues = checkPlayable(g.s).filter((i) => i.level !== 'info');
    // maps the yard does not join (the default map) are not the yard's problem
    expect(issues.filter((i) => i.map === g.map || !i.map)).toEqual([]);
  });

  it('finds a chest walled in, an achievement nothing unlocks, a collection short of items, a zone up in the air', () => {
    const g = yardGame();
    const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
    // a chest on top of a tall tower (nobody climbs up there)
    run(g, [
      { type: 'bricks.place', payload: { map: g.map, bricks: [...tower(16, 1), ...tower(18, 1)] } },
      { type: 'asset.place', payload: { map: g.map, asset: chest.id, pos: [16, 31, 1], id: 'ins_highchest0' } },
    ]);
    const doc = g.s.get<ProgressDoc>(paths.progress)!;
    run(g, {
      type: 'progress.put',
      payload: {
        progress: {
          ...doc,
          achievements: [...doc.achievements, { id: 'never', name: 'Never', description: 'Nothing unlocks it.' }],
          collections: [...doc.collections, { item: 'gem', label: 'Gems', total: 5 }],
        },
      },
    });
    const m = g.s.get<MapDoc>(paths.map(g.map))!;
    run(g, {
      type: 'map.addZone',
      payload: {
        map: g.map,
        zone: {
          id: 'zn_skyskysky1',
          min: [0, 40, 0],
          max: [4, 44, 4],
          tags: ['Sky'],
          onEnter: [{ do: 'message', text: 'Hi' }],
        },
      },
    });
    void m;
    const issues = checkPlayable(g.s);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('achievementNever');
    expect(codes).toContain('collectionShort');
    expect(codes).toContain('zoneUnreachable');
    const obj = issues.find((i) => i.code === 'objectUnreachable');
    expect(obj?.instance).toBe('ins_highchest0');
    expect(issues.find((i) => i.code === 'collectionShort')?.message).toMatch(/nothing gives “gem”/);
  });

  it('a gate on a map no one can reach, and a game with no start, are reported', () => {
    const g = yardGame();
    run(g, { type: 'map.create', payload: { id: 'map_lonelyisle', name: 'Lonely isle', spawnId: 'sp_lonelyspot' } });
    expect(checkPlayable(g.s).some((i) => i.code === 'mapUnreachable' && i.map === 'map_lonelyisle')).toBe(true);
    const items = g.s.get<Instances>(paths.instances(g.map));
    void items;
    const m = g.s.get<MapDoc>(paths.map(g.map))!;
    g.s.put(paths.map(g.map), { ...m, spawns: [] });
    expect(checkPlayable(g.s)[0]?.code).toBe('noStart');
  });
});

/** a 2 × 2 column of bricks 30 plates tall at (x, z) */
function tower(x: number, z: number) {
  return Array.from({ length: 10 }, (_, i) => ({ type: 'brick2x2', x, y: 1 + i * 3, z, rot: 0, color: '#888888' }));
}

describe('test shortcuts in Play', () => {
  it('god mode keeps the hero safe; a snapshot brings the world back; Play from a spot', async () => {
    const { PlaySession } = await import('../../src/engine/runtime/session');
    const g = yardGame();
    const p = new PlaySession(g.s.snapshot(), { mapId: g.map });
    p.god = true;
    p.hurt(2);
    expect(Number(p.logic.vars.get('hp'))).toBe(3);
    p.god = false;
    const chest = p.world.instances.find((i) => i.def.name === 'Treasure chest')!;
    p.snapshotMoment();
    p.setInstanceState(chest.inst.id, 'open');
    p.logic.setVar('coins', 9);
    p.hurt(1);
    expect(p.restoreMoment()).toBe(true);
    expect(p.world.instances.find((i) => i.inst.id === chest.inst.id)?.state).toBe('closed');
    expect(p.logic.vars.get('coins')).toBeUndefined();
    expect(Number(p.logic.vars.get('hp'))).toBe(3);
    expect(p.message).toBe('Back to the snapshot');
  });
});
