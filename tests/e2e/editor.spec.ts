import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number } };
  selection: { value: Set<number> };
  tool: { value: string };
  bus: { history: () => { label: string; source: string }[] };
  mapDoc: { value: { sky: { time: string } } };
  autosave: { flush: () => Promise<void> };
};
const count = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.scene.value.count);

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
}

test('editor boots, selects, paints, places, undoes and persists', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  const start = await count(page);
  expect(start).toBeGreaterThan(1000);
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;

  // Select whatever is under the middle of the view
  await canvas.click({ position: { x: box.width / 2, y: box.height * 0.6 } });
  const selected = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.selection.value.size);
  expect(selected).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { level: 2 }).or(page.getByText('Transform'))).toBeVisible();

  // An asset (house, tree...) is recolored in the Asset studio; Unpack makes it loose bricks first
  const inspector = page.getByRole('region', { name: 'Inspector' });
  const unpack = inspector.getByRole('button', { name: 'Unpack' });
  const wasAsset = await unpack.isVisible();
  if (wasAsset) await unpack.click();
  // Recolor from the Inspector, then undo
  await inspector.getByRole('option', { name: 'Lavender' }).click();
  expect(
    (await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.bus.history().at(-1)?.label)) ?? '',
  ).toMatch(/Paint/);
  await page.keyboard.press('Control+z');
  if (wasAsset) await page.keyboard.press('Control+z');

  // Place a brick with Brick paint on top of whatever is in the middle
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.tool.value)).toBe('place');
  // v68 rules apply (no overlaps, stud-connected), so try a few spots like a user would
  for (const [fx, fy] of [
    [0.5, 0.6],
    [0.45, 0.7],
    [0.55, 0.75],
    [0.6, 0.65],
    [0.4, 0.55],
    [0.5, 0.8],
  ] as const) {
    await canvas.hover({ position: { x: box.width * fx, y: box.height * fy } });
    await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
    if ((await count(page)) > start) break;
  }
  await expect.poll(() => count(page)).toBe(start + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => count(page)).toBe(start);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => count(page)).toBe(start + 1);

  // Sky & weather from the Map tab
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page
    .getByLabel('Start time')
    .or(page.locator('select').filter({ hasText: 'Evening' }))
    .first()
    .selectOption('night');
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.mapDoc.value.sky.time)).toBe(
    'night',
  );

  // Everything survives a reload (IndexedDB)
  await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.autosave.flush());
  await page.reload();
  await page.waitForFunction(() => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0);
  expect(await count(page)).toBe(start + 1);
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.mapDoc.value.sky.time)).toBe(
    'night',
  );
  expect(errors).toEqual([]);
});

test('Play runs the map in the v68 runtime and Stop returns to the editor unchanged', async ({ page }) => {
  test.setTimeout(300_000); // v68 renders its whole world in software GL on CI
  const errors: string[] = [];
  await open(page, errors);
  const before = await count(page);
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play in v68' }).click();
  const frame = page.frameLocator('iframe[title="LEGO World v68"]');
  await expect(frame.locator('#bb-canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '■ Stop' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await count(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('compact layout fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  await open(page, errors);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByLabel('3D map view')).toBeVisible();
  await page.getByRole('button', { name: 'Outliner' }).click();
  await expect(page.getByRole('tree')).toBeVisible();
});

test('v68 studio edits come back into the project as one undo step', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  const before = await count(page);
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'v68 studio' }).click();
  const frame = page.frameLocator('iframe[title="LEGO World v68"]');
  await expect(frame.locator('#bb-canvas')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(
    () =>
      !!(document.querySelector('iframe') as HTMLIFrameElement | null)?.contentWindow &&
      !!(
        document.querySelector('iframe')!.contentWindow as unknown as { __bwTools?: Map<string, unknown> }
      ).__bwTools?.has('generate_lego_world'),
  );
  await page.evaluate(() => {
    const tools = (
      document.querySelector('iframe')!.contentWindow as unknown as {
        __bwTools: Map<string, { execute: (i: unknown) => unknown }>;
      }
    ).__bwTools;
    tools
      .get('generate_lego_world')!
      .execute({ biomes: ['desert'], time: 'evening', rain: false, snow: false, snowing: false, size: 16, seed: 5 });
  });
  await page.getByRole('button', { name: 'Done — bring changes back' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect.poll(() => count(page)).not.toBe(before);
  const last = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.bus.history().at(-1));
  expect(last).toMatchObject({ label: 'Edit in LEGO World v68', source: 'legacy' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => count(page)).toBe(before);
  expect(errors).toEqual([]);
});
