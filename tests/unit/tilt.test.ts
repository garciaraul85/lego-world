import { describe, expect, it } from 'vitest';
import { expandInstances } from '../../src/core/assets/instances';
import {
  hasTilt,
  normalizeTilt,
  tiltedBox,
  tiltMatrix,
  tiltModel,
  tiltPivot,
  tiltPoint,
  untiltRay,
} from '../../src/core/assets/tilt';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, paths } from '../../src/core/schema';
import { EditorState } from '../../src/editor/state';
import { gizmoTarget, handlesFor, tiltChange } from '../../src/editor/viewport/gizmo';

function editor() {
  const store = new ProjectStore(
    newProjectFiles({ name: 'T', generate: { environments: ['city'], size: 16, seed: 9 } }),
  );
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  return new EditorState({ store, bus, autosave: new Autosave(store, backend), backend });
}
const instOf = (ed: EditorState, id: string) =>
  ed.store.get<Instances>(paths.instances(ed.mapId.value))!.items.find((i) => i.id === id) as {
    tilt?: number[];
    rot: number;
    pos: number[];
  };

describe('P31 free rotation math', () => {
  it('turns are proper rotations, and the ray trick is the exact inverse', () => {
    for (const t of [
      [30, 0, 0],
      [0, 45, 0],
      [0, 0, -60],
      [15, 120, 75],
    ]) {
      const m = tiltMatrix(t);
      // rows are unit length and at right angles
      for (let i = 0; i < 3; i++) {
        const r = m.slice(i * 3, i * 3 + 3);
        expect(Math.hypot(...r)).toBeCloseTo(1);
      }
      const pivot = [3, 2, -1];
      const p = [5, 1, 4];
      const q = tiltPoint(t, pivot, p);
      expect(Math.hypot(q[0] - 3, q[1] - 2, q[2] + 1)).toBeCloseTo(Math.hypot(2, -1, 5));
      // a ray at the turned point, seen untilted, passes through the original point
      const r = untiltRay(t, pivot, { o: [q[0], q[1] + 10, q[2]], d: [0, -1, 0] });
      const at = [r.o[0] + r.d[0] * 10, r.o[1] + r.d[1] * 10, r.o[2] + r.d[2] * 10];
      for (const [i, v] of at.entries()) expect(v).toBeCloseTo(p[i]!);
      // the renderer's model matrix does the same as tiltPoint
      const M = tiltModel(t, pivot);
      const mm = [0, 1, 2].map((row) => M[row]! * p[0]! + M[4 + row]! * p[1]! + M[8 + row]! * p[2]! + M[12 + row]!);
      for (const [i, v] of mm.entries()) expect(v).toBeCloseTo(q[i]!);
    }
  });

  it('a quarter turn about Y matches a quarter turn of the brick grid (counter-clockwise from above)', () => {
    const q = tiltPoint([0, 90, 0], [0, 0, 0], [1, 0, 0]);
    expect(q[0]).toBeCloseTo(0);
    expect(q[2]).toBeCloseTo(-1);
  });

  it('keeps angles in -180..180 and knows when there is no turn', () => {
    expect(normalizeTilt([190, -200, 360])).toEqual([-170, 160, 0]);
    expect(hasTilt([0, 0, 0])).toBe(false);
    expect(hasTilt(undefined)).toBe(false);
    expect(hasTilt([0, 15, 0])).toBe(true);
  });
});

describe('P31 instance.tilt', () => {
  it('turns an asset freely, leaves it out of the grid rules, and straightening brings the rules back', () => {
    const ed = editor();
    const [e] = expandInstances(ed.store, ed.mapId.value);
    expect(e).toBeTruthy();
    const map = ed.mapId.value;
    const id = e!.inst.id;
    expect(ed.exec({ type: 'instance.tilt', payload: { map, instance: id, tilt: [30, 0, 45] } }).ok).toBe(true);
    expect(instOf(ed, id).tilt).toEqual([30, 0, 45]);
    const s = ed.scene.value!;
    expect(s.tilted.has(id)).toBe(true);
    // the box around it grew (turned corners stick out)
    const [a, b] = tiltedBox(e!.bricks, [30, 0, 45]);
    const [a0, b0] = tiltedBox(e!.bricks, [0, 0, 0]);
    expect(b[1] - a[1]).toBeGreaterThan(b0[1] - a0[1]);
    // it can sink into the ground or neighbours: free objects skip overlap and support checks
    const down = ed.exec({
      type: 'bricks.move',
      payload: { map, ids: e!.bricks.map((x) => x.id), dx: 0, dy: 0, dz: 1 },
    });
    expect(down.ok).toBe(true);
    // unpacking a turned asset is refused with a reason
    const un = ed.bus.check({ type: 'instance.unpack', payload: { map, instances: [id] } });
    expect(un).toMatch(/Straighten/);
    // straighten: tilt goes away
    ed.undo();
    expect(ed.exec({ type: 'instance.tilt', payload: { map, instance: id, tilt: [0, 0, 0] } }).ok).toBe(true);
    expect(instOf(ed, id).tilt).toBeUndefined();
    expect(ed.scene.value!.tilted.has(id)).toBe(false);
  });

  it('picks a turned asset where it is drawn, not where it would stand', () => {
    const ed = editor();
    const [e] = expandInstances(ed.store, ed.mapId.value);
    const map = ed.mapId.value;
    ed.exec({ type: 'instance.tilt', payload: { map, instance: e!.inst.id, tilt: [0, 45, 0] } });
    const s = ed.scene.value!;
    const pivot = tiltPivot(e!.bricks);
    const hit = s.pick({ o: [pivot[0], 200, pivot[2]], d: [0, -1, 0] });
    expect(hit && s.ownerOf(hit.brick.id)?.inst.id).toBe(e!.inst.id);
  });
});

describe('P31 Rotate gizmo on a whole asset', () => {
  it('shows red, green and blue rings and snaps free turns to 15°; 90° about Y goes back on the grid', () => {
    const ed = editor();
    const s = ed.scene.value!;
    const owned = s.all().find((b) => s.ownerOf(b.id))!;
    const owner = s.ownerOf(owned.id)!;
    ed.select(owner.bricks.map((b) => b.id));
    const t = gizmoTarget(ed, 'rotate')!;
    expect(t).toMatchObject({ kind: 'bricks', inst: { id: owner.inst.id } });
    expect(handlesFor('rotate', t, 4).map((h) => h.id)).toEqual(['ring', 'rx', 'rz']);
    const tip = tiltChange(ed.mapId.value, t, 'rx', 37);
    expect(tip.command).toMatchObject({ type: 'instance.tilt', payload: { tilt: [30, 0, 0] } });
    expect(tip.label).toBe('+30° about X');
    expect(tip.model).toBeInstanceOf(Float32Array);
    const quarter = tiltChange(ed.mapId.value, t, 'ring', 92);
    expect(quarter.command).toMatchObject({ payload: { tilt: [0, 0, 0], rot: (owner.inst.rot + 1) % 4 } });
    expect(tiltChange(ed.mapId.value, t, 'rz', 5).command).toBeNull();
    // loose bricks still get the single quarter-turn ring
    const loose = s.all().find((b) => !s.ownerOf(b.id))!;
    ed.select([loose.id]);
    expect(handlesFor('rotate', gizmoTarget(ed, 'rotate')!, 4).map((h) => h.id)).toEqual(['ring']);
  });
});
