import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number; instances: { def: { name: string } }[] } };
  store: { list(p: string): string[]; get(p: string): unknown; manifest: { entry: { map: string } } };
  studioAsset: { value: string | null };
  session: {
    value: {
      prompt: { label: string } | null;
      world: { instances: { state: string }[] };
      placeAt(p: number[], h: number): void;
    } | null;
  };
  exec(cmds: unknown, opts?: unknown): { ok: boolean; error?: string };
  undo(): void;
  mapId: { value: string };
};
const ed = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor !== undefined);

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 30_000,
    },
  );
  expect(await ed(page)).toBe(true);
}
const instances = (page: Page) =>
  page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.scene.value.instances.length);

test('a built-in asset is placed from the dock with the Place asset tool, and undo removes it', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  const before = await instances(page);
  await page
    .locator('.cats')
    .getByRole('button', { name: /^Assets/ })
    .click();
  await page
    .getByRole('listbox', { name: 'Assets' })
    .getByRole('option', { name: /Treasure chest/ })
    .click();
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  // find a spot where the chest fits: try a few points on the ground near the middle
  for (const [fx, fy] of <[number, number][]>[
    [0.5, 0.75],
    [0.35, 0.8],
    [0.65, 0.8],
    [0.5, 0.9],
    [0.25, 0.7],
    [0.75, 0.7],
  ]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.mouse.move(box.x + box.width * fx + 2, box.y + box.height * fy);
    await page.mouse.down();
    await page.mouse.up();
    if ((await instances(page)) > before) break;
  }
  expect(await instances(page)).toBe(before + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => instances(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('Asset studio: building on the plate changes the asset; Character studio: a duplicated clip gets a key', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  await page.getByRole('option', { name: /Treasure chest/ }).click();
  const plate = page.locator('.studio canvas');
  await expect(plate).toBeVisible();
  const box = (await plate.boundingBox())!;
  await page.locator('.studio-tools').getByRole('button', { name: 'Brick paint (B)' }).click();
  const bricks = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return (
        (e.store.get(`assets/${e.studioAsset.value}.json`) as { bricks: unknown[] } | undefined)?.bricks.length ?? 0
      );
    });
  for (const [fx, fy] of <[number, number][]>[
    [0.2, 0.85],
    [0.8, 0.85],
    [0.5, 0.2],
  ]) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
    await page.mouse.move(box.x + box.width * fx + 2, box.y + box.height * fy);
    await page.mouse.down();
    await page.mouse.up();
    if ((await bricks()) > 5) break;
  }
  expect(await bricks()).toBe(6);

  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.getByLabel('New character from a preset').selectOption({ label: 'Knight' });
  await page.getByRole('option', { name: 'Squats' }).click();
  await page.getByRole('button', { name: 'Duplicate to edit' }).click();
  const keys = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const clips = e.store.list('clips/').map((p) => e.store.get(p) as { tracks: { keys: unknown[] }[] });
      return clips.reduce((n, c) => n + c.tracks.reduce((m, t) => m + t.keys.length, 0), 0);
    });
  const k0 = await keys();
  await page.locator('.tl-lanes').click({ position: { x: 40, y: 8 } });
  await page.getByRole('button', { name: '◆ Key' }).click();
  await expect.poll(keys).toBe(k0 + 1);
  await expect(page.getByLabel('Character preview', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('in play, E opens a chest placed near the start', async ({ page }) => {
  test.setTimeout(420_000); // software GL on CI draws a few frames per second
  const errors: string[] = [];
  await open(page, errors);
  // place the built-in chest with the same commands the dock's Place asset tool uses
  const ok = await page.evaluate(() => {
    const w = window as unknown as {
      __editor: Ed;
      __assets: { placeCommands: (ed: unknown, id: string, pos: number[], rot: number) => unknown; chestId: string };
    };
    for (const [x, z] of [
      [3, 3],
      [-6, 3],
      [3, -6],
      [-6, -6],
      [8, 0],
      [0, 8],
    ] as [number, number][])
      for (let y = 0; y < 60; y++)
        if (w.__editor.exec(w.__assets.placeCommands(w.__editor, w.__assets.chestId, [x, y, z], 0), { quiet: true }).ok)
          return [x, y, z];
    return null;
  });
  expect(ok).not.toBeNull();
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => !!(window as unknown as { __editor: Ed }).__editor.session.value, undefined, {
    timeout: 60_000,
  });
  await page.evaluate((at) => {
    const [x, y, z] = at as [number, number, number];
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    s.placeAt([x + 2, y * 0.4, z + 3.2], Math.PI);
  }, ok);
  await page.waitForFunction(
    () => !!(window as unknown as { __editor: Ed }).__editor.session.value?.prompt,
    undefined,
    { timeout: 120_000 },
  );
  await page.keyboard.press('e');
  await page.waitForFunction(
    () =>
      (window as unknown as { __editor: Ed }).__editor.session.value?.world.instances.some((i) => i.state === 'open'),
    undefined,
    { timeout: 120_000 },
  );
  await page.keyboard.press('F5'); // stop (Esc is the game's back / pause now)
  expect(errors).toEqual([]);
});
