import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { expandAsset, rotatedFootprint } from '../../core/assets/expand';
import { type FreeGroup, freeGroupsOf } from '../../core/assets/free';
import {
  affineModel,
  bricksBox,
  type FreeTransform,
  freeAffine,
  IDENTITY,
  shiftAffine,
  transformOf,
} from '../../core/assets/tilt';
import type { Brick } from '../../core/bricks/codec';
import { footprint } from '../../core/bricks/inspect';
import type { Command } from '../../core/commands';
import { skyCycle } from '../../core/legacy/modules';
import { OrbitCamera } from '../../engine/render/camera';
import type { Vec3 } from '../../engine/render/math';
import { type LineSet, type Marker, type Overlay, type RenderBrick, Renderer } from '../../engine/render/renderer';
import { placeCommands, resolveAsset } from '../assets';
import { groupLabel } from '../categories';
import { dragPayload, endDrag, sceneHover } from '../interact/drag';
import {
  assetCorner,
  mapItems,
  placeAssetAt,
  placeItemAt,
  placeSpawnAt,
  type SceneTarget,
  selectOnly,
} from '../interact/place';
import { rayBox } from '../scene';
import type { EditorState } from '../state';
import { fullscreenDock, sceneFullscreen, setActiveView, type ViewOp, type ViewportApi, viewOp } from './active';
import {
  changeFor,
  dragAmount,
  dragDegrees,
  dragQuarters,
  type GizmoChange,
  type GizmoMode,
  type GizmoTarget,
  gizmoOrigin,
  gizmoTarget,
  type Handle,
  type HandleId,
  handlesFor,
  isRing,
  type Project,
  pickHandle,
  ringPoints,
  targetBox,
} from './gizmo';

const kindOf = (type: string) =>
  (type.startsWith('brick') ? 'brick' : type.startsWith('plate') ? 'plate' : 'tile') as RenderBrick['kind'];

export type { ViewportApi } from './active';

/** The 3D scene view: renderer + camera + the active tool's pointer handling. */
export type StudioHooks = {
  markers(): Marker[];
  onPoint(pos: [number, number, number]): void;
  /** a part of the asset was turned or sized on the plate (P31): save it into the asset */
  onPart?(p: {
    index: number | null;
    ids: number[];
    tilt: [number, number, number];
    scale: [number, number, number];
  }): void;
};

export function Viewport({
  ed,
  mode,
  api,
  studio,
  onMenu,
}: {
  ed: EditorState;
  mode: 'scene' | 'game';
  /** right-click without dragging: what was clicked and where (P31 context menus) */
  onMenu?: (t: SceneTarget, x: number, y: number) => void;
  api?: (a: ViewportApi) => void;
  /** Asset studio hooks: extra markers (sockets), and where the Spawn tool's click goes instead */
  studio?: StudioHooks;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewportApi | null>(null);
  const menuRef = useRef(onMenu);
  menuRef.current = onMenu;
  const studioRef = useRef(studio);
  studioRef.current = studio;

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch (e) {
      ed.notify(e instanceof Error ? e.message : String(e), true);
      return;
    }
    const camera = new OrbitCamera();
    let dirty = true;
    let raf = 0;
    let hover: Brick | null = null;
    let ghost: RenderBrick | null = null;
    let drag: {
      kind: 'orbit' | 'pan' | 'move' | 'zone' | 'gizmo';
      x: number;
      y: number;
      moved: boolean;
      button: number;
      start?: { x: number; z: number };
      offset?: [number, number];
      plane?: number;
    } | null = null;
    let preview: Brick[] | null = null;
    let zoneDraft: { x0: number; z0: number; x1: number; z1: number; y: number } | null = null;
    let assetGhost: Brick[] | null = null;
    let assetAt: [number, number, number] | null = null;
    // P31 transform gizmo: the handle under the pointer, and the drag in progress
    let hot: HandleId | null = null;
    // bricks drawn by the live preview of a turn or size (taken out of the chunks while dragging)
    let liveHide = new Set<number>();
    const setLiveHide = (ids: Iterable<number>) => {
      const s = ed.scene.value;
      if (!s) return;
      const before = liveHide;
      liveHide = new Set(ids);
      const keys = new Set<string>();
      for (const id of [...before, ...liveHide]) {
        const k = s.byId.get(id)?.key;
        if (k) keys.add(k);
      }
      if (keys.size) syncChunks([...keys], false);
    };
    // P31: why the change being dragged would be refused (overlap, floating…), checked once per snap step
    let blocked: string | null = null;
    let checkedKey = '';
    const checkCommand = (cmd: Command | null) => {
      const key = cmd ? JSON.stringify(cmd) : '';
      if (key === checkedKey) return blocked;
      checkedKey = key;
      blocked = cmd ? ed.bus.check(cmd) : null;
      return blocked;
    };
    let tagTimer = 0;
    let gz: {
      mode: GizmoMode;
      target: GizmoTarget;
      handle: Handle;
      start: [number, number];
      center: [number, number];
      change: GizmoChange | null;
    } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const redraw = () => {
      dirty = true;
    };

    const syncChunks = (keys: string[], all: boolean) => {
      const s = ed.scene.value;
      if (!s) return;
      if (all) renderer.clearChunks();
      for (const k of all ? [...s.chunks.keys()] : keys) {
        const list = s.chunks.get(k);
        if (!list) renderer.dropChunk(k);
        else
          renderer.setChunk(
            k,
            list.filter((b) => ed.isVisible(b) && !s.freeOf(b.id) && !liveHide.has(b.id)).map((b) => s.toRender(b)),
          );
      }
      dirty = true;
    };

    const fitAll = () => {
      const s = ed.scene.value;
      const b = s?.bounds();
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      if (b) camera.fit(b.min, b.max, aspect);
      else {
        camera.target = [0, 1, 0];
        camera.baseDistance = 35;
      }
      if (mode === 'game') gameCamera();
      dirty = true;
    };

    const gameCamera = () => {
      const m = ed.mapDoc.value;
      const sp = m?.spawns.find((s) => s.id === ed.store.manifest.entry.spawn) ?? m?.spawns[0];
      if (!sp) return;
      camera.target = [sp.pos[0], sp.pos[1] + 2, sp.pos[2]];
      camera.yaw = sp.yaw + Math.PI; // behind the actor, looking where it faces
      camera.pitch = 0.28;
      camera.baseDistance = 11.5;
      camera.zoom = 55;
      camera.fov = 0.9;
    };

    const frameSelection = () => {
      const sel = ed.selectedBricks.value;
      const min: Vec3 = [Infinity, Infinity, Infinity];
      const max: Vec3 = [-Infinity, -Infinity, -Infinity];
      // a selected spawn, zone or item is framed too (right-click › Frame)
      const m = ed.mapDoc.value;
      const zone = m?.zones.find((z) => z.id === ed.selectedZone.value);
      const point =
        m?.spawns.find((sp) => sp.id === ed.selectedSpawn.value)?.pos ??
        mapItems(ed).find((it) => it.id === ed.selectedItem.value)?.pos;
      const box: [Vec3, Vec3] | null = zone
        ? [sp3(zone.min), sp3(zone.max)]
        : point
          ? [
              [point[0] - 3, point[1] - 1, point[2] - 3],
              [point[0] + 3, point[1] + 2, point[2] + 3],
            ]
          : null;
      if (!sel.length && !box) return fitAll();
      if (box) {
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, box[0][i]!);
          max[i] = Math.max(max[i]!, box[1][i]!);
        }
      }
      for (const b of sel) {
        const [w, d] = footprint(b);
        min[0] = Math.min(min[0], b.x);
        min[1] = Math.min(min[1], b.y * 0.4);
        min[2] = Math.min(min[2], b.z);
        max[0] = Math.max(max[0], b.x + w);
        max[1] = Math.max(max[1], b.y * 0.4 + 1.4);
        max[2] = Math.max(max[2], b.z + d);
      }
      const yaw = camera.yaw;
      const pitch = camera.pitch;
      camera.fit(min, max, canvas.clientWidth / Math.max(1, canvas.clientHeight));
      camera.baseDistance = Math.max(camera.baseDistance, 12);
      camera.yaw = yaw;
      camera.pitch = pitch;
      dirty = true;
    };
    const self: ViewportApi = {
      camera,
      get renderer() {
        return renderer;
      },
      redraw,
      fit: fitAll,
      frameSelection,
    };
    api?.(self);
    viewRef.current = self;
    // the view you work in gets the focus, zoom and orbit keys (Scene or the Asset studio's plate)
    if (mode === 'scene') setActiveView(self);
    const claim = () => mode === 'scene' && setActiveView(self);
    canvas.addEventListener('pointerenter', claim);

    // Scene subscription (re-attached when the map changes) + layer visibility + environment.
    let unsubScene: (() => void) | null = null;
    const disposers = [
      effect(() => {
        const s = ed.scene.value;
        unsubScene?.();
        if (!s) return;
        renderer.setSegments(s.map.generator ? 12 : 24);
        renderer.floor = !s.map.generator;
        syncChunks([], true);
        unsubScene = s.onChange((keys, full) => {
          renderer.setSegments(s.map.generator ? 12 : 24);
          renderer.floor = !s.map.generator;
          syncChunks(keys, full);
        });
        fitAll();
      }),
      effect(() => {
        ed.layers.value;
        syncChunks([], true);
      }),
      effect(() => {
        const m = ed.mapDoc.value;
        if (!m) return;
        renderer.skySample = skyCycle().sample(m.sky.time, 0, m.weather.rain, m.weather.snowing);
        renderer.snow = m.weather.snow;
        renderer.seed = m.generator?.seed ?? 73521;
        dirty = true;
      }),
      effect(() => {
        ed.selection.value;
        ed.selectedSpawn.value;
        ed.selectedZone.value;
        ed.selectedItem.value;
        ed.brush.value;
        ed.assetBrush.value;
        ed.tool.value;
        ed.revision.value;
        dirty = true;
      }),
    ];

    const brickRender = (b: Brick): RenderBrick => {
      const [w, d] = footprint(b);
      return { id: b.id, w, d, kind: kindOf(b.type), x: b.x, y: b.y, z: b.z, color: b.color };
    };

    const drawGizmo = (lines: LineSet[], markers: Marker[]) => {
      const g = currentGizmo();
      // where each handle is on screen, for tutorials (the ghost cursor) and tests
      const spots = g
        ? Object.fromEntries(
            [['center', gizmoOrigin(g.target)] as const, ...g.handles.map((h) => [h.id, h.to] as const)].map(
              ([id, at]) => {
                const p = project(at);
                return [id, p ? [Math.round(p[0]), Math.round(p[1])] : null];
              },
            ),
          )
        : null;
      const json = spots ? JSON.stringify(spots) : '';
      if (canvas.dataset.gizmo !== json) canvas.dataset.gizmo = json;
      if (!g) return;
      const live = gz?.change;
      const ghostCol: [number, number, number] = blocked ? [1, 0.3, 0.25] : [1, 0.85, 0.4];
      // previews for things that are not bricks
      if (live?.box) {
        const [a, b] = live.box;
        lines.push({ lines: boxLines(a[0], a[1], a[2], b[0], b[1], b[2]), color: ghostCol, onTop: true });
      }
      if (live?.pos && g.target.kind === 'spawn') {
        markers.push({
          pos: [live.pos[0], live.pos[1] + 0.9, live.pos[2]],
          size: [0.9, 1.8, 0.9],
          color: ghostCol,
          alpha: 0.6,
        });
        lines.push({ lines: facingLine(live.pos, live.yaw ?? g.target.yaw), color: ghostCol, onTop: true });
      } else if (live?.pos) markers.push({ pos: live.pos, size: [0.7, 0.7, 0.7], color: ghostCol, alpha: 0.6 });
      const active = gz?.handle.id ?? hot;
      const col = (h: Handle) => (h.id === active ? AXIS_HOT : h.color);
      for (const h of g.handles) {
        const size = Math.hypot(h.to[0] - h.from[0], h.to[1] - h.from[1], h.to[2] - h.from[2]);
        if (isRing(h.id)) {
          const unit = gizmoSize(h.from);
          const pts: number[] = [];
          // three rings side by side read as one thick ring
          for (const k of [-0.025, 0, 0.025]) {
            const to: Vec3 = [
              h.from[0] + (h.to[0] - h.from[0]) * (1 + k),
              h.from[1] + (h.to[1] - h.from[1]) * (1 + k),
              h.from[2] + (h.to[2] - h.from[2]) * (1 + k),
            ];
            const ring = ringPoints({ ...h, to });
            for (let i = 1; i < ring.length; i++) pts.push(...ring[i - 1]!, ...ring[i]!);
          }
          lines.push({ lines: pts, color: col(h), onTop: true });
          const c = unit * 0.11;
          const ring = ringPoints(h, 4);
          for (let q = 0; q < 4; q++) markers.push({ pos: ring[q]!, size: [c, c, c], color: col(h), onTop: true });
          continue;
        }
        if (h.from === h.to) {
          // small enough that the handles of a small zone or brick do not swallow each other
          const [bmin, bmax] = targetBox(g.target);
          const ext = Math.min(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2]);
          const c = Math.max(0.2, Math.min(gizmoSize(h.from) * 0.12, ext * 0.45));
          markers.push({ pos: h.from, size: [c, c, c], color: col(h), onTop: true });
          continue;
        }
        const th = Math.max(0.04, size * 0.035);
        const mid: Vec3 = [(h.from[0] + h.to[0]) / 2, (h.from[1] + h.to[1]) / 2, (h.from[2] + h.to[2]) / 2];
        const len = (i: number) => (h.dir[i] ? size : th);
        markers.push({ pos: mid, size: [len(0), len(1), len(2)], color: col(h), onTop: true });
        // a real arrowhead (Resize uses cubes, so the two never look alike)
        const axis = h.dir[0] ? 'x' : h.dir[1] ? 'y' : 'z';
        markers.push({ pos: h.to, size: [size * 0.17, size * 0.3, 0], color: col(h), onTop: true, cone: axis });
      }
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty) return;
      dirty = false;
      const s = ed.scene.value;
      const overlays: Overlay[] = [];
      const lines: LineSet[] = [];
      const markers: Marker[] = [];
      if (s && mode === 'scene') {
        const sel = ed.selectedBricks.value;
        // freely turned or resized assets and parts are drawn here, each group with its own transform;
        // while a turn or size is dragged, the groups of that asset (or that studio part) use the new one
        const live = gz?.change?.free;
        const tg = gz?.target.kind === 'bricks' ? gz.target : null;
        let liveGroups: FreeGroup[] = [];
        if (live && tg?.inst) {
          const e = s.instances.find((x) => x.inst.id === tg.inst!.id);
          if (e) liveGroups = freeGroupsOf(e, { ...e.inst, tilt: live.tilt, scale: live.scale });
          // a whole asset with no turn or size left shows straight: draw its bricks plainly
          if (!liveGroups.length && e) liveGroups = [plainGroup(e.bricks)];
        } else if (live && tg?.part) {
          const { affine, center } = freeAffine(tg.bricks, live.tilt, live.scale);
          liveGroups = [
            {
              key: 'live',
              instance: '',
              part: null,
              bricks: tg.bricks,
              t: transformOf(affine, tg.bricks, live.tilt, live.scale, center),
            },
          ];
        }
        const hiddenIds = new Set(liveGroups.flatMap((g) => g.bricks.map((b) => b.id)));
        const red = [1, 0.25, 0.2] as [number, number, number];
        for (const f of s.free.values()) {
          const bricks = f.bricks.filter((b) => ed.isVisible(b) && !hiddenIds.has(b.id));
          if (bricks.length)
            overlays.push({ bricks: bricks.map(brickRender), alpha: 1, flat: false, model: f.t.model });
        }
        for (const g of liveGroups)
          overlays.push({
            bricks: g.bricks.map(brickRender),
            alpha: blocked ? 0.75 : 1,
            flat: !!blocked,
            model: g.t.model,
            ...(blocked ? { color: red } : {}),
          });
        // grid bricks of the asset being turned/sized are drawn plainly in the chunks; hide nothing else
        /** bricks split by the free group they are drawn with ('' = on the grid) */
        const byGroup = (list: readonly Brick[]) => {
          const m = new Map<string, Brick[]>();
          for (const b of list) {
            const k = s.freeGroupOf(b.id)?.key ?? '';
            const arr = m.get(k) ?? [];
            if (!m.has(k)) m.set(k, arr);
            arr.push(b);
          }
          return m;
        };
        if (preview) {
          // a turned asset being moved keeps its turns in the preview: shift each group's transform
          const first = sel[0];
          const moved = preview[0];
          const d = first && moved ? [moved.x - first.x, (moved.y - first.y) * 0.4, moved.z - first.z] : [0, 0, 0];
          const at = new Map(preview.map((b) => [b.id, b]));
          for (const [k, list] of byGroup(sel)) {
            const g = k ? s.free.get(k) : null;
            overlays.push({
              bricks: list.map((b) => brickRender(at.get(b.id) ?? b)),
              ...(g ? { model: affineModel(shiftAffine(g.t.affine, d)) } : {}),
              alpha: 0.75,
              flat: !!blocked,
              ...(blocked ? { color: red } : {}),
            });
          }
        } else if (sel.length && !live)
          for (const [k, list] of byGroup(sel)) {
            const g = k ? s.free.get(k) : null;
            overlays.push({
              bricks: list.map(brickRender),
              color: [1, 0.72, 0.2],
              alpha: 0.38,
              flat: true,
              ...(g ? { model: g.t.model } : {}),
            });
          }
        if (hover && !ed.selection.value.has(hover.id) && !preview) {
          const group = hover.group ? (s.groups.get(hover.group) ?? [hover.id]) : [hover.id];
          for (const [k, list] of byGroup(group.map((id) => s.get(id)!).filter(Boolean))) {
            const g = k ? s.free.get(k) : null;
            overlays.push({
              ...(g ? { model: g.t.model } : {}),
              bricks: list.map(brickRender),
              color: [1, 1, 1],
              alpha: 0.16,
              flat: true,
            });
          }
        }
        if (ghost) overlays.push({ bricks: [ghost], alpha: 0.6, flat: false });
        if (assetGhost) overlays.push({ bricks: assetGhost.map(brickRender), alpha: 0.6, flat: false });
        if (sel.length && !live)
          for (const [k, list] of byGroup(sel)) {
            const g = k ? s.free.get(k) : null;
            lines.push({ lines: g ? tiltedLines(list, g.t) : boundsLines(list), color: [1, 0.82, 0.3] });
          }
        if (studio) markers.push(...studio.markers());
        if (!studio) {
          for (const z of s.map.zones)
            lines.push({
              lines: boxLines(z.min[0]!, z.min[1]!, z.min[2]!, z.max[0]!, z.max[1]!, z.max[2]!),
              color: z.id === ed.selectedZone.value ? [1, 0.72, 0.2] : [0.78, 0.57, 0.92],
            });
          if (zoneDraft) {
            const q = zoneDraft;
            lines.push({
              lines: boxLines(
                Math.min(q.x0, q.x1),
                q.y,
                Math.min(q.z0, q.z1),
                Math.max(q.x0, q.x1),
                q.y + 4,
                Math.max(q.z0, q.z1),
              ),
              color: [1, 0.85, 0.4],
            });
          }
        }
        // sound emitters (♫, with their range when selected) and world UI signs (P5.5, P5.9)
        for (const it of studio ? [] : mapItems(ed)) {
          const sel = it.id === ed.selectedItem.value;
          const p = it.pos;
          markers.push({
            pos: [p[0], p[1], p[2]],
            size: it.kind === 'emitter' ? [0.7, 0.7, 0.7] : [1.6, 0.8, 0.12],
            color: sel ? [1, 0.72, 0.2] : it.kind === 'emitter' ? [0.55, 0.45, 1] : [0.98, 0.85, 0.3],
            alpha: 0.9,
          });
          if (it.kind === 'emitter')
            lines.push({
              lines: ringLines(p[0], p[1], p[2], it.maxDistance),
              color: sel ? [1, 0.72, 0.2] : [0.55, 0.45, 1],
            });
        }
        for (const sp of studio ? [] : s.map.spawns)
          markers.push({
            pos: [sp.pos[0], sp.pos[1] + 0.9, sp.pos[2]],
            size: [0.9, 1.8, 0.9],
            color: sp.id === ed.selectedSpawn.value ? [1, 0.72, 0.2] : [0.31, 0.82, 0.77],
            alpha: 0.85,
          });
        for (const sp of studio ? [] : s.map.spawns)
          lines.push({ lines: facingLine(sp.pos as Vec3, sp.yaw), color: [0.31, 0.82, 0.77] });
      }
      if (s) drawGizmo(lines, markers);
      const cam = camera.frame();
      const t0 = performance.now();
      const st = renderer.render(cam, camera.target, overlays, lines, markers);
      const ms = performance.now() - t0;
      const times = [...ed.frameTimes.value.slice(-59), ms];
      ed.frameTimes.value = times;
      ed.stats.value = { ...st, fps: Math.round(1000 / Math.max(1, times.reduce((a, b) => a + b, 0) / times.length)) };
      if (hudRef.current && s)
        hudRef.current.textContent = `${s.count.toLocaleString('en-US')} / 12,000 pieces · ${st.drawCalls} draws · ${st.chunksDrawn}/${st.chunks} chunks`;
    };
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => (dirty = true));
    ro.observe(canvas);

    // ---------- pointer tools ----------
    const rayAt = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return camera.ray(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    const pickable = (b: Brick) => !ed.isVisible(b) || ed.isLocked(b);

    /** world point → canvas pixel (CSS px), null when behind the camera */
    const project: Project = (p) => {
      const f = camera.frame();
      const v = [p[0] - f.eye[0], p[1] - f.eye[1], p[2] - f.eye[2]];
      const z = v[0]! * f.forward[0] + v[1]! * f.forward[1] + v[2]! * f.forward[2];
      if (z < 0.05) return null;
      const x = v[0]! * f.right[0] + v[1]! * f.right[1] + v[2]! * f.right[2];
      const y = v[0]! * f.up[0] + v[1]! * f.up[1] + v[2]! * f.up[2];
      const t = Math.tan(f.fov / 2);
      const w = canvas.clientWidth;
      const h = Math.max(1, canvas.clientHeight);
      return [((x / (z * t * (w / h)) + 1) / 2) * w, ((1 - y / (z * t)) / 2) * h];
    };
    const local = (e: { clientX: number; clientY: number }): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const showTag = (text: string | null, at?: [number, number], bad = false) => {
      const el = tagRef.current;
      if (!el) return;
      clearTimeout(tagTimer);
      el.hidden = !text;
      el.classList.toggle('bad', bad);
      if (text && at) {
        el.textContent = text;
        el.style.left = `${at[0] + 16}px`;
        el.style.top = `${at[1] + 14}px`;
      }
    };
    /** a message at the pointer that fades after a moment (a refused drop) */
    const flashTag = (text: string, at: [number, number]) => {
      showTag(text, at, true);
      tagTimer = window.setTimeout(() => showTag(null), 2600);
    };
    const gizmoMode = (): GizmoMode | null => {
      const t = ed.tool.value;
      return mode === 'scene' && (t === 'move' || t === 'rotate' || t === 'resize') ? t : null;
    };
    /** arrow length in world units that stays about 70 px on screen */
    const gizmoSize = (at: Vec3) => {
      const f = camera.frame();
      const z = Math.max(
        1,
        (at[0] - f.eye[0]) * f.forward[0] + (at[1] - f.eye[1]) * f.forward[1] + (at[2] - f.eye[2]) * f.forward[2],
      );
      const worldPerPx = (2 * z * Math.tan(f.fov / 2)) / Math.max(1, canvas.clientHeight);
      return Math.max(0.5, Math.round(worldPerPx * 70 * 4) / 4);
    };
    const currentGizmo = (): { mode: GizmoMode; target: GizmoTarget; handles: Handle[] } | null => {
      const m = gizmoMode();
      if (!m) return null;
      const target = gz?.target ?? gizmoTarget(ed, m);
      if (!target) return null;
      return { mode: m, target, handles: handlesFor(m, target, gizmoSize(gizmoOrigin(target))) };
    };

    const updateHover = (e: PointerEvent) => {
      const s = ed.scene.value;
      if (!s || mode !== 'scene') return;
      const g = currentGizmo();
      const nowHot = g ? pickHandle(g.handles, project, ...local(e)) : null;
      if (nowHot !== hot) {
        hot = nowHot;
        canvas.style.cursor = hot ? 'grab' : '';
        dirty = true;
      }
      if (hot) {
        hover = null;
        sceneHover.value = null;
        return;
      }
      const r = rayAt(e);
      const tool = ed.tool.value;
      ghost = null;
      assetGhost = null;
      assetAt = null;
      if (tool === 'asset') {
        const def = resolveAsset(ed, ed.assetBrush.value.asset);
        const hit = def && s.surface(r, (b) => !ed.isVisible(b));
        if (def && hit) {
          const rot = ed.assetBrush.value.rot;
          const [w, d] = rotatedFootprint(def, rot);
          assetAt = [Math.round(hit.x - w / 2), hit.y, Math.round(hit.z - d / 2)];
          assetGhost = expandAsset(def, { pos: assetAt, rot, idBase: 1 }).bricks;
          ed.cursor.value = { x: assetAt[0], z: assetAt[2], y: assetAt[1] };
        }
        hover = null;
      } else if (tool === 'place') {
        const hit = s.surface(r, (b) => !ed.isVisible(b));
        if (hit) {
          const br = ed.brush.value;
          const [w, d] = footprint({ type: br.type, rot: br.rot });
          ghost = {
            id: -1,
            w,
            d,
            kind: kindOf(br.type),
            x: Math.round(hit.x - w / 2),
            y: hit.y,
            z: Math.round(hit.z - d / 2),
            color: br.color,
          };
          ed.cursor.value = { x: ghost.x, z: ghost.z, y: ghost.y };
        }
        hover = null;
      } else {
        const hit = s.pick(r, pickable);
        hover = hit?.brick ?? null;
        if (!studio) {
          const owner = hover ? s.ownerOf(hover.id) : null;
          sceneHover.value = hover
            ? { name: owner?.def.name ?? (hover.group ? groupLabel(hover.group) : 'Brick'), x: e.clientX, y: e.clientY }
            : null;
        }
        const surf = s.surface(r);
        if (surf) ed.cursor.value = { x: Math.floor(surf.x), z: Math.floor(surf.z), y: surf.y };
      }
      dirty = true;
    };

    const click = (e: PointerEvent) => {
      const s = ed.scene.value;
      if (!s || mode !== 'scene') return;
      const r = rayAt(e);
      const tool = ed.tool.value;
      const map = ed.mapId.value;
      if (tool === 'asset') {
        const id = ed.assetBrush.value.asset;
        if (!id) ed.notify('Pick an asset in the dock (Assets › Assets) first.');
        else if (assetAt) {
          const def = resolveAsset(ed, id);
          ed.exec(placeCommands(ed, id, assetAt, ed.assetBrush.value.rot), { label: `Place ${def?.name ?? 'asset'}` });
        }
        return;
      }
      if (tool === 'place' && ghost) {
        const br = ed.brush.value;
        ed.exec({
          type: 'bricks.place',
          payload: {
            map,
            bricks: [{ type: br.type, x: ghost.x, y: ghost.y, z: ghost.z, rot: br.rot, color: br.color }],
          },
        });
        return;
      }
      if ((tool === 'sound' || tool === 'ui') && !studio) {
        const hit = s.surface(r);
        if (hit) placeItemAt(ed, tool === 'sound' ? 'sound' : 'sign', hit);
        return;
      }
      if (tool === 'spawn' && studio) {
        const hit = s.surface(r);
        if (hit) studio.onPoint([Math.round(hit.x * 2) / 2, hit.y * 0.4, Math.round(hit.z * 2) / 2]);
        return;
      }
      if (tool === 'spawn') {
        const hit = s.surface(r);
        if (hit)
          placeSpawnAt(ed, hit, (Math.round(camera.yaw / (Math.PI / 2)) * (Math.PI / 2) + Math.PI) % (2 * Math.PI));
        return;
      }
      // emitters and world UI are selectable with any other tool
      const item = studio
        ? null
        : mapItems(ed)
            .map((it) => ({ it, t: rayBoxAt(r, [it.pos[0], it.pos[1] - 0.9, it.pos[2]] as Vec3) }))
            .filter((x) => x.t !== null)
            .sort((a, b) => a.t! - b.t!)[0];
      if (item) {
        const bh = s.pick(r, pickable);
        if (!bh || item.t! < bh.t) {
          ed.selection.value = new Set();
          ed.selectedSpawn.value = null;
          ed.selectedZone.value = null;
          ed.selectedItem.value = item.it.id;
          ed.right.value = 'inspect';
          return;
        }
      }
      // spawn markers are selectable with any other tool
      const spawn = (studio ? [] : s.map.spawns).find((sp) => {
        const t = rayBoxAt(r, sp.pos as Vec3);
        return t !== null;
      });
      const hit = s.pick(r, pickable);
      if (spawn && (!hit || hit.t > 0)) {
        if (!hit || distanceTo(r.o, sp3(spawn.pos)) < hit.t) {
          ed.selection.value = new Set();
          ed.selectedSpawn.value = spawn.id;
          ed.right.value = 'inspect';
          return;
        }
      }
      const zone = studio
        ? null
        : s.map.zones
            .map((z) => ({ z, t: rayBox(r, z.min as Vec3, z.max as Vec3) }))
            .filter((x) => x.t !== null && (!hit || x.t! < hit.t))
            .sort((a, b) => a.t! - b.t!)[0]?.z;
      if (zone && (tool === 'select' || tool === 'move' || tool === 'rotate' || tool === 'resize')) {
        ed.selection.value = new Set();
        ed.selectedSpawn.value = null;
        ed.selectedZone.value = zone.id;
        ed.right.value = 'inspect';
        return;
      }
      if (!hit) {
        if (!e.shiftKey) ed.select([]);
        return;
      }
      const b = hit.brick;
      if (tool === 'paint') {
        ed.exec({
          type: 'bricks.paint',
          payload: {
            map,
            ids: e.altKey ? [b.id] : b.group ? (s.groups.get(b.group) ?? [b.id]) : [b.id],
            color: ed.brush.value.color,
          },
        });
        return;
      }
      if (tool === 'erase') {
        const owner = s.ownerOf(b.id);
        const ids = owner
          ? owner.bricks.map((x) => x.id)
          : e.shiftKey && b.group
            ? (s.groups.get(b.group) ?? [b.id])
            : [b.id];
        if (ed.exec({ type: 'bricks.remove', payload: { map, ids } }).ok) ed.pruneSelection();
        return;
      }
      ed.selectObject(b, { single: e.altKey, add: e.shiftKey });
    };

    /** The thing under the pointer, in the same order a left click picks: items, spawns, zones, bricks, ground. */
    const targetAt = (e: { clientX: number; clientY: number }): SceneTarget | null => {
      const s = ed.scene.value;
      if (!s) return null;
      const r = rayAt(e);
      const hit = s.pick(r, pickable);
      const item = mapItems(ed)
        .map((it) => ({ it, t: rayBoxAt(r, [it.pos[0], it.pos[1] - 0.9, it.pos[2]] as Vec3) }))
        .filter((x) => x.t !== null)
        .sort((a, b) => a.t! - b.t!)[0];
      if (item && (!hit || item.t! < hit.t)) return { kind: 'item', id: item.it.id };
      const spawn = s.map.spawns.find((sp) => rayBoxAt(r, sp.pos as Vec3) !== null);
      if (spawn && (!hit || distanceTo(r.o, sp3(spawn.pos)) < hit.t)) return { kind: 'spawn', id: spawn.id };
      const zone = s.map.zones
        .map((z) => ({ z, t: rayBox(r, z.min as Vec3, z.max as Vec3) }))
        .filter((x) => x.t !== null && (!hit || x.t! < hit.t))
        .sort((a, b) => a.t! - b.t!)[0]?.z;
      if (zone) return { kind: 'zone', id: zone.id };
      // grouped bricks and asset copies are objects; loose terrain bricks are ground unless already selected
      const b = hit?.brick;
      if (b && (b.group || s.ownerOf(b.id) || ed.selection.value.has(b.id))) return { kind: 'object', brick: b.id };
      const g = s.surface(r);
      if (!g) return b ? { kind: 'object', brick: b.id } : null;
      return { kind: 'ground', at: { x: g.x, y: g.y, z: g.z }, ...(b ? { brick: b.id } : {}) };
    };

    /** Right-click: select what is under the pointer (keeping a selection it is part of), then open its menu. */
    const menuAt = (e: PointerEvent) => {
      const s = ed.scene.value;
      const t = targetAt(e);
      if (!s || !t || !menuRef.current) return;
      if (t.kind === 'object') {
        if (!ed.selection.value.has(t.brick)) ed.selectObject(s.get(t.brick)!);
      } else if (t.kind === 'spawn' || t.kind === 'zone' || t.kind === 'item') selectOnly(ed, t.kind, t.id);
      menuRef.current(t, e.clientX, e.clientY);
    };

    const groundAt = (e: { clientX: number; clientY: number }, y: number): [number, number] | null => {
      const r = rayAt(e);
      if (Math.abs(r.d[1]) < 1e-6) return null;
      const t = (y - r.o[1]) / r.d[1];
      if (t < 0) return null;
      return [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t];
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        drag = { kind: 'pan', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, moved: true, button: 0 };
        return;
      }
      const s = ed.scene.value;
      if (e.button === 0 && !e.shiftKey) {
        const g = currentGizmo();
        const at = local(e);
        const id = g && pickHandle(g.handles, project, at[0], at[1]);
        const handle = id ? g.handles.find((h) => h.id === id) : null;
        if (g && handle) {
          gz = {
            mode: g.mode,
            target: g.target,
            handle,
            start: at,
            center: project(gizmoOrigin(g.target)) ?? at,
            change: null,
          };
          canvas.style.cursor = 'grabbing';
          drag = { kind: 'gizmo', x: e.clientX, y: e.clientY, moved: false, button: 0 };
          dirty = true;
          return;
        }
      }
      let kind: 'orbit' | 'pan' | 'move' | 'zone' | 'gizmo' =
        e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
      let offset: [number, number] | undefined;
      let plane: number | undefined;
      if (e.button === 0 && !e.shiftKey && ed.tool.value === 'zone' && s && mode === 'scene' && !studio) {
        const hit = s.surface(rayAt(e));
        if (hit) {
          kind = 'zone';
          plane = hit.y * 0.4;
          offset = [Math.floor(hit.x), Math.floor(hit.z)];
          zoneDraft = { x0: offset[0], z0: offset[1], x1: offset[0] + 1, z1: offset[1] + 1, y: plane };
        }
      }
      if (e.button === 0 && !e.shiftKey && ed.tool.value === 'move' && s && mode === 'scene') {
        const hit = s.pick(rayAt(e), pickable);
        if (hit) {
          if (!ed.selection.value.has(hit.brick.id)) ed.selectObject(hit.brick, { single: e.altKey });
          plane = hit.point[1];
          const g = groundAt(e, plane);
          if (g) {
            kind = 'move';
            offset = g;
          }
        }
      }
      drag = {
        kind,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        button: e.button,
        ...(offset ? { start: { x: offset[0], z: offset[1] }, offset, plane } : {}),
      };
    };

    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!drag) return updateHover(e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        camera.pan(mx - drag.x, my - drag.y, canvas.clientHeight);
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) camera.zoomBy(dist / pinch);
        pinch = dist;
        drag.x = mx;
        drag.y = my;
        dirty = true;
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      if (drag.kind === 'gizmo' && gz) {
        const now = local(e);
        const free = gz.target.kind === 'bricks' && !!(gz.target.inst || gz.target.part);
        const f = camera.frame();
        const facing =
          gz.handle.dir[0] * (f.eye[0] - gz.handle.from[0]) +
          gz.handle.dir[1] * (f.eye[1] - gz.handle.from[1]) +
          gz.handle.dir[2] * (f.eye[2] - gz.handle.from[2]);
        const amount =
          gz.mode !== 'rotate'
            ? dragAmount(gz.handle, project, gz.start, now)
            : free
              ? dragDegrees(gz.center, gz.start, now, facing)
              : dragQuarters(gz.center, gz.start, now);
        gz.change = changeFor(ed.mapId.value, gz.mode, gz.target, gz.handle.id, amount);
        if (gz.change.free && !liveHide.size && gz.target.kind === 'bricks') {
          const t = gz.target;
          const e = t.inst ? ed.scene.value?.instances.find((x) => x.inst.id === t.inst!.id) : null;
          setLiveHide((e?.bricks ?? t.bricks).map((b) => b.id));
        }
        preview = gz.change.bricks ?? null;
        const why = checkCommand(gz.change.command);
        showTag(why ? `${gz.change.label} · can't go here: ${why}` : gz.change.label, now, !!why);
        dirty = true;
        return;
      }
      if (drag.kind === 'zone' && drag.start && drag.plane !== undefined) {
        const g = groundAt(e, drag.plane);
        if (g && zoneDraft) {
          zoneDraft = {
            ...zoneDraft,
            x1: Math.floor(g[0]) + (g[0] >= drag.start.x ? 1 : 0),
            z1: Math.floor(g[1]) + (g[1] >= drag.start.z ? 1 : 0),
          };
          dirty = true;
        }
        return;
      }
      if (drag.kind === 'move' && drag.start && drag.plane !== undefined) {
        const g = groundAt(e, drag.plane);
        if (!g) return;
        const mx = Math.round(g[0] - drag.start.x);
        const mz = Math.round(g[1] - drag.start.z);
        preview = ed.selectedBricks.value.map((b) => ({ ...b, x: b.x + mx, z: b.z + mz }));
        ed.cursor.value = { x: mx, z: mz, y: 0 };
        const sel = ed.selectedBricks.value;
        const why = checkCommand(
          mx || mz
            ? {
                type: 'bricks.move',
                payload: { map: ed.mapId.value, ids: sel.map((b) => b.id), dx: mx, dy: 0, dz: mz },
              }
            : null,
        );
        const unit = (n: number) => `${n > 0 ? '+' : ''}${n}`;
        const what = `${unit(mx)} X  ${unit(mz)} Z`;
        showTag(why ? `${what} · can't go here: ${why}` : what, local(e), !!why);
        dirty = true;
        return;
      }
      if (drag.kind === 'orbit') camera.orbit(dx, dy);
      else camera.pan(dx, dy, canvas.clientHeight);
      drag.x = e.clientX;
      drag.y = e.clientY;
      dirty = true;
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size) return;
      const d = drag;
      drag = null;
      pinch = 0;
      if (!d) return;
      if (d.kind === 'gizmo') {
        const g = gz;
        gz = null;
        if (liveHide.size) setLiveHide([]);
        preview = null;
        showTag(null);
        canvas.style.cursor = hot ? 'grab' : '';
        dirty = true;
        if (g?.change?.part) studioRef.current?.onPart?.(g.change.part);
        if (g?.change?.command) {
          const r = ed.exec(g.change.command, { label: g.change.undoLabel });
          if (!r.ok) flashTag(`Not moved: ${r.error ?? 'that spot is not allowed'}`, local(e));
        }
        blocked = null;
        checkedKey = '';
        return;
      }
      if (d.kind === 'zone' && zoneDraft) {
        const z = zoneDraft;
        zoneDraft = null;
        dirty = true;
        const x0 = Math.min(z.x0, z.x1);
        const x1 = Math.max(z.x0, z.x1, x0 + 1);
        const z0 = Math.min(z.z0, z.z1);
        const z1 = Math.max(z.z0, z.z1, z0 + 1);
        const n = (ed.mapDoc.value?.zones.length ?? 0) + 1;
        const r = ed.exec(
          {
            type: 'map.addZone',
            payload: { map: ed.mapId.value, zone: { min: [x0, z.y, z0], max: [x1, z.y + 4, z1], tags: [`Zone ${n}`] } },
          },
          { label: 'Add trigger zone' },
        );
        if (r.ok) {
          const zones = ed.mapDoc.value?.zones ?? [];
          ed.selection.value = new Set();
          ed.selectedSpawn.value = null;
          ed.selectedZone.value = zones.at(-1)?.id ?? null;
          ed.right.value = 'inspect';
        }
        return;
      }
      if (d.kind === 'move' && d.moved && preview) {
        const sel = ed.selectedBricks.value;
        const dx = (preview[0]?.x ?? 0) - (sel[0]?.x ?? 0);
        const dz = (preview[0]?.z ?? 0) - (sel[0]?.z ?? 0);
        preview = null;
        blocked = null;
        checkedKey = '';
        showTag(null);
        if (dx || dz) {
          const r = ed.exec({
            type: 'bricks.move',
            payload: { map: ed.mapId.value, ids: sel.map((b) => b.id), dx, dy: 0, dz },
          });
          if (!r.ok) flashTag(`Not moved: ${r.error ?? 'that spot is not allowed'}`, local(e));
        }
        dirty = true;
        return;
      }
      preview = null;
      if (!d.moved && d.button === 0) click(e);
      else if (!d.moved && d.button === 2 && mode === 'scene' && !studio) menuAt(e);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.zoomBy(Math.exp(-e.deltaY * 0.0015));
      dirty = true;
    };
    const onLeave = () => {
      sceneHover.value = null;
      hover = null;
      ghost = null;
      assetGhost = null;
      dirty = true;
    };
    // P31: drop an asset from the dock straight into the scene, with the ghost following the pointer
    const onDragOver = (e: DragEvent) => {
      const p = dragPayload.value;
      const s = ed.scene.value;
      if (!p || !s || mode !== 'scene' || studio) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      const hit = s.surface(rayAt(e), (b) => !ed.isVisible(b));
      const def = resolveAsset(ed, p.asset);
      const at = hit && assetCorner(ed, p.asset, p.rot, hit);
      assetAt = at ?? null;
      assetGhost = def && at ? expandAsset(def, { pos: at, rot: p.rot, idBase: 1 }).bricks : null;
      hover = null;
      sceneHover.value = null;
      dirty = true;
    };
    const onDrop = (e: DragEvent) => {
      const p = dragPayload.value;
      const s = ed.scene.value;
      if (!p || !s || mode !== 'scene' || studio) return;
      e.preventDefault();
      const hit = s.surface(rayAt(e), (b) => !ed.isVisible(b));
      assetGhost = null;
      assetAt = null;
      dirty = true;
      endDrag();
      if (hit) placeAssetAt(ed, p.asset, p.rot, hit);
    };
    const onDragLeave = () => {
      assetGhost = null;
      assetAt = null;
      dirty = true;
    };
    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDrop);
    canvas.addEventListener('dragleave', onDragLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerenter', claim);
      setActiveView(null, self);
      viewRef.current = null;
      ro.disconnect();
      unsubScene?.();
      for (const d of disposers) d();
      renderer.dispose();
    };
  }, [ed, mode]);

  return (
    <div class="viewport-wrap">
      <canvas ref={canvasRef} class="viewport-canvas" data-tour="viewport" aria-label="3D map view" />
      <div class="vp-hud mono" ref={hudRef} />
      <div class="gizmo-tag" ref={tagRef} hidden />
      {mode === 'scene' && <ViewControls view={viewRef} studio={!!studio} />}
    </div>
  );
}

export { mapItems };

const sp3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const AXIS_HOT: [number, number, number] = [1, 0.85, 0.25];

function ringLines(x: number, y: number, z: number, r: number, n = 32): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    out.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r);
  }
  return out;
}
const distanceTo = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function rayBoxAt(r: { o: Vec3; d: Vec3 }, p: Vec3) {
  const mins: Vec3 = [p[0] - 0.6, p[1], p[2] - 0.6];
  const maxs: Vec3 = [p[0] + 0.6, p[1] + 1.9, p[2] + 0.6];
  let near = 0;
  let far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(r.d[i]!) < 1e-8) {
      if (r.o[i]! < mins[i]! || r.o[i]! > maxs[i]!) return null;
      continue;
    }
    let a = (mins[i]! - r.o[i]!) / r.d[i]!;
    let b = (maxs[i]! - r.o[i]!) / r.d[i]!;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return null;
  }
  return far >= 0 ? near : null;
}

function boundsLines(bricks: readonly Brick[]): number[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const b of bricks) {
    const [w, d] = footprint(b);
    x0 = Math.min(x0, b.x);
    z0 = Math.min(z0, b.z);
    y0 = Math.min(y0, b.y * 0.4);
    x1 = Math.max(x1, b.x + w);
    z1 = Math.max(z1, b.z + d);
    y1 = Math.max(y1, b.y * 0.4 + (b.type.startsWith('brick') ? 1.2 : 0.4) + 0.25);
  }
  const p = 0.08;
  [x0, y0, z0, x1, y1, z1] = [x0 - p, y0 - p, z0 - p, x1 + p, y1 + p, z1 + p];
  const c = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  return e.flatMap((i) => c[i]!);
}

function facingLine(p: Vec3, yaw: number): number[] {
  // v68 heading: an actor faces (sin(heading), cos(heading)) (game-physics.js).
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const y = p[1] + 0.1;
  return [p[0], y, p[2], p[0] + fx * 2, y, p[2] + fz * 2];
}

function boxLines(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const c = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  return [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7].flatMap((i) => c[i]!);
}

/**
 * P31 view buttons in the corner of the 3D view: focus on the selection, zoom, turn the view, fit, and
 * full screen. Each has a key, shown in its tip.
 */
function ViewControls({ view, studio }: { view: { current: ViewportApi | null }; studio: boolean }) {
  const op = (o: ViewOp) => () => viewOp(o, view.current);
  const full = sceneFullscreen.value;
  const btn = (label: string, tip: string, glyph: string, run: () => void, extra = '') => (
    <button type="button" class={`vc ${extra}`} aria-label={label} data-tip={tip} onClick={run}>
      {glyph}
    </button>
  );
  return (
    <div class="vp-controls" role="toolbar" aria-label="View" data-tour="view-controls">
      {btn('Focus on selection', 'Focus on the selection, then zoom and turn around it (F)', '◎', () =>
        view.current?.frameSelection(),
      )}
      {btn('Zoom in', 'Zoom in (+)', '+', op('zoomIn'))}
      {btn('Zoom out', 'Zoom out (−)', '−', op('zoomOut'))}
      {btn('Turn view left', 'Turn the view left (Alt ←)', '⟲', op('orbitLeft'))}
      {btn('Turn view right', 'Turn the view right (Alt →)', '⟳', op('orbitRight'))}
      {btn('Fit everything', 'Show everything (Home)', '⤢', () => view.current?.fit())}
      {!studio &&
        full &&
        btn(
          fullscreenDock.value ? 'Hide assets' : 'Show assets',
          fullscreenDock.value ? 'Hide the asset drawer' : 'Show the assets to drag into the scene',
          '▤',
          () => (fullscreenDock.value = !fullscreenDock.value),
          fullscreenDock.value ? 'on' : '',
        )}
      {!studio &&
        btn(
          full ? 'Leave full screen' : 'Full screen',
          full ? 'Leave full screen (Esc or Ctrl Shift F)' : 'Full-screen scene: hide the panels (Ctrl Shift F)',
          full ? '⤡' : '⛶',
          () => window.dispatchEvent(new CustomEvent('bw:fullscreen')),
          full ? 'on' : '',
        )}
    </div>
  );
}

/** The selection box of a freely turned or resized asset, transformed with it. */
function tiltedLines(bricks: readonly Brick[], t: FreeTransform): number[] {
  const [a, b] = bricksBox(bricks);
  const corner = (x: number, y: number, z: number) => t.point([x, y, z]);
  const c = [
    corner(a[0], a[1], a[2]),
    corner(b[0], a[1], a[2]),
    corner(b[0], a[1], b[2]),
    corner(a[0], a[1], b[2]),
    corner(a[0], b[1], a[2]),
    corner(b[0], b[1], a[2]),
    corner(b[0], b[1], b[2]),
    corner(a[0], b[1], b[2]),
  ];
  const e = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  return e.flatMap((i) => c[i]!);
}

/** A group drawn straight (an asset whose turn and size are being dragged back to none). */
function plainGroup(bricks: Brick[]): FreeGroup {
  return {
    key: 'live',
    instance: '',
    part: null,
    bricks,
    t: transformOf(IDENTITY, bricks, [0, 0, 0], [1, 1, 1], [0, 0, 0]),
  };
}
