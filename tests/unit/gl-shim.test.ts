import { describe, expect, it } from 'vitest';
import { GlShim } from '../../src/engine/render/gpu/gl-shim';

/** Milestone 2b, 10c part 2: the stand-in WebGL context v68's character model draws through under WebGPU. */
// (no WebGPU in this test runner: its flag names, as a browser has them)
Object.assign(globalThis, {
  GPUBufferUsage: { VERTEX: 32, COPY_DST: 8, UNIFORM: 64, MAP_READ: 1, COPY_SRC: 4 },
  GPUTextureUsage: { TEXTURE_BINDING: 4, COPY_DST: 2, RENDER_ATTACHMENT: 16, COPY_SRC: 1 },
});
const fakeDevice = () => {
  const made: string[] = [];
  const device = {
    createBuffer: (d: { size: number }) => {
      made.push(`buffer ${d.size}`);
      return { destroy() {} };
    },
    createTexture: (d: { size: number[] }) => {
      made.push(`texture ${d.size.join('×')}`);
      return { destroy() {}, createView() {} };
    },
    queue: { writeBuffer() {}, writeTexture() {} },
  } as unknown as GPUDevice;
  return { device, made };
};

describe('the stand-in WebGL context', () => {
  it('keeps buffers and textures on the GPU and writes down each draw with what was set', () => {
    const { device, made } = fakeDevice();
    const gl = new GlShim(device, () => ({}) as GPUBindGroup);
    const prog = gl.createProgram();
    const P = gl.getAttribLocation(prog, 'aPosition');
    const N = gl.getAttribLocation(prog, 'aNormal');
    const A = gl.getAttribLocation(prog, 'aUV');
    expect([P, N, A]).toEqual([0, 1, 2]);
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(9));
    const nor = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nor);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(9));
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(16));
    expect(made).toEqual(['buffer 36', 'buffer 36', 'texture 2×2']);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniformMatrix4fv(u('uMVP'), false, new Float32Array(16).fill(2));
    gl.uniform3fv(u('uColor'), [1, 0, 0]);
    gl.uniform1f(u('uPaint'), 1);
    gl.frame();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(P);
    gl.vertexAttribPointer(P);
    gl.bindBuffer(gl.ARRAY_BUFFER, nor);
    gl.enableVertexAttribArray(N);
    gl.vertexAttribPointer(N);
    gl.disableVertexAttribArray(A);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // a glowing effect: blended, adding light, not writing depth
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.uniform1f(u('uAlpha'), 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    expect(gl.draws).toHaveLength(2);
    const [a, b] = gl.draws as [(typeof gl.draws)[0], (typeof gl.draws)[0]];
    expect(a.color).toEqual([1, 0, 0]);
    expect(a.paint).toBe(1);
    expect(a.mvp[0]).toBe(2);
    expect(a.uv).toBeNull();
    expect(a.texture).toBe(t);
    expect(a.blend).toBe('none');
    expect(b.blend).toBe('add');
    expect(b.depthWrite).toBe(false);
    expect(b.alpha).toBe(0.5);
    gl.frame();
    expect(gl.draws).toHaveLength(0);
  });
});
