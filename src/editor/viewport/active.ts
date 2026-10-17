import { signal } from '@preact/signals';
import type { OrbitCamera } from '../../engine/render/camera';
import type { Renderer } from '../../engine/render/renderer';

export type ViewportApi = {
  camera: OrbitCamera;
  renderer: Renderer | null;
  redraw(): void;
  /** P32: hands every brick to the renderer again and draws (after a change it must show at once) */
  resync(): void;
  fit(): void;
  frameSelection(): void;
};

/**
 * P31 view controls: the 3D view the user last worked in (the Scene, or the Asset studio's build plate).
 * Focus, zoom, orbit and fit go to it, whether they come from keys, menus, the view buttons or Brix.
 */
let active: ViewportApi | null = null;

export function setActiveView(v: ViewportApi | null, only?: ViewportApi) {
  if (v === null && only && active !== only) return;
  active = v;
}

export function activeView(): ViewportApi | null {
  return active;
}

export type ViewOp = 'zoomIn' | 'zoomOut' | 'orbitLeft' | 'orbitRight' | 'orbitUp' | 'orbitDown';

export function viewOp(op: ViewOp, v: ViewportApi | null = active) {
  if (!v) return;
  const c = v.camera;
  if (op === 'zoomIn') c.zoomBy(1.25);
  else if (op === 'zoomOut') c.zoomBy(0.8);
  else if (op === 'orbitLeft') c.orbit(-45, 0);
  else if (op === 'orbitRight') c.orbit(45, 0);
  else if (op === 'orbitUp') c.orbit(0, 30);
  else c.orbit(0, -30);
  v.redraw();
}

/** Full-screen scene: menus and side panels hide so the 3D view gets the whole window (P31). */
export const sceneFullscreen = signal(false);

/** In full-screen scene, the asset dock can be opened as a drawer for adding things. */
export const fullscreenDock = signal(false);
