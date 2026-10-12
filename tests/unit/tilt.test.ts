import { describe, expect, it } from 'vitest';
import { expandInstances } from '../../src/core/assets/instances';
import {
  freeTransform,
  hasScale,
  hasTilt,
  isFree,
  normalizeScale,
  normalizeTilt,
  tiltMatrix,
} from '../../src/core/assets/tilt';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, paths } from '../../src/core/schema';
import { EditorState } from '../../src/editor/state';
import { gizmoTarget, handlesFor, resizeChange, tiltChange } from '../../src/editor/viewport/gizmo';

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

// one 2x4 brick standing at (4, 0, 6): box x 4..8, y 0..1.2, z 6..8
const B = [{ id: 1, type: 'brick2x4', x: 4, y: 0, z: 6, rot: 0, color: '#ff0000' }] as never;

describe('P31 free transform math', () => {
  it('turns are proper rotations', () => {
    for (const t of [
      [30, 0, 0],
      [15, 120, 75],
    ]) {
      const m = tiltMatrix(t);
      for (let i = 0; i < 3; i++) expect(Math.hypot(...m.slice(i * 3, i * 3 + 3))).toBeCloseTo(1);
    }
  });

  it('the picking ray and the renderer matrix agree with point(), turned and sized', () => {
    for (const [t, sc] of [
      [
        [0, 0, 0],
        [2, 2, 2],
      ],
      [
        [30, 0, 0],
        [1, 1, 1],
      ],
      [
        [15, 120, 75],
        [1.5, 0.5, 3],
      ],
    ] as const) {
      const f = freeTransform(B, t, sc);
      const p = [5, 1, 7];
      const q = f.point(p);
      // a ray through the drawn point, seen straight, passes through the original point at the same t
      const r = f.ray({ o: [q[0], q[1] + 10, q[2]], d: [0, -1, 0] });
      const at = [r.o[0] + r.d[0] * 10, r.o[1] + r.d[1] * 10, r.o[2] + r.d[2] * 10];
      for (const [i, v] of at.entries()) expect(v).toBeCloseTo(p[i]!);
      const M = f.model;
      const mm = [0, 1, 2].map((row) => M[row]! * p[0]! + M[4 + row]! * p[1]! + M[8 + row]! * p[2]! + M[12 + row]!);
      for (const [i, v] of mm.entries()) expect(v).toBeCloseTo(q[i]!);
    }
  });

  it('grows from the middle of the base: twice the size stays on the ground and centered', () => {
    const f = freeTransform(B, [0, 0, 0], [2, 2, 2]);
    expect(f.box[0][1]).toBeCloseTo(0);
    expect(f.box[1][1]).toBeCloseTo(2.4);
    expect((f.box[0][0] + f.box[1][0]) / 2).toBeCloseTo(6);
    expect(f.box[1][0] - f.box[0][0]).toBeCloseTo(8);
  });

  it('a quarter turn about Y matches a quarter turn of the brick grid (counter-clockwise from above)', () => {
    const f = freeTransform(B, [0, 90, 0]);
    const c = f.center;
    const q = f.point([c[0] + 1, c[1], c[2]]);
    expect(q[0] - c[0]).toBeCloseTo(0);
    expect(q[2] - c[2]).toBeCloseTo(-1);
  });

  it('keeps angles in -180..180 and sizes in 0.1..10', () => {
    expect(normalizeTilt([190, -200, 360])).toEqual([-170, 160, 0]);
    expect(normalizeScale([0.01, 2.345, 50])).toEqual([0.1, 2.35, 10]);
    expect(hasTilt([0, 0, 0])).toBe(false);
    expect(hasScale([1, 1, 1])).toBe(false);
    expect(isFree({ scale: [1, 2, 1] })).toBe(true);
    expect(isFree({})).toBe(false);
  });
});

describe('P31 instance.transform', () => {
  it('turns an asset freely, leaves it out of the grid rules, and straightening brings the rules back', () => {
    const ed = editor();
    const [e] = expandInstances(ed.store, ed.mapId.value);
    expect(e).toBeTruthy();
    const map = ed.mapId.value;
    const id = e!.inst.id;
    expect(ed.exec({ type: 'instance.transform', payload: { map, instance: id, tilt: [30, 0, 45] } }).ok).toBe(true);
    expect(instOf(ed, id).tilt).toEqual([30, 0, 45]);
    const s = ed.scene.value!;
    expect(s.free.has(id)).toBe(true);
    // the box around it grew (turned corners stick out)
    const [a, b] = freeTransform(e!.bricks, [30, 0, 45]).box;
    const [a0, b0] = freeTransform(e!.bricks).box;
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
    expect(ed.exec({ type: 'instance.transform', payload: { map, instance: id, tilt: [0, 0, 0] } }).ok).toBe(true);
    expect(instOf(ed, id).tilt).toBeUndefined();
    expect(ed.scene.value!.free.has(id)).toBe(false);
  });

  it('picks a turned asset where it is drawn, not where it would stand', () => {
    const ed = editor();
    const [e] = expandInstances(ed.store, ed.mapId.value);
    const map = ed.mapId.value;
    ed.exec({ type: 'instance.transform', payload: { map, instance: e!.inst.id, tilt: [0, 45, 0] } });
    const s = ed.scene.value!;
    const pivot = freeTransform(e!.bricks).center;
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
    expect(tip.command).toMatchObject({ type: 'instance.transform', payload: { tilt: [30, 0, 0] } });
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

describe('P31 Resize on a whole asset', () => {
  it('shows side, top and corner handles, grows in 5% steps, and normal size goes back on the grid', () => {
    const ed = editor();
    const s = ed.scene.value!;
    const owner = s.ownerOf(s.all().find((b) => s.ownerOf(b.id))!.id)!;
    ed.select(owner.bricks.map((b) => b.id));
    const t = gizmoTarget(ed, 'resize')!;
    expect(t).toMatchObject({ kind: 'bricks', inst: { id: owner.inst.id, scale: [1, 1, 1] } });
    expect(handlesFor('resize', t, 4).map((h) => h.id)).toEqual(['+x', '-x', '+z', '-z', '+y', 'all']);
    const tall = resizeChange(ed.mapId.value, t, '+y', 100);
    expect(tall.command).toMatchObject({ type: 'instance.transform', payload: { scale: [1, expect.any(Number), 1] } });
    expect(ed.exec(tall.command!).ok).toBe(true);
    expect(ed.scene.value!.free.has(owner.inst.id)).toBe(true);
    const even = resizeChange(ed.mapId.value, gizmoTarget(ed, 'resize')!, 'all', 3);
    const sc = (even.command as { payload: { scale: number[] } }).payload.scale;
    expect(sc[0]).toBe(sc[2]);
    expect(sc[0]).toBeGreaterThan(1);
    expect((sc[0]! * 100) % 5).toBeCloseTo(0);
    // Reset size
    expect(
      ed.exec({
        type: 'instance.transform',
        payload: { map: ed.mapId.value, instance: owner.inst.id, scale: [1, 1, 1] },
      }).ok,
    ).toBe(true);
    expect(ed.scene.value!.free.has(owner.inst.id)).toBe(false);
  });
});
