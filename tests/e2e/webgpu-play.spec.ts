import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Milestone 2b, 10c part 2: a game drawn with WebGPU — bricks, the hero and the neighbours (v68's character
 * model through the stand-in WebGL context), debris and markers — looks the same as drawn with WebGL. Both draw
 * the same paused moment of one game into canvases of the test's own; WebGPU is read back (this machine cannot
 * show it on the page).
 */
type Ed = {
  scene: { value: { count: number } | null };
  session: {
    value: {
      runtime: { ticks: number };
      breakHit(p: unknown, by: unknown, force: boolean): number;
      world: { pieces: { y: number }[] };
    } | null;
  };
  paused: { value: boolean };
};

test('Play drawn with WebGPU matches WebGL: bricks, the hero, neighbours and debris', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub&gpu=offscreen');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 30,
    undefined,
    { timeout: 120_000 },
  );
  // smash something near the hero so debris is drawn too, then hold the game still
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const s = e.session.value!;
    for (const p of s.world.pieces.filter((x) => x.y > 0).slice(0, 200)) if (s.breakHit(p, undefined, true)) break;
    e.paused.value = true;
  });
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async () => {
    const w = window as unknown as {
      __editor: Ed;
      __PlayRenderer: new (
        c: HTMLCanvasElement,
        s: unknown,
        d: string,
      ) => {
        render(): { drawCalls: number };
        renderer: {
          kind: string;
          gl: WebGLRenderingContext;
          snapshot?: () => Promise<{ width: number; height: number; rgba: Uint8Array }>;
        };
        dispose(): void;
      };
    };
    const s = w.__editor.session.value!;
    const canvas = () => {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:270px;z-index:-1';
      document.body.appendChild(c);
      return c;
    };
    const frames = (pr: { render(): unknown }) => {
      for (let i = 0; i < 3; i++) pr.render();
    };
    // WebGL: read right after drawing
    const glPr = new w.__PlayRenderer(canvas(), s, 'webgl');
    frames(glPr);
    const gl = glPr.renderer.gl;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    const raw = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const A = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) A.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    // WebGPU
    const gpuPr = new w.__PlayRenderer(canvas(), s, 'webgpu');
    frames(gpuPr);
    const kind = gpuPr.renderer.kind;
    const shot = await gpuPr.renderer.snapshot!();
    const png = async (rgba: Uint8Array, width: number, height: number) => {
      const out = new OffscreenCanvas(width, height);
      out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      const bytes = new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(bin);
    };
    let sum = 0;
    let big = 0;
    const n = W * H;
    if (shot.width === W && shot.height === H)
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let k = 0; k < 3; k++) {
          const e = Math.abs(A[i * 4 + k]! - shot.rgba[i * 4 + k]!);
          sum += e;
          m = Math.max(m, e);
        }
        if (m > 40) big++;
      }
    const res = {
      kind,
      size: `${W}×${H} / ${shot.width}×${shot.height}`,
      mean: shot.width === W ? sum / (n * 3) : 999,
      bigShare: shot.width === W ? big / n : 1,
      gl: await png(A, W, H),
      gpu: await png(shot.rgba, shot.width, shot.height),
    };
    glPr.dispose();
    gpuPr.dispose();
    return res;
  });
  const { gl, gpu, ...d } = result;
  writeFileSync('test-results/play-webgl.png', Buffer.from(gl, 'base64'));
  writeFileSync('test-results/play-webgpu.png', Buffer.from(gpu, 'base64'));
  expect(d.kind).toBe('webgpu');
  expect(d.mean, JSON.stringify(d)).toBeLessThan(4);
  expect(d.bigShare, JSON.stringify(d)).toBeLessThan(0.03);
  expect(errors).toEqual([]);
});
