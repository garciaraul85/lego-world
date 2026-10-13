import {
  bricksBox,
  freeTransform,
  hasScale,
  hasTilt,
  isFree,
  normalizeScale,
  normalizeTilt,
  type Scale,
  type Tilt,
} from '../../core/assets/tilt';
import type { Brick } from '../../core/bricks/codec';
import { footprint } from '../../core/bricks/inspect';
import { pivotOf, rotateQuarter } from '../../core/bricks/transform';
import type { Command } from '../../core/commands';
import { BRICK_SIZES, type MapDoc } from '../../core/schema';

type Zone = MapDoc['zones'][number];

import type { Vec3 } from '../../engine/render/math';
import { mapItems } from '../interact/place';
import type { EditorState } from '../state';

/**
 * P31 transform gizmos, like in 3D tools: pick Move, Rotate or Resize, and the selection shows handles.
 * Move: three arrows (red X, green up, blue Z). Rotate: a ring around the vertical axis, in quarter turns.
 * Resize: square handles on the sides and top. Dragging a handle previews the change; letting go makes
 * one command (one undo step). Everything snaps to studs and plates, so v68's brick rules still hold.
 *
 * Pure geometry and command building live here (unit-tested); the 3D view draws and drags.
 */
export type GizmoMode = 'move' | 'rotate' | 'resize';

export type GizmoTarget =
  | {
      kind: 'bricks';
      bricks: Brick[];
      asset: boolean;
      /** exactly one whole asset is selected: it can turn freely about X, Y and Z */
      inst?: { id: string; rot: number; tilt: Tilt; scale: Scale };
      /** in the Asset studio: the selected bricks as a part of the asset (index null = becomes a new part) */
      part?: { index: number | null; ids: number[]; tilt: Tilt; scale: Scale };
    }
  | { kind: 'zone'; zone: Zone }
  | { kind: 'spawn'; id: string; pos: Vec3; yaw: number }
  | { kind: 'item'; id: string; pos: Vec3 };

/** ring = turn about Y (quarter turns for bricks, free for an asset); rx / rz = free turns about X / Z */
export type HandleId = 'x' | 'y' | 'z' | 'ring' | 'rx' | 'rz' | '+x' | '-x' | '+z' | '-z' | '+y' | 'all';
export const isRing = (id: HandleId) => id === 'ring' || id === 'rx' || id === 'rz';

export type Handle = {
  id: HandleId;
  /** axis handles: shaft from → to; face handles: from = to = the handle's center */
  from: Vec3;
  to: Vec3;
  /** world direction a drag moves along (ring: unused) */
  dir: Vec3;
  color: [number, number, number];
};

export const AXIS_COLOR = {
  x: [0.95, 0.32, 0.3] as [number, number, number],
  y: [0.42, 0.86, 0.36] as [number, number, number],
  z: [0.3, 0.56, 1] as [number, number, number],
  hot: [1, 0.85, 0.25] as [number, number, number],
};

const PLATE = 0.4;
const brickTop = (b: Brick) => b.y * PLATE + (b.type.startsWith('brick') ? 1.2 : 0.4);

/** What the gizmo works on: the selection, or null when there is nothing (or nothing this mode can change). */
export function gizmoTarget(ed: EditorState, mode: GizmoMode): GizmoTarget | null {
  const m = ed.mapDoc.value;
  if (!m) return null;
  const zone = m.zones.find((z) => z.id === ed.selectedZone.value);
  if (zone) return mode === 'rotate' ? null : { kind: 'zone', zone };
  const sp = m.spawns.find((s) => s.id === ed.selectedSpawn.value);
  if (sp) return mode === 'resize' ? null : { kind: 'spawn', id: sp.id, pos: [...sp.pos] as Vec3, yaw: sp.yaw };
  const it = mapItems(ed).find((i) => i.id === ed.selectedItem.value);
  if (it) return mode === 'move' ? { kind: 'item', id: it.id, pos: [...it.pos] as Vec3 } : null;
  const bricks = ed.selectedBricks.value;
  if (!bricks.length) return null;
  const s = ed.scene.value;
  const asset = !!s && bricks.some((b) => s.ownerOf(b.id));
  const owner = s?.ownerOf(bricks[0]!.id);
  const whole =
    owner && bricks.length === owner.bricks.length && bricks.every((b) => s!.ownerOf(b.id)?.inst.id === owner.inst.id);
  // Asset studio: selected bricks turn and size freely as a part of the asset
  if (s?.parts && !asset && mode !== 'move') {
    const ids = bricks.map((b) => b.id);
    const found = s.partOf(ids);
    // one loose brick that is not a part yet keeps real LEGO sizes in Resize
    if (!(mode === 'resize' && !found && bricks.length === 1))
      return {
        kind: 'bricks',
        bricks,
        asset,
        part: {
          index: found?.index ?? null,
          ids,
          tilt: (found?.tilt ?? [0, 0, 0]) as Tilt,
          scale: (found?.scale ?? [1, 1, 1]) as Scale,
        },
      };
  }
  // Resize: a whole asset (free size) or one loose brick (LEGO sizes)
  if (mode === 'resize' && !whole && (bricks.length !== 1 || asset)) return null;
  if (!whole) return { kind: 'bricks', bricks, asset };
  return {
    kind: 'bricks',
    bricks,
    asset,
    inst: {
      id: owner.inst.id,
      rot: owner.inst.rot,
      tilt: (owner.inst.tilt ?? [0, 0, 0]) as Tilt,
      scale: (owner.inst.scale ?? [1, 1, 1]) as Scale,
    },
  };
}

/** Why Resize shows no handles for this selection (shown in the tool hint). */
export function resizeHint(ed: EditorState): string | null {
  if (ed.selectedZone.value) return null;
  const bricks = ed.selectedBricks.value;
  if (ed.selectedSpawn.value || ed.selectedItem.value) return 'Spawn points, sounds and signs have no size to change.';
  if (!bricks.length) return 'Select a trigger zone or a single brick to resize it.';
  const s = ed.scene.value;
  const owner = s && bricks.length ? s.ownerOf(bricks[0]!.id) : null;
  if (owner && bricks.length === owner.bricks.length) return null;
  if (owner) return 'Select the whole asset (click it without Alt) to resize it.';
  if (bricks.length > 1)
    return 'Resize works on a whole asset or one brick (Alt-click selects a single brick); several loose bricks keep their size.';
  return null;
}

export function targetBox(t: GizmoTarget): [Vec3, Vec3] {
  if (t.kind === 'zone') return [[...t.zone.min] as Vec3, [...t.zone.max] as Vec3];
  if (t.kind === 'spawn')
    return [
      [t.pos[0] - 0.45, t.pos[1], t.pos[2] - 0.45],
      [t.pos[0] + 0.45, t.pos[1] + 1.8, t.pos[2] + 0.45],
    ];
  if (t.kind === 'item')
    return [
      [t.pos[0] - 0.4, t.pos[1] - 0.4, t.pos[2] - 0.4],
      [t.pos[0] + 0.4, t.pos[1] + 0.4, t.pos[2] + 0.4],
    ];
  const fr = t.inst ?? t.part;
  if (fr && isFree(fr)) return freeTransform(t.bricks, fr.tilt, fr.scale).box as [Vec3, Vec3];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const b of t.bricks) {
    const [w, d] = footprint(b);
    min[0] = Math.min(min[0], b.x);
    min[1] = Math.min(min[1], b.y * PLATE);
    min[2] = Math.min(min[2], b.z);
    max[0] = Math.max(max[0], b.x + w);
    max[1] = Math.max(max[1], brickTop(b));
    max[2] = Math.max(max[2], b.z + d);
  }
  return [min, max];
}

/** Where the gizmo sits: the middle of the selection's box, so it stays in view when the object is framed. */
export function gizmoOrigin(t: GizmoTarget): Vec3 {
  const [min, max] = targetBox(t);
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

/** The handles for a mode. `size` is the arrow length in world units (the view keeps it a constant on-screen size). */
export function handlesFor(mode: GizmoMode, t: GizmoTarget, size: number): Handle[] {
  const o = gizmoOrigin(t);
  const [min, max] = targetBox(t);
  if (mode === 'move') {
    const c = o;
    return [
      { id: 'x', from: c, to: [c[0] + size, c[1], c[2]], dir: [1, 0, 0], color: AXIS_COLOR.x },
      { id: 'y', from: c, to: [c[0], c[1] + size, c[2]], dir: [0, 1, 0], color: AXIS_COLOR.y },
      { id: 'z', from: c, to: [c[0], c[1], c[2] + size], dir: [0, 0, 1], color: AXIS_COLOR.z },
    ];
  }
  if (mode === 'rotate') {
    // a turned asset keeps the ring size of its straight shape, so the rings do not balloon
    const [bmin, bmax] = t.kind === 'bricks' && (t.inst || t.part) ? bricksBox(t.bricks) : [min, max];
    const r = Math.max(size * 0.8, Math.hypot(bmax[0] - bmin[0], bmax[2] - bmin[2]) / 2 + size * 0.15);
    const y: Handle = { id: 'ring', from: o, to: [o[0] + r, o[1], o[2]], dir: [0, 1, 0], color: AXIS_COLOR.y };
    if (t.kind !== 'bricks' || !(t.inst || t.part)) return [y];
    // a whole asset turns freely: red ring about X, green about Y, blue about Z
    const r2 = r * 0.9;
    return [
      y,
      { id: 'rx', from: o, to: [o[0], o[1] + r2, o[2]], dir: [1, 0, 0], color: AXIS_COLOR.x },
      { id: 'rz', from: o, to: [o[0] + r2 * 0.95, o[1], o[2]], dir: [0, 0, 1], color: AXIS_COLOR.z },
    ];
  }
  const cy = (min[1] + max[1]) / 2;
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const face = (id: HandleId, p: Vec3, dir: Vec3, color: [number, number, number]): Handle => ({
    id,
    from: p,
    to: p,
    dir,
    color,
  });
  return [
    face('+x', [max[0], cy, cz], [1, 0, 0], AXIS_COLOR.x),
    face('-x', [min[0], cy, cz], [-1, 0, 0], AXIS_COLOR.x),
    face('+z', [cx, cy, max[2]], [0, 0, 1], AXIS_COLOR.z),
    face('-z', [cx, cy, min[2]], [0, 0, -1], AXIS_COLOR.z),
    face('+y', [cx, max[1], cz], [0, 1, 0], AXIS_COLOR.y),
    // a whole asset also grows evenly from the top corner (white)
    ...(t.kind === 'bricks' && (t.inst || t.part)
      ? [
          face(
            'all',
            [max[0], max[1], max[2]],
            [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
            [0.95, 0.95, 0.95],
          ),
        ]
      : []),
  ];
}

/** Points of the rotate ring (a closed polyline). */
/** Points of a rotate ring (a closed polyline) in the plane across its axis. */
export function ringPoints(h: Handle, n = 48): Vec3[] {
  const r = Math.hypot(h.to[0] - h.from[0], h.to[1] - h.from[1], h.to[2] - h.from[2]);
  // two directions across the axis
  const [u, v]: [Vec3, Vec3] = h.dir[0]
    ? [
        [0, 1, 0],
        [0, 0, 1],
      ]
    : h.dir[2]
      ? [
          [1, 0, 0],
          [0, 1, 0],
        ]
      : [
          [1, 0, 0],
          [0, 0, 1],
        ];
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    return [h.from[0] + u[0] * c + v[0] * s, h.from[1] + u[1] * c + v[1] * s, h.from[2] + u[2] * c + v[2] * s] as Vec3;
  });
}

// ---------- picking (screen space) ----------

export type Project = (p: Vec3) => [number, number] | null;

function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0;
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

/** The handle under a screen point, within `tol` pixels (nearest wins). */
export function pickHandle(handles: Handle[], project: Project, px: number, py: number, tol = 10): HandleId | null {
  let best: { id: HandleId; d: number } | null = null;
  for (const h of handles) {
    let d = Infinity;
    if (isRing(h.id)) {
      const pts = ringPoints(h).map(project);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a && b) d = Math.min(d, segDist(px, py, a, b));
      }
    } else {
      const a = project(h.from);
      const b = project(h.to);
      if (!a || !b) continue;
      d = h.from === h.to ? Math.hypot(px - a[0], py - a[1]) - 4 : segDist(px, py, a, b);
    }
    if (d <= tol && (!best || d < best.d)) best = { id: h.id, d };
  }
  return best?.id ?? null;
}

/**
 * How far a drag went along a handle, in world units: the pointer movement projected on the handle's
 * on-screen direction, divided by how many pixels one world unit covers there.
 */
export function dragAmount(h: Handle, project: Project, start: [number, number], now: [number, number]): number {
  const a = project(h.from);
  const b = project([h.from[0] + h.dir[0], h.from[1] + h.dir[1], h.from[2] + h.dir[2]]);
  if (!a || !b) return 0;
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const ppu = Math.hypot(sx, sy);
  if (ppu < 1e-3) return 0;
  return ((now[0] - start[0]) * sx + (now[1] - start[1]) * sy) / (ppu * ppu);
}

/** Quarter turns for a ring drag: the angle swept around the gizmo's center on screen, in 90° steps. */
export function dragQuarters(center: [number, number], start: [number, number], now: [number, number]): number {
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const a1 = Math.atan2(now[1] - center[1], now[0] - center[0]);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  // screen y points down, so a clockwise drag on screen is a negative turn seen from above
  return Math.round(-d / (Math.PI / 2)) || 0;
}

/**
 * Degrees turned by dragging around a ring: the angle swept around the gizmo's center on screen, positive
 * counter-clockwise as seen from the side the axis points to. `facing` is +1 when the axis points toward the
 * camera, -1 when away.
 */
export function dragDegrees(center: [number, number], start: [number, number], now: [number, number], facing: number) {
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const a1 = Math.atan2(now[1] - center[1], now[0] - center[0]);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return ((-d * 180) / Math.PI) * (facing < 0 ? -1 : 1);
}

/** Free turns snap to this many degrees. */
export const TILT_STEP = 15;

// ---------- the change a drag makes ----------

export type GizmoChange = {
  /** bricks as they will be (preview) */
  bricks?: Brick[];
  /** a zone's new box, a spawn's or item's new position/yaw (preview) */
  box?: [Vec3, Vec3];
  pos?: Vec3;
  yaw?: number;
  /** a freely turned or sized asset or part: its turn and size while dragging (preview) */
  free?: { tilt: Tilt; scale: Scale };
  /** Asset studio: the part change to save into the asset (instead of a command) */
  part?: { index: number | null; ids: number[]; tilt: Tilt; scale: Scale };
  /** what to tell the user while dragging ("+3 studs", "90°", "2×4 brick") */
  label: string;
  /** null = no change (yet) */
  command: Command | null;
  undoLabel: string;
};

const snap = (v: number, step: number) => Math.round(v / step) * step;
const fmt = (n: number) => `${n > 0 ? '+' : ''}${Number(n.toFixed(2))}`;

export function moveChange(map: string, t: GizmoTarget, axis: 'x' | 'y' | 'z', amount: number): GizmoChange {
  const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  if (t.kind === 'bricks') {
    const n = axis === 'y' ? Math.round(amount / PLATE) : Math.round(amount);
    const d = { dx: axis === 'x' ? n : 0, dy: axis === 'y' ? n : 0, dz: axis === 'z' ? n : 0 };
    const unit = axis === 'y' ? (Math.abs(n) === 1 ? 'plate' : 'plates') : Math.abs(n) === 1 ? 'stud' : 'studs';
    return {
      bricks: t.bricks.map((b) => ({ ...b, x: b.x + d.dx, y: b.y + d.dy, z: b.z + d.dz })),
      label: `${fmt(n)} ${unit} ${axis === 'y' ? 'up' : axis.toUpperCase()}`,
      command: n ? { type: 'bricks.move', payload: { map, ids: t.bricks.map((b) => b.id), ...d } } : null,
      undoLabel: t.asset ? 'Move asset' : t.bricks.length === 1 ? 'Move brick' : `Move ${t.bricks.length} bricks`,
    };
  }
  if (t.kind === 'zone') {
    const n = snap(amount, axis === 'y' ? PLATE : 1);
    const min = [...t.zone.min] as Vec3;
    const max = [...t.zone.max] as Vec3;
    min[i] = +(min[i]! + n).toFixed(3);
    max[i] = +(max[i]! + n).toFixed(3);
    return {
      box: [min, max],
      label: `${fmt(n)} ${axis === 'y' ? 'up' : axis.toUpperCase()}`,
      command: n ? { type: 'map.updateZone', payload: { map, zone: t.zone.id, patch: { min, max } } } : null,
      undoLabel: 'Move trigger zone',
    };
  }
  const step = axis === 'y' ? PLATE : t.kind === 'item' ? 0.5 : 1;
  const n = snap(amount, step);
  const pos = [...t.pos] as Vec3;
  pos[i] = +(pos[i]! + n).toFixed(3);
  if (axis === 'y') pos[1] = Math.max(0, pos[1]);
  const command: Command | null = !n
    ? null
    : t.kind === 'spawn'
      ? { type: 'map.updateSpawn', payload: { map, spawn: t.id, pos } }
      : { type: 'item.update', payload: { map, id: t.id, patch: { pos } } };
  return {
    pos,
    label: `${fmt(n)} ${axis === 'y' ? 'up' : axis.toUpperCase()}`,
    command,
    undoLabel: t.kind === 'spawn' ? 'Move spawn point' : 'Move item',
  };
}

export function rotateChange(map: string, t: GizmoTarget, quarters: number): GizmoChange {
  // spawns face (sin yaw, cos yaw): +yaw turns the same way as the drag
  const k = ((quarters % 4) + 4) % 4;
  // bricks: a drag that turns counter-clockwise on screen (seen from above) is −1 grid quarter
  // (rotateQuarter / rot + 1 map +x to +z)
  const kb = ((-quarters % 4) + 4) % 4;
  const deg = `${quarters * 90 > 0 ? '+' : ''}${quarters * 90}°`;
  if (t.kind === 'spawn') {
    const yaw = (((t.yaw + k * (Math.PI / 2)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return {
      yaw,
      pos: t.pos,
      label: deg,
      command: k ? { type: 'map.updateSpawn', payload: { map, spawn: t.id, yaw } } : null,
      undoLabel: 'Turn spawn point',
    };
  }
  if (t.kind !== 'bricks') return { label: deg, command: null, undoLabel: '' };
  const pivot = pivotOf(t.bricks);
  let out = t.bricks;
  for (let i = 0; i < kb; i++) out = rotateQuarter(out, pivot);
  return {
    bricks: out,
    label: deg,
    command: kb
      ? { type: 'bricks.update', payload: { map, bricks: out.map((b) => ({ id: b.id, x: b.x, z: b.z, rot: b.rot })) } }
      : null,
    undoLabel: t.asset ? 'Turn asset' : 'Turn bricks',
  };
}

/** Brick type with the world footprint w×d (keeping the kind), and the rotation that gives it. */
export function brickFor(b: Brick, w: number, d: number): { type: string; rot: number } | null {
  const kind = /^(brick|plate|tile)/.exec(b.type)![1]!;
  for (const [r, c] of BRICK_SIZES) {
    // even rot: footprint = [cols, rows]; odd rot: [rows, cols]
    if (c === w && r === d) return { type: `${kind}${r}x${c}`, rot: b.rot % 2 ? (b.rot + 1) % 4 : b.rot };
    if (r === w && c === d) return { type: `${kind}${r}x${c}`, rot: b.rot % 2 ? b.rot : (b.rot + 1) % 4 };
  }
  return null;
}

/** The sizes a side can take with the other side fixed, e.g. widths that fit a depth of 2. */
export function sizesWith(other: number): number[] {
  const out = new Set<number>();
  for (const [r, c] of BRICK_SIZES) {
    if (r === other) out.add(c);
    if (c === other) out.add(r);
  }
  return [...out].sort((a, b) => a - b);
}

/** Free size steps for assets (5%). */
export const SCALE_STEP = 0.05;

/** Resizing a whole asset: a side grows from the middle (both sides), the top grows up, the corner grows evenly. */
export function scaleChange(map: string, t: GizmoTarget, handle: HandleId, amount: number): GizmoChange {
  const f = t.kind === 'bricks' ? (t.inst ?? t.part) : undefined;
  if (t.kind !== 'bricks' || !f) return { label: '', command: null, undoLabel: '' };
  const [a, b] = bricksBox(t.bricks);
  const ext = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const cur = f.scale;
  const snapS = (v: number) => Math.max(0.1, Math.round(v / SCALE_STEP) * SCALE_STEP);
  let next: Scale;
  if (handle === 'all') {
    // distance from the middle of the base to the top corner, at the current size
    const L = Math.hypot((ext[0]! * cur[0]) / 2, ext[1]! * cur[1], (ext[2]! * cur[2]) / 2) || 1;
    const f = Math.max(0.1, (L + amount) / L);
    next = normalizeScale(cur.map((v) => snapS(v * f)));
  } else {
    const i = handle.endsWith('x') ? 0 : handle.endsWith('y') ? 1 : 2;
    const size = ext[i]! * cur[i]!;
    const k = i === 1 ? 1 : 2;
    next = [...cur] as Scale;
    next[i] = snapS(cur[i]! * Math.max(0.05, (size + k * amount) / Math.max(0.01, size)));
    next = normalizeScale(next);
  }
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const same = next.every((v, j) => Math.abs(v - cur[j]!) < 1e-6);
  const label =
    next[0] === next[1] && next[1] === next[2]
      ? `Size ${pct(next[0])}`
      : `Width ${pct(next[0])} · Height ${pct(next[1])} · Depth ${pct(next[2])}`;
  const back = hasScale(next) || hasTilt(f.tilt) ? label : `${label} · back on the grid`;
  if (t.part)
    return {
      free: { tilt: t.part.tilt, scale: next },
      label: back,
      command: null,
      ...(same ? {} : { part: { ...t.part, scale: next } }),
      undoLabel: 'Resize part',
    };
  const inst = t.inst!;
  return {
    free: { tilt: inst.tilt, scale: next },
    label: back,
    command: same ? null : { type: 'instance.transform', payload: { map, instance: inst.id, scale: next } },
    undoLabel: hasScale(next) ? 'Resize asset' : 'Reset asset size',
  };
}

export function resizeChange(map: string, t: GizmoTarget, handle: HandleId, amount: number): GizmoChange {
  if (t.kind === 'bricks' && (t.inst || t.part)) return scaleChange(map, t, handle, amount);
  if (t.kind === 'zone') {
    const min = [...t.zone.min] as Vec3;
    const max = [...t.zone.max] as Vec3;
    const i = handle.endsWith('x') ? 0 : handle.endsWith('y') ? 1 : 2;
    const step = i === 1 ? PLATE : 1;
    const n = snap(amount, step);
    if (handle.startsWith('+')) max[i] = Math.max(+(max[i]! + n).toFixed(3), +(min[i]! + step).toFixed(3));
    else min[i] = Math.min(+(min[i]! - n).toFixed(3), +(max[i]! - step).toFixed(3));
    const size = `${+(max[0] - min[0]).toFixed(1)} × ${+(max[2] - min[2]).toFixed(1)} × ${+(max[1] - min[1]).toFixed(1)} high`;
    const same = min.every((v, j) => v === t.zone.min[j]) && max.every((v, j) => v === t.zone.max[j]);
    return {
      box: [min, max],
      label: size,
      command: same ? null : { type: 'map.updateZone', payload: { map, zone: t.zone.id, patch: { min, max } } },
      undoLabel: 'Resize trigger zone',
    };
  }
  if (t.kind !== 'bricks' || t.bricks.length !== 1) return { label: '', command: null, undoLabel: '' };
  const b = t.bricks[0]!;
  const [w, d] = footprint(b);
  let next: Brick = b;
  if (handle === '+y') {
    const n = Math.round(amount / PLATE);
    const kind = n >= 1 ? 'brick' : n <= -1 ? 'plate' : null;
    if (kind && !b.type.startsWith(kind)) next = { ...b, type: b.type.replace(/^(brick|plate|tile)/, kind) };
  } else {
    const alongX = handle.endsWith('x');
    const cur = alongX ? w : d;
    const choices = sizesWith(alongX ? d : w);
    const want = cur + amount;
    const size = choices.reduce((a, c) => (Math.abs(c - want) < Math.abs(a - want) ? c : a), cur);
    const fit = brickFor(b, alongX ? size : w, alongX ? d : size);
    if (fit && size !== cur) {
      next = { ...b, ...fit };
      // the - handles grow toward -x / -z: the far side stays put
      if (handle === '-x') next.x = b.x + w - size;
      if (handle === '-z') next.z = b.z + d - size;
    }
  }
  const [nw, nd] = footprint(next);
  const kind = /^(brick|plate|tile)/.exec(next.type)![1];
  return {
    bricks: [next],
    label: `${Math.min(nw, nd)}×${Math.max(nw, nd)} ${kind}`,
    command:
      next === b
        ? null
        : {
            type: 'bricks.update',
            payload: { map, bricks: [{ id: b.id, type: next.type, rot: next.rot, x: next.x, z: next.z }] },
          },
    undoLabel: 'Resize brick',
  };
}

/** Turning a whole asset (or a studio part) freely about one axis (degrees, snapped to TILT_STEP). */
export function tiltChange(map: string, t: GizmoTarget, h: HandleId, degrees: number): GizmoChange {
  const f = t.kind === 'bricks' ? (t.inst ?? t.part) : undefined;
  if (t.kind !== 'bricks' || !f) return { label: '', command: null, undoLabel: '' };
  const i = h === 'rx' ? 0 : h === 'ring' ? 1 : 2;
  const step = Math.round(degrees / TILT_STEP) * TILT_STEP;
  const next = [...f.tilt] as Tilt;
  next[i] = next[i]! + step;
  const tilt = normalizeTilt(next);
  const axis = ['X', 'Y', 'Z'][i];
  const straight = !hasTilt(tilt) && !hasScale(f.scale);
  const label = `${step > 0 ? '+' : ''}${step}° about ${axis}${straight ? ' · back on the grid' : ''}`;
  if (!step) return { label, command: null, undoLabel: '' };
  if (t.part)
    return {
      free: { tilt, scale: t.part.scale },
      label,
      command: null,
      part: { ...t.part, tilt },
      undoLabel: 'Turn part',
    };
  const inst = t.inst!;
  // whole quarter turns about Y with no tilt left go back into rot: the asset is a grid asset again
  // (+90° here is a quarter turn back on the grid: rot + 1 maps +x to +z, which is −90° about Y)
  const flat = Math.abs(tilt[0]) < 1e-6 && Math.abs(tilt[2]) < 1e-6 && Math.abs(tilt[1] % 90) < 1e-6 && !!tilt[1];
  const payload = flat
    ? { map, instance: inst.id, tilt: [0, 0, 0] as Tilt, rot: (((inst.rot - tilt[1] / 90) % 4) + 4) % 4 }
    : { map, instance: inst.id, tilt };
  return {
    free: { tilt, scale: inst.scale },
    label,
    command: { type: 'instance.transform', payload },
    undoLabel: hasTilt(tilt) ? 'Turn asset freely' : 'Straighten asset',
  };
}

export function changeFor(map: string, mode: GizmoMode, t: GizmoTarget, h: HandleId, amount: number): GizmoChange {
  if (mode === 'rotate' && t.kind === 'bricks' && (t.inst || t.part)) return tiltChange(map, t, h, amount);
  if (mode === 'rotate') return rotateChange(map, t, amount);
  if (mode === 'move') return moveChange(map, t, h as 'x' | 'y' | 'z', amount);
  return resizeChange(map, t, h, amount);
}
