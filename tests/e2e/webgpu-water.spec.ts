import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 2b, 10c part 4: water's surface ripples and mirrors what is above it. WebGPU draws the world upside
 * down under the surface first (a true reflection); WebGL mirrors the sky's colours. Drawn off the page here.
 */
type Shot = { width: number; height: number; rgba: Uint8Array };
type R = {
  kind: string;
  reflections: boolean;
  reflected: unknown;
  water: unknown[];
  stats: { drawCalls: number };
  snapshot?: () => Promise<Shot>;
};

const open = async (page: Page) => {
  await page.goto('/editor.html?nohub&gpu=offscreen');
  await page.waitForFunction(
    () =>
      ((window as unknown as { __editor?: { scene: { value: { count: number } | null } } }).__editor?.scene.value
        ?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
};
const kind = (page: Page) =>
  page.evaluate(() => (window as unknown as { __view: () => { renderer: R | null } | null }).__view()?.renderer?.kind);

const addPool = (page: Page) =>
  page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: { mapId: { value: string }; exec(c: unknown): { ok: boolean; error?: string } };
      }
    ).__editor;
    const r = e.exec({
      type: 'item.add',
      payload: {
        map: e.mapId.value,
        item: {
          id: 'ins_mirrorpool',
          kind: 'water',
          name: 'Pool 1',
          pos: [-12, 3, -12],
          size: [24, 1, 24],
          body: 'pool',
        },
      },
    });
    if (!r.ok) throw new Error(r.error);
  });

test('WebGPU water mirrors the world above it; WebGL water draws without errors', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // the GPU's own complaints (a shader or a draw it refused); not missing pictures or the "experimental" notice
    if (/validation|WGSL|invalid|GPU.*error/i.test(m.text()) && !/experimental/i.test(m.text())) errors.push(m.text());
  });
  await open(page);
  await addPool(page);
  await page.getByLabel('Draw with').selectOption('webgpu');
  await expect.poll(() => kind(page), { timeout: 90_000 }).toBe('webgpu');
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async () => {
    const r = (window as unknown as { __view: () => { renderer: R } }).__view().renderer;
    r.reflections = false;
    const plain = await r.snapshot!();
    const offReflected = r.reflected;
    r.reflections = true;
    const mirror = await r.snapshot!();
    let changed = 0;
    for (let i = 0; i < plain.rgba.length; i += 4) {
      const d = Math.max(
        Math.abs(plain.rgba[i]! - mirror.rgba[i]!),
        Math.abs(plain.rgba[i + 1]! - mirror.rgba[i + 1]!),
        Math.abs(plain.rgba[i + 2]! - mirror.rgba[i + 2]!),
      );
      if (d > 12) changed++;
    }
    const png = async (s: Shot) => {
      const c = new OffscreenCanvas(s.width, s.height);
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(s.rgba), s.width, s.height), 0, 0);
      const b = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
      return btoa(bin);
    };
    return {
      pngs: [await png(plain), await png(mirror)],
      water: r.water.length,
      offReflected: offReflected !== null,
      onReflected: r.reflected !== null,
      share: changed / (plain.width * plain.height),
    };
  });
  const { pngs, ...summary } = result;
  writeFileSync('test-results/water-plain.png', Buffer.from(pngs[0]!, 'base64'));
  writeFileSync('test-results/water-mirror.png', Buffer.from(pngs[1]!, 'base64'));
  Object.assign(result, { pngs: [] });
  void summary;
  expect(result.water).toBe(1);
  expect(result.offReflected).toBe(false);
  expect(result.onReflected).toBe(true);
  // the reflection changes the water's surface, and only that: not the whole picture
  expect(result.share, JSON.stringify(result)).toBeGreaterThan(0.002);
  expect(result.share, JSON.stringify(result)).toBeLessThan(0.6);

  // WebGL: the same water with the sky's colours, no GL errors
  await page.getByLabel('Draw with').selectOption('webgl');
  await expect.poll(() => kind(page), { timeout: 90_000 }).toBe('webgl');
  await page.waitForTimeout(1000);
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="3D map view"]') as HTMLCanvasElement;
    const ctx = c.getContext('webgl')!;
    const r = (window as unknown as { __view: () => { renderer: R } }).__view().renderer;
    return { error: ctx.getError(), water: r.water.length };
  });
  expect(gl).toEqual({ error: 0, water: 1 });
  expect(errors).toEqual([]);
});
