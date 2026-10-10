import { cross, normalize, type Vec3 } from './math';

export type CameraFrame = { eye: Vec3; right: Vec3; up: Vec3; forward: Vec3; fov: number; distance: number };

/** v68's editor orbit camera: yaw/pitch around a target, distance = baseDistance * 55 / zoom. */
export class OrbitCamera {
  yaw = 0.65;
  pitch = 0.65;
  target: Vec3 = [0, 1, 0];
  baseDistance = 35;
  zoom = 55;
  fov = 0.62;

  frame(): CameraFrame {
    const distance = (this.baseDistance * 55) / this.zoom;
    const eye: Vec3 = [
      this.target[0] + distance * Math.sin(this.yaw) * Math.cos(this.pitch),
      this.target[1] + distance * Math.sin(this.pitch),
      this.target[2] + distance * Math.cos(this.yaw) * Math.cos(this.pitch),
    ];
    const z = normalize(eye.map((v, i) => v - this.target[i]!));
    const right = normalize(cross([0, 1, 0], z));
    const up = cross(z, right);
    return { eye, right, up, forward: [-z[0], -z[1], -z[2]], fov: this.fov, distance };
  }

  orbit(dx: number, dy: number) {
    this.yaw -= dx * 0.008;
    this.pitch = Math.max(0.08, Math.min(1.52, this.pitch + dy * 0.008));
  }

  /** Pan in the ground plane by screen pixels. */
  pan(dx: number, dy: number, viewHeight: number) {
    const f = this.frame();
    const scale = (2 * f.distance * Math.tan(this.fov / 2)) / Math.max(1, viewHeight);
    const fwd = normalize([f.forward[0], 0, f.forward[2]]);
    const right = normalize([f.right[0], 0, f.right[2]]);
    for (let i = 0; i < 3; i++) this.target[i]! -= (right[i]! * dx - fwd[i]! * dy) * scale;
  }

  zoomBy(factor: number) {
    this.zoom = Math.max(8, Math.min(400, this.zoom * factor));
  }

  /** Frame a box like v68's fit(). */
  fit(min: Vec3, max: Vec3, aspect: number) {
    this.target = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const radius = Math.max(3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    // v68 fit() distance, tightened for the editor's wider viewport
    this.baseDistance = (radius / Math.sin(0.31)) * 0.82 * Math.max(1, 1 / Math.max(0.1, aspect));
    this.zoom = 55;
    this.yaw = 0.65;
    this.pitch = 0.65;
  }

  topView() {
    this.pitch = 1.52;
  }

  /** World ray through a canvas pixel. */
  ray(px: number, py: number, width: number, height: number): { o: Vec3; d: Vec3 } {
    const f = this.frame();
    const aspect = width / height;
    const nx = (px / width) * 2 - 1;
    const ny = 1 - (py / height) * 2;
    const t = Math.tan(this.fov / 2);
    return { o: f.eye, d: normalize(f.forward.map((v, i) => v + f.right[i]! * nx * t * aspect + f.up[i]! * ny * t)) };
  }
}
