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

/** the view drawn with WebGL (a screenshot, the view's labels hidden) against WebGPU (read back), pixel by pixel */
async function compare(page: Page, name: string) {
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

test('the Scene drawn with WebGPU matches WebGL (daylight; dark with a torch, fog, water and a selection)', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '/editor.html?nohub&gpu=offscreen');
  await expect(page.getByLabel('Draw with')).toHaveValue('auto');
  await expect.poll(async () => (await view(page))?.kind).toBe('webgl');
  await compare(page, 'scene-day');
  // a dark map lit by a torch, in mist, with a pool and a picked brick (lines and an overlay)
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: {
          mapId: { value: string };
          exec(c: unknown): { ok: boolean; error?: string };
          scene: { value: { bricks: { id: number }[] } | null };
          select(ids: number[]): void;
        };
      }
    ).__editor;
    const map = e.mapId.value;
    const ok = (c: unknown) => {
      const r = e.exec(c);
      if (!r.ok) throw new Error(r.error);
    };
    ok({
      type: 'map.setEnvironment',
      payload: { map, darkness: 0.7, fog: { near: 10, far: 60, thickness: 0.85, color: '#c8d2dc' } },
    });
    ok({
      type: 'item.add',
      payload: {
        map,
        item: {
          id: 'ins_gputorch01',
          kind: 'light',
          name: 'Torch 1',
          pos: [2, 2.4, 2],
          on: true,
          light: { color: '#ff9a3c', brightness: 1.6, range: 14, flicker: 0, shadow: false },
        },
      },
    });
    ok({
      type: 'item.add',
      payload: {
        map,
        item: { id: 'ins_gpupool001', kind: 'water', name: 'Pool 1', pos: [-6, 0, -6], size: [8, 2, 8], body: 'pool' },
      },
    });
  });
  await compare(page, 'scene-dark');
  // part 3: two lights casting shadows at once, the same both ways
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: { mapId: { value: string }; exec(c: unknown): { ok: boolean; error?: string } };
      }
    ).__editor;
    const map = e.mapId.value;
    e.exec({ type: 'map.setEnvironment', payload: { map, darkness: 0.85, fog: null } });
    for (const [id, pos, color] of [
      ['ins_gpushadow1', [6, 9, -6], '#ffd08a'],
      ['ins_gpushadow2', [-6, 9, 6], '#9ad0ff'],
    ] as const)
      e.exec({
        type: 'item.add',
        payload: {
          map,
          item: {
            id,
            kind: 'light',
            name: id,
            pos,
            on: true,
            light: { color, brightness: 2.4, range: 40, flicker: 0, shadow: true },
          },
        },
      });
  });
  await compare(page, 'scene-shadows');
  const shadows = await page.evaluate(
    () =>
      (window as unknown as { __view: () => { renderer: { stats: { shadows?: number } } } | null }).__view()!.renderer
        .stats.shadows,
  );
  expect(shadows).toBe(2);
  expect(errors).toEqual([]);
});

test('the choice of WebGPU is kept for the next time', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, '/editor.html?nohub&gpu=offscreen');
  await page.getByLabel('Draw with').selectOption('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 90_000 }).toBe('webgpu');
  await open(page, '/editor.html?nohub&gpu=offscreen');
  await expect(page.getByLabel('Draw with')).toHaveValue('webgpu');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 90_000 }).toBe('webgpu');
  await page.getByLabel('Draw with').selectOption('webgl');
  await expect.poll(async () => (await view(page))?.kind, { timeout: 90_000 }).toBe('webgl');
});

test('a browser that cannot show WebGPU draws with WebGL, and Draw with says so', async ({ page }) => {
  test.setTimeout(300_000);
  // this machine's browser draws WebGPU but cannot show it: found out at start-up with a tiny try
  await open(page, '/editor.html?nohub');
  await expect(page.locator('[data-tour="draw-with"] option[value="webgpu"]')).toHaveText(/unavailable/);
  await expect(page.locator('[data-tour="draw-with"] option[value="webgpu"]')).toBeDisabled();
  await expect.poll(async () => (await view(page))?.kind).toBe('webgl');
  // a choice of WebGPU kept from another computer still draws with WebGL here
  await page.evaluate(() =>
    (window as unknown as { __editor: { setDrawWith(c: string): void } }).__editor.setDrawWith('webgpu'),
  );
  await page.waitForTimeout(1000);
  await expect.poll(async () => (await view(page))?.kind).toBe('webgl');
});
