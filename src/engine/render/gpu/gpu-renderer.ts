import type { SkySample } from '../../../core/legacy/modules';
import type { FogParams } from '../../lighting/atmosphere';
import { brickGeometry, coneGeometry, downTriangle, type Geometry, plainBox, turnedY } from '../brick-geometry';
import type { CameraFrame } from '../camera';
import { boxVisible, frustumPlanes, multiply, perspective, type Vec3, viewMatrix } from '../math';
import { drawBox, type ModelDraw, type ModelUpload } from '../model-draw';
import {
  brickCenter,
  brickHeightUnits,
  brickRgb,
  CUBE_FACES,
  chunkGroups,
  type FrameStats,
  frameFog,
  type LineSet,
  LOD_DISTANCE,
  MAX_LIGHTS,
  MAX_SHADOWS,
  type Marker,
  type Overlay,
  type ParticleBatch,
  type PointLight,
  pickLights,
  type RenderBrick,
  shadowCount,
} from '../renderer';
import { mirrorAt, reflectedWater, type WaterSurface, waterBody } from '../water';
import { GlShim, type ShimBuffer, type ShimDraw } from './gl-shim';
import { BRICK_WGSL, CHAR_WGSL, MESH_WGSL, SHADOW_WGSL, SKY_WGSL, WATER_WGSL } from './shaders.wgsl';

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
      // can this browser show what WebGPU draws on a page? (some draw it but cannot show it): a tiny try first
      if (!offscreen && !(await canShow(device, gpu.format))) {
        gpuBroken = true;
        return false;
      }
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

async function canShow(device: GPUDevice, format: GPUTextureFormat): Promise<boolean> {
  try {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('webgpu');
    if (!ctx) return false;
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const enc = device.createCommandEncoder();
    enc
      .beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' }],
      })
      .end();
    device.queue.submit([enc.finish()]);
    await Promise.race([
      device.queue.onSubmittedWorkDone(),
      new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 3000)),
    ]);
    ctx.unconfigure();
    return true;
  } catch {
    return false;
  }
}

/** WebGPU is ready to draw with in this browser (and has not failed to show a picture here) */
export const gpuReady = () => !!gpu && !gpuBroken;

let gpuBroken = false;
/** a view could not show what WebGPU drew (the browser lost it): WebGL draws from now on */
export function markGpuBroken() {
  gpuBroken = true;
}

let offscreen = false;
/**
 * tests: draw into a picture of its own instead of the page (a browser that cannot show WebGPU on the page, as
 * the test machine's, still draws; snapshot() reads the picture)
 */
export function setGpuOffscreen(on: boolean) {
  offscreen = on;
}

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
  /** part 2: a draw of v68's character model */
  char?: ShimDraw;
  /** part 4: the water's surfaces (how many) */
  water?: number;
  /** part 5: a part of an imported model */
  part?: GpuModelPart;
};

/** part 5: a model's part on the GPU */
type GpuModelPart = {
  p: GPUBuffer;
  n: GPUBuffer;
  uv: GPUBuffer;
  count: number;
  color: [number, number, number, number];
  texture: GPUTexture | null;
  group: GPUBindGroup | null;
};
type GpuModel = { parts: GpuModelPart[]; min: [number, number, number]; max: [number, number, number] };

/** what casts a shadow besides bricks: a character's draw or a model's part */
type Caster = {
  p: { gpu: GPUBuffer | null };
  n: { gpu: GPUBuffer | null };
  count: number;
  model: Float32Array;
  blend: string;
};

const sameMatrix = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  for (let i = 0; i < 16; i++) if (Math.abs(a[i]! - b[i]!) > 1e-5) return false;
  return true;
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
  private frameGroup: GPUBindGroup;
  private readonly frameLayout: GPUBindGroupLayout;
  private readonly shadowSampler: GPUSampler;
  private readonly noShadow: GPUTexture;
  /** part 3: one shadow map per shadow-casting light: a cube of distances, drawn again when what it sees changes */
  private shadowMaps: { tex: GPUTexture; depth: GPUTexture; key: string; size: number }[] = [];
  private shadowFaceBuf: GPUBuffer | null = null;
  private shadowFaceCap = 0;
  private shadowLayout!: GPUBindGroupLayout;
  private shadowPipes!: { bricks: GPURenderPipeline; chars: GPURenderPipeline };
  private chunkRev = 0;
  /** part 4: the bodies of water to draw, and whether their surfaces mirror the world (the quality level's) */
  water: WaterSurface[] = [];
  reflections = true;
  private waterPipe!: GPURenderPipeline;
  private waterLayout!: GPUBindGroupLayout;
  private waterUni: GPUBuffer | null = null;
  private waterUniCap = 0;
  private waterVerts: GPUBuffer | null = null;
  private waterVertCap = 0;
  private reflectTex: GPUTexture | null = null;
  private frameBufR!: GPUBuffer;
  private frameGroupR!: GPUBindGroup;
  private skyBufR!: GPUBuffer;
  private skyGroupR!: GPUBindGroup;
  private reflSampler!: GPUSampler;
  /** part 5: imported models, uploaded once; and where copies stand this frame */
  private models = new Map<string, GpuModel>();
  modelDraws: ModelDraw[] = [];
  private meshPipes!: { opaque: GPURenderPipeline; blend: GPURenderPipeline };
  /** the water the last frame mirrored (tests) */
  reflected: WaterSurface | null = null;
  /** how many lights cast shadows this frame, and how many may (the quality level's) */
  shadowCount = 0;
  maxShadows = MAX_SHADOWS;
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
  /** offscreen: the picture drawn into (tests), else the page's canvas */
  private readonly offscreen = offscreen;
  private picture: GPUTexture | null = null;
  private last: [CameraFrame, Vec3, Overlay[], LineSet[], Marker[], ((mvp: Float32Array, eye: Vec3) => void)?] | null =
    null;
  private watched = false;
  /** called once if what WebGPU draws cannot be shown (the view starts again with WebGL) */
  onFail: ((why: string) => void) | null = null;
  private meshes = new Map<string, GpuMesh>();
  /** part 2: what v68's character model draws with (it thinks it is a WebGL context) */
  readonly gl: GlShim;
  private readonly charLayout: GPUBindGroupLayout;
  private readonly texLayout: GPUBindGroupLayout;
  private readonly sampler: GPUSampler;
  private charGroup: GPUBindGroup;
  private readonly charPipes: Record<'none' | 'alpha' | 'add', GPURenderPipeline>;
  private readonly blankTexture: GPUBindGroup;
  private zeroUv: GPUBuffer | null = null;
  private zeroUvBytes = 0;
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
  shadowed = false;
  stats: FrameStats = { drawCalls: 0, instances: 0, chunksDrawn: 0, chunks: 0, ms: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    if (!gpu) throw new Error('WebGPU is not available in this browser.');
    this.device = gpu.device;
    this.format = gpu.format;
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('This canvas cannot draw with WebGPU.');
    this.ctx = ctx;
    if (!offscreen) ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    const d = this.device;
    this.frameBuf = d.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyBuf = d.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.drawBuf = d.createBuffer({
      size: DRAW_SIZE * this.drawCap,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const frameLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
        // part 3: the shadow maps of up to four lights
        ...[1, 2, 3, 4].map((binding) => ({
          binding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: 'cube' as const },
        })),
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.frameLayout = frameLayout;
    this.shadowSampler = d.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    this.noShadow = d.createTexture({
      size: [1, 1, 6],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
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
    this.frameGroup = this.makeFrameGroup();
    this.skyGroup = d.createBindGroup({
      layout: skyLayout,
      entries: [{ binding: 0, resource: { buffer: this.skyBuf } }],
    });
    this.drawGroup = this.makeDrawGroup();
    // part 2: characters
    this.charLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { hasDynamicOffset: true, minBindingSize: 208 },
        },
      ],
    });
    this.texLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.sampler = d.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    this.charGroup = this.makeCharGroup();
    const blank = d.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    d.queue.writeTexture({ texture: blank }, new Uint8Array([255, 255, 255, 0]), { bytesPerRow: 4 }, [1, 1]);
    this.blankTexture = this.textureGroup(blank);
    this.gl = new GlShim(d, (t) => this.textureGroup(t));
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
    const charModule = d.createShaderModule({ code: CHAR_WGSL });
    const charLayoutP = d.createPipelineLayout({ bindGroupLayouts: [frameLayout, this.charLayout, this.texLayout] });
    const charPipe = (mode: 'none' | 'alpha' | 'add') =>
      d.createRenderPipeline({
        layout: charLayoutP,
        vertex: {
          module: charModule,
          entryPoint: 'vs',
          buffers: [
            { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
            { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
            { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
          ],
        },
        fragment: {
          module: charModule,
          entryPoint: 'fs',
          targets: [
            {
              format: this.format,
              ...(mode === 'none'
                ? {}
                : {
                    blend: {
                      color: { srcFactor: 'src-alpha', dstFactor: mode === 'add' ? 'one' : 'one-minus-src-alpha' },
                      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    },
                  }),
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: mode === 'none', depthCompare: 'less' },
        multisample: { count: SAMPLES },
      });
    this.charPipes = { none: charPipe('none'), alpha: charPipe('alpha'), add: charPipe('add') };
    // part 3: the shadow pass
    this.shadowLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { hasDynamicOffset: true, minBindingSize: 144 },
        },
      ],
    });
    const shadowModule = d.createShaderModule({ code: SHADOW_WGSL });
    const shadowLayoutP = d.createPipelineLayout({ bindGroupLayouts: [this.shadowLayout] });
    const shadowPipe = (chars: boolean) =>
      d.createRenderPipeline({
        layout: shadowLayoutP,
        vertex: {
          module: shadowModule,
          entryPoint: chars ? 'vsChar' : 'vs',
          buffers: chars ? meshBuffers.slice(0, 2) : meshBuffers,
        },
        fragment: { module: shadowModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      });
    this.shadowPipes = { bricks: shadowPipe(false), chars: shadowPipe(true) };
    // part 4: water surfaces, and what the reflection is drawn with
    this.waterLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { hasDynamicOffset: true, minBindingSize: 80 },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const waterModule = d.createShaderModule({ code: WATER_WGSL });
    this.waterPipe = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.drawLayout, this.waterLayout] }),
      vertex: {
        module: waterModule,
        entryPoint: 'vsWater',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      fragment: {
        module: waterModule,
        entryPoint: 'fsWater',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
      multisample: { count: SAMPLES },
    });
    this.frameBufR = d.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyBufR = d.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyGroupR = d.createBindGroup({
      layout: skyLayout,
      entries: [{ binding: 0, resource: { buffer: this.skyBufR } }],
    });
    this.frameGroupR = this.makeFrameGroup(this.frameBufR);
    this.reflSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    // part 5: imported models' parts
    const meshModule = d.createShaderModule({ code: MESH_WGSL });
    const meshLayoutP = d.createPipelineLayout({
      bindGroupLayouts: [this.frameLayout, this.drawLayout, this.texLayout],
    });
    const meshPipe = (see: boolean) =>
      d.createRenderPipeline({
        layout: meshLayoutP,
        vertex: {
          module: meshModule,
          entryPoint: 'vsMesh',
          buffers: [
            { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
            { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
            { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
          ],
        },
        fragment: {
          module: meshModule,
          entryPoint: 'fsMesh',
          targets: [
            {
              format: this.format,
              ...(see
                ? {
                    blend: {
                      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
                      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                    },
                  }
                : {}),
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: !see, depthCompare: 'less' },
        multisample: { count: SAMPLES },
      });
    this.meshPipes = { opaque: meshPipe(false), blend: meshPipe(true) };
  }

  /** part 5: puts a model on the GPU under `key` (again replaces it) */
  setModel(key: string, m: ModelUpload) {
    this.dropModel(key);
    const d = this.device;
    const buf = (a: Float32Array) => {
      const b = d.createBuffer({
        size: Math.max(16, a.byteLength),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      d.queue.writeBuffer(b, 0, a);
      return b;
    };
    const parts = m.data.parts.map((part, i): GpuModelPart => {
      const count = part.positions.length / 3;
      const pic = m.pictures[i];
      let texture: GPUTexture | null = null;
      if (pic && part.uvs) {
        texture = d.createTexture({
          size: [pic.width, pic.height],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        if (pic instanceof ImageData)
          d.queue.writeTexture({ texture }, pic.data, { bytesPerRow: pic.width * 4 }, [pic.width, pic.height]);
        else d.queue.copyExternalImageToTexture({ source: pic }, { texture }, [pic.width, pic.height]);
      }
      return {
        p: buf(part.positions),
        n: buf(part.normals),
        uv: buf(part.uvs ?? new Float32Array(count * 2)),
        count,
        color: part.color,
        texture,
        group: texture ? this.textureGroup(texture) : null,
      };
    });
    this.models.set(key, { parts, min: m.data.min, max: m.data.max });
    this.chunkRev++;
  }

  hasModel(key: string) {
    return this.models.has(key);
  }

  dropModel(key: string) {
    const m = this.models.get(key);
    if (!m) return;
    for (const p of m.parts) {
      p.p.destroy();
      p.n.destroy();
      p.uv.destroy();
      p.texture?.destroy();
    }
    this.models.delete(key);
    this.chunkRev++;
  }

  private makeFrameGroup(buffer: GPUBuffer = this.frameBuf) {
    const view = (i: number) => (this.shadowMaps[i]?.tex ?? this.noShadow).createView({ dimension: 'cube' });
    return this.device.createBindGroup({
      layout: this.frameLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: view(0) },
        { binding: 2, resource: view(1) },
        { binding: 3, resource: view(2) },
        { binding: 4, resource: view(3) },
        { binding: 5, resource: this.shadowSampler },
      ],
    });
  }

  /**
   * part 3: draws the shadow maps of this frame's shadow-casting lights — what they see in every direction, bricks
   * and characters — again only where the light, the bricks near it or a character near it changed
   */
  private drawShadows(enc: GPUCommandEncoder, chars: readonly Caster[]) {
    const d = this.device;
    const size = this.shadowSize;
    const n = this.shadowCount;
    // what each light must draw: its key says whether its map is still right
    const jobs: { slot: number; light: PointLight; near: GpuChunk[]; casters: Caster[] }[] = [];
    let remade = false;
    for (let i = 0; i < n; i++) {
      const light = this.lit[i]!;
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
      const casters = chars.filter(
        (c) =>
          c.blend === 'none' &&
          Math.hypot(c.model[12]! - light.pos[0], c.model[13]! - light.pos[1], c.model[14]! - light.pos[2]) < r + 3,
      );
      const key = `${light.pos.map((v) => v.toFixed(2)).join(',')}|${r}|${this.chunkRev}|${casters
        .map(
          (c) =>
            `${c.model[12]!.toFixed(2)},${c.model[13]!.toFixed(2)},${c.model[14]!.toFixed(2)},${c.model[0]!.toFixed(2)}`,
        )
        .join(';')}`;
      let map = this.shadowMaps[i];
      if (map && map.key === key && map.size === size) continue;
      if (map && map.size !== size) {
        map.tex.destroy();
        map.depth.destroy();
        map = undefined;
      }
      if (!map) {
        map = {
          tex: d.createTexture({
            size: [size, size, 6],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
          }),
          depth: d.createTexture({
            size: [size, size],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          }),
          key: '',
          size,
        };
        this.shadowMaps[i] = map;
        remade = true;
      }
      map.key = key;
      jobs.push({ slot: i, light, near, casters });
    }
    if (remade) {
      this.frameGroup = this.makeFrameGroup();
      this.frameGroupR = this.makeFrameGroup(this.frameBufR);
    }
    if (!jobs.length) return;
    // every face's settings, and every caster's on every face, in one buffer
    const FACE = 64;
    const data: number[] = [];
    const faceSlot = (mvp: Float32Array, light: PointLight, model: Float32Array) => {
      const at = data.length / FACE;
      data.push(...mvp, light.pos[0], light.pos[1], light.pos[2], light.range, ...model);
      while (data.length % FACE) data.push(0);
      return at;
    };
    const plan: { job: (typeof jobs)[0]; face: number; mvp: Float32Array; slot: number; chars: number[] }[] = [];
    for (const job of jobs) {
      const proj = perspective(Math.PI / 2, 1, 0.05, job.light.range + 1);
      for (const [face, fwd, right, up] of CUBE_FACES) {
        const mvp = multiply(proj, viewMatrix(job.light.pos, right, up, fwd));
        plan.push({
          job,
          face,
          mvp,
          slot: faceSlot(mvp, job.light, IDENTITY),
          chars: job.casters.map((c) => faceSlot(mvp, job.light, c.model)),
        });
      }
    }
    const bytes = data.length * 4;
    if (!this.shadowFaceBuf || this.shadowFaceCap < bytes) {
      this.shadowFaceBuf?.destroy();
      this.shadowFaceCap = Math.max(bytes, 64 * 1024);
      this.shadowFaceBuf = d.createBuffer({
        size: this.shadowFaceCap,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    d.queue.writeBuffer(this.shadowFaceBuf, 0, new Float32Array(data));
    const group = d.createBindGroup({
      layout: this.shadowLayout,
      entries: [{ binding: 0, resource: { buffer: this.shadowFaceBuf, size: 144 } }],
    });
    for (const f of plan) {
      const map = this.shadowMaps[f.job.slot]!;
      const p = enc.beginRenderPass({
        colorAttachments: [
          {
            view: map.tex.createView({ dimension: '2d', baseArrayLayer: f.face, arrayLayerCount: 1 }),
            // nothing in a direction: as far as the light reaches
            clearValue: { r: 1, g: 1, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: map.depth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });
      const planes = frustumPlanes(f.mvp);
      p.setPipeline(this.shadowPipes.bricks);
      p.setBindGroup(0, group, [f.slot * FACE * 4]);
      for (const c of f.job.near) {
        if (!boxVisible(planes, c.min, c.max)) continue;
        for (const b of c.batches) {
          const mesh = this.shape(b.w, b.d, b.kind, b.paved);
          p.setVertexBuffer(0, mesh.p);
          p.setVertexBuffer(1, mesh.n);
          p.setVertexBuffer(2, b.buffer);
          p.draw(mesh.count, b.count);
          this.stats.drawCalls++;
        }
      }
      if (f.chars.length) {
        p.setPipeline(this.shadowPipes.chars);
        f.job.casters.forEach((c, k) => {
          p.setBindGroup(0, group, [f.chars[k]! * FACE * 4]);
          p.setVertexBuffer(0, c.p.gpu!);
          p.setVertexBuffer(1, c.n.gpu!);
          p.draw(c.count);
          this.stats.drawCalls++;
        });
      }
      p.end();
    }
  }

  private makeCharGroup() {
    return this.device.createBindGroup({
      layout: this.charLayout,
      entries: [{ binding: 0, resource: { buffer: this.drawBuf, size: 208 } }],
    });
  }

  private textureGroup(t: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.texLayout,
      entries: [
        { binding: 0, resource: t.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  /** a mesh v68's character model can draw (debris): its buffers, as the model's WebGL buffers */
  meshOf(g: Geometry): { p: ShimBuffer; n: ShimBuffer; count: number } {
    const gl = this.gl;
    const p = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, p);
    gl.bufferData(gl.ARRAY_BUFFER, g.positions);
    const n = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, n);
    gl.bufferData(gl.ARRAY_BUFFER, g.normals);
    return { p, n, count: g.positions.length / 3 };
  }

  /** the frame's lights reach the characters through the frame's settings (nothing to set per program) */
  applyLights(_prog?: unknown) {}

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
    this.chunkRev++;
  }

  dropChunk(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const b of c.batches) b.buffer.destroy();
    this.chunks.delete(key);
    this.chunkRev++;
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
    this.reflectTex?.destroy();
    this.reflectTex = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.picture?.destroy();
    this.picture = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
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
    this.last = [cam, focus, overlays, lines, markers, extra];
    return this.draw(cam, focus, overlays, lines, markers, this.offscreen, extra);
  }

  private draw(
    cam: CameraFrame,
    focus: Vec3,
    overlays: Overlay[],
    lines: LineSet[],
    markers: Marker[],
    toPicture: boolean,
    extra?: (mvp: Float32Array, eye: Vec3) => void,
  ): FrameStats {
    const t0 = performance.now();
    this.stats = { drawCalls: 0, instances: 0, chunksDrawn: 0, chunks: this.chunks.size, ms: 0 };
    const shadowSlots = this.shadows ? Math.min(MAX_SHADOWS, this.maxShadows) : 0;
    this.lit = pickLights(this.lights, focus, Math.min(MAX_LIGHTS, this.maxLights), shadowSlots);
    this.shadowCount = shadowCount(this.lit, shadowSlots);
    this.shadowed = this.shadowCount > 0;
    this.stats.lights = this.lit.length;
    this.stats.maxLights = Math.min(MAX_LIGHTS, this.maxLights);
    this.stats.shadowed = this.shadowed;
    this.stats.shadows = this.shadowCount;
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
    // part 2: what v68's character model draws this frame (written down; drawn in the pass, and part 3: in shadows)
    this.gl.frame();
    if (extra) extra(mvp, cam.eye);
    // part 4: the water's bodies (see-through boxes), its surfaces drawn after the characters; one mirrors the world
    markers = [...markers, ...this.water.map(waterBody)];
    const mirrored = this.reflections && s ? reflectedWater(this.water, focus) : null;
    this.reflected = mirrored;

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
      if (i < this.shadowCount) fr.set([l.pos[0], l.pos[1], l.pos[2], l.range], 104 + i * 4);
    });
    fr.set([this.shadowCount, 0, 0, 0], 120);
    this.device.queue.writeBuffer(this.frameBuf, 0, fr);
    const hW = mirrored ? mirrored.max[1] : 0;
    const mvpR = mirrored ? multiply(mvp, mirrorAt(hW)) : mvp;
    const eyeR: Vec3 = [cam.eye[0], 2 * hW - cam.eye[1], cam.eye[2]];
    if (mirrored) {
      const fr2 = new Float32Array(fr);
      fr2.set(mvpR, 0);
      fr2.set([...eyeR, 0], 16);
      fr2.set([this.shadowCount, 1, hW, 0], 120);
      this.device.queue.writeBuffer(this.frameBufR, 0, fr2);
    }

    // every draw's settings (one 256-byte slot each) and instances, gathered then uploaded at once
    const slots: number[] = [];
    const slot = (model: Float32Array, alpha: number, flat: boolean, floor: boolean, pav: boolean, color?: Vec3) => {
      const base = slots.length;
      slots.push(...model, alpha, flat ? 1 : 0, floor ? 1 : 0, pav ? 1 : 0, ...(color ?? [0, 0, 0]), 1);
      for (let i = slots.length - base; i < DRAW_SIZE / 4; i++) slots.push(0);
      return base / (DRAW_SIZE / 4);
    };
    const rawSlot = (values: number[]) => {
      const base = slots.length;
      slots.push(...values);
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
    // part 5: the imported models' copies in view (see-through parts after the characters)
    const seeThrough: DrawCall[] = [];
    const modelCasters: Caster[] = [];
    for (const md of this.modelDraws) {
      const model = this.models.get(md.key);
      if (!model) continue;
      const box = drawBox(md.matrix, model.min, model.max);
      for (const part of model.parts)
        if (part.color[3] >= 1 && (md.alpha ?? 1) >= 1)
          modelCasters.push({
            p: { gpu: part.p },
            n: { gpu: part.n },
            count: part.count,
            model: md.matrix,
            blend: 'none',
          });
      if (!boxVisible(planes, box.min, box.max)) continue;
      for (const part of model.parts) {
        const alpha = part.color[3] * (md.alpha ?? 1);
        const call: DrawCall = {
          pipe: alpha < 1 ? this.meshPipes.blend : this.meshPipes.opaque,
          part,
          slot: rawSlot([
            ...md.matrix,
            alpha,
            0,
            0,
            0,
            part.color[0],
            part.color[1],
            part.color[2],
            part.group ? 1 : 0,
          ]),
        };
        if (alpha < 1) seeThrough.push(call);
        else calls.push(call);
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
    // part 2: the characters (and debris) drawn by v68's character model, as written down by the stand-in context
    if (extra) {
      let uvBytes = 0;
      for (const d of this.gl.draws) if (!d.uv) uvBytes = Math.max(uvBytes, d.count * 8);
      if (uvBytes > this.zeroUvBytes) {
        this.zeroUv?.destroy();
        this.zeroUvBytes = Math.max(uvBytes, 4096);
        this.zeroUv = this.device.createBuffer({ size: this.zeroUvBytes, usage: GPUBufferUsage.VERTEX });
      }
      for (const d of this.gl.draws)
        calls.push({
          pipe: this.charPipes[d.blend],
          char: d,
          slot: rawSlot([
            ...d.model,
            d.alpha,
            d.flat,
            d.paint,
            d.night,
            ...d.color,
            1,
            ...d.mvp,
            ...d.eye,
            0,
            ...d.light,
            0,
            ...d.ambient,
            0,
          ]),
        });
    }
    calls.push(...seeThrough);
    // part 4: what the water mirrors: the world above its surface, drawn upside down about it
    const rcalls: DrawCall[] = [];
    if (mirrored) {
      const planesR = frustumPlanes(mvpR);
      for (const c of this.chunks.values()) {
        if (c.max[1] < hW - 0.05 || !boxVisible(planesR, c.min, c.max)) continue;
        const dist = Math.hypot(
          Math.max(c.min[0] - cam.eye[0], 0, cam.eye[0] - c.max[0]),
          Math.max(c.min[2] - cam.eye[2], 0, cam.eye[2] - c.max[2]),
        );
        if (dist > this.viewDistance + (cam.distance ?? 0)) continue;
        for (const b of c.batches)
          rcalls.push({
            pipe: this.pipes.opaque,
            mesh: b.paved ? this.shape(b.w, b.d, b.kind, true) : this.lodShape(b.w, b.d, b.kind),
            inst: { buffer: b.buffer, offset: 0, count: b.count },
            slot: b.paved ? paved : plain,
          });
      }
      for (const c of calls)
        if ((c.pipe === this.pipes.opaque && c.inst && !c.inst.buffer) || c.pipe === this.meshPipes.opaque)
          rcalls.push(c);
      if (extra)
        for (const d of this.gl.draws) {
          if (d.blend !== 'none' || !sameMatrix(d.mvp, mvp)) continue;
          rcalls.push({
            pipe: this.charPipes.none,
            char: d,
            slot: rawSlot([
              ...d.model,
              d.alpha,
              d.flat,
              d.paint,
              d.night,
              ...d.color,
              1,
              ...mvpR,
              ...eyeR,
              0,
              ...d.light,
              0,
              ...d.ambient,
              0,
            ]),
          });
        }
    }
    // part 4: the water's surfaces, each with its own settings
    const surfaces = this.water;
    if (surfaces.length) {
      const verts = new Float32Array(surfaces.length * 18);
      const uni = new Float32Array(surfaces.length * 64);
      surfaces.forEach((ws, i) => {
        const [x0, , z0] = ws.min;
        const [x1, y, z1] = ws.max;
        verts.set([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1], i * 18);
        uni.set([...ws.color, 0.78], i * 64);
        uni.set([ws.current[0], ws.current[1], this.clock, ws === mirrored ? 1 : 0], i * 64 + 4);
        uni.set([w, h], i * 64 + 8);
        uni.set([...(s?.zenith ?? [0.35, 0.55, 0.85]), 0], i * 64 + 12);
        uni.set([...(s?.horizon ?? [0.75, 0.82, 0.9]), 0], i * 64 + 16);
      });
      if (verts.byteLength > this.waterVertCap || !this.waterVerts) {
        this.waterVerts?.destroy();
        this.waterVertCap = Math.max(4096, verts.byteLength * 2);
        this.waterVerts = this.device.createBuffer({
          size: this.waterVertCap,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      if (uni.byteLength > this.waterUniCap || !this.waterUni) {
        this.waterUni?.destroy();
        this.waterUniCap = Math.max(1024, uni.byteLength * 2);
        this.waterUni = this.device.createBuffer({
          size: this.waterUniCap,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      }
      this.device.queue.writeBuffer(this.waterVerts, 0, verts);
      this.device.queue.writeBuffer(this.waterUni, 0, uni);
      calls.push({ pipe: this.waterPipe, water: surfaces.length, slot: plain });
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
      this.charGroup = this.makeCharGroup();
    }
    if (slots.length) this.device.queue.writeBuffer(this.drawBuf, 0, new Float32Array(slots));
    this.instBuf = this.grow(this.instBuf, this.instCap, inst.length * 4, (c) => (this.instCap = c));
    if (inst.length) this.device.queue.writeBuffer(this.instBuf!, 0, new Float32Array(inst));
    this.lineBuf = this.grow(this.lineBuf, this.lineCap, lineData.length * 4, (c) => (this.lineCap = c));
    if (lineData.length) this.device.queue.writeBuffer(this.lineBuf!, 0, new Float32Array(lineData));
    if (s) this.writeSky(s, cam, aspect);
    if (s && mirrored) {
      const flip = (v: Vec3): Vec3 => [v[0], -v[1], v[2]];
      this.writeSky(
        s,
        { ...cam, right: flip(cam.right), up: flip(cam.up), forward: flip(cam.forward) },
        aspect,
        this.skyBufR,
      );
    }

    const enc = this.device.createCommandEncoder();
    if (this.shadowCount) this.drawShadows(enc, [...this.gl.draws, ...modelCasters]);
    const view = (toPicture ? this.picture! : this.ctx.getCurrentTexture()).createView();
    const waterGroup = surfaces.length
      ? this.device.createBindGroup({
          layout: this.waterLayout,
          entries: [
            { binding: 0, resource: { buffer: this.waterUni!, size: 80 } },
            { binding: 1, resource: this.reflectTex!.createView() },
            { binding: 2, resource: this.reflSampler },
          ],
        })
      : null;
    const pass = (clear: boolean, list: DrawCall[], sky: boolean, into = view, mirror = false) => {
      const p = enc.beginRenderPass({
        colorAttachments: [
          {
            view: this.color!.createView(),
            resolveTarget: into,
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
        p.setBindGroup(0, mirror ? this.skyGroupR : this.skyGroup);
        p.draw(6);
        this.stats.drawCalls++;
      }
      p.setBindGroup(0, mirror ? this.frameGroupR : this.frameGroup);
      for (const c of list) {
        p.setPipeline(c.pipe);
        if (c.part) {
          const part = c.part;
          p.setBindGroup(1, this.drawGroup, [c.slot * DRAW_SIZE]);
          p.setBindGroup(2, part.group ?? this.blankTexture);
          p.setVertexBuffer(0, part.p);
          p.setVertexBuffer(1, part.n);
          p.setVertexBuffer(2, part.uv);
          p.draw(part.count);
          this.stats.drawCalls++;
          continue;
        }
        if (c.water) {
          p.setBindGroup(1, this.drawGroup, [c.slot * DRAW_SIZE]);
          p.setVertexBuffer(0, this.waterVerts!);
          for (let i = 0; i < c.water; i++) {
            p.setBindGroup(2, waterGroup!, [i * 256]);
            p.draw(6, 1, i * 6);
            this.stats.drawCalls++;
          }
          continue;
        }
        if (c.char) {
          const d = c.char;
          p.setBindGroup(1, this.charGroup, [c.slot * DRAW_SIZE]);
          p.setBindGroup(2, d.texture?.group ?? this.blankTexture);
          p.setVertexBuffer(0, d.p.gpu!);
          p.setVertexBuffer(1, d.n.gpu!);
          p.setVertexBuffer(2, d.uv?.gpu ?? this.zeroUv!);
          p.draw(d.count);
          this.stats.drawCalls++;
          continue;
        }
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
    if (mirrored) pass(true, rcalls, true, this.reflectTex!.createView(), true);
    pass(
      true,
      calls.filter((c) => !c.top),
      !!s,
    );
    const top = calls.filter((c) => c.top);
    if (top.length) pass(false, top, false);
    this.device.queue.submit([enc.finish()]);
    // the first frame shown on the page: if the browser cannot show it, WebGL takes over
    if (!toPicture && !this.watched) {
      this.watched = true;
      this.device.queue.onSubmittedWorkDone().catch((e) => this.fail(String(e)));
      this.device.lost.then((info) => this.fail(info.message || 'the GPU was reset'));
    }
    this.stats.ms = performance.now() - t0;
    return this.stats;
  }

  private failed = false;
  private fail(why: string) {
    if (this.failed) return;
    this.failed = true;
    markGpuBroken();
    this.onFail?.(why);
  }

  /** the last frame as a picture (RGBA, top row first): drawn again off the page and read back */
  async snapshot(): Promise<{ width: number; height: number; rgba: Uint8Array }> {
    if (!this.last) throw new Error('Nothing has been drawn yet.');
    const [c, f, o, l, m, x] = this.last;
    this.draw(c, f, o, l, m, true, x);
    const [w, h] = this.size as [number, number];
    const row = Math.ceil((w * 4) / 256) * 256;
    const buf = this.device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: this.picture! }, { buffer: buf, bytesPerRow: row }, [w, h]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const rgba = new Uint8Array(w * h * 4);
    const bgra = this.format === 'bgra8unorm';
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * row + x * 4;
        const o = (y * w + x) * 4;
        rgba[o] = src[i + (bgra ? 2 : 0)]!;
        rgba[o + 1] = src[i + 1]!;
        rgba[o + 2] = src[i + (bgra ? 0 : 2)]!;
        rgba[o + 3] = 255;
      }
    buf.unmap();
    buf.destroy();
    return { width: w, height: h, rgba };
  }

  private grow(buf: GPUBuffer | null, cap: number, bytes: number, set: (c: number) => void): GPUBuffer | null {
    if (bytes <= cap && buf) return buf;
    buf?.destroy();
    let c = Math.max(4096, cap);
    while (c < bytes) c *= 2;
    set(c);
    return this.device.createBuffer({ size: c, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  private writeSky(s: SkySample, cam: CameraFrame, aspect: number, buf: GPUBuffer = this.skyBuf) {
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
    this.device.queue.writeBuffer(buf, 0, a);
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
    this.zeroUv?.destroy();
    this.picture?.destroy();
    this.reflectTex?.destroy();
    for (const k of [...this.models.keys()]) this.dropModel(k);
    this.waterVerts?.destroy();
    this.waterUni?.destroy();
    this.frameBufR.destroy();
    this.skyBufR.destroy();
    for (const m of this.shadowMaps) {
      m.tex.destroy();
      m.depth.destroy();
    }
    this.shadowFaceBuf?.destroy();
    this.noShadow.destroy();
    this.failed = true;
    if (!this.offscreen) this.ctx.unconfigure();
  }
}
