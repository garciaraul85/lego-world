import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 2b, 10c part 1: the Scene drawn with WebGPU looks the same as drawn with WebGL.
 *
 * This machine's browser draws WebGPU (in software) but cannot show it on the page, so the WebGPU picture is
 * drawn off the page (?gpu=offscreen) and read back; a second test checks that a browser that cannot show it
 * falls back to WebGL with a message.
 */
type Ed = { scene: { value: { count: number } | null } };
type View = {
  renderer: {
    kind: string;
    stats: { drawCalls: number; chunksDrawn: number };
    snapshot?: () => Promise<{ width: number; height: number; rgba: Uint8Array }>;
  } | null;
};

const open = async (page: Page, url: string) => {
  await page.goto(url);
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
};

const view = (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as { __view: () => View | null }).__view();
    return v?.renderer ? { kind: v.renderer.kind, chunks: v.renderer.stats.chunksDrawn } : null;
  });

test('the Scene drawn with WebGPU matches WebGL, and the choice is kept', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '/editor.html?nohub&gpu=offscreen');
  const pick = page.getByLabel('Draw with');
  await expect(pick).toHaveValue('auto');
  await expect.poll(async () => (await view(page))?.kind).toBe('webgl');
  const canvas = page.getByLabel('3D map view');
  await page.waitForTimeout(1500);
  const gl = await canvas.screenshot({ path: 'test-results/scene-webgl.png' });
  await pick.selectOption('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 30_000 }).toBe('webgpu');
  await expect.poll(async () => (await view(page))?.chunks ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  // the WebGPU picture against the WebGL one, pixel by pixel
  const d = await page.evaluate(async (png64) => {
    const v = (window as unknown as { __view: () => View | null }).__view()!;
    const shot = await v.renderer!.snapshot!();
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const A = g.getImageData(0, 0, img.width, img.height).data;
    // keep the WebGPU picture to look at
    const out = new OffscreenCanvas(shot.width, shot.height);
    out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(shot.rgba), shot.width, shot.height), 0, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const gpuPng = btoa(bin);
    if (img.width !== shot.width || img.height !== shot.height)
      return { size: `${img.width}×${img.height} / ${shot.width}×${shot.height}`, mean: 999, bigShare: 1, gpuPng };
    let sum = 0;
    let big = 0;
    const n = img.width * img.height;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let k = 0; k < 3; k++) {
        const e = Math.abs(A[i * 4 + k]! - shot.rgba[i * 4 + k]!);
        sum += e;
        m = Math.max(m, e);
      }
      if (m > 40) big++;
    }
    return { size: `${img.width}×${img.height}`, mean: sum / (n * 3), bigShare: big / n, gpuPng };
  }, gl.toString('base64'));
  const { gpuPng, ...result } = d;
  writeFileSync('test-results/scene-webgpu.png', Buffer.from(gpuPng, 'base64'));
  // the same picture: small differences only (edges, rounding); the corner buttons are only on the screenshot
  expect(result.mean, JSON.stringify(result)).toBeLessThan(8);
  expect(result.bigShare, JSON.stringify(result)).toBeLessThan(0.08);
  // kept for the next time the editor opens
  await open(page, '/editor.html?nohub&gpu=offscreen');
  await expect(page.getByLabel('Draw with')).toHaveValue('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 30_000 }).toBe('webgpu');
  await page.getByLabel('Draw with').selectOption('webgl');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 30_000 }).toBe('webgl');
  expect(errors).toEqual([]);
});

test('a browser that cannot show WebGPU falls back to WebGL with a message', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '/editor.html?nohub');
  const toasts: string[] = [];
  await page.exposeFunction('__toast', (t: string) => toasts.push(t));
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: { toast: { subscribe(f: (v: unknown) => void): void } } }).__editor;
    e.toast.subscribe((v) => v && (window as unknown as { __toast(t: string): void }).__toast(JSON.stringify(v)));
  });
  await page.getByLabel('Draw with').selectOption('webgpu');
  // this machine's browser cannot show it: WebGL draws, and says so
  await expect.poll(async () => (await view(page))?.kind, { timeout: 60_000 }).toBe('webgl');
  await expect.poll(() => toasts.join(' '), { timeout: 30_000 }).toContain('WebGPU could not show');
  await expect(page.getByRole('option', { name: /not working in this browser/ })).toHaveCount(1);
});
