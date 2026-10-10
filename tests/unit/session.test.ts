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
