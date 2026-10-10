import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { expandAsset, rotatedFootprint } from '../../core/assets/expand';
import type { Brick } from '../../core/bricks/codec';
import { footprint } from '../../core/bricks/inspect';
import { rotateQuarter } from '../../core/bricks/transform';
import { skyCycle } from '../../core/legacy/modules';
import { OrbitCamera } from '../../engine/render/camera';
import type { Vec3 } from '../../engine/render/math';
import { type LineSet, type Marker, type Overlay, type RenderBrick, Renderer } from '../../engine/render/renderer';
import { placeCommands, resolveAsset } from '../assets';
import { rayBox } from '../scene';
import type { EditorState } from '../state';

const kindOf = (type: string) =>
  (type.startsWith('brick') ? 'brick' : type.startsWith('plate') ? 'plate' : 'tile') as RenderBrick['kind'];

export type ViewportApi = {
  camera: OrbitCamera;
  renderer: Renderer | null;
  redraw(): void;
  fit(): void;
  frameSelection(): void;
};

/** The 3D scene view: renderer + camera + the active tool's pointer handling. */
export type StudioHooks = { markers(): Marker[]; onPoint(pos: [number, number, number]): void };

export function Viewport({
  ed,
  mode,
  api,
  studio,
}: {
  ed: EditorState;
  mode: 'scene' | 'game';
  api?: (a: ViewportApi) => void;
  /** Asset studio hooks: extra markers (sockets), and where the Spawn tool's click goes instead */
  studio?: StudioHooks;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

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
      kind: 'orbit' | 'pan' | 'move' | 'zone';
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
            list.filter((b) => ed.isVisible(b)).map((b) => s.toRender(b)),
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
      if (!sel.length) return fitAll();
      const min: Vec3 = [Infinity, Infinity, Infinity];
      const max: Vec3 = [-Infinity, -Infinity, -Infinity];
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
    api?.({
      camera,
      get renderer() {
        return renderer;
      },
      redraw,
      fit: fitAll,
      frameSelection,
    });

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
        if (preview) overlays.push({ bricks: preview.map(brickRender), alpha: 0.75, flat: false });
        else if (sel.length)
          overlays.push({ bricks: sel.map(brickRender), color: [1, 0.72, 0.2], alpha: 0.38, flat: true });
        if (hover && !ed.selection.value.has(hover.id) && !preview) {
          const group = hover.group ? (s.groups.get(hover.group) ?? [hover.id]) : [hover.id];
          overlays.push({
            bricks: group
              .map((id) => s.get(id)!)
              .filter(Boolean)
              .map(brickRender),
            color: [1, 1, 1],
            alpha: 0.16,
            flat: true,
          });
        }
        if (ghost) overlays.push({ bricks: [ghost], alpha: 0.6, flat: false });
        if (assetGhost) overlays.push({ bricks: assetGhost.map(brickRender), alpha: 0.6, flat: false });
        if (sel.length) lines.push({ lines: boundsLines(sel), color: [1, 0.82, 0.3] });
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

    const updateHover = (e: PointerEvent) => {
      const s = ed.scene.value;
      if (!s || mode !== 'scene') return;
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
      if (tool === 'spawn' && studio) {
        const hit = s.surface(r);
        if (hit) studio.onPoint([Math.round(hit.x * 2) / 2, hit.y * 0.4, Math.round(hit.z * 2) / 2]);
        return;
      }
      if (tool === 'spawn') {
        const hit = s.surface(r);
        if (hit)
          ed.exec({
            type: 'map.addSpawn',
            payload: {
              map,
              pos: [Math.round(hit.x), hit.y * 0.4, Math.round(hit.z)],
              yaw: (Math.round(camera.yaw / (Math.PI / 2)) * (Math.PI / 2) + Math.PI) % (2 * Math.PI),
            },
          });
        return;
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
      if (zone && tool === 'select') {
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
      if (tool === 'rotate') {
        const ids = b.group && !e.altKey ? (s.groups.get(b.group) ?? [b.id]) : [b.id];
        const bricks = ids.map((id) => s.get(id)!);
        const turned = rotateQuarter(bricks);
        ed.exec(
          {
            type: 'bricks.update',
            payload: { map, bricks: turned.map((t) => ({ id: t.id, x: t.x, z: t.z, rot: t.rot })) },
          },
          { label: ids.length > 1 ? 'Rotate object 90°' : 'Rotate brick 90°' },
        );
        ed.select(ids);
        return;
      }
      ed.selectObject(b, { single: e.altKey, add: e.shiftKey });
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
      let kind: 'orbit' | 'pan' | 'move' | 'zone' = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
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
        if (dx || dz)
          ed.exec({ type: 'bricks.move', payload: { map: ed.mapId.value, ids: sel.map((b) => b.id), dx, dy: 0, dz } });
        dirty = true;
        return;
      }
      preview = null;
      if (!d.moved && d.button === 0) click(e);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.zoomBy(Math.exp(-e.deltaY * 0.0015));
      dirty = true;
    };
    const onLeave = () => {
      hover = null;
      ghost = null;
      assetGhost = null;
      dirty = true;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      cancelAnimationFrame(raf);
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
    </div>
  );
}

const sp3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
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
