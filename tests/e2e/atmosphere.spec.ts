import { expect, type Page, test } from '@playwright/test';

/**
 * P27 part 2: atmosphere — fog, the shadows' colour and day and night on the Map tab (measured on the picture),
 * in Play, and the Atmosphere course with Do it for me.
 */
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  selectedItem: { value: string | null };
  right: { value: string };
  exec: (c: unknown, o?: unknown) => { ok: boolean; error?: string };
  store: { get(p: string): unknown };
  session: { value: { atmosphereNow(): { sky: { night: number }; fog: { far: number } | null } } | null };
  skyPreview: { value: number | null };
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
/** how bright the middle of a canvas is (0–255), read from a screenshot */
async function brightness(page: Page, sel: string): Promise<number> {
  const shot = await page.locator(sel).first().screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(img.width * 0.25, img.height * 0.25, img.width * 0.5, img.height * 0.5).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    return s / (d.length / 4);
  }, shot.toString('base64'));
}

test('the Map tab: fog from the pictures fades the map, the night preview darkens it, Play runs the sky', async ({
  page,
}) => {
  test.setTimeout(720_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    (window as unknown as { __editor: Ed }).__editor.right.value = 'map';
  });
  const before = await brightness(page, 'canvas.viewport-canvas');
  await page.locator('[data-tour="map-fog"]').scrollIntoViewIfNeeded();
  await page.locator('[data-tour="pick-fog-kind"]').click();
  await page.locator('[data-tour="pick-fog-kind-list"] [data-value="thick"]').click();
  const doc = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return e.store.get(`maps/${e.mapId.value}/map.json`) as {
        fog?: { far: number; height?: number };
        ambient?: { color: string };
        dayLength?: number;
      };
    });
  await expect.poll(async () => (await doc()).fog?.far).toBe(24);
  await page.waitForTimeout(800);
  const foggy = await brightness(page, 'canvas.viewport-canvas');
  // thick grey fog: the picture changes a lot
  expect(Math.abs(foggy - before)).toBeGreaterThan(8);
  await page.locator('[data-tour="fog-ground"]').check();
  await expect.poll(async () => (await doc()).fog?.height).toBe(2.5);
  await page.locator('[data-tour="ambient-on"]').check();
  await page.locator('[data-tour="ambient-color"]').fill('#7a9cff');
  await expect.poll(async () => (await doc()).ambient?.color).toBe('#7a9cff');
  await page.locator('[data-tour="day-length"]').fill('2');
  await expect.poll(async () => (await doc()).dayLength).toBe(2);
  // undo takes the day length back
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await doc()).dayLength).toBeUndefined();
  // no fog, then the night preview darkens the view
  await page.locator('[data-tour="pick-fog-kind"]').click();
  await page.locator('[data-tour="pick-fog-kind-list"] [data-value="none"]').click();
  await expect.poll(async () => (await doc()).fog).toBeUndefined();
  await page.waitForTimeout(800);
  const day = await brightness(page, 'canvas.viewport-canvas');
  await page.locator('[data-tour="sky-preview"]').fill('720');
  await expect(page.locator('[data-tour="map-day"]')).toContainText('Night');
  await page.waitForTimeout(800);
  const night = await brightness(page, 'canvas.viewport-canvas');
  expect(night).toBeLessThan(day * 0.8);
  await page.locator('[data-tour="sky-preview-reset"]').click();
  // in Play: a night start is night; logic’s Set fog brings fog
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({ type: 'map.setEnvironment', payload: { map: e.mapId.value, time: 'night' } });
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const now = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
      return { night: s.atmosphereNow().sky.night > 0.5, far: s.atmosphereNow().fog?.far ?? null };
    });
  expect(await now()).toEqual({ night: true, far: null });
  await page.evaluate(() =>
    (
      window as unknown as { __editor: { session: { value: { skyOp(o: string, v: string): void } } } }
    ).__editor.session.value.skyOp('fog', 'mist'),
  );
  expect(await now()).toEqual({ night: true, far: 60 });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Atmosphere course: Do it for me adds mist, ground fog, blue shadows, a short day and a lamp for the night', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Atmosphere course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(10);
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 120_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 120_000 });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(errors).toEqual([]);
});
