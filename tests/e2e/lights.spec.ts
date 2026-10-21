import { expect, type Page, test } from '@playwright/test';

/**
 * P27 part 1: lights — a dark map lit by a torch in the Scene and in Play (measured on the picture), the
 * Inspector's light fields, and the Lights course with Do it for me.
 */
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  selectedItem: { value: string | null };
  right: { value: string };
  exec: (c: unknown, o?: unknown) => { ok: boolean; error?: string };
  store: { get(p: string): unknown };
  session: { value: { lightSources(): { name?: string; on: boolean }[]; darkness: number } | null };
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

test('a dark map is lit by a torch: in the Scene, in the Inspector and in Play', async ({ page }) => {
  test.setTimeout(720_000);
  const errors: string[] = [];
  await open(page, errors);
  const dark0 = await brightness(page, 'canvas.viewport-canvas');
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({ type: 'map.setEnvironment', payload: { map: e.mapId.value, darkness: 0.95 } });
  });
  await page.waitForTimeout(800);
  const dark = await brightness(page, 'canvas.viewport-canvas');
  expect(dark).toBeLessThan(dark0 * 0.7);
  // a lamp lighting a wide area, picked in the Inspector
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.mapId.value;
    const sp = (e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    e.exec({
      type: 'item.add',
      payload: {
        map,
        item: {
          id: 'ins_lighttest1',
          kind: 'light',
          name: 'Big lamp',
          pos: [sp[0]!, sp[1]! + 6, sp[2]!],
          on: true,
          light: { color: '#fff0d0', brightness: 4, range: 40, flicker: 0, shadow: false },
        },
      },
    });
    e.selectedItem.value = 'ins_lighttest1';
    e.right.value = 'inspect';
  });
  await expect(page.locator('[data-help="scene.item.light"]')).toBeVisible();
  await page.waitForTimeout(800);
  const lit = await brightness(page, 'canvas.viewport-canvas');
  expect(lit).toBeGreaterThan(dark * 1.3);
  // the Inspector: a Kind from the pictures, a colour, the reach
  await page.locator('[data-tour="pick-light-kind"]').click();
  await page.locator('[data-tour="pick-light-kind-list"] [data-value="lava"]').click();
  const item = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return (
        e.store.get(`maps/${e.mapId.value}/instances.json`) as {
          items: { id: string; light?: { color: string; range: number } }[];
        }
      ).items.find((i) => i.id === 'ins_lighttest1')!.light!;
    });
  await expect.poll(item).toMatchObject({ color: '#ff4a1c', range: 13 });
  await page.locator('[data-tour="light-range"]').fill('30');
  await expect.poll(async () => (await item()).range).toBe(30);
  // in Play: dark, and lit by the lamp (logic switches it off and on)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  expect(
    await page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return [
        e.session.value?.darkness,
        (e.store.get(`maps/${e.mapId.value}/map.json`) as { darkness?: number }).darkness,
      ];
    }),
  ).toEqual([0.95, 0.95]);
  await page.waitForTimeout(1500);
  const playLit = await brightness(page, '[aria-label="Game view"]');
  await page.evaluate(() =>
    (
      window as unknown as { __editor: Ed & { session: { value: { lightOp(o: string, n: string): void } } } }
    ).__editor.session.value!.lightOp('off', 'Big lamp'),
  );
  await page.waitForTimeout(1000);
  const playDark = await brightness(page, '[aria-label="Game view"]');
  expect(playLit).toBeGreaterThan(playDark * 1.3);
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Lights course: Do it for me makes the map dark, lights it with a torch and a crystal switched on by a zone', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Lights course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
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
