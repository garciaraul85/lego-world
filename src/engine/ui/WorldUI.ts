import type { UiInstance } from '../../core/schema';
import type { CameraFrame } from '../render/camera';
import { asNumber, interpolate, type Lookup } from './bindings';

export const MAX_WORLD_UI = 64;

/** Screen position (0..1, y down) and depth of a world point, or null behind the camera / off screen. */
export function projectPoint(cam: CameraFrame, aspect: number, p: readonly number[]) {
  const v = [p[0]! - cam.eye[0], p[1]! - cam.eye[1], p[2]! - cam.eye[2]];
  const dot = (a: readonly number[]) => v[0]! * a[0]! + v[1]! * a[1]! + v[2]! * a[2]!;
  const z = dot(cam.forward);
  if (z < 0.3) return null;
  const f = 1 / Math.tan(cam.fov / 2);
  const nx = (dot(cam.right) * f) / (z * aspect);
  const ny = (dot(cam.up) * f) / z;
  if (Math.abs(nx) > 1.1 || Math.abs(ny) > 1.1) return null;
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth: z };
}

/**
 * World-space UI (P5.9): signs, labels and bars placed in a map, drawn as DOM over the game view at
 * their projected 3D position. Elements are pooled; at most 64 (the nearest) are visible.
 */
export class WorldUI {
  private pool: HTMLDivElement[] = [];
  visible = 0;

  constructor(private readonly root: HTMLElement) {}

  update(items: readonly UiInstance[], cam: CameraFrame, w: number, h: number, ear: readonly number[], lookup: Lookup) {
    const shown: { item: UiInstance; x: number; y: number; d: number }[] = [];
    for (const it of items) {
      const d = Math.hypot(it.pos[0] - ear[0]!, it.pos[1] - ear[1]!, it.pos[2] - ear[2]!);
      if (d > it.maxDistance) continue;
      const p = projectPoint(cam, w / h, it.pos);
      if (p) shown.push({ item: it, x: p.x * w, y: p.y * h, d });
    }
    shown.sort((a, b) => a.d - b.d);
    shown.length = Math.min(shown.length, MAX_WORLD_UI);
    while (this.pool.length < shown.length) {
      const el = document.createElement('div');
      el.className = 'bw-world';
      this.root.appendChild(el);
      this.pool.push(el);
    }
    shown.forEach((s, i) => {
      const el = this.pool[i]!;
      const it = s.item;
      el.hidden = false;
      el.dataset.ui = it.id;
      el.className = `bw-world bw-world-${it.widget}`;
      const fade = Math.max(0.25, Math.min(1, (it.maxDistance - s.d) / (it.maxDistance * 0.3)));
      el.style.cssText = `transform: translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%); opacity: ${fade.toFixed(2)}; z-index: ${1000 - Math.round(s.d)}`;
      if (it.color) el.style.setProperty('--ui', it.color);
      const text = interpolate(it.text, lookup);
      if (it.widget === 'bar') {
        const v = asNumber(lookup(it.bind?.[0] ?? ''));
        const m = Math.max(0.0001, asNumber(lookup(it.bind?.[1] ?? ''), 100));
        const k = Math.max(0, Math.min(1, v / m));
        const html = `<span class="t"></span><span class="b"><i style="width:${(k * 100).toFixed(1)}%"></i></span>`;
        if (el.dataset.kind !== 'bar') el.innerHTML = html;
        el.dataset.kind = 'bar';
        (el.querySelector('.t') as HTMLElement).textContent = text;
        (el.querySelector('i') as HTMLElement).style.width = `${(k * 100).toFixed(1)}%`;
      } else {
        el.dataset.kind = 'text';
        if (el.textContent !== text) el.textContent = text;
      }
    });
    for (let i = shown.length; i < this.pool.length; i++) this.pool[i]!.hidden = true;
    this.visible = shown.length;
  }

  dispose() {
    for (const el of this.pool) el.remove();
    this.pool = [];
  }
}
