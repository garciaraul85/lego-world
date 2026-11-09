import { expect, type Page, test } from '@playwright/test';

/**
 * Step 12c-2: wind, water and throwing — the Starter pack's pieces, the Asset studio's Wind and lifting section,
 * and the course run with Do it for me (a fan's wind walked into, a pinwheel spun and a torch blown out with the
 * Gust leaf, a rock thrown at a crystal switch, a river's current waded into).
 */
type Ed = {
  scene: { value: { count: number } | null };
  store: { get(p: string): unknown; list(p: string): string[] };
};
const open = async (page: Page, errors: string[]) => {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
};

test('Wind and throwing: the pack pieces and the Asset studio section', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack wind and throwing' });
  for (const n of ['Fan', 'Switch fan', 'Gale fan', 'Pinwheel', 'Rock', 'Clay pot', 'Gust leaf'])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) })).toBeVisible();
  // the Asset studio: the Barrel made a fan (faster, in a state), then something to lift that breaks
  await page
    .getByRole('listbox', { name: 'Pack buildings and props' })
    .getByRole('option', { name: /^Barrel/ })
    .dblclick();
  const sec = page.locator('[data-help="asset.wind"]');
  await sec.scrollIntoViewIfNeeded();
  await sec.locator('[data-tour="asset-wind"] input').check();
  const barrel = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Barrel');
      return p ? (e.store.get(p) as { wind?: { speed?: number }; lift?: { breaks?: boolean } }) : null;
    });
  await expect.poll(async () => !!(await barrel())?.wind).toBe(true);
  await sec.getByRole('slider', { name: 'Wind speed' }).fill('24');
  await expect.poll(async () => (await barrel())?.wind?.speed).toBe(24);
  await sec.locator('[data-tour="asset-lift"] input').check();
  await sec.getByRole('checkbox', { name: 'Breaks where it lands' }).check();
  await expect.poll(async () => (await barrel())?.lift?.breaks).toBe(true);
  expect(errors).toEqual([]);
});

test('Wind, water and throwing course: Do it for me walks into the wind, gusts, throws and wades', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Wind, water and throwing course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(12);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/wind-${String(i).padStart(2, '0')}.png` });
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
