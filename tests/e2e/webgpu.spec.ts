import { expect, type Page, test } from '@playwright/test';

/** Milestone 2b, 10c part 1: the Scene drawn with WebGPU looks the same as drawn with WebGL. */
type Ed = {
  scene: { value: { count: number } | null };
  drawWith: { value: string };
  setDrawWith(c: string): void;
};
type View = { renderer: { kind: string; stats: { drawCalls: number; chunksDrawn: number } } | null; redraw(): void };

const view = (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as { __view: () => View | null }).__view();
    return v?.renderer
      ? { kind: v.renderer.kind, draws: v.renderer.stats.drawCalls, chunks: v.renderer.stats.chunksDrawn }
      : null;
  });

/** how different two pictures of the view are: the mean difference per channel (0–255), and the share of pixels
 * that differ by more than 40 */
async function difference(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (s: string) => {
        const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height);
      };
      const A = await load(a64!);
      const B = await load(b64!);
      let sum = 0;
      let big = 0;
      const n = Math.min(A.data.length, B.data.length) / 4;
      for (let i = 0; i < n; i++) {
        let d = 0;
        for (let k = 0; k < 3; k++) {
          const e = Math.abs(A.data[i * 4 + k]! - B.data[i * 4 + k]!);
          sum += e;
          d = Math.max(d, e);
        }
        if (d > 40) big++;
      }
      return { mean: sum / (n * 3), bigShare: big / n, w: A.width, h: A.height, w2: B.width, h2: B.height };
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

test('the Scene drawn with WebGPU matches WebGL; the choice is kept; WebGL stays the fallback', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  const pick = page.getByLabel('Draw with');
  await expect(pick).toHaveValue('auto');
  await expect.poll(async () => (await view(page))?.kind).toBe('webgl');
  const canvas = page.locator('[data-tour="viewport"] canvas').first();
  await page.waitForTimeout(1500);
  const gl = await canvas.screenshot();
  // WebGPU (drawn in software here)
  await pick.selectOption('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 30_000 }).toBe('webgpu');
  await expect.poll(async () => (await view(page))?.chunks ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const gpu = await canvas.screenshot();
  const d = await difference(page, gl, gpu);
  expect(d.w).toBe(d.w2);
  // the same picture: small differences only (edges and rounding)
  expect(d.mean, JSON.stringify(d)).toBeLessThan(6);
  expect(d.bigShare, JSON.stringify(d)).toBeLessThan(0.03);
  test.info().attach('webgl.png', { body: gl, contentType: 'image/png' });
  test.info().attach('webgpu.png', { body: gpu, contentType: 'image/png' });
  // kept for the next time the editor opens
  await page.reload();
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.getByLabel('Draw with')).toHaveValue('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 30_000 }).toBe('webgpu');
  // back to WebGL
  await page.getByLabel('Draw with').selectOption('webgl');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 30_000 }).toBe('webgl');
  expect(errors).toEqual([]);
});
