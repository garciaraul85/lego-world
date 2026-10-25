import { expect, test } from '@playwright/test';
import { compare, open, view } from './helpers/gpu-compare';

/**
 * Milestone 2b, 10c part 1: the Scene drawn with WebGPU looks the same as drawn with WebGL.
 *
 * This machine's browser draws WebGPU (in software) but cannot show it on the page, so the WebGPU picture is
 * drawn off the page (?gpu=offscreen) and read back; a second test checks that a browser that cannot show it
 * falls back to WebGL with a message.
 */
test('the Scene drawn with WebGPU matches WebGL (daylight; 3D models; dark with a torch, fog and a selection; two shadowed lights)', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, '/editor.html?nohub&gpu=offscreen');
  await expect(page.getByLabel('Draw with')).toHaveValue('auto');
  await expect.poll(async () => (await view(page))?.kind).toBe('webgl');
  await compare(page, 'scene-day');
  // 10c part 5: the built-in 3D models, big, beside the bricks
  await page.evaluate(() => {
    const e = (
      window as unknown as { __editor: { mapId: { value: string }; exec(c: unknown): { ok: boolean; error?: string } } }
    ).__editor;
    ['lantern-post', 'barrel', 'round-tree', 'boulder', 'crystal', 'toadstool', 'stone-ring', 'vase'].forEach(
      (m, i) => {
        const r = e.exec({
          type: 'item.add',
          payload: {
            map: e.mapId.value,
            item: {
              id: `ins_gpumodel0${i}`,
              kind: 'model',
              model: `builtin:${m}`,
              pos: [-50 + i * 14, 10, 25],
              size: 4,
              turn: 30,
            },
          },
        });
        if (!r.ok) throw new Error(r.error);
      },
    );
  });
  await compare(page, 'scene-models');
  // a dark map lit by a torch, in mist, with a picked brick (water is checked in webgpu-water: WebGPU mirrors the world) (lines and an overlay)
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
