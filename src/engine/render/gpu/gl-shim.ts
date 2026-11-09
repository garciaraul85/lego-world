/**
 * Milestone 2b, 10c part 2: v68's character model draws itself with WebGL calls (buffers, a texture for printed
 * clothes and faces, uniforms, drawArrays). This stands in for the WebGL context it is given: it keeps its buffers
 * and textures on the GPU through WebGPU and writes down every draw, which the WebGPU renderer then draws in its
 * own pass, with a shader made from the same one. v68's files are not changed.
 */

export type ShimBuffer = { kind: 'buffer'; gpu: GPUBuffer | null; bytes: number };
export type ShimTexture = { kind: 'texture'; gpu: GPUTexture | null; group: GPUBindGroup | null };

/** one draw the character model asked for, with everything it had set */
export type ShimDraw = {
  p: ShimBuffer;
  n: ShimBuffer;
  uv: ShimBuffer | null;
  count: number;
  texture: ShimTexture | null;
  mvp: Float32Array;
  model: Float32Array;
  color: [number, number, number];
  eye: [number, number, number];
  light: [number, number, number];
  ambient: [number, number, number];
  night: number;
  alpha: number;
  flat: number;
  paint: number;
  /** how it blends: none, see-through (alpha) or glowing (additive) */
  blend: 'none' | 'alpha' | 'add';
  depthWrite: boolean;
};

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class GlShim {
  // the WebGL names the model uses (any distinct values do)
  readonly ARRAY_BUFFER = 0x8892;
  readonly STATIC_DRAW = 0x88e4;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly FLOAT = 0x1406;
  readonly TRIANGLES = 0x0004;
  readonly TEXTURE_2D = 0x0de1;
  readonly TEXTURE0 = 0x84c0;
  readonly RGBA = 0x1908;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly NEAREST = 0x2600;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly BLEND = 0x0be2;
  readonly SRC_ALPHA = 0x0302;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly ONE = 1;
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly CURRENT_PROGRAM = 0x8b8d;
  readonly DEPTH_TEST = 0x0b71;

  /** the draws since the frame began */
  draws: ShimDraw[] = [];
  private bound: ShimBuffer | null = null;
  private attribs: (ShimBuffer | null)[] = [null, null, null];
  private enabled = [false, false, false];
  private texture: ShimTexture | null = null;
  private u = new Map<string, number[] | Float32Array>();
  private blending = false;
  private additive = false;
  private depthWrite = true;

  constructor(
    private readonly device: GPUDevice,
    /** a bind group for a texture (the renderer's layout and sampler) */
    private readonly bindTexture_: (t: GPUTexture) => GPUBindGroup,
  ) {}

  frame() {
    this.draws = [];
  }

  // ---- programs: one shader stands in for the model's ----
  createShader() {
    return {};
  }
  shaderSource() {}
  compileShader() {}
  getShaderParameter() {
    return true;
  }
  getShaderInfoLog() {
    return '';
  }
  createProgram() {
    return {};
  }
  attachShader() {}
  linkProgram() {}
  getProgramParameter() {
    return true;
  }
  useProgram() {}
  getParameter() {
    return null;
  }
  getUniformLocation(_p: unknown, name: string) {
    return name;
  }
  getAttribLocation(_p: unknown, name: string) {
    return name === 'aPosition' ? 0 : name === 'aNormal' ? 1 : name === 'aUV' ? 2 : -1;
  }

  // ---- uniforms ----
  uniformMatrix4fv(loc: string | null, _t: boolean, m: Float32Array) {
    if (loc) this.u.set(loc, new Float32Array(m));
  }
  uniform3fv(loc: string | null, v: ArrayLike<number>) {
    if (loc) this.u.set(loc, Array.from(v));
  }
  uniform2f(loc: string | null, a: number, b: number) {
    if (loc) this.u.set(loc, [a, b]);
  }
  uniform1f(loc: string | null, a: number) {
    if (loc) this.u.set(loc, [a]);
  }
  uniform1i(loc: string | null, a: number) {
    if (loc) this.u.set(loc, [a]);
  }

  // ---- buffers ----
  createBuffer(): ShimBuffer {
    return { kind: 'buffer', gpu: null, bytes: 0 };
  }
  deleteBuffer(b: ShimBuffer | null) {
    b?.gpu?.destroy();
    if (b) b.gpu = null;
  }
  bindBuffer(_t: number, b: ShimBuffer | null) {
    this.bound = b;
  }
  bufferData(_t: number, data: Float32Array) {
    const b = this.bound;
    if (!b) return;
    b.gpu?.destroy();
    b.bytes = data.byteLength;
    b.gpu = this.device.createBuffer({
      size: Math.max(16, Math.ceil(data.byteLength / 4) * 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(b.gpu, 0, data);
  }
  enableVertexAttribArray(i: number) {
    if (i >= 0) this.enabled[i] = true;
  }
  disableVertexAttribArray(i: number) {
    if (i >= 0) this.enabled[i] = false;
  }
  vertexAttribPointer(i: number) {
    if (i >= 0) this.attribs[i] = this.bound;
  }
  vertexAttrib2f() {}
  vertexAttrib3f() {}

  // ---- textures (printed clothes, faces) ----
  createTexture(): ShimTexture {
    return { kind: 'texture', gpu: null, group: null };
  }
  deleteTexture(t: ShimTexture | null) {
    t?.gpu?.destroy();
    if (t) {
      t.gpu = null;
      t.group = null;
    }
  }
  activeTexture() {}
  bindTexture(_t: number, t: ShimTexture | null) {
    this.texture = t;
  }
  texParameteri() {}
  texImage2D(
    _t: number,
    _l: number,
    _i: number,
    w: number,
    h: number,
    _b: number,
    _f: number,
    _ty: number,
    pixels: ArrayBufferView,
  ) {
    const t = this.texture;
    if (!t) return;
    t.gpu?.destroy();
    t.gpu = this.device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture: t.gpu }, pixels as Uint8Array<ArrayBuffer>, { bytesPerRow: w * 4 }, [
      w,
      h,
    ]);
    t.group = this.bindTexture_(t.gpu);
  }

  // ---- state ----
  enable(cap: number) {
    if (cap === this.BLEND) this.blending = true;
  }
  disable(cap: number) {
    if (cap === this.BLEND) this.blending = false;
  }
  blendFunc(_s: number, d: number) {
    this.additive = d === this.ONE;
  }
  depthMask(on: boolean) {
    this.depthWrite = on;
  }
  viewport() {}
  clear() {}
  depthFunc() {}

  // ---- the draw: written down for the WebGPU pass ----
  drawArrays(_mode: number, _first: number, count: number) {
    const p = this.attribs[0];
    const n = this.attribs[1];
    if (!p?.gpu || !n?.gpu || count <= 0) return;
    const v = (name: string, def: number[]) => (this.u.get(name) as number[] | undefined) ?? def;
    const m = (name: string) => (this.u.get(name) as Float32Array | undefined) ?? IDENTITY;
    this.draws.push({
      p,
      n,
      uv: this.enabled[2] && this.attribs[2]?.gpu ? this.attribs[2] : null,
      count,
      texture: this.texture?.group ? this.texture : null,
      mvp: m('uMVP'),
      model: m('uModel'),
      color: v('uColor', [1, 1, 1]).slice(0, 3) as [number, number, number],
      eye: v('uEye', [0, 0, 0]).slice(0, 3) as [number, number, number],
      light: v('uLight', [0.5, 1, 0.6]).slice(0, 3) as [number, number, number],
      ambient: v('uAmbient', [0.36, 0.39, 0.43]).slice(0, 3) as [number, number, number],
      night: v('uNight', [0])[0]!,
      alpha: v('uAlpha', [1])[0]!,
      flat: v('uFlat', [0])[0]!,
      paint: v('uPaint', [0])[0]!,
      blend: this.blending ? (this.additive ? 'add' : 'alpha') : 'none',
      depthWrite: this.depthWrite,
    });
  }
}
