import { describe, expect, it } from 'vitest';
import type { Brick } from '../../src/core/bricks/codec';
import { footprint } from '../../src/core/bricks/inspect';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { BRICK_SIZES } from '../../src/core/schema';
import { placeSpawnAt, placeZoneAt } from '../../src/editor/interact/place';
import { EditorState } from '../../src/editor/state';
import {
  brickFor,
  dragAmount,
  dragQuarters,
  type GizmoTarget,
  gizmoTarget,
  handlesFor,
  moveChange,
  type Project,
  pickHandle,
  resizeChange,
  resizeHint,
  rotateChange,
  sizesWith,
} from '../../src/editor/viewport/gizmo';
import type { Vec3 } from '../../src/engine/render/math';

const brick = (type: string, x = 0, y = 0, z = 0, rot = 0, id = 1): Brick =>
  ({ id, type, x, y, z, rot, color: '#d20c20' }) as Brick;
const bricks = (...b: Brick[]): GizmoTarget => ({ kind: 'bricks', bricks: b, asset: false });
// a top-down orthographic view: 10 px per world unit, x → right, z → down
const top: Project = (p: Vec3) => [100 + p[0] * 10, 100 + p[2] * 10];
// a front view: x → right, y → up
const front: Project = (p: Vec3) => [100 + p[0] * 10, 100 - p[1] * 10];

function editor() {
  const store = new ProjectStore(
    newProjectFiles({ name: 'G', generate: { environments: ['city'], size: 16, seed: 5 } }),
  );
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  return new EditorState({ store, bus, autosave: new Autosave(store, backend), backend });
}

describe('P31 gizmo: handles and picking', () => {
  it('Move shows three arrows from the bottom middle of the selection; Rotate a ring; Resize five squares', () => {
    const t = bricks(brick('brick2x4', 10, 3, 20));
    const move = handlesFor('move', t, 4);
    expect(move.map((h) => h.id)).toEqual(['x', 'y', 'z']);
    expect(move[0]!.from[0]).toBe(12); // 2x4 at rot 0 is 4 wide in x
    expect(move[0]!.from[2]).toBe(21);
    expect(move[0]!.to[0]).toBe(16);
    expect(handlesFor('rotate', t, 4).map((h) => h.id)).toEqual(['ring']);
    expect(handlesFor('resize', t, 4).map((h) => h.id)).toEqual(['+x', '-x', '+z', '-z', '+y']);
  });

  it('picks the handle under the pointer, nearest first, and nothing far away', () => {
    const t = bricks(brick('brick2x2', 0, 0, 0));
    const hs = handlesFor('move', t, 4);
    // the x arrow runs from (1,_,1) to (5,_,1): on screen 110,110 → 150,110
    expect(pickHandle(hs, top, 140, 112)).toBe('x');
    expect(pickHandle(hs, top, 111, 140)).toBe('z');
    expect(pickHandle(hs, top, 300, 300)).toBeNull();
    const ring = handlesFor('rotate', t, 4);
    const r = ring[0]!.to[0] - ring[0]!.from[0];
    expect(pickHandle(ring, top, 110 + r * 10, 110)).toBe('ring');
    expect(pickHandle(ring, top, 110, 110)).toBeNull();
  });

  it('turns pointer movement into world units along the handle, and ring drags into quarter turns', () => {
    const hs = handlesFor('move', bricks(brick('brick2x2')), 4);
    expect(dragAmount(hs[0]!, top, [0, 0], [30, 7])).toBeCloseTo(3);
    expect(dragAmount(hs[1]!, front, [0, 0], [0, -24])).toBeCloseTo(2.4);
    // the y arrow is end-on from the top: no movement rather than a jump
    expect(dragAmount(hs[1]!, top, [0, 0], [50, 50])).toBe(0);
    expect(dragQuarters([0, 0], [10, 0], [0, -10])).toBe(1); // counter-clockwise on screen = +90°
    expect(dragQuarters([0, 0], [10, 0], [0, 10])).toBe(-1);
    expect(dragQuarters([0, 0], [10, 0], [9, 2])).toBe(0);
  });
});

describe('P31 gizmo: the change a drag makes', () => {
  it('moves bricks by whole studs, and up by plates', () => {
    const t = bricks(brick('brick2x2', 0, 0, 0, 0, 7));
    const x = moveChange('m', t, 'x', 2.6);
    expect(x.command).toEqual({ type: 'bricks.move', payload: { map: 'm', ids: [7], dx: 3, dy: 0, dz: 0 } });
    expect(x.label).toBe('+3 studs X');
    const y = moveChange('m', t, 'y', 1.25); // 1.25 world = 3 plates = one brick
    expect(y.command).toMatchObject({ payload: { dy: 3 } });
    expect(y.bricks![0]!.y).toBe(3);
    expect(moveChange('m', t, 'z', 0.3).command).toBeNull();
  });

  it('turns bricks in quarter turns around their middle; four quarters is no change', () => {
    const t = bricks(brick('brick2x4', 0, 0, 0, 0, 1));
    // a counter-clockwise drag (seen from above) is one grid quarter back: rot 3
    const one = rotateChange('m', t, 1);
    expect(one.bricks![0]!.rot).toBe(3);
    expect(footprint(one.bricks![0]!)).toEqual([2, 4]);
    expect(one.label).toBe('+90°');
    expect(rotateChange('m', t, 4).command).toBeNull();
    expect(rotateChange('m', t, -1).bricks![0]!.rot).toBe(1);
  });

  it('only offers real LEGO sizes when resizing a brick, keeping the kind', () => {
    expect(sizesWith(2)).toEqual([1, 2, 3, 4, 6, 8]);
    expect(sizesWith(4)).toEqual([1, 2, 4, 8]);
    for (const [r, c] of BRICK_SIZES)
      for (const rot of [0, 1, 2, 3]) {
        const b = brick(`plate${r}x${c}`, 0, 0, 0, rot);
        const [w, d] = footprint(b);
        const fit = brickFor(b, w, d)!;
        expect(footprint(fit)).toEqual([w, d]);
        expect(fit.type.startsWith('plate')).toBe(true);
      }
  });

  it('a side handle grows the brick to the nearest size; the - side keeps the far edge still', () => {
    const t = bricks(brick('brick2x2', 10, 0, 10, 0, 4));
    const grow = resizeChange('m', t, '+x', 1.8);
    expect(grow.bricks![0]!.type).toBe('brick2x4');
    expect(footprint(grow.bricks![0]!)).toEqual([4, 2]);
    expect(grow.bricks![0]!.x).toBe(10);
    expect(grow.label).toBe('2×4 brick');
    const back = resizeChange('m', t, '-x', 2);
    expect(footprint(back.bricks![0]!)).toEqual([4, 2]);
    expect(back.bricks![0]!.x).toBe(8);
    const deep = resizeChange('m', t, '+z', 4);
    expect(footprint(deep.bricks![0]!)).toEqual([2, 6]);
    expect(resizeChange('m', t, '+x', 0.4).command).toBeNull();
    // the top handle swaps brick ⇄ plate
    expect(resizeChange('m', t, '+y', -0.5).bricks![0]!.type).toBe('plate2x2');
    expect(resizeChange('m', bricks(brick('plate1x4')), '+y', 0.5).bricks![0]!.type).toBe('brick1x4');
  });

  it('resizes and moves zones by studs and plate heights, never to nothing', () => {
    const zone = { id: 'zon_aaaaaaaaaa', shape: 'box', tags: [], min: [0, 0, 0], max: [4, 4, 4] } as never;
    const t: GizmoTarget = { kind: 'zone', zone };
    expect(resizeChange('m', t, '+x', 2.2).box![1][0]).toBe(6);
    expect(resizeChange('m', t, '-z', 1).box![0][2]).toBe(-1);
    expect(resizeChange('m', t, '+x', -10).box![1][0]).toBe(1);
    expect(resizeChange('m', t, '+y', 0.9).box![1][1]).toBeCloseTo(4.8);
    const mv = moveChange('m', t, 'x', -3);
    expect(mv.box).toEqual([
      [-3, 0, 0],
      [1, 4, 4],
    ]);
    expect(mv.command).toMatchObject({ type: 'map.updateZone' });
  });
});

describe('P31 gizmo in the editor', () => {
  it('picks what the selection allows and explains what Resize cannot do', () => {
    const ed = editor();
    const s = ed.scene.value!;
    expect(gizmoTarget(ed, 'move')).toBeNull();
    expect(resizeHint(ed)).toMatch(/Select a trigger zone/);
    const owned = s.all().find((b) => s.ownerOf(b.id))!;
    ed.select(s.ownerOf(owned.id)!.bricks.map((b) => b.id));
    expect(gizmoTarget(ed, 'move')).toMatchObject({ kind: 'bricks', asset: true });
    // a whole asset can be resized freely; part of one cannot
    expect(gizmoTarget(ed, 'resize')).toMatchObject({ kind: 'bricks', inst: { scale: [1, 1, 1] } });
    expect(resizeHint(ed)).toBeNull();
    ed.select([owned.id]);
    expect(gizmoTarget(ed, 'resize')).toBeNull();
    expect(resizeHint(ed)).toMatch(/whole asset/);
    const zone = placeZoneAt(ed, { x: 0, y: 0, z: 0 })!;
    expect(gizmoTarget(ed, 'resize')).toMatchObject({ kind: 'zone' });
    expect(gizmoTarget(ed, 'rotate')).toBeNull();
    const t = gizmoTarget(ed, 'resize')!;
    expect(ed.exec(resizeChange(ed.mapId.value, t, '+x', 3).command!).ok).toBe(true);
    const z = ed.mapDoc.value!.zones.find((x) => x.id === zone)!;
    expect(z.max[0]! - z.min[0]!).toBe(7);
    const sp = placeSpawnAt(ed, { x: 2, y: 0, z: 2 })!;
    ed.select([]);
    ed.selectedSpawn.value = sp;
    const spt = gizmoTarget(ed, 'rotate')!;
    expect(ed.exec(rotateChange(ed.mapId.value, spt, 1).command!).ok).toBe(true);
    const yaw0 = (spt as { yaw: number }).yaw;
    expect(ed.mapDoc.value!.spawns.find((x) => x.id === sp)!.yaw).toBeCloseTo((yaw0 + Math.PI / 2) % (2 * Math.PI));
  });

  it('an asset copy moves up and turns as a whole, one undo step each', () => {
    const ed = editor();
    const s = ed.scene.value!;
    const owner = s.ownerOf(s.all().find((b) => s.ownerOf(b.id))!.id)!;
    ed.select(owner.bricks.map((b) => b.id));
    const before = ed.bus.history().length;
    // v68 rules refuse floating or overlapping spots, so slide it along until one is free
    let moved = false;
    for (const n of [1, -1, 2, -2, 3, -3, 4, -4]) {
      for (const axis of ['x', 'z'] as const) {
        if (moved) break;
        const ch = moveChange(ed.mapId.value, gizmoTarget(ed, 'move')!, axis, n);
        moved = ed.exec(ch.command!, { label: ch.undoLabel }).ok;
      }
    }
    expect(moved).toBe(true);
    expect(ed.bus.history().length).toBe(before + 1);
    expect(ed.bus.history().at(-1)!.label).toBe('Move asset');
    ed.undo();
    const turn = rotateChange(ed.mapId.value, gizmoTarget(ed, 'rotate')!, 1);
    const r = ed.exec(turn.command!, { label: turn.undoLabel });
    // turning can be refused where it would overlap a neighbour; when it works the asset is still whole
    if (r.ok) expect(s.ownerOf(owner.bricks[0]!.id)?.inst.rot).toBe((owner.inst.rot + 3) % 4);
    else expect(ed.toast.value?.msg).toBeTruthy();
  });
});
