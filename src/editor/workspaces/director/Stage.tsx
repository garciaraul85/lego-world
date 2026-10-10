import { useEffect, useRef } from 'preact/hooks';
import type { Cinematic } from '../../../core/schema';
import { shotPose } from '../../../engine/cinematic/CameraRig';
import { cameraAt } from '../../../engine/cinematic/tracks/camera';
import { OrbitCamera } from '../../../engine/render/camera';
import type { Vec3 } from '../../../engine/render/math';
import type { LineSet, Marker } from '../../../engine/render/renderer';
import { PlayRenderer } from '../../../engine/runtime/play-renderer';
import type { DirectorPreview } from './preview';

export type StageApi = { camera: OrbitCamera; target(): Vec3 };

/**
 * The stage (board 7): the scene's map from a free orbit camera, with marks (drag to move),
 * cameras drawn as frusta, and the cast where the playhead puts them. In Record mode a click on the
 * ground makes a mark and a walk to it for the selected role.
 */
export function Stage({
  preview,
  cin,
  selMark,
  record,
  onSelectMark,
  onMoveMark,
  onGround,
  onApi,
}: {
  preview: DirectorPreview;
  cin: Cinematic;
  selMark: string | null;
  record: boolean;
  onSelectMark: (id: string | null) => void;
  onMoveMark: (id: string, pos: Vec3) => void;
  onGround: (pos: Vec3) => void;
  onApi: (a: StageApi) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ cin, selMark, record, dirty: true });
  live.current = { cin, selMark, record, dirty: true };
  useEffect(() => {
    const canvas = ref.current!;
    const pr = new PlayRenderer(canvas, preview.session);
    pr.debug = { colliders: false, spawns: false };
    const cam = new OrbitCamera();
    const h = preview.session.heroState;
    cam.target = [h.x, h.y + 1, h.z];
    cam.baseDistance = 22;
    cam.pitch = 0.75;
    const groundY = h.y;
    onApi({ camera: cam, target: () => cam.target });
    let raf = 0;
    // draw only when something changed (software GL on CI and phones is slow)
    let lastT = -1;
    const ro = new ResizeObserver(() => (live.current.dirty = true));
    ro.observe(canvas);
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = preview.session.cine.frame?.t ?? 0;
      if (!live.current.dirty && t === lastT) return;
      live.current.dirty = false;
      lastT = t;
      const { cin: c, selMark: sm } = live.current;
      pr.cameraOverride = cam.frame();
      pr.extra = overlays(preview, c, sm);
      pr.render();
    };
    raf = requestAnimationFrame(frame);

    const rayAt = (e: PointerEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return cam.ray(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
    };
    const ground = (e: PointerEvent): Vec3 | null => {
      const r = rayAt(e);
      if (Math.abs(r.d[1]) < 1e-4) return null;
      const t = (groundY - r.o[1]) / r.d[1];
      if (t < 0) return null;
      return [r.o[0] + r.d[0] * t, groundY, r.o[2] + r.d[2] * t];
    };
    const markAt = (e: PointerEvent) => {
      const r = rayAt(e);
      let best: string | null = null;
      let bestD = 0.9;
      for (const m of live.current.cin.marks) {
        const v = [m.pos[0] - r.o[0], m.pos[1] + 0.2 - r.o[1], m.pos[2] - r.o[2]];
        const along = v[0]! * r.d[0] + v[1]! * r.d[1] + v[2]! * r.d[2];
        if (along < 0) continue;
        const d = Math.hypot(v[0]! - r.d[0] * along, v[1]! - r.d[1] * along, v[2]! - r.d[2] * along);
        if (d < bestD) {
          bestD = d;
          best = m.id;
        }
      }
      return best;
    };
    let drag: { x: number; y: number; kind: 'orbit' | 'pan' | 'mark'; mark?: string; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const mark = e.button === 0 && !e.shiftKey ? markAt(e) : null;
      drag = {
        x: e.clientX,
        y: e.clientY,
        kind: mark ? 'mark' : e.button === 0 && !e.shiftKey ? 'orbit' : 'pan',
        moved: false,
        ...(mark ? { mark } : {}),
      };
      if (mark) onSelectMark(mark);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.kind === 'mark') {
        const g = ground(e);
        if (g && drag.moved) onMoveMark(drag.mark!, [Math.round(g[0] * 2) / 2, g[1], Math.round(g[2] * 2) / 2]);
        return;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.kind === 'orbit') cam.orbit(dx, dy);
      else cam.pan(dx, dy, canvas.clientHeight);
      live.current.dirty = true;
    };
    const up = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.moved || d.kind === 'mark') return;
      const g = ground(e);
      if (g && live.current.record) onGround([Math.round(g[0] * 2) / 2, g[1], Math.round(g[2] * 2) / 2]);
      else onSelectMark(null);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.zoomBy(Math.exp(-e.deltaY * 0.001));
      live.current.dirty = true;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      pr.dispose();
    };
  }, [preview]);
  return (
    <div class="viewport-wrap dr-stage">
      <canvas ref={ref} class={`viewport-canvas ${record ? 'recording' : ''}`} aria-label="Stage view" />
      <span class="dr-tag">Stage{record ? ' · ● Record: click the ground to walk the selected role there' : ''}</span>
    </div>
  );
}

const TEAL: [number, number, number] = [0.31, 0.82, 0.77];
const ORANGE: [number, number, number] = [1, 0.72, 0.2];
const GOLD: [number, number, number] = [0.95, 0.75, 0.25];

function overlays(preview: DirectorPreview, cin: Cinematic, selMark: string | null) {
  const lines: LineSet[] = [];
  const markers: Marker[] = [];
  for (const m of cin.marks) {
    const on = m.id === selMark;
    markers.push({
      pos: [m.pos[0], m.pos[1] + 0.08, m.pos[2]],
      size: [0.9, 0.12, 0.9],
      color: on ? ORANGE : TEAL,
      alpha: 0.9,
    });
    const fx = Math.sin(m.yaw);
    const fz = Math.cos(m.yaw);
    lines.push({
      lines: [m.pos[0], m.pos[1] + 0.15, m.pos[2], m.pos[0] + fx * 1.3, m.pos[1] + 0.15, m.pos[2] + fz * 1.3],
      color: on ? ORANGE : TEAL,
    });
  }
  const f = preview.session.cine.frame;
  if (!f) return { lines, markers };
  const scene = {
    role: (n: string) => {
      const a = f.actors.get(n);
      return a ? { pos: a.pos, yaw: a.yaw } : null;
    },
    mark: (id: string) => {
      const m = cin.marks.find((x) => x.id === id);
      return m ? { pos: m.pos as Vec3, yaw: m.yaw } : null;
    },
  };
  const camItems = cin.tracks.flatMap((t) => (t.kind === 'camera' ? t.items : []));
  const active = cameraAt(camItems, f.t)?.cur;
  for (const it of camItems) {
    const p = shotPose(it, scene, f.t);
    const on = it === active;
    markers.push({ pos: p.eye, size: [0.5, 0.35, 0.5], color: on ? ORANGE : GOLD, alpha: on ? 0.95 : 0.6 });
    const d = [p.target[0] - p.eye[0], p.target[1] - p.eye[1], p.target[2] - p.eye[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    const k = Math.min(3, len) / len;
    const tip: Vec3 = [p.eye[0] + d[0]! * k, p.eye[1] + d[1]! * k, p.eye[2] + d[2]! * k];
    const w = Math.tan(((p.fov ?? 50) * Math.PI) / 360) * Math.min(3, len);
    // a small frustum: eye to four corners around the aim point
    const right: Vec3 = [-d[2]! / len, 0, d[0]! / len];
    const corners: Vec3[] = [
      [tip[0] + right[0] * w * 1.6, tip[1] + w, tip[2] + right[2] * w * 1.6],
      [tip[0] - right[0] * w * 1.6, tip[1] + w, tip[2] - right[2] * w * 1.6],
      [tip[0] - right[0] * w * 1.6, tip[1] - w, tip[2] - right[2] * w * 1.6],
      [tip[0] + right[0] * w * 1.6, tip[1] - w, tip[2] + right[2] * w * 1.6],
    ];
    const ls: number[] = [];
    for (let i = 0; i < 4; i++) ls.push(...p.eye, ...corners[i]!, ...corners[i]!, ...corners[(i + 1) % 4]!);
    lines.push({ lines: ls, color: on ? ORANGE : GOLD });
  }
  return { lines, markers };
}
