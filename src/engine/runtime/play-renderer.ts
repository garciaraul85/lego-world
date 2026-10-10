import { LEGACY_COLORS } from '../../core/legacy/constants';
import type { LegacyPiece } from '../../core/legacy/types';
import { rigPose } from '../character/animator';
import type { CharacterRenderer, Controller } from '../legacy/runtime-modules';
import { brickGeometry } from '../render/brick-geometry';
import type { CameraFrame } from '../render/camera';
import { cross, normalize, type Vec3 } from '../render/math';
import { type LineSet, type Marker, type Mesh, type RenderBrick, Renderer } from '../render/renderer';
import { FRAGMENT } from '../render/shaders';
import { chunkKeyOf } from './pieces';
import type { MapWorld, PlaySession } from './session';

export type DebugDraw = { colliders: boolean; spawns: boolean };

const toRender = (p: LegacyPiece): RenderBrick => {
  const [w, d] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
  return { id: p.id ?? 0, w, d, kind: p.kind, x: p.x, y: p.y, z: p.z, color: LEGACY_COLORS[p.color]?.[1] ?? '#ff00ff' };
};

/** Draws a PlaySession: bricks (chunked), v68 characters and debris, play camera, debug overlays. */
export class PlayRenderer {
  readonly renderer: Renderer;
  private chars: CharacterRenderer;
  private debrisMesh: Mesh;
  private shown: MapWorld | null = null;
  private bound = new WeakSet<Controller>();
  debug: DebugDraw = { colliders: false, spawns: true };
  /** the camera of the last frame (world UI projects with it) */
  lastCamera: CameraFrame | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly session: PlaySession,
  ) {
    this.renderer = new Renderer(canvas);
    this.renderer.floor = false;
    this.chars = session.L.CharacterModel.create(this.renderer.gl, FRAGMENT);
    this.debrisMesh = this.renderer.meshOf(brickGeometry(1, 1, 'brick', 8));
  }

  /** v68's play camera: behind the hero, pulled in when a wall is in the way. */
  camera(): CameraFrame {
    const s = this.session;
    const st = s.heroState;
    const scale = s.L.CharacterCatalog.heightScale(s.hero);
    const target: Vec3 = [st.x, st.y + 2.0 * scale, st.z];
    const distance = (11.5 * 55) / s.zoom;
    const pitch = Math.max(0.08, s.camPitch);
    let eye: Vec3 = [
      target[0] + distance * Math.sin(s.camYaw) * Math.cos(pitch),
      target[1] + distance * Math.sin(pitch),
      target[2] + distance * Math.cos(s.camYaw) * Math.cos(pitch),
    ];
    const f = Math.max(0.76, s.L.GamePhysics.cameraDistance(target, eye, s.world.pieces));
    eye = eye.map((v, i) => target[i]! + (v - target[i]!) * f) as Vec3;
    const z = normalize(eye.map((v, i) => v - target[i]!));
    const right = normalize(cross([0, 1, 0], z));
    const up = cross(z, right);
    return { eye, right, up, forward: [-z[0], -z[1], -z[2]], fov: 0.9, distance: distance * f };
  }

  private syncBricks() {
    const w = this.session.world;
    const r = this.renderer;
    if (this.shown !== w) {
      this.shown = w;
      r.clearChunks();
      r.setSegments(w.doc.generator ? 12 : 24);
      w.dirtyChunks.clear();
      const byKey = new Map<string, RenderBrick[]>();
      for (const p of w.pieces) {
        const k = chunkKeyOf(p);
        const list = byKey.get(k) ?? [];
        if (!byKey.has(k)) byKey.set(k, list);
        list.push(toRender(p));
      }
      for (const [k, list] of byKey) r.setChunk(k, list);
      return;
    }
    if (!w.dirtyChunks.size) return;
    for (const k of w.dirtyChunks) r.setChunk(k, w.pieces.filter((p) => chunkKeyOf(p) === k).map(toRender));
    w.dirtyChunks.clear();
  }

  render() {
    const s = this.session;
    const w = s.world;
    this.syncBricks();
    const sky = s.L.SkyCycle.sample(w.doc.sky.time, s.clock, w.doc.weather.rain, w.doc.weather.snowing);
    this.renderer.skySample = sky;
    this.renderer.snow = w.doc.weather.snow;
    this.renderer.clock = s.clock;
    // a cinematic owns the camera while it plays (P6.2)
    const cam = s.cine.frame?.camera ?? this.camera();
    this.lastCamera = cam;
    const lines: LineSet[] = [];
    const markers: Marker[] = [];
    if (this.debug.spawns) {
      const gateSpawns = new Set(s.outbound().map((o) => o.from));
      for (const sp of w.doc.spawns)
        markers.push({
          pos: [sp.pos[0], sp.pos[1] + 0.05, sp.pos[2]],
          size: [1.4, 0.1, 1.4],
          color: gateSpawns.has(sp.id) ? [0.31, 0.82, 0.77] : [0.95, 0.7, 0.2],
          alpha: 0.7,
        });
    }
    if (s.prompt) {
      const [x, y, z] = s.prompt.pos;
      markers.push({
        pos: [x, y + 0.6 + 0.08 * Math.sin(s.clock * 5), z],
        size: [0.35, 0.35, 0.35],
        color: [1, 0.78, 0.2],
        alpha: 0.9,
      });
    }
    if (this.debug.colliders) {
      const st = s.heroState;
      const near: number[] = [];
      for (const p of w.pieces) {
        const b = s.L.GamePhysics.bounds(p);
        if (
          b.x1 < st.x - 6 ||
          b.x0 > st.x + 6 ||
          b.z1 < st.z - 6 ||
          b.z0 > st.z + 6 ||
          b.y0 > st.y + 6 ||
          b.y1 < st.y - 2
        )
          continue;
        near.push(...boxLines(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1));
      }
      lines.push({ lines: near, color: [1, 0.35, 0.35] });
      const r = 0.45 * s.L.GamePhysics.scaleOf(st);
      lines.push({
        lines: boxLines(st.x - r, st.y, st.z - r, st.x + r, st.y + 2.9 * s.L.GamePhysics.scaleOf(st), st.z + r),
        color: [0.4, 1, 0.5],
      });
    }
    return this.renderer.render(cam, [s.heroState.x, s.heroState.y, s.heroState.z], [], lines, markers, (mvp, eye) => {
      const c = this.chars;
      c.begin(mvp, eye, sky);
      for (const n of w.npcs) {
        if (!this.bound.has(n.controller)) {
          c.bindCollision(n.profile, n.controller);
          this.bound.add(n.controller);
        }
        const cast = s.cine.drawFor(n, n.profile, n.state);
        if (cast?.state.hidden) continue;
        c.draw(cast?.profile ?? n.profile, cast?.state ?? n.state);
      }
      for (const x of s.cine.extras()) c.draw(x.profile, x.state);
      if (!this.bound.has(w.controller)) {
        c.bindCollision(s.hero, w.controller);
        this.bound.add(w.controller);
      }
      const pose = s.heroAnim.params();
      const heroCast = s.cine.drawFor('hero', s.hero, s.heroState);
      if (heroCast) {
        if (!heroCast.state.hidden) c.draw(heroCast.profile, heroCast.state);
      } else
        c.draw(
          s.hero,
          pose
            ? { ...s.heroState, studioPose: rigPose(pose, s.heroAnim.clip), studioProgress: 0, studioFist: false }
            : s.heroState,
        );
      for (const d of w.debris) c.debris(this.debrisMesh, d);
    });
  }

  dispose() {
    this.renderer.dispose();
  }
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
