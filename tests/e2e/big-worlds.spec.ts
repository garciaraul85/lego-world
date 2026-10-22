import { expect, type Page, test } from '@playwright/test';

/**
 * P27 part 3: big worlds — a million-brick map made and opened in the editor (timed), the Big worlds section,
 * chunk streaming in the view, a big map played with a window that follows the hero, and the Big worlds course.
 */
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  right: { value: string };
  exec: (c: unknown, o?: unknown) => { ok: boolean; error?: string };
  store: { get(p: string): unknown };
  openMap(id: string): void;
  session: {
    value: {
      world: { big: boolean; windowAt: string | null; pieces: unknown[]; controller: { pieces: unknown[] } };
      placeAt(p: number[], h: number): void;
    } | null;
  };
};
const ed = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor !== undefined);

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  expect(await ed(page)).toBe(true);
}

test('a million-brick map opens quickly, streams its chunks, and plays around the hero', async ({ page }) => {
  test.setTimeout(720_000);
  const errors: string[] = [];
  await open(page, errors);
  // 950,000 bricks in one step
  const made = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const a = performance.now();
    const r = e.exec({
      type: 'map.create',
      payload: { id: 'map_bigbigbig1', name: 'Big land', land: { size: 2048, seed: 7 } },
    });
    const ms = performance.now() - a;
    e.openMap('map_bigbigbig1');
    e.right.value = 'map';
    return { ok: r.ok, ms, count: e.scene.value?.count ?? 0, opened: performance.now() - a };
  });
  expect(made.ok).toBe(true);
  expect(made.count).toBe(950_000);
  expect(made.ms).toBeLessThan(20_000);
  expect(made.opened).toBeLessThan(40_000);
  // the Big worlds section and the view's counter: a streamed map, a few chunks loaded around the start
  const big = page.locator('[data-tour="map-big"]');
  await big.scrollIntoViewIfNeeded();
  await expect(big).toContainText('950,000 / 1,000,000');
  await expect(big).toContainText('big map (streamed)');
  await expect(big).toContainText('Play in v68 can’t load this map');
  const hud = page.locator('.vp-hud').first();
  await expect(hud).toContainText(/\/4096 chunks · \d+ loaded/, { timeout: 60_000 });
  const loaded = async () => Number(/(\d+) loaded/.exec(await hud.innerText())?.[1] ?? 0);
  await expect.poll(loaded, { timeout: 120_000 }).toBeGreaterThan(30);
  expect(await loaded()).toBeLessThan(400);
  // how far you see: one undo step on the map
  await page.locator('[data-tour="view-distance"]').fill('384');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return (e.store.get(`maps/${e.mapId.value}/map.json`) as { viewDistance?: number }).viewDistance;
      }),
    )
    .toBe(384);
  // a brick placed on the clearing is quick (the rules check only around it)
  const placed = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const a = performance.now();
    const r = e.exec({
      type: 'bricks.place',
      payload: { map: e.mapId.value, bricks: [{ type: 'brick2x2', x: 6, y: 1, z: 6, rot: 0, color: '#d20c20' }] },
    });
    return { ok: r.ok, ms: performance.now() - a };
  });
  expect(placed.ok).toBe(true);
  expect(placed.ms).toBeLessThan(5_000);
  // Play in v68 is refused for a map this big; ▶ Play plays it
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({ type: 'project.update', payload: { entryMap: 'map_bigbigbig1' } });
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.getByRole('button', { name: 'Play in v68' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __editor: { toast: { value: { msg: string } | null } } }).__editor.toast.value?.msg,
      ),
    )
    .toMatch(/more than 12,000 pieces, which v68 cannot load/);
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 120_000 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value?.world.big), {
      timeout: 120_000,
    })
    .toBe(true);
  const w = await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    return { all: s.world.pieces.length, near: s.world.controller.pieces.length, at: s.world.windowAt };
  });
  expect(w.all).toBe(950_001);
  expect(w.near).toBeLessThan(60_000);
  expect(w.at).toBe('0_0');
  // the window follows the hero
  await page.evaluate(() =>
    (window as unknown as { __editor: Ed }).__editor.session.value!.placeAt([300.5, 60, 0.5], 0),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.world.windowAt), {
      timeout: 60_000,
    })
    .toBe('9_0');
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Big worlds course: Do it for me makes big land, sets how far you see and plays it', async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Big worlds course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(6);
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 180_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 180_000 });
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
