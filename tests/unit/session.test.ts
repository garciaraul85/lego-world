import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapToLegacyBuild } from '../../src/core/bridge/legacy-bridge';
import { serializeFile } from '../../src/core/json/stable';
import { migrate } from '../../src/core/migrate';
import { ProjectStore } from '../../src/core/project/store';
import { legacyRuntime } from '../../src/engine/legacy/runtime-modules';
import { Runtime, STEP } from '../../src/engine/runtime/runtime';
import { PlaySession } from '../../src/engine/runtime/session';

const store = () =>
  new ProjectStore(migrate(JSON.parse(readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8'))).files);
const dump = (s: ProjectStore) =>
  [...s.keys()]
    .sort()
    .map((p) => p + serializeFile(p, s.get(p)))
    .join('\n');

describe('Runtime', () => {
  it('runs fixed 60 Hz steps, caps a long frame at 4 steps, pauses and single-steps', () => {
    let n = 0;
    const rt = new Runtime({}, [{ id: 'count', fixed: () => n++ }]);
    expect(rt.advance(1 / 30)).toBe(2);
    expect(rt.advance(5)).toBe(4); // spiral guard
    rt.paused = true;
    expect(rt.advance(1)).toBe(0);
    rt.stepOnce();
    expect(n).toBe(7);
    rt.paused = false;
    rt.timeScale = 0.5;
    const before = n;
    rt.advance(1 / 15);
    expect(n - before).toBeLessThanOrEqual(3);
  });
});

describe('PlaySession', () => {
  it('moves the hero exactly like v68’s controller with the same input', () => {
    const s = store();
    const snap = s.snapshot();
    const session = new PlaySession(snap);
    const L = legacyRuntime();
    const build = mapToLegacyBuild(snap, s.manifest.entry.map);
    const ref = new L.GamePhysics.Controller(
      build.pieces.map((p) => ({ ...p })),
      build.world as never,
    );
    Object.assign(ref.state, structuredClone(session.heroState));
    session.input.keys.add('w');
    session.input.keys.add('shift');
    for (let i = 0; i < 120; i++) {
      if (i === 30) session.input.jump = true;
      session.runtime.stepOnce();
      ref.step(
        { x: 0, z: 1, run: true, jump: i === 30, vertical: 0, speedScale: 1, jumpSpeed: 9.5 },
        STEP,
        session.camYaw,
      );
    }
    expect(session.heroState.x).toBeCloseTo(ref.state.x, 9);
    expect(session.heroState.z).toBeCloseTo(ref.state.z, 9);
    expect(session.heroState.y).toBeCloseTo(ref.state.y, 9);
  });

  it('smashes an object, rebuilds it, and never touches the project', () => {
    const s = store();
    const before = dump(s);
    const session = new PlaySession(s.snapshot(), { mapId: 'map_0000000001' });
    const w = session.world;
    // Stand next to a grouped object and face it until v68's target() picks it.
    let aimed = false;
    for (const p of w.pieces.filter((p) => p.group && p.y === 1)) {
      for (const [dx, dz, heading] of [
        [-1.6, 0.5, Math.PI / 2],
        [3.6, 0.5, -Math.PI / 2],
        [0.5, -1.6, 0],
        [0.5, 3.6, Math.PI],
      ] as const) {
        Object.assign(w.controller.state, {
          x: p.x + dx,
          y: 0.4,
          z: p.z + dz,
          heading,
          vy: 0,
          grounded: true,
          speed: 0,
        });
        const t = w.controller.target(2.8);
        if (t && w.controller.clear(w.controller.state.x, 0.4, w.controller.state.z)) {
          aimed = true;
          break;
        }
      }
      if (aimed) break;
    }
    expect(aimed).toBe(true);
    const pieces = w.pieces.length;
    session.smash();
    for (let i = 0; i < 40; i++) session.runtime.stepOnce();
    expect(w.broken.length).toBe(1 + 1); // the fixture already had one smashed tree
    expect(session.world.pieces.length).toBeLessThan(pieces);
    expect(w.dirtyChunks.size).toBeGreaterThan(0);
    session.input.keys.add('e');
    for (let i = 0; i < 100; i++) session.runtime.stepOnce();
    expect(session.world.pieces.length).toBe(pieces);
    expect(session.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['smash', 'rebuild']));
    expect(dump(s)).toBe(before);
  });

  it('travels through a gate when the hero walks onto its spawn, and arrives locked', () => {
    const s = store();
    const session = new PlaySession(s.snapshot()); // starts on Prairie's gate spawn
    session.runtime.stepOnce();
    expect(session.world.doc.name).toBe('Prairie'); // starting on a gate does not travel
    const sp = session.world.doc.spawns[0]!;
    Object.assign(session.heroState, { x: sp.pos[0] + 6, z: sp.pos[2] });
    session.runtime.stepOnce(); // leave the gate: unlock
    Object.assign(session.heroState, { x: sp.pos[0], z: sp.pos[2] });
    session.runtime.stepOnce();
    expect(session.world.doc.name).toBe('Map 1');
    expect(session.events.at(-1)).toMatchObject({ kind: 'travel', msg: 'Prairie → Map 1 (Arrival)' });
    session.runtime.stepOnce();
    expect(session.world.doc.name).toBe('Map 1'); // no bounce back
  });
});

describe('PlaySession asset interactions (P3.1)', () => {
  it('a chest near the hero shows a prompt; E opens it (its lid bricks swap) and Stop keeps the project unchanged', async () => {
    const { newProjectFiles } = await import('../../src/core/project/new-project');
    const { CommandBus, registerAll } = await import('../../src/core/commands');
    const { BUILTIN_ASSETS } = await import('../../src/builtin/assets');
    const s = new ProjectStore(newProjectFiles({ name: 'Chest', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
    const map = s.manifest.entry.map;
    expect(
      bus.execute(
        [
          { type: 'asset.create', payload: { asset: chest } },
          { type: 'asset.place', payload: { map, asset: chest.id, pos: [-2, 0, 3] } },
        ],
        { source: 'user' },
      ).ok,
    ).toBe(true);
    const before = dump(s);
    const game = new PlaySession(s.snapshot());
    const n0 = game.world.pieces.length;
    game.placeAt([0, 0.4, 6.2], Math.PI);
    game.runtime.stepOnce();
    expect(game.prompt?.label).toBe('Open');
    expect(game.interact()).toBe(true);
    expect(game.world.instances[0]!.state).toBe('open');
    expect(game.world.pieces.length).toBe(n0 + 1); // closed lid out; open lid + coins in
    expect(game.events.some((e) => e.msg.includes('chest-opened'))).toBe(true);
    game.runtime.stepOnce();
    expect(game.interact()).toBe(true); // the open chest's interaction closes it again
    expect(game.world.instances[0]!.state).toBe('closed');
    expect(game.world.pieces.length).toBe(n0);
    expect(dump(s)).toBe(before);
  });
});

describe('PlaySession logic (P4.2)', () => {
  it('repair 3 buildings: logic counts rebuilds in play and rewards the hero on the third', async () => {
    const { newProjectFiles } = await import('../../src/core/project/new-project');
    const { CommandBus, registerAll } = await import('../../src/core/commands');
    const { graph } = await import('./logic-helpers');
    const s = new ProjectStore(
      newProjectFiles({ name: 'Q', generate: { environments: ['forest'], size: 16, seed: 3 } }),
    );
    const bus = registerAll(new CommandBus(s));
    const g = graph(
      [
        ['event.onRebuildFinished'],
        ['var.add', { var: 'repaired' }],
        ['flow.branch'],
        ['compare.gte', { b: 3 }],
        ['var.get', { var: 'repaired' }],
        ['world.give', { item: 'medal', count: 1 }],
        ['flow.once'],
      ],
      [
        [1, 'then', 2, 'in'],
        [2, 'then', 3, 'in'],
        [5, 'value', 4, 'a'],
        [4, 'out', 3, 'cond'],
        [3, 'true', 7, 'in'],
        [7, 'then', 6, 'in'],
      ],
      'lg_repair0001',
    );
    expect(
      bus.execute(
        [
          {
            type: 'logic.setVariable',
            payload: { name: 'repaired', def: { type: 'number', default: 0, scope: 'global' } },
          },
          { type: 'logic.create', payload: { graph: g } },
        ],
        { source: 'user' },
      ),
    ).toMatchObject({ ok: true });
    const game = new PlaySession(s.snapshot());
    game.runtime.stepOnce();
    let rebuilt = 0;
    for (const inst of [...game.world.instances]) {
      if (rebuilt === 3) break;
      const hit = game.world.pieces.find((p) => p.id === inst.bricks[0]!.id);
      if (!hit || !game.breakHit(hit)) continue;
      const entry = game.world.broken.at(-1)!;
      // stand next to the damage, still, and hold E until it is rebuilt
      const b = game.L.GamePhysics.bounds(entry.originals[0]!);
      for (const [dx, dz] of [
        [-1.2, 0],
        [1.2, 0],
        [0, -1.2],
        [0, 1.2],
      ] as [number, number][]) {
        game.placeAt(
          [
            dx < 0 ? b.x0 + dx : dx > 0 ? b.x1 + dx : (b.x0 + b.x1) / 2,
            0.4,
            dz < 0 ? b.z0 + dz : dz > 0 ? b.z1 + dz : (b.z0 + b.z1) / 2,
          ],
          0,
        );
        game.rebuildHeld = true;
        for (let i = 0; i < 100 && game.world.broken.includes(entry); i++) game.runtime.stepOnce();
        if (!game.world.broken.includes(entry)) break;
      }
      game.rebuildHeld = false;
      if (!game.world.broken.includes(entry)) rebuilt++;
    }
    expect(rebuilt).toBe(3);
    game.runtime.stepOnce();
    expect(game.logic.vars.get('repaired')).toBe(3);
    expect(game.inventory.get('medal')).toBe(1);
    expect(game.logic.problems).toEqual([]);
  });
});

describe('PlaySession zones (P4.6)', () => {
  it('walking into a zone fires On enter zone and the zone’s own actions; leaving fires On exit zone', async () => {
    const { newProjectFiles } = await import('../../src/core/project/new-project');
    const { CommandBus, registerAll } = await import('../../src/core/commands');
    const { graph } = await import('./logic-helpers');
    const s = new ProjectStore(newProjectFiles({ name: 'Z', random: () => 0.2 }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    bus.execute(
      {
        type: 'map.addZone',
        payload: {
          map,
          zone: {
            id: 'zn_square0001',
            min: [4, 0, -2],
            max: [8, 4, 2],
            tags: ['Square'],
            onEnter: [{ do: 'give', item: 'flag' }],
          },
        },
      },
      { source: 'user' },
    );
    const g = graph(
      [
        ['event.onEnterZone', { zone: 'zn_square0001' }],
        ['misc.log', { value: 'in' }],
        ['event.onExitZone', { zone: 'zn_square0001' }],
        ['misc.log', { value: 'out' }],
      ],
      [
        [1, 'then', 2, 'in'],
        [3, 'then', 4, 'in'],
      ],
      'lg_zones00001',
    );
    expect(bus.execute({ type: 'logic.create', payload: { graph: g } }, { source: 'user' }).ok).toBe(true);
    const game = new PlaySession(s.snapshot());
    game.runtime.stepOnce();
    expect(game.events.some((e) => e.msg === 'Logic: in')).toBe(false);
    game.placeAt([6, 0.4, 0], 0);
    game.runtime.stepOnce();
    game.runtime.stepOnce();
    expect(game.events.some((e) => e.msg === 'Logic: in')).toBe(true);
    expect(game.inventory.get('flag')).toBe(1);
    game.placeAt([-6, 0.4, 0], 0);
    game.runtime.stepOnce();
    game.runtime.stepOnce();
    expect(game.events.some((e) => e.msg === 'Logic: out')).toBe(true);
  });
});
