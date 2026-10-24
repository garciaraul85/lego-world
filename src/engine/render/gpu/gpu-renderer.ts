import type { SkySample } from '../../../core/legacy/modules';
import type { FogParams } from '../../lighting/atmosphere';
import { brickGeometry, coneGeometry, downTriangle, type Geometry, plainBox, turnedY } from '../brick-geometry';
import type { CameraFrame } from '../camera';
import { boxVisible, frustumPlanes, multiply, perspective, type Vec3, viewMatrix } from '../math';
import {
  brickCenter,
  brickHeightUnits,
  brickRgb,
  chunkGroups,
  type FrameStats,
  frameFog,
  type LineSet,
  LOD_DISTANCE,
  MAX_LIGHTS,
  type Marker,
  type Overlay,
  type ParticleBatch,
  type PointLight,
  pickLights,
  type RenderBrick,
} from '../renderer';
import { BRICK_WGSL, SKY_WGSL } from './shaders.wgsl';

/**
 * Milestone 2b, 10c part 1: the WebGPU renderer. It draws what the WebGL renderer draws for a scene — the sky,
 * bricks chunk by chunk (instanced by shape, studs left off far away and where bricks cover them), the floor
 * grid, fog, point lights and darkness, markers, overlays, lines and particles — the same way, so a map looks the
 * same drawn with either. Characters (part 2) and shadows (part 3) come next; the WebGL renderer stays the
 * fallback where a browser has no WebGPU.
 */

let gpu: { adapter: GPUAdapter; device: GPUDevice; format: GPUTextureFormat } | null = null;
let gpuLoading: Promise<boolean> | null = null;

/** asks the browser for a WebGPU device once (false: this browser has none, WebGL draws instead) */
export function initGpu(): Promise<boolean> {
  gpuLoading ??= (async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return false;
      // (a browser that takes too long to answer draws with WebGL)
      const adapter = await Promise.race([
        navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      if (!adapter) return false;
      const device = await adapter.requestDevice();
      gpu = { adapter, device, format: navigator.gpu.getPreferredCanvasFormat() };
      device.lost.then(() => {
        gpu = null;
        gpuLoading = null;
      });
      return true;
    } catch {
      return false;
    }
  })();
  return gpuLoading;
}

/** WebGPU is ready to draw with in this browser */
export const gpuReady = () => !!gpu;

const SAMPLES = 4;
const DRAW_SIZE = 256;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

type GpuMesh = { p: GPUBuffer; n: GPUBuffer; count: number };
type GpuBatch = {
  w: number;
  d: number;
  kind: RenderBrick['kind'];
  paved: boolean;
  covered: boolean;
  buffer: GPUBuffer;
  count: number;
};
type GpuChunk = { batches: GpuBatch[]; min: Vec3; max: Vec3; bricks: number };

/** one draw of this frame: which pipeline, mesh, instances (offset into the frame's instance data) and settings */
type DrawCall = {
  pipe: GPURenderPipeline;
  mesh?: GpuMesh;
  /** instances from a chunk's own buffer, or from the frame's instance data */
  inst?: { buffer: GPUBuffer; offset: number; count: number };
  /** a line set: vertices in the frame's line data */
  line?: { offset: number; count: number };
  slot: number;
  /** drawn after the depth is cleared (gizmo handles) */
  top?: boolean;
};

export class GpuRenderer {
  readonly kind = 'webgpu' as const;
  private readonly device: GPUDevice;
  private readonly ctx: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly frameBuf: GPUBuffer;
  private readonly skyBuf: GPUBuffer;
  private drawBuf: GPUBuffer;
  private drawCap = 256;
  private readonly frameGroup: GPUBindGroup;
  private readonly skyGroup: GPUBindGroup;
  private drawGroup: GPUBindGroup;
  private readonly drawLayout: GPUBindGroupLayout;
  private readonly pipes: Record<'opaque' | 'blend' | 'overlay' | 'line' | 'lineTop' | 'sky', GPURenderPipeline>;
  private instBuf: GPUBuffer | null = null;
  private instCap = 0;
  private lineBuf: GPUBuffer | null = null;
  private lineCap = 0;
  private color: GPUTexture | null = null;
  private depth: GPUTexture | null = null;
  private size = [0, 0];
  private meshes = new Map<string, GpuMesh>();
  private chunks = new Map<string, GpuChunk>();

  // the same settings as the WebGL renderer
  segments = 12;
  lodDistance = LOD_DISTANCE;
  viewDistance = Number.POSITIVE_INFINITY;
  floor = true;
  skySample: SkySample | null = null;
  snow = false;
  particles: ParticleBatch[] = [];
  seed = 73521;
  clock = 0;
  lights: PointLight[] = [];
  darkness = 0;
  fog: FogParams | null = null;
  shadows = true;
  maxLights = MAX_LIGHTS;
  shadowSize = 256;
  detailScale = 1;
  pixelRatio = 2;
  groundFog = true;
  lit: PointLight[] = [];
  /** shadows come in part 3: none are drawn yet */
  shadowed = false;
  stats: FrameStats = { drawCalls: 0, instances: 0, chunksDrawn: 0, chunks: 0, ms: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    if (!gpu) throw new Error('WebGPU is not available in this browser.');
    this.device = gpu.device;
    this.format = gpu.format;
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('This canvas cannot draw with WebGPU.');
    this.ctx = ctx;
    ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    const d = this.device;
    this.frameBuf = d.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyBuf = d.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.drawBuf = d.createBuffer({
      size: DRAW_SIZE * this.drawCap,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const frameLayout = d.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }],
    });
    this.drawLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { hasDynamicOffset: true, minBindingSize: 96 },
        },
      ],
    });
    const skyLayout = d.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }],
    });
    this.frameGroup = d.createBindGroup({
      layout: frameLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameBuf } }],
    });
    this.skyGroup = d.createBindGroup({
      layout: skyLayout,
      entries: [{ binding: 0, resource: { buffer: this.skyBuf } }],
    });
    this.drawGroup = this.makeDrawGroup();
    const brick = d.createShaderModule({ code: BRICK_WGSL });
    const sky = d.createShaderModule({ code: SKY_WGSL });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [frameLayout, this.drawLayout] });
    const meshBuffers: GPUVertexBufferLayout[] = [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
      {
        arrayStride: 24,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 2, offset: 0, format: 'float32x3' },
          { shaderLocation: 3, offset: 12, format: 'float32x3' },
        ],
      },
    ];
    const blend: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const tri = (depthWrite: boolean, compare: GPUCompareFunction, withBlend: boolean): GPURenderPipeline =>
      d.createRenderPipeline({
        layout,
        vertex: { module: brick, entryPoint: 'vs', buffers: meshBuffers },
        fragment: {
          module: brick,
          entryPoint: 'fs',
          targets: [{ format: this.format, ...(withBlend ? { blend } : {}) }],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: depthWrite, depthCompare: compare },
        multisample: { count: SAMPLES },
      });
    const line = (onTop: boolean) =>
      d.createRenderPipeline({
        layout,
        vertex: {
          module: brick,
          entryPoint: 'vsLine',
          buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
        },
        fragment: { module: brick, entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology: 'line-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: !onTop, depthCompare: onTop ? 'always' : 'less' },
        multisample: { count: SAMPLES },
      });
    this.pipes = {
      opaque: tri(true, 'less', false),
      // see-through markers never hide what is drawn after them
      blend: tri(false, 'less', true),
      // see-through overlays (ghost, selection) over what they cover
      overlay: tri(true, 'less-equal', true),
      line: line(false),
      lineTop: line(true),
      sky: d.createRenderPipeline({
        layout: d.createPipelineLayout({ bindGroupLayouts: [skyLayout] }),
        vertex: { module: sky, entryPoint: 'vs' },
        fragment: { module: sky, entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
        multisample: { count: SAMPLES },
      }),
    };
  }

  get instanced(): boolean {
    return true;
  }

  private makeDrawGroup() {
    return this.device.createBindGroup({
      layout: this.drawLayout,
      entries: [{ binding: 0, resource: { buffer: this.drawBuf, size: 96 } }],
    });
  }

  private upload(g: Geometry): GpuMesh {
    const make = (a: Float32Array) => {
      const b = this.device.createBuffer({
        size: Math.max(16, a.byteLength),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(b, 0, a);
      return b;
    };
    return { p: make(g.positions), n: make(g.normals), count: g.positions.length / 3 };
  }

  private cached(key: string, make: () => Geometry): GpuMesh {
    let m = this.meshes.get(key);
    if (!m) {
      m = this.upload(make());
      this.meshes.set(key, m);
    }
    return m;
  }

  private shape(w: number, d: number, kind: RenderBrick['kind'], paved: boolean): GpuMesh {
    return this.cached(`${w},${d},${kind},${paved},${this.segments}`, () =>
      brickGeometry(w, d, kind, this.segments, paved),
    );
  }

  private lodShape(w: number, d: number, kind: RenderBrick['kind']): GpuMesh {
    return this.cached(`lod:${w},${d},${kind}`, () => plainBox(w - 0.025, brickHeightUnits(kind), d - 0.025));
  }

  private particleMesh(shape: ParticleBatch['shape'], size: number): GpuMesh {
    return this.cached(`particle:${shape}:${size}`, () => {
      const h = shape === 'brick' ? size * 1.2 : shape === 'stud' ? size * 0.7 : size * 0.4;
      return plainBox(size, h, size, shape === 'stud' ? size * 0.3 : Math.min(0.04, size * 0.15));
    });
  }

  private markerMesh(m: Marker): GpuMesh {
    if (m.tri !== undefined) {
      const step = Math.round((m.tri / (Math.PI * 2)) * 64) & 63;
      return this.cached(`tri:${m.size.join(',')}:${step}`, () =>
        downTriangle(m.size[0], m.size[1], m.size[2], (step / 64) * Math.PI * 2),
      );
    }
    if (m.cone) {
      const axis = m.cone;
      return this.cached(`cone:${m.size[0] / 2},${m.size[1]},${axis}`, () =>
        coneGeometry(m.size[0] / 2, m.size[1], axis),
      );
    }
    if (m.facing !== undefined) {
      const step = Math.round((m.facing / (Math.PI * 2)) * 64) & 63;
      return this.cached(`face:${m.size.join(',')}:${step}`, () =>
        turnedY(plainBox(m.size[0], m.size[1], m.size[2]), (step / 64) * Math.PI * 2),
      );
    }
    return this.cached(`marker:${m.size.join(',')}`, () => plainBox(m.size[0], m.size[1], m.size[2]));
  }

  setChunk(key: string, bricks: readonly RenderBrick[]) {
    this.dropChunk(key);
    if (!bricks.length) return;
    const { groups, min, max } = chunkGroups(bricks);
    const batches: GpuBatch[] = groups.map((g) => {
      const buffer = this.device.createBuffer({
        size: Math.max(16, g.values.byteLength),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(buffer, 0, g.values);
      return { w: g.w, d: g.d, kind: g.kind, paved: g.paved, covered: g.covered, buffer, count: g.values.length / 6 };
    });
    this.chunks.set(key, { batches, min, max, bricks: bricks.length });
  }

  dropChunk(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const b of c.batches) b.buffer.destroy();
    this.chunks.delete(key);
  }

  clearChunks() {
    for (const k of [...this.chunks.keys()]) this.dropChunk(k);
  }

  setSegments(n: number) {
    if (n === this.segments) return;
    this.segments = n;
    for (const m of this.meshes.values()) {
      m.p.destroy();
      m.n.destroy();
    }
    this.meshes.clear();
  }

  /** the multisampled colour and the depth of the frame, made again when the canvas changes size */
  private targets(w: number, h: number) {
    if (this.size[0] === w && this.size[1] === h && this.color && this.depth) return;
    this.color?.destroy();
    this.depth?.destroy();
    this.size = [w, h];
    this.color = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLES,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depth = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLES,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  render(
    cam: CameraFrame,
    focus: Vec3,
    overlays: Overlay[] = [],
    lines: LineSet[] = [],
    markers: Marker[] = [],
    extra?: (mvp: Float32Array, eye: Vec3) => void,
  ): FrameStats {
    void extra; // characters are drawn by WebGL only until part 2
    const t0 = performance.now();
    this.stats = { drawCalls: 0, instances: 0, chunksDrawn: 0, chunks: this.chunks.size, ms: 0 };
    this.lit = pickLights(this.lights, focus, Math.min(MAX_LIGHTS, this.maxLights), false);
    this.stats.lights = this.lit.length;
    this.stats.maxLights = Math.min(MAX_LIGHTS, this.maxLights);
    this.stats.shadowed = false;
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatio);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.targets(w, h);
    const aspect = w / h;
    const s = this.skySample;
    const mvp = multiply(perspective(cam.fov, aspect), viewMatrix(cam.eye, cam.right, cam.up, cam.forward));
    const fog = frameFog(this.fog, s, this.darkness, cam, this.groundFog, this.viewDistance);

    // the frame's settings
    const fr = new Float32Array(128);
    fr.set(mvp, 0);
    fr.set([...cam.eye, 0], 16);
    fr.set([...(s?.light ?? [0.5, 1, 0.6]), 0], 20);
    fr.set([...(s?.ambient ?? [0.36, 0.39, 0.43]), 0], 24);
    fr.set([...fog.color, fog.max], 28);
    fr.set([fog.near, fog.far, fog.height, fog.ground], 32);
    fr.set([this.snow ? 1 : 0, s?.night ?? 0, this.darkness, this.lit.length], 36);
    this.lit.forEach((l, i) => {
      fr.set([l.pos[0], l.pos[1], l.pos[2], l.range], 40 + i * 4);
      fr.set([l.color[0], l.color[1], l.color[2], 0], 72 + i * 4);
    });
    this.device.queue.writeBuffer(this.frameBuf, 0, fr);

    // every draw's settings (one 256-byte slot each) and instances, gathered then uploaded at once
    const slots: number[] = [];
    const slot = (model: Float32Array, alpha: number, flat: boolean, floor: boolean, pav: boolean, color?: Vec3) => {
      const base = slots.length;
      slots.push(...model, alpha, flat ? 1 : 0, floor ? 1 : 0, pav ? 1 : 0, ...(color ?? [0, 0, 0]), 1);
      for (let i = slots.length - base; i < DRAW_SIZE / 4; i++) slots.push(0);
      return base / (DRAW_SIZE / 4);
    };
    const inst: number[] = [];
    const lineData: number[] = [];
    const calls: DrawCall[] = [];
    const frameInst = (values: ArrayLike<number>) => {
      const offset = inst.length * 4;
      for (let i = 0; i < values.length; i++) inst.push(values[i]!);
      return { offset, count: values.length / 6 };
    };

    if (this.floor) {
      const f = frameInst([Math.round(focus[0]), -0.1, Math.round(focus[2]), 0.1, 0.14, 0.2]);
      calls.push({
        pipe: this.pipes.opaque,
        mesh: this.cached('floor', () => plainBox(48, 0.15, 48)),
        inst: { buffer: null as never, ...f },
        slot: slot(IDENTITY, 1, false, true, false),
      });
    }
    const planes = frustumPlanes(mvp);
    const plain = slot(IDENTITY, 1, false, false, false);
    const paved = slot(IDENTITY, 1, false, false, true);
    for (const c of this.chunks.values()) {
      if (!boxVisible(planes, c.min, c.max)) continue;
      const dx = Math.max(c.min[0] - cam.eye[0], 0, cam.eye[0] - c.max[0]);
      const dy = Math.max(c.min[1] - cam.eye[1], 0, cam.eye[1] - c.max[1]);
      const dz = Math.max(c.min[2] - cam.eye[2], 0, cam.eye[2] - c.max[2]);
      const dist = Math.hypot(dx, dy, dz);
      if (dist > this.viewDistance + (cam.distance ?? 0)) continue;
      this.stats.chunksDrawn++;
      const far = dist > this.lodDistance * this.detailScale;
      for (const b of c.batches) {
        const mesh =
          (far || b.covered) && !b.paved ? this.lodShape(b.w, b.d, b.kind) : this.shape(b.w, b.d, b.kind, b.paved);
        calls.push({
          pipe: this.pipes.opaque,
          mesh,
          inst: { buffer: b.buffer, offset: 0, count: b.count },
          slot: b.paved ? paved : plain,
        });
      }
    }
    for (const b of this.particles) {
      if (!b.count) continue;
      calls.push({
        pipe: this.pipes.opaque,
        mesh: this.particleMesh(b.shape, b.size),
        inst: { buffer: null as never, ...frameInst(b.data.subarray(0, b.count * 6)) },
        slot: plain,
      });
    }
    for (const m of markers) {
      if (m.onTop) continue;
      const see = m.alpha !== undefined && m.alpha < 1;
      calls.push({
        pipe: see ? this.pipes.blend : this.pipes.opaque,
        mesh: this.markerMesh(m),
        inst: { buffer: null as never, ...frameInst([...m.pos, ...m.color]) },
        slot: slot(IDENTITY, m.alpha ?? 1, true, false, false),
      });
    }
    for (const o of overlays) {
      if (!o.bricks.length) continue;
      const sl = slot(o.model ?? IDENTITY, o.alpha, o.flat, false, false);
      const groups = new Map<string, { m: GpuMesh; values: number[] }>();
      for (const b of o.bricks) {
        const k = `${b.w},${b.d},${b.kind}`;
        const g = groups.get(k) ?? { m: this.shape(b.w, b.d, b.kind, false), values: [] };
        if (!groups.has(k)) groups.set(k, g);
        g.values.push(...brickCenter(b), ...(o.color ?? brickRgb(b.color)));
      }
      for (const g of groups.values())
        calls.push({
          pipe: o.alpha < 1 ? this.pipes.overlay : this.pipes.opaque,
          mesh: g.m,
          inst: { buffer: null as never, ...frameInst(g.values) },
          slot: sl,
        });
    }
    for (const set of lines) {
      if (!set.lines.length) continue;
      const offset = lineData.length * 4;
      lineData.push(...set.lines);
      calls.push({
        pipe: set.onTop ? this.pipes.lineTop : this.pipes.line,
        line: { offset, count: set.lines.length / 3 },
        slot: slot(IDENTITY, 1, true, false, false, set.color),
      });
    }
    for (const m of markers)
      if (m.onTop)
        calls.push({
          pipe: this.pipes.opaque,
          mesh: this.markerMesh(m),
          inst: { buffer: null as never, ...frameInst([...m.pos, ...m.color]) },
          slot: slot(IDENTITY, 1, true, false, false),
          top: true,
        });

    // upload what this frame made
    const nSlots = slots.length / (DRAW_SIZE / 4);
    if (nSlots > this.drawCap) {
      this.drawBuf.destroy();
      while (this.drawCap < nSlots) this.drawCap *= 2;
      this.drawBuf = this.device.createBuffer({
        size: DRAW_SIZE * this.drawCap,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.drawGroup = this.makeDrawGroup();
    }
    if (slots.length) this.device.queue.writeBuffer(this.drawBuf, 0, new Float32Array(slots));
    this.instBuf = this.grow(this.instBuf, this.instCap, inst.length * 4, (c) => (this.instCap = c));
    if (inst.length) this.device.queue.writeBuffer(this.instBuf!, 0, new Float32Array(inst));
    this.lineBuf = this.grow(this.lineBuf, this.lineCap, lineData.length * 4, (c) => (this.lineCap = c));
    if (lineData.length) this.device.queue.writeBuffer(this.lineBuf!, 0, new Float32Array(lineData));
    if (s) this.writeSky(s, cam, aspect);

    const enc = this.device.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    const pass = (clear: boolean, list: DrawCall[], sky: boolean) => {
      const p = enc.beginRenderPass({
        colorAttachments: [
          {
            view: this.color!.createView(),
            resolveTarget: view,
            clearValue: { r: 0.06, g: 0.07, b: 0.09, a: 1 },
            loadOp: clear ? 'clear' : 'load',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depth!.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      if (sky) {
        p.setPipeline(this.pipes.sky);
        p.setBindGroup(0, this.skyGroup);
        p.draw(6);
        this.stats.drawCalls++;
      }
      p.setBindGroup(0, this.frameGroup);
      for (const c of list) {
        p.setPipeline(c.pipe);
        p.setBindGroup(1, this.drawGroup, [c.slot * DRAW_SIZE]);
        if (c.line) {
          p.setVertexBuffer(0, this.lineBuf!, c.line.offset);
          p.draw(c.line.count);
        } else if (c.mesh && c.inst) {
          p.setVertexBuffer(0, c.mesh.p);
          p.setVertexBuffer(1, c.mesh.n);
          p.setVertexBuffer(2, c.inst.buffer ?? this.instBuf!, c.inst.offset);
          p.draw(c.mesh.count, c.inst.count);
          this.stats.instances += c.inst.count;
        }
        this.stats.drawCalls++;
      }
      p.end();
    };
    pass(
      true,
      calls.filter((c) => !c.top),
      !!s,
    );
    const top = calls.filter((c) => c.top);
    if (top.length) pass(false, top, false);
    this.device.queue.submit([enc.finish()]);
    this.stats.ms = performance.now() - t0;
    return this.stats;
  }

  private grow(buf: GPUBuffer | null, cap: number, bytes: number, set: (c: number) => void): GPUBuffer | null {
    if (bytes <= cap && buf) return buf;
    buf?.destroy();
    let c = Math.max(4096, cap);
    while (c < bytes) c *= 2;
    set(c);
    return this.device.createBuffer({ size: c, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  private writeSky(s: SkySample, cam: CameraFrame, aspect: number) {
    const a = new Float32Array(36);
    a.set([...s.zenith, 0], 0);
    a.set([...s.horizon, 0], 4);
    a.set([...cam.right, 0], 8);
    a.set([...cam.up, 0], 12);
    a.set([...cam.forward, 0], 16);
    a.set([...(s.sun ?? [0, 1, 0]), 0], 20);
    a.set([...(s.moon ?? [0, -1, 0]), 0], 24);
    a.set([s.night, s.overcast, this.clock, aspect], 28);
    a.set([Math.tan(cam.fov / 2), this.seed % 4096, 0, this.darkness], 32);
    this.device.queue.writeBuffer(this.skyBuf, 0, a);
  }

  /** frees what it holds on the GPU (`release` as the WebGL renderer's: the canvas is not drawn on again) */
  dispose(release = false) {
    void release;
    this.clearChunks();
    for (const m of this.meshes.values()) {
      m.p.destroy();
      m.n.destroy();
    }
    this.meshes.clear();
    this.color?.destroy();
    this.depth?.destroy();
    this.instBuf?.destroy();
    this.lineBuf?.destroy();
    this.drawBuf.destroy();
    this.ctx.unconfigure();
  }
}
