import type { SkySample } from '../../core/legacy/modules';
import { brickGeometry, type Geometry, PLATE, plainBox } from './brick-geometry';
import type { CameraFrame } from './camera';
import { boxVisible, frustumPlanes, multiply, perspective, type Vec3, viewMatrix } from './math';
import { FRAGMENT, SKY_FRAGMENT, SKY_VERTEX, VERTEX } from './shaders';

/** A brick as the renderer needs it. `paved` = road/pavement slab shading. */
export type RenderBrick = {
  id: number;
  w: number;
  d: number;
  kind: 'brick' | 'plate' | 'tile';
  x: number;
  y: number;
  z: number;
  color: string;
  paved?: boolean;
};

export type Mesh = { p: WebGLBuffer; n: WebGLBuffer; count: number };
type Batch = { w: number; d: number; kind: RenderBrick['kind']; paved: boolean; buffer: WebGLBuffer; count: number };
type ChunkGpu = { batches: Batch[]; min: Vec3; max: Vec3; bricks: number };

/** Beyond this distance (studs) a chunk draws plain boxes without studs (plan: Performance › stud LOD). */
export const LOD_DISTANCE = 96;

export type Overlay = { bricks: RenderBrick[]; color?: [number, number, number]; alpha: number; flat: boolean };
export type LineSet = { lines: number[]; color: [number, number, number] };
export type Marker = { pos: Vec3; size: Vec3; color: [number, number, number]; alpha?: number };

export type FrameStats = { drawCalls: number; instances: number; chunksDrawn: number; chunks: number; ms: number };

const rgbCache = new Map<string, [number, number, number]>();
/** v68 color: sRGB hex -> pow(c, 1.5). */
export function brickRgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    c = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 1.5) as [number, number, number];
    rgbCache.set(hex, c);
  }
  return c;
}

export const brickHeightUnits = (kind: RenderBrick['kind']) => (kind === 'brick' ? 3 : 1) * PLATE;
/** Center of a brick in world units (v68 drawPiece offset). */
export const brickCenter = (b: RenderBrick): Vec3 => [
  b.x + b.w / 2,
  b.y * PLATE + brickHeightUnits(b.kind) / 2,
  b.z + b.d / 2,
];

function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Shader linking failed');
  return p;
}

/**
 * WebGL1 renderer for the editor viewport: v68's sky and brick shading, with bricks batched
 * per 32x32 chunk and per shape (instanced), so an edit re-uploads only the chunks it touched.
 */
export class Renderer {
  readonly gl: WebGLRenderingContext;
  private readonly inst: ANGLE_instanced_arrays | null;
  private readonly prog: WebGLProgram;
  private readonly sky: WebGLProgram;
  private readonly skyBuf: WebGLBuffer;
  private readonly lineBuf: WebGLBuffer;
  private readonly overlayBuf: WebGLBuffer;
  private readonly u: Record<string, WebGLUniformLocation | null>;
  private readonly su: Record<string, WebGLUniformLocation | null>;
  private readonly a: { p: number; n: number; off: number; col: number; sky: number };
  private meshes = new Map<string, Mesh>();
  private chunks = new Map<string, ChunkGpu>();
  /** 12 matches v68's world detail; free-build maps use smoother studs. */
  segments = 12;
  lodDistance = LOD_DISTANCE;
  floor = true;
  skySample: SkySample | null = null;
  snow = false;
  seed = 73521;
  clock = 0;
  stats: FrameStats = { drawCalls: 0, instances: 0, chunksDrawn: 0, chunks: 0, ms: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.inst = gl.getExtension('ANGLE_instanced_arrays');
    this.prog = compile(gl, VERTEX, FRAGMENT);
    this.sky = compile(gl, SKY_VERTEX, SKY_FRAGMENT);
    const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    this.u = Object.fromEntries(
      [
        'uMVP',
        'uColor',
        'uEye',
        'uOffset',
        'uAlpha',
        'uFloor',
        'uFlat',
        'uLight',
        'uAmbient',
        'uFog',
        'uFogRange',
        'uSnow',
        'uNight',
        'uInstances',
        'uParticle',
        'uPointSize',
        'uExplore',
        'uFocus',
        'uPavement',
      ].map((n) => [n, U(this.prog, n)]),
    );
    this.su = Object.fromEntries(
      [
        'uZenith',
        'uHorizon',
        'uNight',
        'uOvercast',
        'uTime',
        'uRight',
        'uUp',
        'uForward',
        'uSunDirection',
        'uMoonDirection',
        'uTanHalfFov',
        'uAspect',
        'uSeed',
        'uStudio',
      ].map((n) => [n, U(this.sky, n)]),
    );
    this.a = {
      p: gl.getAttribLocation(this.prog, 'aPosition'),
      n: gl.getAttribLocation(this.prog, 'aNormal'),
      off: gl.getAttribLocation(this.prog, 'aInstanceOffset'),
      col: gl.getAttribLocation(this.prog, 'aInstanceColor'),
      sky: gl.getAttribLocation(this.sky, 'aSky'),
    };
    this.skyBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    this.lineBuf = gl.createBuffer()!;
    this.overlayBuf = gl.createBuffer()!;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  get instanced(): boolean {
    return !!this.inst;
  }

  private upload(g: Geometry): Mesh {
    const gl = this.gl;
    const p = gl.createBuffer()!;
    const n = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, p);
    gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, n);
    gl.bufferData(gl.ARRAY_BUFFER, g.normals, gl.STATIC_DRAW);
    return { p, n, count: g.positions.length / 3 };
  }

  private shape(w: number, d: number, kind: RenderBrick['kind'], paved: boolean): Mesh {
    const key = `${w},${d},${kind},${paved},${this.segments}`;
    let m = this.meshes.get(key);
    if (!m) {
      m = this.upload(brickGeometry(w, d, kind, this.segments, paved));
      this.meshes.set(key, m);
    }
    return m;
  }

  /** Far-LOD shape: the brick's shell as one rounded box, no studs or tubes. */
  private lodShape(w: number, d: number, kind: RenderBrick['kind']): Mesh {
    return this.boxMesh(`lod:${w},${d},${kind}`, w - 0.025, brickHeightUnits(kind), d - 0.025);
  }

  private boxMesh(key: string, w: number, h: number, d: number): Mesh {
    let m = this.meshes.get(key);
    if (!m) {
      m = this.upload(plainBox(w, h, d));
      this.meshes.set(key, m);
    }
    return m;
  }

  /** Replace one chunk's bricks (empty list removes it). */
  setChunk(key: string, bricks: readonly RenderBrick[]) {
    this.dropChunk(key);
    if (!bricks.length) return;
    const gl = this.gl;
    const groups = new Map<
      string,
      { w: number; d: number; kind: RenderBrick['kind']; paved: boolean; values: number[] }
    >();
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const b of bricks) {
      const paved = !!b.paved;
      const k = `${b.w},${b.d},${b.kind},${paved}`;
      const g = groups.get(k) ?? { w: b.w, d: b.d, kind: b.kind, paved, values: [] };
      if (!groups.has(k)) groups.set(k, g);
      const c = brickCenter(b);
      g.values.push(c[0], c[1], c[2], ...brickRgb(b.color));
      min[0] = Math.min(min[0], b.x);
      min[1] = Math.min(min[1], b.y * PLATE);
      min[2] = Math.min(min[2], b.z);
      max[0] = Math.max(max[0], b.x + b.w);
      max[1] = Math.max(max[1], b.y * PLATE + brickHeightUnits(b.kind) + 0.25);
      max[2] = Math.max(max[2], b.z + b.d);
    }
    const batches: Batch[] = [];
    for (const g of groups.values()) {
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.values), gl.STATIC_DRAW);
      batches.push({ w: g.w, d: g.d, kind: g.kind, paved: g.paved, buffer, count: g.values.length / 6 });
    }
    this.chunks.set(key, { batches, min, max, bricks: bricks.length });
  }

  dropChunk(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const b of c.batches) this.gl.deleteBuffer(b.buffer);
    this.chunks.delete(key);
  }

  clearChunks() {
    for (const k of [...this.chunks.keys()]) this.dropChunk(k);
  }

  /** Changing stud detail invalidates shapes (call before re-adding chunks). */
  setSegments(n: number) {
    if (n === this.segments) return;
    this.segments = n;
    for (const m of this.meshes.values()) {
      this.gl.deleteBuffer(m.p);
      this.gl.deleteBuffer(m.n);
    }
    this.meshes.clear();
  }

  private bindMesh(m: Mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.p);
    gl.enableVertexAttribArray(this.a.p);
    gl.vertexAttribPointer(this.a.p, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.n);
    gl.enableVertexAttribArray(this.a.n);
    gl.vertexAttribPointer(this.a.n, 3, gl.FLOAT, false, 0, 0);
  }

  private drawInstanced(m: Mesh, buffer: WebGLBuffer, count: number) {
    const gl = this.gl;
    const inst = this.inst!;
    this.bindMesh(m);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(this.a.off);
    gl.enableVertexAttribArray(this.a.col);
    gl.vertexAttribPointer(this.a.off, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(this.a.col, 3, gl.FLOAT, false, 24, 12);
    inst.vertexAttribDivisorANGLE(this.a.off, 1);
    inst.vertexAttribDivisorANGLE(this.a.col, 1);
    inst.drawArraysInstancedANGLE(gl.TRIANGLES, 0, m.count, count);
    inst.vertexAttribDivisorANGLE(this.a.off, 0);
    inst.vertexAttribDivisorANGLE(this.a.col, 0);
    gl.disableVertexAttribArray(this.a.off);
    gl.disableVertexAttribArray(this.a.col);
    this.stats.drawCalls++;
    this.stats.instances += count;
  }

  /** Non-instanced fallback / single draws. */
  private drawSingle(
    m: Mesh,
    offset: Vec3,
    color: [number, number, number],
    alpha: number,
    flat: boolean,
    floor = false,
  ) {
    const gl = this.gl;
    gl.uniform1f(this.u.uInstances!, 0);
    gl.uniform3fv(this.u.uOffset!, offset);
    gl.uniform3fv(this.u.uColor!, color);
    gl.uniform1f(this.u.uAlpha!, alpha);
    gl.uniform1f(this.u.uFlat!, flat ? 1 : 0);
    gl.uniform1f(this.u.uFloor!, floor ? 1 : 0);
    this.bindMesh(m);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    this.stats.drawCalls++;
  }

  private drawBrickList(list: readonly RenderBrick[], alpha: number, flat: boolean, tint?: [number, number, number]) {
    const gl = this.gl;
    if (!list.length) return;
    gl.uniform1f(this.u.uAlpha!, alpha);
    gl.uniform1f(this.u.uFlat!, flat ? 1 : 0);
    gl.uniform1f(this.u.uFloor!, 0);
    if (!this.inst) {
      for (const b of list)
        this.drawSingle(
          this.shape(b.w, b.d, b.kind, !!b.paved),
          brickCenter(b),
          tint ?? brickRgb(b.color),
          alpha,
          flat,
        );
      return;
    }
    const groups = new Map<string, { m: Mesh; values: number[] }>();
    for (const b of list) {
      const k = `${b.w},${b.d},${b.kind}`;
      const g = groups.get(k) ?? { m: this.shape(b.w, b.d, b.kind, false), values: [] };
      if (!groups.has(k)) groups.set(k, g);
      g.values.push(...brickCenter(b), ...(tint ?? brickRgb(b.color)));
    }
    gl.uniform1f(this.u.uInstances!, 1);
    for (const g of groups.values()) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.values), gl.DYNAMIC_DRAW);
      this.drawInstanced(g.m, this.overlayBuf, g.values.length / 6);
    }
    gl.uniform1f(this.u.uInstances!, 0);
  }

  /**
   * Draws one frame. `overlays` draw over the scene (selection, ghost); `lines` are world-space
   * line segments (zones, bounds); `markers` are flat boxes (spawn points).
   */
  render(
    cam: CameraFrame,
    focus: Vec3,
    overlays: Overlay[] = [],
    lines: LineSet[] = [],
    markers: Marker[] = [],
    /** draws more into the same frame (characters, debris) with the scene's view-projection */
    extra?: (mvp: Float32Array, eye: Vec3) => void,
  ): FrameStats {
    const t0 = performance.now();
    const gl = this.gl;
    this.stats = { drawCalls: 0, instances: 0, chunksDrawn: 0, chunks: this.chunks.size, ms: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.06, 0.07, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = w / h;
    const s = this.skySample;
    if (s) this.drawSky(s, cam, aspect);

    gl.useProgram(this.prog);
    const mvp = multiply(perspective(cam.fov, aspect), viewMatrix(cam.eye, cam.right, cam.up, cam.forward));
    gl.uniformMatrix4fv(this.u.uMVP!, false, mvp);
    gl.uniform3fv(this.u.uEye!, cam.eye);
    gl.uniform3fv(this.u.uLight!, s?.light ?? [0.5, 1, 0.6]);
    gl.uniform3fv(this.u.uAmbient!, s?.ambient ?? [0.36, 0.39, 0.43]);
    gl.uniform3fv(this.u.uFog!, s?.horizon ?? [0.1, 0.12, 0.16]);
    const fogNear = Math.max(55, cam.distance * 0.9);
    gl.uniform2f(this.u.uFogRange!, fogNear, Math.max(120, cam.distance * 2.5));
    gl.uniform1f(this.u.uSnow!, this.snow ? 1 : 0);
    gl.uniform1f(this.u.uNight!, s?.night ?? 0);
    gl.uniform1f(this.u.uParticle!, 0);
    gl.uniform1f(this.u.uPointSize!, 3);
    gl.uniform1f(this.u.uExplore!, 0);
    gl.uniform3fv(this.u.uFocus!, focus);
    gl.uniform1f(this.u.uPavement!, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.vertexAttrib3f(this.a.off, 0, 0, 0);
    gl.vertexAttrib3f(this.a.col, 0, 0, 0);

    if (this.floor)
      this.drawSingle(
        this.boxMesh('floor', 48, 0.15, 48),
        [Math.round(focus[0]), -0.1, Math.round(focus[2])],
        [0.1, 0.14, 0.2],
        1,
        false,
        true,
      );

    const planes = frustumPlanes(mvp);
    gl.uniform1f(this.u.uAlpha!, 1);
    gl.uniform1f(this.u.uFlat!, 0);
    gl.uniform1f(this.u.uFloor!, 0);
    gl.uniform3fv(this.u.uOffset!, [0, 0, 0]);
    if (this.inst) gl.uniform1f(this.u.uInstances!, 1);
    for (const c of this.chunks.values()) {
      if (!boxVisible(planes, c.min, c.max)) continue;
      this.stats.chunksDrawn++;
      // distance from the eye to the nearest point of the chunk box
      const dx = Math.max(c.min[0] - cam.eye[0], 0, cam.eye[0] - c.max[0]);
      const dy = Math.max(c.min[1] - cam.eye[1], 0, cam.eye[1] - c.max[1]);
      const dz = Math.max(c.min[2] - cam.eye[2], 0, cam.eye[2] - c.max[2]);
      const far = Math.hypot(dx, dy, dz) > this.lodDistance;
      for (const b of c.batches) {
        gl.uniform1f(this.u.uPavement!, b.paved ? 1 : 0);
        const mesh = far && !b.paved ? this.lodShape(b.w, b.d, b.kind) : this.shape(b.w, b.d, b.kind, b.paved);
        if (this.inst) this.drawInstanced(mesh, b.buffer, b.count);
      }
    }
    gl.uniform1f(this.u.uPavement!, 0);
    gl.uniform1f(this.u.uInstances!, 0);

    for (const m of markers) {
      if (m.alpha !== undefined && m.alpha < 1) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      this.drawSingle(
        this.boxMesh(`marker:${m.size.join(',')}`, m.size[0], m.size[1], m.size[2]),
        m.pos,
        m.color,
        m.alpha ?? 1,
        true,
      );
      gl.disable(gl.BLEND);
    }

    for (const o of overlays) {
      if (o.alpha < 1) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthFunc(gl.LEQUAL);
      }
      this.drawBrickList(o.bricks, o.alpha, o.flat, o.color);
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
    }

    if (lines.length) {
      gl.disableVertexAttribArray(this.a.n);
      gl.vertexAttrib3f(this.a.n, 0, 1, 0);
      gl.uniform1f(this.u.uInstances!, 0);
      gl.uniform1f(this.u.uFlat!, 1);
      gl.uniform1f(this.u.uAlpha!, 1);
      gl.uniform3fv(this.u.uOffset!, [0, 0, 0]);
      for (const set of lines) {
        if (!set.lines.length) continue;
        gl.uniform3fv(this.u.uColor!, set.color);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(set.lines), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.a.p);
        gl.vertexAttribPointer(this.a.p, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, set.lines.length / 3);
        this.stats.drawCalls++;
      }
    }
    if (extra) {
      extra(mvp, cam.eye);
      gl.useProgram(this.prog);
    }
    this.stats.ms = performance.now() - t0;
    return this.stats;
  }

  /** Uploads a geometry as a mesh other renderers can draw (v68 debris uses a 1x1 brick). */
  meshOf(g: Geometry): Mesh {
    return this.upload(g);
  }

  private drawSky(s: SkySample, cam: CameraFrame, aspect: number) {
    const gl = this.gl;
    const u = this.su;
    gl.useProgram(this.sky);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.enableVertexAttribArray(this.a.sky);
    gl.vertexAttribPointer(this.a.sky, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(u.uZenith!, s.zenith);
    gl.uniform3fv(u.uHorizon!, s.horizon);
    gl.uniform1f(u.uNight!, s.night);
    gl.uniform1f(u.uOvercast!, s.overcast);
    gl.uniform1f(u.uTime!, this.clock);
    gl.uniform3fv(u.uRight!, cam.right);
    gl.uniform3fv(u.uUp!, cam.up);
    gl.uniform3fv(u.uForward!, cam.forward);
    gl.uniform3fv(u.uSunDirection!, s.sun ?? [0, 1, 0]);
    gl.uniform3fv(u.uMoonDirection!, s.moon ?? [0, -1, 0]);
    gl.uniform1f(u.uTanHalfFov!, Math.tan(cam.fov / 2));
    gl.uniform1f(u.uAspect!, aspect);
    gl.uniform1f(u.uSeed!, this.seed % 4096);
    gl.uniform1f(u.uStudio!, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(this.a.sky);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    this.stats.drawCalls++;
  }

  /** Reads the color under a pixel (tests and screenshots). */
  dispose() {
    this.clearChunks();
    for (const m of this.meshes.values()) {
      this.gl.deleteBuffer(m.p);
      this.gl.deleteBuffer(m.n);
    }
    this.meshes.clear();
  }
}
