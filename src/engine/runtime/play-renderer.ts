import { freeGroups, partsMoving } from '../../core/assets/free';
import { LEGACY_COLORS } from '../../core/legacy/constants';
import type { LegacyPiece } from '../../core/legacy/types';
import { rigPose } from '../character/animator';
import type { CharacterRenderer, Controller, HeroState } from '../legacy/runtime-modules';
import { brickGeometry } from '../render/brick-geometry';
import type { CameraFrame } from '../render/camera';
import { cross, normalize, type Vec3 } from '../render/math';
import { drawCharacter } from '../render/place-character';
import { type LineSet, type Marker, type Mesh, type Overlay, type RenderBrick, Renderer } from '../render/renderer';
import { FRAGMENT } from '../render/shaders';
import { chunkKeyOf } from './pieces';
import type { MapWorld, PlaySession } from './session';

export type DebugDraw = { colliders: boolean; spawns: boolean };

const toRender = (p: LegacyPiece): RenderBrick => {
  const [w, d] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
  return {
    id: p.id ?? 0,
    w,
    d,
    kind: p.kind,
    x: p.x,
    y: p.y,
    z: p.z,
    color: p.hex ?? LEGACY_COLORS[p.color]?.[1] ?? '#ff00ff',
  };
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
  /** the Director's stage view: its own orbit camera and markers instead of the game's (P6.3) */
  cameraOverride: CameraFrame | null = null;
  extra: { lines: LineSet[]; markers: Marker[] } | null = null;

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

  /** freely turned assets (P31): their pieces are drawn turned, not in the chunks */
  private tilted: { ids: Set<number>; groups: { ids: Set<number>; model: Float32Array }[] } = {
    ids: new Set(),
    groups: [],
  };

  private tiltedRev = -1;
  private moving = false;

  private syncTilted() {
    const w = this.session.world;
    const ids = new Set<number>();
    const groups: { ids: Set<number>; model: Float32Array }[] = [];
    const now = this.session.clock;
    // P32: moving parts ease to their state's pose after a state change
    const anim = (id: string) => {
      const i = w.instances.find((x) => x.inst.id === id);
      return i?.anim ? { ...i.anim, now } : null;
    };
    for (const g of freeGroups(w.instances, anim)) {
      const set = new Set(g.bricks.map((b) => b.id));
      for (const id of set) ids.add(id);
      groups.push({ ids: set, model: g.t.model });
    }
    // bricks that joined or left a group move between the chunks and the overlays
    for (const p of w.pieces)
      if (p.id !== undefined && ids.has(p.id) !== this.tilted.ids.has(p.id)) w.dirtyChunks.add(chunkKeyOf(p));
    this.tilted = { ids, groups };
    this.tiltedRev = w.rev;
    this.moving = w.instances.some((i) => partsMoving(i.def, i.state, i.anim ? { ...i.anim, now } : null));
  }

  private tiltedOverlays(): Overlay[] {
    const w = this.session.world;
    if (!this.tilted.ids.size) return [];
    const out: Overlay[] = [];
    for (const g of this.tilted.groups) {
      const pieces = w.pieces.filter((p) => p.id !== undefined && g.ids.has(p.id));
      if (pieces.length) out.push({ bricks: pieces.map(toRender), alpha: 1, flat: false, model: g.model });
    }
    return out;
  }

  private syncBricks() {
    const w = this.session.world;
    const r = this.renderer;
    if (this.shown === w && (this.tiltedRev !== w.rev || this.moving)) this.syncTilted();
    if (this.shown !== w) {
      this.tilted = { ids: new Set(), groups: [] };
      this.syncTilted();
      this.shown = w;
      r.clearChunks();
      r.setSegments(w.doc.generator ? 12 : 24);
      w.dirtyChunks.clear();
      const byKey = new Map<string, RenderBrick[]>();
      for (const p of w.pieces) {
        if (p.id !== undefined && this.tilted.ids.has(p.id)) continue;
        const k = chunkKeyOf(p);
        const list = byKey.get(k) ?? [];
        if (!byKey.has(k)) byKey.set(k, list);
        list.push(toRender(p));
      }
      for (const [k, list] of byKey) r.setChunk(k, list);
      return;
    }
    if (!w.dirtyChunks.size) return;
    for (const k of w.dirtyChunks)
      r.setChunk(
        k,
        w.pieces.filter((p) => chunkKeyOf(p) === k && !(p.id !== undefined && this.tilted.ids.has(p.id))).map(toRender),
      );
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
    const cam = this.cameraOverride ?? s.cine.frame?.camera ?? this.camera();
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
    if (this.extra) {
      lines.push(...this.extra.lines);
      markers.push(...this.extra.markers);
    }
    // P9b: lock-on, Zelda style — a yellow down-pointing arrow bobs over what Z would lock on to (gone when out
    // of range); locked on, a red one pulses over the target. Drawn over everything, so nothing hides it.
    const locked = s.combat.markerPos(s.combat.target);
    const at = locked ?? s.combat.markerPos(s.combat.hint);
    if (at) {
      const k = locked ? 1 + 0.12 * Math.sin(s.clock * 8) : 0.85;
      const bob = locked ? 0 : 0.18 * (1 + Math.sin(s.clock * 4));
      markers.push({
        pos: [at[0], at[1] + bob, at[2]],
        size: [0.8 * k, 0.75 * k, 0.12],
        color: locked ? [1, 0.25, 0.2] : [1, 0.82, 0.2],
        tri: s.camYaw,
        onTop: true,
      });
    }
    // P9c: an enemy winding up a swing shows a red “!” over its head — the moment to guard, dodge or parry
    for (const n of w.npcs) {
      if (!s.enemies.windingUp(n)) continue;
      const y = n.state.y + 4.9;
      markers.push({
        pos: [n.state.x, y + 0.45, n.state.z],
        size: [0.16, 0.55, 0.16],
        color: [1, 0.2, 0.15],
        onTop: true,
      });
      markers.push({ pos: [n.state.x, y, n.state.z], size: [0.16, 0.16, 0.16], color: [1, 0.2, 0.15], onTop: true });
    }
    // P9c: health bars over hurt objects and neighbours, and over enemies in a fight
    for (const b of s.healthBars()) {
      const W = 1.6;
      const yaw = s.camYaw;
      const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const toEye: Vec3 = [Math.sin(yaw) * 0.03, 0, Math.cos(yaw) * 0.03];
      markers.push({ pos: b.pos, size: [W + 0.08, 0.26, 0.04], color: [0.08, 0.08, 0.1], facing: yaw, onTop: true });
      const k = Math.max(0, Math.min(1, b.k));
      if (k > 0) {
        const shift = -(W - W * k) / 2;
        markers.push({
          pos: [b.pos[0] + right[0] * shift + toEye[0], b.pos[1], b.pos[2] + right[2] * shift + toEye[2]],
          size: [W * k, 0.18, 0.04],
          color: k > 0.5 ? [0.35, 0.85, 0.35] : k > 0.25 ? [0.95, 0.75, 0.2] : [0.95, 0.3, 0.25],
          facing: yaw,
          onTop: true,
        });
      }
    }
    // P9b.1 / P9c: where smashed things can be rebuilt — their bricks float as faint ghosts where they go back
    // (filling in while E is held), and a ring on the ground with an arrow over it shows exactly where to stand
    let ghosts = 0;
    for (const spot of s.rebuildSpots()) {
      const b = spot.bounds;
      const glow = 0.5 + 0.5 * Math.sin(s.clock * 3);
      const col: [number, number, number] = spot.near ? [0.35, 0.95, 0.5] : [0.45, 0.8, 1];
      const [sx, sy, sz] = s.rebuildStand(b);
      const R = 0.8;
      const t = 0.12;
      for (const [dx, dz, w, d] of [
        [0, -R, 2 * R + t, t],
        [0, R, 2 * R + t, t],
        [-R, 0, t, 2 * R],
        [R, 0, t, 2 * R],
      ] as const)
        markers.push({ pos: [sx + dx, sy + 0.06, sz + dz], size: [w, 0.1, d], color: col });
      if (!spot.near)
        markers.push({
          pos: [sx, sy + 1.2 + 0.25 * (1 + Math.sin(s.clock * 4)), sz],
          size: [0.9, 0.85, 0.12],
          color: col,
          tri: s.camYaw,
          onTop: true,
        });
      const n = spot.entry.originals.length;
      spot.entry.originals.forEach((p, i) => {
        if (ghosts++ > 160) return;
        const g = s.L.GamePhysics.bounds(p);
        const built = i < spot.entry.progress * n;
        const bob = built ? 0 : 0.08 * Math.sin(s.clock * 3 + i * 0.7);
        markers.push({
          pos: [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2 + bob, (g.z0 + g.z1) / 2],
          size: [g.x1 - g.x0 - 0.04, g.y1 - g.y0 - 0.04, g.z1 - g.z0 - 0.04],
          color: built ? [0.95, 0.95, 0.75] : col,
          alpha: built ? 0.7 : 0.12 + 0.08 * glow,
        });
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
    return this.renderer.render(
      cam,
      [s.heroState.x, s.heroState.y, s.heroState.z],
      this.tiltedOverlays(),
      lines,
      markers,
      (mvp, eye) => {
        const c = this.chars;
        c.begin(mvp, eye, sky);
        // a character playing a clip (a cinematic, an emote) is drawn where it stands
        const frame = { mvp, eye: eye as number[], light: sky };
        const draw = (profile: Record<string, unknown>, state: HeroState) =>
          drawCharacter(s.L, c, frame, profile, state);
        for (const n of w.npcs) {
          if (!this.bound.has(n.controller)) {
            c.bindCollision(n.profile, n.controller);
            this.bound.add(n.controller);
          }
          const cast = s.cine.drawFor(n, n.profile, n.state);
          if (cast?.state.hidden) continue;
          draw(cast?.profile ?? n.profile, cast?.state ?? n.state);
        }
        for (const x of s.cine.extras()) draw(x.profile, x.state);
        if (!this.bound.has(w.controller)) {
          c.bindCollision(s.hero, w.controller);
          this.bound.add(w.controller);
        }
        // P9b: a combat move (guard, roll, spin…) shows over an emote
        const fight = s.combat.pose();
        const pose = fight ?? s.heroAnim.params();
        const poseClip = fight ? s.combat.anim.clip : s.heroAnim.clip;
        const heroCast = s.cine.drawFor('hero', s.hero, s.heroState);
        if (heroCast) {
          if (!heroCast.state.hidden) draw(heroCast.profile, heroCast.state);
        } else
          draw(
            s.hero,
            pose
              ? { ...s.heroState, studioPose: rigPose(pose, poseClip), studioProgress: 0, studioFist: false }
              : s.heroState,
          );
        for (const d of w.debris) c.debris(this.debrisMesh, d);
      },
    );
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
