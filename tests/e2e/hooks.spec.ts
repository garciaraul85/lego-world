import { expect, type Page, test } from '@playwright/test';

/**
 * Step 13b: hooks and the magnet glove — the Starter pack's Hook and magnet pieces, the Asset studio's hook and metal
 * boxes, and the course run with Do it for me (hooked up a wall, a light crate pulled in, a swing on the rope and a
 * let-go, an iron crate carried onto a floor switch).
 */
type Ed = { scene: { value: { count: number } | null } };
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

test('Hook and magnet: the pack pieces and the Asset studio boxes', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack hook and magnet' });
  for (const n of [
    'Hook line',
    'Grapple rope',
    'Magnet glove',
    'Hook target',
    'Swing beam',
    'Light crate',
    'Iron crate',
  ])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) }).first()).toBeVisible();
  // the Asset studio: the Light crate made metal
  await pieces.getByRole('option', { name: /^Light crate/ }).dblclick();
  const box = page.locator('[data-tour="asset-metal"] input');
  await box.scrollIntoViewIfNeeded();
  await box.check();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: { store: { list(p: string): string[]; get(p: string): unknown } } })
          .__editor;
        const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Light crate');
        return p ? !!(e.store.get(p) as { metal?: boolean }).metal : false;
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('Hook and magnet course: Do it for me hooks up a wall, pulls a crate, swings and carries iron', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Hook and magnet course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
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
      await page.screenshot({ path: `test-results/hooks-${String(i).padStart(2, '0')}.png` });
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
