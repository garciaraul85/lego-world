import type { SkySample } from '../../core/legacy/modules';
import { brickGeometry, coneGeometry, downTriangle, type Geometry, PLATE, plainBox, turnedY } from './brick-geometry';

/** P23: particles to draw this frame: tiny bricks, plates, tiles or studs of one size, centre and colour each (6 floats) */
export type ParticleBatch = {
  shape: 'brick' | 'plate' | 'tile' | 'stud';
  size: number;
  data: Float32Array;
  count: number;
};

import type { FogParams } from '../lighting/atmosphere';
import type { CameraFrame } from './camera';
import { boxVisible, frustumPlanes, multiply, perspective, type Vec3, viewMatrix } from './math';
import { FRAGMENT, SHADOW_FRAGMENT, SKY_FRAGMENT, SKY_VERTEX, VERTEX } from './shaders';

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
type Batch = {
  w: number;
  d: number;
  kind: RenderBrick['kind'];
  paved: boolean;
  /** P27 part 3: every stud is under another brick, so it draws as a plain box */
  covered: boolean;
  buffer: WebGLBuffer;
  count: number;
};
type ChunkGpu = { batches: Batch[]; min: Vec3; max: Vec3; bricks: number };

/** Beyond this distance (studs) a chunk draws plain boxes without studs (plan: Performance › stud LOD). */
export const LOD_DISTANCE = 96;

export type Overlay = {
  bricks: RenderBrick[];
  color?: [number, number, number];
  alpha: number;
  flat: boolean;
  /** column-major model matrix: draws the bricks turned (a freely rotated asset, P31) */
  model?: Float32Array;
};
/** onTop: drawn over everything, ignoring depth (editor gizmos) */
export type LineSet = { lines: number[]; color: [number, number, number]; onTop?: boolean };
export type Marker = {
  pos: Vec3;
  /** box: width, height, depth (centered on pos); cone: [diameter, length, _], base on pos */
  size: Vec3;
  color: [number, number, number];
  alpha?: number;
  onTop?: boolean;
  /** an arrowhead pointing along +axis instead of a box (editor gizmos) */
  cone?: 'x' | 'y' | 'z' | '-y';
  /** a flat triangle pointing down (size: width, height, thickness), turned to face this yaw — the lock-on arrow */
  tri?: number;
  /** a box turned about y to this yaw (its width along the camera's right): health bars */
  facing?: number;
};

/**
 * P27: a light that lights the bricks and characters around it: where it is, its colour (linear, already times
 * its brightness), how far it reaches (studs) and whether it casts shadows.
 */
export type PointLight = { pos: Vec3; color: [number, number, number]; range: number; shadow?: boolean };
/** lights drawn at once (the nearest and brightest); the first that casts shadows gets the shadow map */
export const MAX_LIGHTS = 8;
const SHADOW_SIZE = 256;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** the six faces of a cube map as cameras: [face target offset, forward, right, up] (GL's cube map layout) */
const CUBE_FACES: [number, Vec3, Vec3, Vec3][] = [
  [0, [1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [1, [-1, 0, 0], [0, 0, 1], [0, -1, 0]],
  [2, [0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [3, [0, -1, 0], [1, 0, 0], [0, 0, -1]],
  [4, [0, 0, 1], [1, 0, 0], [0, -1, 0]],
  [5, [0, 0, -1], [-1, 0, 0], [0, -1, 0]],
];

/** The lights to draw this frame: the brightest near the focus first; one that casts shadows goes first. */
export function pickLights(all: readonly PointLight[], focus: Vec3, max = MAX_LIGHTS, shadows = true): PointLight[] {
  const score = (l: PointLight) => {
    const d = Math.hypot(l.pos[0] - focus[0], l.pos[1] - focus[1], l.pos[2] - focus[2]);
    const bright = Math.max(l.color[0], l.color[1], l.color[2]);
    return (bright * l.range) / (1 + Math.max(0, d - l.range));
  };
  const near = all.filter((l) => l.range > 0 && Math.max(...l.color) > 0.001);
  near.sort((a, b) => score(b) - score(a));
  const picked = near.slice(0, max);
  const s = shadows ? picked.findIndex((l) => l.shadow) : -1;
  if (s > 0) picked.unshift(picked.splice(s, 1)[0]!);
  return picked;
}

export type FrameStats = {
  drawCalls: number;
  instances: number;
  chunksDrawn: number;
  chunks: number;
  ms: number;
  /** P27 part 4: lights drawn, the most allowed, and whether a shadow was drawn this frame */
  lights?: number;
  maxLights?: number;
  shadowed?: boolean;
};

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
  // the same attribute slots in every program, so the brick and shadow passes share their buffers
  for (const [i, n] of ['aPosition', 'aNormal', 'aInstanceOffset', 'aInstanceColor'].entries())
    gl.bindAttribLocation(p, i, n);
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
  /** P27 part 3: how far chunks are drawn (studs; a streamed big map sets it, and the fog closes in before it) */
  viewDistance = Number.POSITIVE_INFINITY;
  floor = true;
  skySample: SkySample | null = null;
  snow = false;
  /** P23: the particles of this frame (set before render) */
  particles: ParticleBatch[] = [];
  seed = 73521;
  clock = 0;
  /** P27: the lights of this frame (set before render), how dark the map is without them, and shadows on */
  lights: PointLight[] = [];
  darkness = 0;
  /** P27 part 2: the map's fog (null: v68's haze) */
  fog: FogParams | null = null;
  private fogNow = { color: [0.1, 0.12, 0.16], near: 55, far: 120, max: 0.62, height: 0, ground: 0 };
  shadows = true;
  /** P27 part 4 (quality levels): lights drawn at once (up to MAX_LIGHTS), the shadow map's size, how far studs are
   *  drawn (× lodDistance), the most screen pixels per CSS pixel, and the ground fog layer */
  maxLights = MAX_LIGHTS;
  shadowSize = SHADOW_SIZE;
  detailScale = 1;
  pixelRatio = 2;
  groundFog = true;
  private shadowAlloc = 0;
  /** the lights drawn in the last frame (the first casts the shadow when `shadowed`) */
  lit: PointLight[] = [];
  shadowed = false;
  private readonly shadowProg: WebGLProgram;
  private readonly shu: Record<string, WebGLUniformLocation | null>;
  private shadowCube: WebGLTexture | null = null;
  private shadowFbo: WebGLFramebuffer | null = null;
  private shadowDepth: WebGLRenderbuffer | null = null;
  private shadowKey = '';
  /** changes whenever a chunk's bricks change (the shadow map is drawn again) */
  private chunkRev = 0;
  /** uniform locations of other programs that share the brick fragment shader (characters) */
  private lightLocs = new WeakMap<WebGLProgram, Record<string, WebGLUniformLocation | null>>();
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
        'uModel',
        'uPL',
        'uPC',
        'uPLN',
        'uDark',
        'uShadow',
        'uShadowOn',
        'uShadowAt',
        'uFogMax',
        'uFogH',
      ].map((n) => [n, U(this.prog, n)]),
    );
    this.shadowProg = compile(gl, VERTEX, SHADOW_FRAGMENT);
    this.shu = Object.fromEntries(
      ['uMVP', 'uModel', 'uOffset', 'uInstances', 'uShadowAt', 'uPointSize'].map((n) => [n, U(this.shadowProg, n)]),
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
        'uDark',
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

  /** the mesh a marker draws: a down-pointing triangle, a cone or a box */
  /** P23: one particle's mesh, centred on its point */
  private particleMesh(shape: ParticleBatch['shape'], size: number): Mesh {
    const key = `particle:${shape}:${size}`;
    let m = this.meshes.get(key);
    if (!m) {
      const h = shape === 'brick' ? size * 1.2 : shape === 'stud' ? size * 0.7 : size * 0.4;
      m = this.upload(plainBox(size, h, size, shape === 'stud' ? size * 0.3 : Math.min(0.04, size * 0.15)));
      this.meshes.set(key, m);
    }
    return m;
  }

  private markerMesh(m: Marker): Mesh {
    if (m.tri !== undefined) {
      // the facing is kept to 64 steps so a handful of meshes are cached
      const step = Math.round((m.tri / (Math.PI * 2)) * 64) & 63;
      const key = `tri:${m.size.join(',')}:${step}`;
      let mesh = this.meshes.get(key);
      if (!mesh) {
        mesh = this.upload(downTriangle(m.size[0], m.size[1], m.size[2], (step / 64) * Math.PI * 2));
        this.meshes.set(key, mesh);
      }
      return mesh;
    }
    if (m.cone) return this.coneMesh(m.size[0] / 2, m.size[1], m.cone);
    if (m.facing !== undefined) {
      const step = Math.round((m.facing / (Math.PI * 2)) * 64) & 63;
      const key = `face:${m.size.join(',')}:${step}`;
      let mesh = this.meshes.get(key);
      if (!mesh) {
        mesh = this.upload(turnedY(plainBox(m.size[0], m.size[1], m.size[2]), (step / 64) * Math.PI * 2));
        this.meshes.set(key, mesh);
      }
      return mesh;
    }
    return this.boxMesh(`marker:${m.size.join(',')}`, m.size[0], m.size[1], m.size[2]);
  }

  private coneMesh(r: number, h: number, axis: 'x' | 'y' | 'z' | '-y'): Mesh {
    const key = `cone:${r},${h},${axis}`;
    let m = this.meshes.get(key);
    if (!m) {
      m = this.upload(coneGeometry(r, h, axis));
      this.meshes.set(key, m);
    }
    return m;
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
      { w: number; d: number; kind: RenderBrick['kind']; paved: boolean; covered: boolean; values: number[] }
    >();
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    // P27 part 3: bricks whose studs are all under other bricks of the chunk draw without studs
    const cell = (x: number, z: number, y: number) => ((x + 4096) * 8192 + (z + 4096)) * 512 + y;
    const bottoms = new Set<number>();
    for (const b of bricks)
      for (let i = 0; i < b.w; i++) for (let j = 0; j < b.d; j++) bottoms.add(cell(b.x + i, b.z + j, b.y));
    const isCovered = (b: RenderBrick) => {
      if (b.kind === 'tile') return false;
      const top = b.y + (b.kind === 'brick' ? 3 : 1);
      for (let i = 0; i < b.w; i++)
        for (let j = 0; j < b.d; j++) if (!bottoms.has(cell(b.x + i, b.z + j, top))) return false;
      return true;
    };
    for (const b of bricks) {
      const paved = !!b.paved;
      const covered = !paved && isCovered(b);
      const k = `${b.w},${b.d},${b.kind},${paved},${covered}`;
      const g = groups.get(k) ?? { w: b.w, d: b.d, kind: b.kind, paved, covered, values: [] };
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
      batches.push({
        w: g.w,
        d: g.d,
        kind: g.kind,
        paved: g.paved,
        covered: g.covered,
        buffer,
        count: g.values.length / 6,
      });
    }
    this.chunks.set(key, { batches, min, max, bricks: bricks.length });
    this.chunkRev++;
  }

  dropChunk(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const b of c.batches) this.gl.deleteBuffer(b.buffer);
    this.chunks.delete(key);
    this.chunkRev++;
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
    // P27: the lights near the focus; the first that casts shadows draws its shadow map first
    this.lit = pickLights(this.lights, focus, Math.min(MAX_LIGHTS, this.maxLights), this.shadows && !!this.inst);
    this.shadowed = !!this.lit[0]?.shadow && this.shadows && !!this.inst;
    if (this.shadowed) this.drawShadowCube(this.lit[0]!);
    this.stats.lights = this.lit.length;
    this.stats.maxLights = Math.min(MAX_LIGHTS, this.maxLights);
    this.stats.shadowed = this.shadowed;
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatio);
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
    // the fog of this frame: the map's (P27 part 2), else v68's haze that follows the camera's distance
    const fogDark = 1 - this.darkness * 0.9;
    const f = this.fog;
    const fc = f?.color ?? s?.horizon ?? [0.1, 0.12, 0.16];
    this.fogNow = {
      color: [fc[0]! * fogDark, fc[1]! * fogDark, fc[2]! * fogDark],
      near: f ? f.near : Math.max(55, cam.distance * 0.9),
      far: f ? f.far : Math.max(120, cam.distance * 2.5),
      max: f ? f.max : 0.62,
      height: f?.height ?? 0,
      ground: this.groundFog ? (f?.ground ?? 0) : 0,
    };
    // P27 part 3: where a streamed map's chunks end, the fog is whole (no visible edge)
    if (Number.isFinite(this.viewDistance)) {
      const fn = this.fogNow;
      // measured from the eye: the view distance around what the camera looks at, plus the camera's own distance
      const edge = this.viewDistance + (cam.distance ?? 0);
      if (fn.far > edge || fn.max < 1) {
        fn.far = Math.min(fn.far, edge);
        fn.near = Math.min(fn.near, edge * 0.55);
        fn.max = 1;
      }
    }
    gl.uniformMatrix4fv(this.u.uModel!, false, IDENTITY);
    this.applyLights(this.prog, this.u);
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
      // distance from the eye to the nearest point of the chunk box
      const dx = Math.max(c.min[0] - cam.eye[0], 0, cam.eye[0] - c.max[0]);
      const dy = Math.max(c.min[1] - cam.eye[1], 0, cam.eye[1] - c.max[1]);
      const dz = Math.max(c.min[2] - cam.eye[2], 0, cam.eye[2] - c.max[2]);
      const dist = Math.hypot(dx, dy, dz);
      if (dist > this.viewDistance + (cam.distance ?? 0)) continue;
      this.stats.chunksDrawn++;
      const far = dist > this.lodDistance * this.detailScale;
      for (const b of c.batches) {
        gl.uniform1f(this.u.uPavement!, b.paved ? 1 : 0);
        const mesh =
          (far || b.covered) && !b.paved ? this.lodShape(b.w, b.d, b.kind) : this.shape(b.w, b.d, b.kind, b.paved);
        if (this.inst) this.drawInstanced(mesh, b.buffer, b.count);
      }
    }
    gl.uniform1f(this.u.uPavement!, 0);
    gl.uniform1f(this.u.uInstances!, 0);

    // P23: particles, instanced by shape and size
    if (this.particles.length && this.inst) {
      gl.uniform1f(this.u.uInstances!, 1);
      for (const b of this.particles) {
        if (!b.count) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuf);
        gl.bufferData(gl.ARRAY_BUFFER, b.data, gl.DYNAMIC_DRAW);
        this.drawInstanced(this.particleMesh(b.shape, b.size), this.overlayBuf, b.count);
      }
      gl.uniform1f(this.u.uInstances!, 0);
    }

    for (const m of markers) {
      if (m.onTop) continue;
      const see = m.alpha !== undefined && m.alpha < 1;
      if (see) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // see-through markers (ghost bricks) never hide the characters drawn after them
        gl.depthMask(false);
      }
      this.drawSingle(this.markerMesh(m), m.pos, m.color, m.alpha ?? 1, true);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }

    for (const o of overlays) {
      if (o.model) gl.uniformMatrix4fv(this.u.uModel!, false, o.model);
      if (o.alpha < 1) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthFunc(gl.LEQUAL);
      }
      this.drawBrickList(o.bricks, o.alpha, o.flat, o.color);
      gl.disable(gl.BLEND);
      gl.depthFunc(gl.LESS);
      if (o.model) gl.uniformMatrix4fv(this.u.uModel!, false, IDENTITY);
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
        if (set.onTop) gl.disable(gl.DEPTH_TEST);
        else gl.enable(gl.DEPTH_TEST);
        gl.uniform3fv(this.u.uColor!, set.color);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(set.lines), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.a.p);
        gl.vertexAttribPointer(this.a.p, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, set.lines.length / 3);
        this.stats.drawCalls++;
      }
      gl.enable(gl.DEPTH_TEST);
    }
    if (extra) {
      extra(mvp, cam.eye);
      gl.useProgram(this.prog);
    }
    // gizmo handles: over the scene, but in depth order among themselves
    const top = markers.filter((m) => m.onTop);
    if (top.length) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      for (const m of top) this.drawSingle(this.markerMesh(m), m.pos, m.color, 1, true);
    }
    this.stats.ms = performance.now() - t0;
    return this.stats;
  }

  /**
   * P27: sets this frame's lights, darkness and shadow map on a program that uses the brick fragment shader (the
   * bricks', or the characters' when drawn after begin()).
   */
  applyLights(prog: WebGLProgram, locs?: Record<string, WebGLUniformLocation | null>) {
    const gl = this.gl;
    let u = locs ?? this.lightLocs.get(prog);
    if (!u) {
      u = Object.fromEntries(
        [
          'uPL',
          'uPC',
          'uPLN',
          'uDark',
          'uShadow',
          'uShadowOn',
          'uShadowAt',
          'uFog',
          'uFogRange',
          'uFogMax',
          'uFogH',
        ].map((n) => [n, gl.getUniformLocation(prog, n)]),
      );
      this.lightLocs.set(prog, u);
    }
    const pl = new Float32Array(MAX_LIGHTS * 4);
    const pc = new Float32Array(MAX_LIGHTS * 4);
    this.lit.forEach((l, i) => {
      pl.set([l.pos[0], l.pos[1], l.pos[2], l.range], i * 4);
      pc.set([l.color[0], l.color[1], l.color[2], 0], i * 4);
    });
    if (u.uPL) gl.uniform4fv(u.uPL, pl);
    if (u.uPC) gl.uniform4fv(u.uPC, pc);
    if (u.uPLN) gl.uniform1f(u.uPLN, this.lit.length);
    if (u.uDark) gl.uniform1f(u.uDark, this.darkness);
    // P27 part 2: the frame's fog (characters too, so they fade into it like the bricks)
    const fg = this.fogNow;
    if (u.uFog) gl.uniform3fv(u.uFog, fg.color);
    if (u.uFogRange) gl.uniform2f(u.uFogRange, fg.near, fg.far);
    if (u.uFogMax) gl.uniform1f(u.uFogMax, fg.max);
    if (u.uFogH) gl.uniform2f(u.uFogH, fg.height, fg.ground);
    const sh = this.shadowed && this.shadowCube;
    if (u.uShadowOn) gl.uniform1f(u.uShadowOn, sh ? 1 : 0);
    if (u.uShadow) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, sh ? this.shadowCube : null);
      gl.uniform1i(u.uShadow, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
    if (u.uShadowAt && sh) {
      const l = this.lit[0]!;
      gl.uniform4f(u.uShadowAt, l.pos[0], l.pos[1], l.pos[2], l.range);
    }
  }

  /** P27: the distance from the light to the nearest brick in every direction, drawn again when it or the bricks change */
  private drawShadowCube(light: PointLight) {
    const gl = this.gl;
    const key = `${light.pos.map((v) => v.toFixed(2)).join(',')}|${light.range}|${this.chunkRev}`;
    const size = this.shadowSize;
    if (key === this.shadowKey && this.shadowCube && size === this.shadowAlloc) return;
    this.shadowKey = key;
    // a quality change asks for another size: make the map again
    if (this.shadowCube && size !== this.shadowAlloc) {
      gl.deleteTexture(this.shadowCube);
      gl.deleteFramebuffer(this.shadowFbo);
      gl.deleteRenderbuffer(this.shadowDepth);
      this.shadowCube = null;
    }
    if (!this.shadowCube) {
      this.shadowAlloc = size;
      this.shadowCube = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.shadowCube);
      for (let f = 0; f < 6; f++)
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.shadowFbo = gl.createFramebuffer()!;
      this.shadowDepth = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    }
    gl.useProgram(this.shadowProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shadowDepth);
    gl.viewport(0, 0, size, size);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const u = this.shu;
    gl.uniformMatrix4fv(u.uModel!, false, IDENTITY);
    gl.uniform3fv(u.uOffset!, [0, 0, 0]);
    gl.uniform1f(u.uInstances!, 1);
    gl.uniform4f(u.uShadowAt!, light.pos[0], light.pos[1], light.pos[2], light.range);
    const proj = perspective(Math.PI / 2, 1, 0.05, light.range + 1);
    const r = light.range;
    const near = [...this.chunks.values()].filter(
      (c) =>
        light.pos[0] > c.min[0] - r &&
        light.pos[0] < c.max[0] + r &&
        light.pos[1] > c.min[1] - r &&
        light.pos[1] < c.max[1] + r &&
        light.pos[2] > c.min[2] - r &&
        light.pos[2] < c.max[2] + r,
    );
    for (const [face, fwd, right, up] of CUBE_FACES) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        this.shadowCube,
        0,
      );
      // nothing in a direction: as far as the light reaches
      gl.clearColor(1, 1, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const mvp = multiply(proj, viewMatrix(light.pos, right, up, fwd));
      gl.uniformMatrix4fv(u.uMVP!, false, mvp);
      const planes = frustumPlanes(mvp);
      for (const c of near) {
        if (!boxVisible(planes, c.min, c.max)) continue;
        for (const b of c.batches) this.drawInstanced(this.shape(b.w, b.d, b.kind, b.paved), b.buffer, b.count);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    gl.uniform1f(u.uDark!, this.darkness);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(this.a.sky);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    this.stats.drawCalls++;
  }

  /** Reads the color under a pixel (tests and screenshots). */
  /** Frees the GPU buffers; `release` also gives the drawing context back (the canvas is not drawn on again). */
  dispose(release = false) {
    this.clearChunks();
    for (const m of this.meshes.values()) {
      this.gl.deleteBuffer(m.p);
      this.gl.deleteBuffer(m.n);
    }
    this.meshes.clear();
    // browsers keep only about 16 drawing contexts; a closed view should not hold one
    if (release) this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
