import { writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * Milestone 2b, 10c: the 3D view drawn with WebGL (a screenshot, the view's labels hidden) against WebGPU (drawn
 * off the page and read back), pixel by pixel. Used by the WebGPU tests and the Milestone 2b gate.
 */
type Ed = { scene: { value: { count: number } | null } };
type View = {
  renderer: {
    kind: string;
    stats: { drawCalls: number; chunksDrawn: number };
    snapshot?: () => Promise<{ width: number; height: number; rgba: Uint8Array }>;
  } | null;
};

export const open = async (page: Page, url: string) => {
  await page.goto(url);
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
};

export const view = (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as { __view: () => View | null }).__view();
    return v?.renderer ? { kind: v.renderer.kind, chunks: v.renderer.stats.chunksDrawn } : null;
  });

/** the view drawn with WebGL (a screenshot, the view's labels hidden) against WebGPU (read back), pixel by pixel */
export async function compare(page: Page, name: string, opts: { reflections?: boolean } = {}) {
  const pick = page.getByLabel('Draw with');
  await pick.selectOption('webgl');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 90_000 }).toBe('webgl');
  const hide = await page.addStyleTag({ content: '.vp-hud, .vp-controls { visibility: hidden !important; }' });
  await page.waitForTimeout(1500);
  const gl = await page.getByLabel('3D map view').screenshot({ path: `test-results/${name}-webgl.png` });
  await hide.evaluate((t) => (t as Element).remove());
  await pick.selectOption('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 90_000 }).toBe('webgpu');
  await expect.poll(async () => (await view(page))?.chunks ?? 0, { timeout: 90_000 }).toBeGreaterThan(0);
  // water: WebGPU mirrors the world (WebGL only the sky's colours); without that both draw the same
  if (opts.reflections === false)
    await page.evaluate(() => {
      (window as unknown as { __view: () => { renderer: { reflections: boolean } } }).__view().renderer.reflections =
        false;
    });
  await page.waitForTimeout(1500);
  const d = await page.evaluate(async (png64) => {
    const v = (window as unknown as { __view: () => View | null }).__view()!;
    const shot = await v.renderer!.snapshot!();
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const A = g.getImageData(0, 0, img.width, img.height).data;
    const out = new OffscreenCanvas(shot.width, shot.height);
    out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(shot.rgba), shot.width, shot.height), 0, 0);
    const bytes = new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    if (img.width !== shot.width || img.height !== shot.height)
      return {
        size: `${img.width}×${img.height} / ${shot.width}×${shot.height}`,
        mean: 999,
        bigShare: 1,
        png: btoa(bin),
      };
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
    return { size: `${img.width}×${img.height}`, mean: sum / (n * 3), bigShare: big / n, png: btoa(bin) };
  }, gl.toString('base64'));
  const { png, ...result } = d;
  writeFileSync(`test-results/${name}-webgpu.png`, Buffer.from(png, 'base64'));
  // the same picture: small differences only (edges, rounding)
  expect(result.mean, `${name} ${JSON.stringify(result)}`).toBeLessThan(4);
  expect(result.bigShare, `${name} ${JSON.stringify(result)}`).toBeLessThan(0.03);
}
